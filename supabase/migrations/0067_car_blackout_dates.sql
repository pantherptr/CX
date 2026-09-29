-- Host-managed blackout dates — HostDashboard.tsx's Calendar section has
-- said "Manually blocking dates is coming soon" since it was written,
-- because nothing backing it ever existed: no table, and the booking
-- overlap check only ever excluded other bookings. A host had no way to
-- take a car off the market for their own use, maintenance, or an
-- off-platform booking.
--
-- Deliberately reuses the same "unavailable range" shape bookings
-- already expose (car_booked_ranges/car_booked_ranges_bulk), rather than
-- inventing a second calendar concept the frontend has to learn — a
-- blackout is just another kind of unavailable range from a browsing
-- renter's point of view, so Browse/CarDetails/Booking's existing
-- calendar code picks these up with zero frontend changes.
--
-- Every real write goes through a security-definer RPC (this codebase's
-- own convention — see empireFeed.ts's own header comment on why), not a
-- raw table insert under RLS: creating a blackout has to be validated
-- against existing bookings for that car, which RLS alone can't express.

create table public.car_blackout_dates (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  -- A host's own private note ("Personal use", "Maintenance") — never
  -- exposed to renters, only surfaced back to the host on their own
  -- calendar (see fetch_car_blackout_dates below).
  reason text,
  created_at timestamptz not null default now(),
  constraint car_blackout_dates_valid_range check (end_date >= start_date)
);

create index car_blackout_dates_car_idx on public.car_blackout_dates (car_id);
create index car_blackout_dates_host_idx on public.car_blackout_dates (host_id);

alter table public.car_blackout_dates enable row level security;

-- Read-only via RLS, and host/admin/owner only — the *dates themselves*
-- reach a browsing renter only through car_booked_ranges below (which
-- exposes just start/end, security-definer, no `reason`/`host_id`). The
-- raw table's own writes only ever happen through the RPCs below.
create policy "Hosts and staff can view blackout dates"
  on public.car_blackout_dates for select
  using (host_id = auth.uid() or public.is_admin() or public.is_owner());

-- ============================================================
-- fetch_car_blackout_dates — the host's own calendar management list.
-- ============================================================
create or replace function public.fetch_car_blackout_dates(p_car_id uuid)
returns table (id uuid, start_date date, end_date date, reason text, created_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.cars
    where id = p_car_id and (host_id = auth.uid() or public.is_admin() or public.is_owner())
  ) then
    raise exception 'You do not have access to this car''s calendar.';
  end if;

  return query
    select b.id, b.start_date, b.end_date, b.reason, b.created_at
    from public.car_blackout_dates b
    where b.car_id = p_car_id
    order by b.start_date asc;
end;
$$;

grant execute on function public.fetch_car_blackout_dates(uuid) to authenticated;

-- ============================================================
-- create_car_blackout_date — validated against both real bookings and
-- any existing blackout for the same car, the same "no overlap" rule
-- quote_booking/prepare_booking already enforce for bookings themselves.
-- ============================================================
create or replace function public.create_car_blackout_date(
  p_car_id uuid,
  p_start_date date,
  p_end_date date,
  p_reason text default null
)
returns public.car_blackout_dates
language plpgsql
security definer set search_path = public
as $$
declare
  v_host uuid;
  v_row public.car_blackout_dates;
begin
  if p_end_date < p_start_date then
    raise exception 'End date must be on or after the start date.';
  end if;

  select host_id into v_host from public.cars where id = p_car_id;
  if v_host is null or v_host <> auth.uid() then
    raise exception 'You can only block dates on your own cars.';
  end if;

  if exists (
    select 1 from public.bookings
    where car_id = p_car_id
      and status not in ('cancelled', 'refunded')
      and daterange(start_date, end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
  ) then
    raise exception 'These dates already have a booking — cancel or wait for it to complete first.';
  end if;

  if exists (
    select 1 from public.car_blackout_dates
    where car_id = p_car_id
      and daterange(start_date, end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
  ) then
    raise exception 'These dates overlap a block you already have — remove it first if you want to change the range.';
  end if;

  insert into public.car_blackout_dates (car_id, host_id, start_date, end_date, reason)
  values (p_car_id, auth.uid(), p_start_date, p_end_date, nullif(btrim(coalesce(p_reason, '')), ''))
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.create_car_blackout_date(uuid, date, date, text) to authenticated;

-- ============================================================
-- delete_car_blackout_date — unblocking. Host of the car, or staff.
-- ============================================================
create or replace function public.delete_car_blackout_date(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.car_blackout_dates
  where id = p_id and (host_id = auth.uid() or public.is_admin() or public.is_owner());

  if not found then
    raise exception 'Block not found, or you do not have access to remove it.';
  end if;
end;
$$;

grant execute on function public.delete_car_blackout_date(uuid) to authenticated;

-- ============================================================
-- car_booked_ranges / car_booked_ranges_bulk — now also carry blackout
-- ranges, so every existing consumer (Browse's calendar, CarDetails,
-- Booking's own pre-flight check) starts respecting them with no
-- frontend change at all. Renter-facing, so still just dates — no
-- `reason`, no way to tell a blackout apart from a real booking, which
-- is the point: to a renter both simply mean "not available".
-- ============================================================
create or replace function public.car_booked_ranges(p_car_id uuid)
returns table(start_date date, end_date date)
language plpgsql security definer set search_path = public as $$
begin
  perform public.expire_stale_holds();
  return query
    select b.start_date, b.end_date
    from public.bookings b
    where b.car_id = p_car_id and b.status not in ('cancelled', 'refunded')
  union all
    select k.start_date, k.end_date
    from public.car_blackout_dates k
    where k.car_id = p_car_id;
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
    where b.car_id = any(p_car_ids) and b.status not in ('cancelled', 'refunded')
  union all
    select k.car_id, k.start_date, k.end_date
    from public.car_blackout_dates k
    where k.car_id = any(p_car_ids);
end;
$$;

grant execute on function public.car_booked_ranges(uuid) to anon, authenticated;
grant execute on function public.car_booked_ranges_bulk(uuid[]) to anon, authenticated;

-- ============================================================
-- quote_booking / prepare_booking / recompute_booking_on_date_change —
-- identical to 0031_cx_score_booking_benefit.sql's own versions, each
-- with one addition: reject dates that overlap a host's blackout, the
-- same "This car is unavailable" family of error the existing booking-
-- overlap check already raises. recompute_booking_on_date_change is the
-- one of the three that never had an overlap check of its own at all —
-- booking-vs-booking overlap on an UPDATE is still caught by the
-- table's own exclusion constraint (0003/0026), but that constraint is
-- single-table by construction and can't reach across to
-- car_blackout_dates, so this path needs its own explicit check or a
-- renter could move an existing booking onto a host's blocked dates via
-- "Modify dates" with nothing stopping them.
-- ============================================================
drop function if exists public.quote_booking(uuid, date, date, text, uuid[], uuid, text);

create or replace function public.quote_booking(
  p_car_id uuid,
  p_start_date date,
  p_end_date date,
  p_fare_tier text default 'standard',
  p_extra_ids uuid[] default '{}',
  p_reward_id uuid default null,
  p_fulfillment_type text default 'pickup'
)
returns table (total numeric, currency text, days int, deposit numeric, delivery_fee numeric, cx_discount numeric)
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
  v_cx_discount numeric := 0;
  v_extras numeric := 0;
  v_deposit numeric;
  v_delivery_fee numeric := 0;
  v_reward record;
  v_score integer;
  v_level record;
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

  if exists (
    select 1 from public.car_blackout_dates
    where car_id = p_car_id
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

  select coalesce(score, 0) into v_score from public.cx_scores where user_id = v_renter;
  select * into v_level from public.cx_current_level(coalesce(v_score, 0));
  if v_level.benefit_percentage > 0 then
    v_cx_discount := least(round(v_pre_discount * v_level.benefit_percentage / 100.0), v_level.max_discount_eur);
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

  return query select (v_pre_discount - v_discount - v_cx_discount + v_extras), 'eur'::text, v_days, v_deposit, v_delivery_fee, v_cx_discount;
end;
$$;

grant execute on function public.quote_booking(uuid, date, date, text, uuid[], uuid, text) to authenticated;

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
  return new;
end;
$$;
