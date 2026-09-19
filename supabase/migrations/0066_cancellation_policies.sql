-- Host-chosen cancellation policies (Airbnb-style, adapted to cars).
--
-- Before this, cancellation rules came from a renter-chosen "fare tier"
-- (standard = free until 24h before pick-up, flexible = free until pick-up
-- for a surcharge) and a plain cancellation never moved any money — refunds
-- were a manual owner/admin action. Now every car carries a policy its host
-- picks, every booking snapshots that policy at booking time (so a host
-- changing their policy later can never change an existing trip's terms),
-- and api/cancel-booking.ts refunds automatically according to it.
--
--   flexible : 100% refund until 24h before pick-up, then nothing
--   moderate : 100% until 5 days before, 50% until 24h before, then nothing
--   strict   : 50% until 7 days before, then nothing
--
-- The pricing functions (quote_booking / prepare_booking / recompute) are
-- deliberately NOT touched. The old fare_tier column stays for history;
-- new bookings are always 'standard' so no surcharge is ever applied.

-- Existing cars keep what renters were already promised (free cancellation
-- until 24h before pick-up == "flexible")...
alter table public.cars
  add column if not exists cancellation_policy text not null default 'flexible'
  check (cancellation_policy in ('flexible', 'moderate', 'strict'));

-- ...while newly listed cars default to Airbnb's usual middle ground.
alter table public.cars
  alter column cancellation_policy set default 'moderate';

alter table public.bookings
  add column if not exists cancellation_policy text not null default 'flexible'
  check (cancellation_policy in ('flexible', 'moderate', 'strict')),
  add column if not exists refund_amount numeric not null default 0;

-- Snapshot the car's policy onto each new booking. A separate trigger so
-- the existing prepare_booking() (pricing) stays untouched.
create or replace function public.snapshot_cancellation_policy()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  select cancellation_policy into new.cancellation_policy
  from public.cars
  where id = new.car_id;
  return new;
end;
$$;

drop trigger if exists trg_snapshot_cancellation_policy on public.bookings;
create trigger trg_snapshot_cancellation_policy
  before insert on public.bookings
  for each row execute function public.snapshot_cancellation_policy();

-- A signed-in user can update their own booking row through RLS, so the
-- policy snapshot and refund figures must not be editable that way — only
-- the server (service role / SQL editor, where auth.uid() is null) may
-- write them. Otherwise a renter could switch their own booking to
-- "flexible" right before cancelling.
create or replace function public.protect_cancellation_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null and (
    new.cancellation_policy is distinct from old.cancellation_policy
    or new.refund_amount is distinct from old.refund_amount
  ) then
    raise exception 'Cancellation terms cannot be changed on an existing booking.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_cancellation_columns on public.bookings;
create trigger trg_protect_cancellation_columns
  before update on public.bookings
  for each row execute function public.protect_cancellation_columns();
