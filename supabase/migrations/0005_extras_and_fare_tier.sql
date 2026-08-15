-- Velora — selectable extras, flexible-cancellation fare tier, and date
-- modification (SIXT benchmark report items A2/A3/A4).
--
-- Extras: unit_price is always computed server-side from extras_catalog,
-- never trusted from the client (same principle as prepare_booking).
-- Because the JS client can't do a single multi-table transaction, extras
-- are inserted in a follow-up call after the booking row exists; an AFTER
-- INSERT trigger folds each extra's cost onto bookings.total_price.
--
-- Fare tier: a flat 10%/day surcharge on the base rate for "Stay flexible"
-- (free cancellation any time before pick-up), computed in the same
-- prepare_booking trigger that already computes service/protection.
--
-- Date modification: a separate BEFORE UPDATE trigger (not the INSERT
-- one) recomputes the full price from the car's real rate and the new day
-- count, and rescales any attached per-day extras to match. The existing
-- bookings_no_overlap exclusion constraint already covers UPDATE, so a
-- modified booking can't be moved onto another confirmed booking's dates.

create table public.extras_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null,
  price numeric not null,
  price_model text not null check (price_model in ('flat', 'per_day')),
  icon text not null,
  active boolean not null default true
);

alter table public.extras_catalog enable row level security;

create policy "Extras catalogue is publicly readable"
  on public.extras_catalog for select
  using (true);

insert into public.extras_catalog (code, name, description, price, price_model, icon) values
  ('additional_driver', 'Additional driver', 'Add a second person authorised to drive during the trip.', 8, 'per_day', 'users'),
  ('child_seat', 'Child seat', 'A certified child seat, fitted and ready before pick-up.', 6, 'per_day', 'seat');

create table public.booking_extras (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  extra_id uuid not null references public.extras_catalog (id),
  quantity int not null default 1 check (quantity > 0),
  unit_price numeric not null,
  created_at timestamptz not null default now(),
  unique (booking_id, extra_id)
);

alter table public.booking_extras enable row level security;

create policy "Renters and hosts view their booking extras"
  on public.booking_extras for select
  using (exists (
    select 1 from public.bookings b
    where b.id = booking_extras.booking_id
      and (b.renter_id = auth.uid() or b.host_id = auth.uid())
  ));

create policy "Renters add extras to their own booking"
  on public.booking_extras for insert
  with check (exists (
    select 1 from public.bookings b
    where b.id = booking_extras.booking_id
      and b.renter_id = auth.uid()
  ));

create or replace function public.prepare_booking_extra()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_price numeric;
  v_model text;
  v_days int;
begin
  select price, price_model into v_price, v_model
  from public.extras_catalog
  where id = new.extra_id and active;

  if v_price is null then
    raise exception 'Extra not found or inactive';
  end if;

  select greatest(1, end_date - start_date) into v_days
  from public.bookings where id = new.booking_id;

  new.unit_price := case when v_model = 'per_day' then v_price * v_days else v_price end;
  return new;
end;
$$;

create trigger booking_extras_prepare
  before insert on public.booking_extras
  for each row execute procedure public.prepare_booking_extra();

create or replace function public.apply_extra_to_booking_total()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.bookings
  set total_price = total_price + (new.unit_price * new.quantity)
  where id = new.booking_id;
  return new;
end;
$$;

create trigger booking_extras_apply_total
  after insert on public.booking_extras
  for each row execute procedure public.apply_extra_to_booking_total();

-- Fare tier
alter table public.bookings
  add column fare_tier text not null default 'standard' check (fare_tier in ('standard', 'flexible'));

-- Extend the existing insert-time pricing trigger with the flex surcharge.
create or replace function public.prepare_booking()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_price numeric;
  v_host uuid;
  v_days int;
  v_base numeric;
  v_service numeric;
  v_protection numeric;
  v_flex numeric;
begin
  select price_per_day, host_id into v_price, v_host
  from public.cars
  where id = new.car_id and status = 'published';

  if v_price is null then
    raise exception 'Car not found or not published';
  end if;

  v_days := greatest(1, new.end_date - new.start_date);
  v_base := v_price * v_days;
  v_service := round(v_base * 0.12);
  v_protection := round(v_price * 0.18) * v_days;
  v_flex := case when new.fare_tier = 'flexible' then round(v_price * 0.10) * v_days else 0 end;

  new.host_id := v_host;
  new.total_price := v_base + v_service + v_protection + v_flex;
  new.reference := 'VLR-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  return new;
end;
$$;

-- Date modification: recomputes the full price from scratch using the new
-- dates, then rescales any per-day extras already attached to the booking.
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

  new.total_price := v_base + v_service + v_protection + v_flex + v_extras;
  return new;
end;
$$;

create trigger bookings_recompute_on_date_change
  before update of start_date, end_date on public.bookings
  for each row execute procedure public.recompute_booking_on_date_change();
