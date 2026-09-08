-- CX — car delivery & pickup options.
--
-- Hosts can now offer delivery in addition to (or instead of) the renter
-- coming to the car's pickup location. Two guarding principles, matching
-- everything else in this schema:
--
--   1. The delivery fee actually charged is always computed server-side
--      from the CAR's own stored fee config (delivery_fee_type/
--      delivery_fee_amount), never trusted from the client — same
--      "server always computes trust-sensitive fields" pattern as
--      prepare_booking()'s base price/service fee/protection.
--   2. delivery_radius_km is informational only (shown to the renter as
--      "delivery available within ~15km", entered by the host) — this
--      schema has no lat/lng or geocoding anywhere, so there is no real
--      distance to enforce it against. Inventing a fake enforcement would
--      be worse than not having one; a host reviews delivery requests
--      against their own knowledge of the area, same trust level as them
--      already writing a free-text pick-up area today.

-- ============================================================
-- 1. cars — delivery configuration, host-controlled
-- ============================================================
alter table public.cars
  add column pickup_enabled boolean not null default true,
  add column delivery_enabled boolean not null default false,
  add column delivery_fee_type text not null default 'free' check (delivery_fee_type in ('free', 'fixed')),
  add column delivery_fee_amount numeric not null default 0 check (delivery_fee_amount >= 0),
  add column delivery_radius_km numeric check (delivery_radius_km is null or delivery_radius_km > 0),
  add column delivery_instructions text,
  add column delivery_hours_start time,
  add column delivery_hours_end time,
  -- A car must offer at least one fulfillment method — enforced here so
  -- it can never be misconfigured into being unbookable by anyone.
  add constraint cars_offers_a_fulfillment_method check (pickup_enabled or delivery_enabled);

-- ============================================================
-- 2. bookings — what the renter actually chose, and what it cost
-- ============================================================
alter table public.bookings
  add column fulfillment_type text not null default 'pickup' check (fulfillment_type in ('pickup', 'delivery')),
  add column delivery_address text,
  add column delivery_fee numeric not null default 0;

-- ============================================================
-- 3. quote_booking gains fulfillment awareness — validates the car
--    actually offers what was requested, computes the real fee, and
--    returns it (as its own line, not folded silently into `total`) so
--    the client can show "Rental + Delivery fee = Total" honestly.
-- ============================================================
drop function if exists public.quote_booking(uuid, date, date, text, uuid[], uuid);

create or replace function public.quote_booking(
  p_car_id uuid,
  p_start_date date,
  p_end_date date,
  p_fare_tier text default 'standard',
  p_extra_ids uuid[] default '{}',
  p_reward_id uuid default null,
  p_fulfillment_type text default 'pickup'
)
returns table (total numeric, currency text, days int, deposit numeric, delivery_fee numeric)
language plpgsql
security definer set search_path = public
as $$
declare
  v_renter uuid := auth.uid();
  v_car record;
  v_days int;
  v_base numeric;
  v_service numeric;
  v_protection numeric;
  v_flex numeric;
  v_pre_discount numeric;
  v_discount numeric := 0;
  v_extras numeric := 0;
  v_deposit numeric;
  v_delivery_fee numeric := 0;
  v_reward record;
begin
  if v_renter is null then
    raise exception 'Not authenticated';
  end if;

  if p_end_date <= p_start_date then
    raise exception 'Return date must be after pick-up';
  end if;

  if p_fulfillment_type not in ('pickup', 'delivery') then
    raise exception 'Invalid fulfillment type';
  end if;

  perform public.expire_stale_holds();

  select price_per_day, pickup_enabled, delivery_enabled, delivery_fee_type, delivery_fee_amount
    into v_car
  from public.cars
  where id = p_car_id and status = 'published';

  if v_car.price_per_day is null then
    raise exception 'Car not found or not published';
  end if;

  if p_fulfillment_type = 'pickup' and not v_car.pickup_enabled then
    raise exception 'This host does not offer pickup for this car — delivery only.';
  end if;
  if p_fulfillment_type = 'delivery' and not v_car.delivery_enabled then
    raise exception 'This host does not offer delivery for this car.';
  end if;

  if p_fulfillment_type = 'delivery' then
    v_delivery_fee := case when v_car.delivery_fee_type = 'fixed' then v_car.delivery_fee_amount else 0 end;
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
  v_base := v_car.price_per_day * v_days;
  v_service := round(v_base * 0.12);
  v_protection := round(v_car.price_per_day * 0.18) * v_days;
  v_flex := case when p_fare_tier = 'flexible' then round(v_car.price_per_day * 0.10) * v_days else 0 end;
  v_pre_discount := v_base + v_service + v_protection + v_flex + v_delivery_fee;
  v_deposit := greatest(100, round(v_car.price_per_day * 2));

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

  return query select (v_pre_discount - v_discount + v_extras), 'eur'::text, v_days, v_deposit, v_delivery_fee;
end;
$$;

grant execute on function public.quote_booking(uuid, date, date, text, uuid[], uuid, text) to authenticated;

-- ============================================================
-- 4. prepare_booking / recompute_booking_on_date_change gain the same
--    delivery-fee math, mirroring quote_booking (same "duplicated on
--    purpose, mirror if it moves" tradeoff already documented in
--    0015_stripe_payments.sql for the base pricing formula). A
--    delivery_address is required whenever fulfillment_type = 'delivery'
--    — enforced here, not just in the UI.
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
begin
  select price_per_day, host_id, pickup_enabled, delivery_enabled, delivery_fee_type, delivery_fee_amount
    into v_price, v_host, v_pickup_enabled, v_delivery_enabled, v_delivery_fee_type, v_delivery_fee_amount
  from public.cars
  where id = new.car_id and status = 'published';

  if v_price is null then
    raise exception 'Car not found or not published';
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

  new.host_id := v_host;
  new.total_price := v_pre_discount - new.discount_amount;
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
begin
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

  -- delivery_fee is a flat, one-off cost tied to the booking's existing
  -- fulfillment choice, not the trip length — it doesn't get rescaled by
  -- a date change the way per-day extras do, it just carries forward.
  v_pre_discount := v_base + v_service + v_protection + v_flex + v_extras + new.delivery_fee;

  new.discount_amount := 0;
  if new.reward_id is not null then
    select discount_percentage into v_discount_pct
    from public.game_rewards where id = new.reward_id;
    new.discount_amount := round(v_pre_discount * coalesce(v_discount_pct, 0) / 100.0);
  end if;

  new.total_price := v_pre_discount - new.discount_amount;
  return new;
end;
$$;
