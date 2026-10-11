-- Precise pick-up point: the exact spot the host marked on the map (address search + draggable pin).
-- Signed-in renters see it on the listing and on the booking page.

alter table public.cars
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists address_label text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cars_lat_range_chk') then
    alter table public.cars add constraint cars_lat_range_chk check (lat is null or (lat between -90 and 90));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cars_lng_range_chk') then
    alter table public.cars add constraint cars_lng_range_chk check (lng is null or (lng between -180 and 180));
  end if;
end $$;
