-- Velora — booking integrity (Phase 4: real bookings).
--
-- Two things the client must never be trusted with:
--
--   1. Overlap prevention. A check-then-insert in application code has a
--      race condition (two requests can both pass the check before either
--      inserts). Postgres's exclusion constraints close that race at the
--      database level — the second conflicting insert simply fails,
--      regardless of timing.
--
--   2. Money and identity. total_price, host_id and the booking reference
--      are computed server-side from the real `cars` row, not accepted
--      from the client, so nothing here can be spoofed by editing a
--      request payload.

create extension if not exists btree_gist;

alter table public.bookings
  add column pickup_location text;

-- No two non-cancelled bookings for the same car may occupy overlapping
-- date ranges (inclusive on both ends — a car needs a day between trips
-- to be returned, inspected and handed off again).
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    car_id with =,
    daterange(start_date, end_date, '[]') with &&
  )
  where (status <> 'cancelled');

-- Mirrors the pricing formula already shown to the user during checkout
-- (see priceBreakdown in src/components/BookingCard.tsx) so the number
-- confirmed on screen always matches what gets stored: base + 12% service
-- fee + protection at 18% of the daily rate per day.
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

  new.host_id := v_host;
  new.total_price := v_base + v_service + v_protection;
  new.reference := 'VLR-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  return new;
end;
$$;

create trigger bookings_prepare
  before insert on public.bookings
  for each row execute procedure public.prepare_booking();
