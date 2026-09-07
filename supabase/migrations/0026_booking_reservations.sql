-- CX — production-grade booking reservations.
--
-- Closes the one real gap in the payments flow shipped in 0015/0019: a
-- booking row only ever existed *after* Stripe confirmed a charge, so two
-- renters could both reach the Payment step for the same car/dates, both
-- get charged, and only the loser's charge would ever surface a problem —
-- with no automatic refund. This migration makes the reservation itself
-- (not just the eventual charge) the thing that's created first and
-- protected by the existing `bookings_no_overlap` exclusion constraint,
-- by inserting a short-lived 'pending' hold row the moment a renter
-- reaches Payment (see api/create-payment-intent.ts) instead of waiting
-- for the webhook. The webhook (api/stripe-webhook.ts) then just
-- *confirms* that same row rather than inserting a fresh one.
--
-- Status lifecycle (booking_status enum): pending -> payment_processing
-- -> confirmed -> {cancelled | refunded}, with 'active'/'completed' kept
-- as derived, date-based refinements of 'confirmed' in the app layer
-- (src/lib/data/bookings.ts's classifyBooking) rather than persisted here
-- — the existing codebase already prefers "derive from real dates" over a
-- background job that flips statuses, and there's no reason to abandon
-- that for two states that are pure functions of today's date.
--
-- 'upcoming' is renamed to 'confirmed' in place (same rows, same meaning
-- — "a real, paid booking that hasn't started yet or is in progress" —
-- just a clearer name now that 'pending' means something different and
-- earlier in the lifecycle).

-- ============================================================
-- 1. Expand booking_status
-- ============================================================
alter type public.booking_status rename value 'upcoming' to 'confirmed';
alter type public.booking_status add value if not exists 'pending' before 'confirmed';
alter type public.booking_status add value if not exists 'payment_processing' before 'confirmed';
alter type public.booking_status add value if not exists 'refunded' after 'cancelled';

-- ============================================================
-- 2. New columns
-- ============================================================
alter table public.bookings
  -- Only set while status is 'pending'/'payment_processing' — the
  -- deadline by which a hold must be confirmed or it's treated as
  -- abandoned. NULL for every other status.
  add column hold_expires_at timestamptz,
  add column cancelled_at timestamptz,
  add column cancellation_reason text,
  add column refunded_at timestamptz,
  add column stripe_refund_id text;

-- ============================================================
-- 3. Overlap constraint now also excludes 'refunded' (a refunded booking
--    frees its dates exactly like a cancelled one). 'pending' and
--    'payment_processing' deliberately still count as occupying — that's
--    the entire point of a hold.
-- ============================================================
alter table public.bookings drop constraint bookings_no_overlap;
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    car_id with =,
    daterange(start_date, end_date, '[]') with &&
  )
  where (status not in ('cancelled', 'refunded'));

-- ============================================================
-- 4. Hold expiry — lazy, not cron-driven. Nothing in this stack runs a
--    scheduler at minute granularity (Vercel Cron on this project's plan
--    only fires daily), so instead every read/write path that cares about
--    "is this car actually free" calls this first. An abandoned hold
--    typically self-heals within moments of the next person even looking
--    at the calendar, and always heals before the next real booking
--    attempt for that car, which is the only place correctness actually
--    matters.
-- ============================================================
create or replace function public.expire_stale_holds()
returns void
language sql
security definer set search_path = public
as $$
  update public.bookings
  set status = 'cancelled', cancelled_at = now(), cancellation_reason = 'hold_expired'
  where status in ('pending', 'payment_processing')
    and hold_expires_at < now();
$$;

grant execute on function public.expire_stale_holds() to anon, authenticated;

-- ============================================================
-- 5. quote_booking now also self-heals stale holds and performs the real
--    "is this even worth trying to pay for" availability check up front,
--    so a renter who's about to be blocked gets a clear, specific message
--    before ever reaching Stripe rather than a generic failure after.
--    The exclusion constraint at insert time (step 8's hold insert in
--    create-payment-intent.ts) remains the actual race-proof guarantee —
--    this is strictly a friendlier pre-check on top of it.
-- ============================================================
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

  perform public.expire_stale_holds();

  select price_per_day into v_price
  from public.cars
  where id = p_car_id and status = 'published';

  if v_price is null then
    raise exception 'Car not found or not published';
  end if;

  if p_fare_tier not in ('standard', 'flexible') then
    raise exception 'Invalid fare tier';
  end if;

  if exists (
    select 1 from public.bookings
    where car_id = p_car_id
      and status not in ('cancelled', 'refunded')
      and daterange(start_date, end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
  ) then
    raise exception 'This car is unavailable for these dates.';
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

-- ============================================================
-- 6. Availability functions also self-heal on every read, so the
--    calendar a renter is actually looking at reflects reality even if
--    nothing else has touched this car recently.
-- ============================================================
create or replace function public.car_booked_ranges(p_car_id uuid)
returns table(start_date date, end_date date)
language plpgsql security definer set search_path = public as $$
begin
  perform public.expire_stale_holds();
  return query
    select b.start_date, b.end_date
    from public.bookings b
    where b.car_id = p_car_id and b.status not in ('cancelled', 'refunded');
end;
$$;

create or replace function public.car_booked_ranges_bulk(p_car_ids uuid[])
returns table(car_id uuid, start_date date, end_date date)
language plpgsql security definer set search_path = public as $$
begin
  perform public.expire_stale_holds();
  return query
    select b.car_id, b.start_date, b.end_date
    from public.bookings b
    where b.car_id = any(p_car_ids) and b.status not in ('cancelled', 'refunded');
end;
$$;

grant execute on function public.car_booked_ranges(uuid) to anon, authenticated;
grant execute on function public.car_booked_ranges_bulk(uuid[]) to anon, authenticated;

-- ============================================================
-- 7. confirm_booking_hold — the webhook's half of the handshake. Turns a
--    'pending'/'payment_processing' hold into a real confirmed booking
--    once Stripe reports the charge succeeded. Reward validation +
--    consumption happens here (not at hold-insert time) specifically so
--    an abandoned/expired hold never costs the renter their reward — the
--    reward is only ever touched once money has actually moved.
--
--    Returns the booking id on success, or null if no matching
--    confirmable hold exists (the caller — api/stripe-webhook.ts — falls
--    back to a direct insert in that case, the same way every booking was
--    created before this migration, as a safety net for the rare case a
--    hold expired despite a real charge succeeding).
-- ============================================================
create or replace function public.confirm_booking_hold(
  p_booking_id uuid,
  p_reward_id uuid,
  p_stripe_payment_intent_id text
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_booking public.bookings;
  v_reward record;
  v_discount numeric := 0;
begin
  select * into v_booking from public.bookings
    where id = p_booking_id and status in ('pending', 'payment_processing')
    for update;

  if v_booking is null then
    return null;
  end if;

  if p_reward_id is not null then
    select * into v_reward from public.game_rewards
      where id = p_reward_id
        and user_id = v_booking.renter_id
        and status = 'available'
        and expires_at > now();

    if v_reward is not null then
      v_discount := round(v_booking.total_price * v_reward.discount_percentage / 100.0);
      update public.game_rewards set status = 'used', used_at = now() where id = p_reward_id;
    end if;
    -- A reward that's no longer valid by confirm time is silently skipped
    -- rather than failing the whole confirmation — the charge already
    -- succeeded for the pre-discount amount in that edge case (the same
    -- amount/discount race that existed before this migration, just
    -- narrowed to the rare "reward expired mid-payment" window instead of
    -- "reward expired mid-payment OR any race at all").
  end if;

  update public.bookings
  set status = 'confirmed',
      stripe_payment_intent_id = p_stripe_payment_intent_id,
      reward_id = p_reward_id,
      discount_amount = v_discount,
      total_price = v_booking.total_price - v_discount,
      hold_expires_at = null
  where id = p_booking_id;

  return p_booking_id;
end;
$$;

-- Callable only by the service-role client (api/stripe-webhook.ts) —
-- confirming a hold is not something any authenticated user should be
-- able to trigger for an arbitrary booking id. Revoking from PUBLIC also
-- removes the blanket default grant every role (service_role included)
-- gets on a newly created function, so it's granted back to service_role
-- explicitly right after.
revoke all on function public.confirm_booking_hold(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_booking_hold(uuid, uuid, text) to service_role;

-- ============================================================
-- 8. release_payment_hold — lets a renter free their own abandoned hold
--    immediately (clicking Back, closing the payment step) instead of
--    waiting out the full hold_expires_at window. Same "renters or hosts
--    update relevant bookings" trust boundary as everything else a renter
--    can already do to their own booking rows.
-- ============================================================
create or replace function public.release_payment_hold(p_booking_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.bookings
  set status = 'cancelled', cancelled_at = now(), cancellation_reason = 'abandoned'
  where id = p_booking_id
    and renter_id = auth.uid()
    and status in ('pending', 'payment_processing');
end;
$$;

grant execute on function public.release_payment_hold(uuid) to authenticated;

-- ============================================================
-- 9. Realtime — added for authenticated contexts that already have RLS
--    visibility into their own rows (a host's own calendar, a renter's
--    own trip updating live). This deliberately does NOT make the public
--    availability calendar push-based: bookings' RLS scopes SELECT (and
--    therefore postgres_changes payloads) to renter_id/host_id = auth.uid(),
--    so an anonymous or unrelated browsing customer — the audience that
--    actually needs to know a car just got booked — would never receive
--    these events at all. The availability calendar instead polls
--    car_booked_ranges on an interval (see useBookedRanges in
--    src/lib/data/bookings.ts), which works identically for every
--    visitor regardless of RLS and is "real-time enough" for a booking
--    calendar where the race window is minutes, not milliseconds.
-- ============================================================
alter publication supabase_realtime add table public.bookings;
