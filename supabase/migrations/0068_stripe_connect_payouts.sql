-- Stripe Connect host payouts — until now every booking's charge went
-- straight into the platform's own Stripe account with no split to the
-- host who actually owns the car (api/owner-stripe-balance.ts's own
-- comment already said as much: "There is no Stripe Connect / host-payout
-- split anywhere in this codebase"). Hosts get their own Stripe Express
-- account (onboarded via api/connect-onboarding-link.ts), and the base
-- rental price — price/day × days, not the service fee, protection fee,
-- or delivery fee, which stay platform revenue — is transferred to them
-- automatically once a trip completes, via the existing daily sweep in
-- api/send-pickup-reminders.ts (the same one that already releases
-- security deposit holds).

-- ============================================================
-- profiles — Connect account reference + capability state
-- ============================================================
alter table public.profiles
  add column stripe_connect_account_id text,
  add column stripe_connect_payouts_enabled boolean not null default false;

-- Server-write-only, same shape as is_admin's own lock trigger (0016) —
-- a host completes onboarding through Stripe's own hosted flow; these two
-- columns are only ever written by service-role code
-- (api/connect-onboarding-link.ts, api/stripe-connect-webhook.ts), never
-- by the client directly, even though "Users can update own profile"
-- would otherwise allow it.
create or replace function public.lock_connect_columns()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.stripe_connect_account_id := old.stripe_connect_account_id;
    new.stripe_connect_payouts_enabled := old.stripe_connect_payouts_enabled;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_connect_columns on public.profiles;
create trigger trg_lock_connect_columns
  before update on public.profiles
  for each row execute function public.lock_connect_columns();

-- ============================================================
-- bookings — payout tracking per trip
-- ============================================================
alter table public.bookings
  add column host_payout_amount numeric,
  add column stripe_transfer_id text,
  add column payout_status text not null default 'not_required'
    check (payout_status in ('not_required', 'pending', 'blocked', 'paid', 'failed', 'reversed')),
  add column payout_paid_at timestamptz;

-- Same server-write-only guard as 0066's protect_cancellation_columns —
-- extended in place rather than adding a second trigger, since it's the
-- same concern (money-moving columns a client must never set directly,
-- even though "Renters or hosts update relevant bookings" is otherwise
-- broad enough to reach them via the date-modify path).
create or replace function public.protect_cancellation_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null and (
    new.cancellation_policy is distinct from old.cancellation_policy
    or new.refund_amount is distinct from old.refund_amount
    or new.payout_status is distinct from old.payout_status
    or new.stripe_transfer_id is distinct from old.stripe_transfer_id
    or new.payout_paid_at is distinct from old.payout_paid_at
  ) then
    raise exception 'Payout and cancellation terms cannot be changed on an existing booking.';
  end if;
  return new;
end;
$$;

-- ============================================================
-- prepare_booking / recompute_booking_on_date_change — identical to
-- 0067's own bodies, each with one addition: host_payout_amount is set
-- to v_base (the price/day × days line item already computed for
-- total_price) at the same moment. Independent of any renter discount —
-- a promo or CX-level benefit is the platform absorbing the cost, never
-- a reduction to what the host earns.
-- ============================================================
create or replace function public.prepare_booking()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_price numeric;
  v_host uuid;
  v_pickup_enabled boolean;
  v_delivery_enabled boolean;
  v_delivery_fee_type text;
  v_delivery_fee_amount numeric;
  v_days int;
  v_base numeric;
  v_service numeric;
  v_protection numeric;
  v_flex numeric;
  v_pre_discount numeric;
  v_reward record;
  v_score integer;
  v_level record;
begin
  select price_per_day, host_id, pickup_enabled, delivery_enabled, delivery_fee_type, delivery_fee_amount
    into v_price, v_host, v_pickup_enabled, v_delivery_enabled, v_delivery_fee_type, v_delivery_fee_amount
  from public.cars
  where id = new.car_id and status = 'published';

  if v_price is null then
    raise exception 'Car not found or not published';
  end if;

  if exists (
    select 1 from public.car_blackout_dates
    where car_id = new.car_id
      and daterange(start_date, end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
  ) then
    raise exception 'This car is unavailable for these dates.';
  end if;

  if new.fulfillment_type = 'pickup' and not v_pickup_enabled then
    raise exception 'This host does not offer pickup for this car — delivery only.';
  end if;
  if new.fulfillment_type = 'delivery' then
    if not v_delivery_enabled then
      raise exception 'This host does not offer delivery for this car.';
    end if;
    if new.delivery_address is null or btrim(new.delivery_address) = '' then
      raise exception 'A delivery address is required.';
    end if;
    new.delivery_fee := case when v_delivery_fee_type = 'fixed' then v_delivery_fee_amount else 0 end;
  else
    new.delivery_address := null;
    new.delivery_fee := 0;
  end if;

  v_days := greatest(1, new.end_date - new.start_date);
  v_base := v_price * v_days;
  v_service := round(v_base * 0.12);
  v_protection := round(v_price * 0.18) * v_days;
  v_flex := case when new.fare_tier = 'flexible' then round(v_price * 0.10) * v_days else 0 end;
  v_pre_discount := v_base + v_service + v_protection + v_flex + new.delivery_fee;

  new.discount_amount := 0;
  if new.reward_id is not null then
    select * into v_reward from public.game_rewards
      where id = new.reward_id
        and user_id = new.renter_id
        and status = 'available'
        and expires_at > now()
      for update;

    if v_reward is null then
      raise exception 'This reward is invalid, expired, or already used';
    end if;

    new.discount_amount := round(v_pre_discount * v_reward.discount_percentage / 100.0);

    update public.game_rewards
    set status = 'used', used_at = now()
    where id = new.reward_id;
  end if;

  new.cx_discount_amount := 0;
  select coalesce(score, 0) into v_score from public.cx_scores where user_id = new.renter_id;
  select * into v_level from public.cx_current_level(coalesce(v_score, 0));
  if v_level.benefit_percentage > 0 then
    new.cx_discount_amount := least(round(v_pre_discount * v_level.benefit_percentage / 100.0), v_level.max_discount_eur);
  end if;

  new.host_id := v_host;
  new.total_price := v_pre_discount - new.discount_amount - new.cx_discount_amount;
  new.host_payout_amount := v_base;
  new.reference := 'VLR-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  return new;
end;
$$;

create or replace function public.recompute_booking_on_date_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_price numeric;
  v_days int;
  v_base numeric;
  v_service numeric;
  v_protection numeric;
  v_flex numeric;
  v_extras numeric;
  v_pre_discount numeric;
  v_discount_pct integer;
  v_score integer;
  v_level record;
begin
  if exists (
    select 1 from public.car_blackout_dates
    where car_id = new.car_id
      and daterange(start_date, end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
  ) then
    raise exception 'This car is unavailable for these dates.';
  end if;

  select price_per_day into v_price from public.cars where id = new.car_id;

  v_days := greatest(1, new.end_date - new.start_date);
  v_base := v_price * v_days;
  v_service := round(v_base * 0.12);
  v_protection := round(v_price * 0.18) * v_days;
  v_flex := case when new.fare_tier = 'flexible' then round(v_price * 0.10) * v_days else 0 end;

  update public.booking_extras be
  set unit_price = ec.price * v_days
  from public.extras_catalog ec
  where be.booking_id = new.id and be.extra_id = ec.id and ec.price_model = 'per_day';

  select coalesce(sum(unit_price * quantity), 0) into v_extras
  from public.booking_extras where booking_id = new.id;

  v_pre_discount := v_base + v_service + v_protection + v_flex + v_extras + new.delivery_fee;

  new.discount_amount := 0;
  if new.reward_id is not null then
    select discount_percentage into v_discount_pct
    from public.game_rewards where id = new.reward_id;
    new.discount_amount := round(v_pre_discount * coalesce(v_discount_pct, 0) / 100.0);
  end if;

  new.cx_discount_amount := 0;
  select coalesce(score, 0) into v_score from public.cx_scores where user_id = new.renter_id;
  select * into v_level from public.cx_current_level(coalesce(v_score, 0));
  if v_level.benefit_percentage > 0 then
    new.cx_discount_amount := least(round(v_pre_discount * v_level.benefit_percentage / 100.0), v_level.max_discount_eur);
  end if;

  new.total_price := v_pre_discount - new.discount_amount - new.cx_discount_amount;
  new.host_payout_amount := v_base;
  return new;
end;
$$;

-- ============================================================
-- confirm_booking_hold — identical to 0026's own body, plus marking the
-- new booking's payout as owed. The webhook's fallback direct-insert
-- path (no confirmable hold found) sets payout_status itself inline,
-- since it never calls this function — see api/stripe-webhook.ts.
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
  end if;

  update public.bookings
  set status = 'confirmed',
      stripe_payment_intent_id = p_stripe_payment_intent_id,
      reward_id = p_reward_id,
      discount_amount = v_discount,
      total_price = v_booking.total_price - v_discount,
      hold_expires_at = null,
      payout_status = 'pending'
  where id = p_booking_id;

  return p_booking_id;
end;
$$;
