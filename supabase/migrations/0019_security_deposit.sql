-- Velora — refundable security deposit.
--
-- A deposit here is a Stripe *authorization hold* (a manual-capture
-- PaymentIntent), not a second charge: the card is held for the amount,
-- nothing is taken unless it's later captured, and an uncaptured
-- authorization is released back to the customer's available balance
-- either by us cancelling it or, if we never do, automatically by the
-- card network — typically after about 7 days. That expiry is the one
-- real limitation of this approach worth knowing: a trip longer than
-- that risks the hold quietly lapsing before drop-off. Handling that
-- (e.g. re-authorizing partway through a long trip) is future work, not
-- attempted here.
--
-- The hold is placed *after* the booking already exists — see
-- api/stripe-webhook.ts — using the payment method and customer already
-- saved from the rental charge itself (see api/create-payment-intent.ts,
-- which now sets setup_future_usage on that PaymentIntent for exactly
-- this reason). That ordering avoids ever needing to correlate two
-- independent Stripe webhook events against a booking that may not exist
-- yet — the rental charge succeeding is what creates the booking; the
-- deposit hold is a step taken with a booking id already in hand, not a
-- second race to synchronize.

alter table public.profiles
  add column stripe_customer_id text;

alter table public.bookings
  add column stripe_deposit_intent_id text,
  add column deposit_status text not null default 'not_required'
    check (deposit_status in ('not_required', 'held', 'failed', 'released', 'captured'));

-- quote_booking's return shape is changing (an added `deposit` column),
-- which create-or-replace can't do for a `returns table (...)` function —
-- Postgres requires dropping it first.
drop function if exists public.quote_booking(uuid, date, date, text, uuid[], uuid);

-- Deposit policy: twice the car's daily rate, floored at €100 — simple,
-- explainable to a renter, and independent of trip length (a long trip
-- doesn't need a proportionally larger hold; the risk being covered is
-- per-incident, not per-day). Adjust v_deposit's formula here if you want
-- a different policy — same "one place, mirror it if it moves" note as
-- the pricing math below.
create or replace function public.quote_booking(
  p_car_id uuid,
  p_start_date date,
  p_end_date date,
  p_fare_tier text default 'standard',
  p_extra_ids uuid[] default '{}',
  p_reward_id uuid default null
)
returns table (total numeric, currency text, days int, deposit numeric)
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
  v_deposit numeric;
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
  v_deposit := greatest(100, round(v_price * 2));

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

    if (select count(*) from public.extras_catalog ec where ec.id = any(p_extra_ids) and ec.active) <> array_length(p_extra_ids, 1) then
      raise exception 'One or more selected extras are no longer available';
    end if;
  end if;

  return query select (v_pre_discount - v_discount + v_extras), 'eur'::text, v_days, v_deposit;
end;
$$;

grant execute on function public.quote_booking(uuid, date, date, text, uuid[], uuid) to authenticated;
