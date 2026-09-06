-- Velora — real Stripe payments.
--
-- Until now the "Payment" step in the booking flow was a mock: bookings
-- were inserted straight away (see createBooking() / prepare_booking())
-- and no money ever moved. This migration adds the one piece of trusted
-- server-side data that real payments need and that didn't exist yet: a
-- read-only quote the client can't tamper with, computed *before* a
-- booking row exists (so we never have to create — and then have to
-- clean up — an "unpaid" booking that would sit there blocking those
-- dates for other renters).
--
-- The actual booking row is still only ever created the same way it
-- always was: by inserting into public.bookings and letting the existing
-- prepare_booking / prepare_booking_extra / apply_extra_to_booking_total
-- triggers compute the real total. The only thing that changes is *who*
-- performs that insert and *when*: previously it was the browser, as
-- soon as the renter clicked "Pay"; now it's the Stripe webhook handler
-- (api/stripe-webhook.ts), running with the service role, and only after
-- Stripe confirms the charge actually succeeded. See api/create-payment-
-- intent.ts and api/stripe-webhook.ts for the two ends of that flow.
--
-- quote_booking() below intentionally duplicates the pricing formula
-- from prepare_booking() (migration 0010) instead of both calling a
-- shared helper. That's a deliberate trade-off: prepare_booking() is a
-- trigger that already runs in production and touches game_rewards
-- (marks a reward 'used'); refactoring it to share code with a brand
-- new read-only function felt riskier than a few duplicated lines that
-- are easy to eyeball against each other. If you ever change the
-- pricing math in prepare_booking(), mirror the change here too — the
-- Stripe charge amount comes from this function, so if the two drift
-- apart, the amount actually charged and the booking's final total_price
-- (computed independently by prepare_booking once the webhook inserts
-- the row) will disagree.

create or replace function public.quote_booking(
  p_car_id uuid,
  p_start_date date,
  p_end_date date,
  p_fare_tier text default 'standard',
  p_extra_ids uuid[] default '{}',
  p_reward_id uuid default null
)
returns table (total numeric, currency text, days int)
language plpgsql
security definer set search_path = public
as $$
declare
  v_renter uuid := auth.uid();
  v_price numeric;
  v_days int;
  v_base numeric;
  v_service numeric;
  v_protection numeric;
  v_flex numeric;
  v_pre_discount numeric;
  v_discount numeric := 0;
  v_extras numeric := 0;
  v_reward record;
begin
  if v_renter is null then
    raise exception 'Not authenticated';
  end if;

  if p_end_date <= p_start_date then
    raise exception 'Return date must be after pick-up';
  end if;

  select price_per_day into v_price
  from public.cars
  where id = p_car_id and status = 'published';

  if v_price is null then
    raise exception 'Car not found or not published';
  end if;

  if p_fare_tier not in ('standard', 'flexible') then
    raise exception 'Invalid fare tier';
  end if;

  v_days := greatest(1, p_end_date - p_start_date);
  v_base := v_price * v_days;
  v_service := round(v_base * 0.12);
  v_protection := round(v_price * 0.18) * v_days;
  v_flex := case when p_fare_tier = 'flexible' then round(v_price * 0.10) * v_days else 0 end;
  v_pre_discount := v_base + v_service + v_protection + v_flex;

  if p_reward_id is not null then
    select * into v_reward from public.game_rewards
      where id = p_reward_id
        and user_id = v_renter
        and status = 'available'
        and expires_at > now();

    if v_reward is null then
      raise exception 'This reward is invalid, expired, or already used';
    end if;

    v_discount := round(v_pre_discount * v_reward.discount_percentage / 100.0);
  end if;

  if p_extra_ids is not null and array_length(p_extra_ids, 1) > 0 then
    select coalesce(sum(case when ec.price_model = 'per_day' then ec.price * v_days else ec.price end), 0)
      into v_extras
    from public.extras_catalog ec
    where ec.id = any(p_extra_ids) and ec.active;

    -- Every id the client sent must resolve to an active extra — silently
    -- dropping an unknown/inactive id would undercharge relative to what
    -- gets attached to the booking later.
    if (select count(*) from public.extras_catalog ec where ec.id = any(p_extra_ids) and ec.active) <> array_length(p_extra_ids, 1) then
      raise exception 'One or more selected extras are no longer available';
    end if;
  end if;

  return query select (v_pre_discount - v_discount + v_extras), 'eur'::text, v_days;
end;
$$;

grant execute on function public.quote_booking(uuid, date, date, text, uuid[], uuid) to authenticated;

-- Lets the Stripe webhook look up "did I already create a booking for
-- this payment_intent?" so a retried webhook delivery (Stripe resends on
-- anything but a fast 2xx) can't double-insert. Partial index: existing
-- rows and any future non-Stripe booking keep stripe_payment_intent_id
-- null, which this deliberately ignores.
create unique index if not exists bookings_stripe_payment_intent_id_idx
  on public.bookings (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
