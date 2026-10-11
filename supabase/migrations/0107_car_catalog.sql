-- CX car catalog: every car on the platform is a real model from our catalogue, shown with our own
-- studio-quality image first and the host's own photos after it.
--
--   car_catalog         — makes / models / versions with the facts a host would otherwise type
--                         (category, seats, doors, luggage, fuel, transmission, drive).
--   car_catalog_images  — one cut-out per paint colour of a model (the first image of a listing).
--   cars.catalog_id / color_key — what a host picked.
--
-- Owner / Admin manage the catalogue (Admin → Catalog). Everyone can read it.
-- Existing cars keep working untouched (catalog_id is null → host photos only).

create table if not exists public.car_catalog (
  id uuid primary key default gen_random_uuid(),
  make text not null,
  model text not null,
  version text,
  year_from int not null,
  year_to int,
  category public.car_category not null,
  seats int not null default 5,
  doors int not null default 4,
  luggage int not null default 2,
  fuels text[] not null default '{Petrol}',
  transmissions text[] not null default '{Automatic}',
  drives text[] not null default '{Rear-wheel drive}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists car_catalog_unique_idx
  on public.car_catalog (lower(make), lower(model), lower(coalesce(version, '')), year_from);

create table if not exists public.car_catalog_images (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.car_catalog (id) on delete cascade,
  color_key text not null,
  color_label text not null,
  color_hex text not null default '#9aa0a6',
  url text not null,
  is_default boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (catalog_id, color_key)
);
create index if not exists car_catalog_images_catalog_idx on public.car_catalog_images (catalog_id);

alter table public.cars
  add column if not exists catalog_id uuid references public.car_catalog (id) on delete set null,
  add column if not exists color_key text;

alter table public.car_catalog enable row level security;
alter table public.car_catalog_images enable row level security;

drop policy if exists "Catalogue is public" on public.car_catalog;
create policy "Catalogue is public" on public.car_catalog for select using (true);
drop policy if exists "Catalogue images are public" on public.car_catalog_images;
create policy "Catalogue images are public" on public.car_catalog_images for select using (true);

drop policy if exists "Admins manage the catalogue" on public.car_catalog;
create policy "Admins manage the catalogue" on public.car_catalog for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins manage catalogue images" on public.car_catalog_images;
create policy "Admins manage catalogue images" on public.car_catalog_images for all
  using (public.is_admin()) with check (public.is_admin());

-- Storage: public read (these are marketing images), admin write.
insert into storage.buckets (id, name, public, file_size_limit)
values ('car-catalog', 'car-catalog', true, 10485760)
on conflict (id) do nothing;

drop policy if exists "Admins upload catalogue images" on storage.objects;
create policy "Admins upload catalogue images" on storage.objects for insert to authenticated
  with check (bucket_id = 'car-catalog' and public.is_admin());
drop policy if exists "Admins replace catalogue images" on storage.objects;
create policy "Admins replace catalogue images" on storage.objects for update to authenticated
  using (bucket_id = 'car-catalog' and public.is_admin());
drop policy if exists "Admins delete catalogue images" on storage.objects;
create policy "Admins delete catalogue images" on storage.objects for delete to authenticated
  using (bucket_id = 'car-catalog' and public.is_admin());

-- ---------------------------------------------------------------- starter catalogue (no images yet)
insert into public.car_catalog (make, model, version, year_from, year_to, category, seats, doors, luggage, fuels, transmissions, drives) values
  ('Porsche', '911', 'Carrera', 2019, null, 'Sport', 4, 2, 2, '{Petrol}', '{Automatic,Manual}', '{Rear-wheel drive,All-wheel drive}'),
  ('Porsche', '911', 'Turbo S', 2020, null, 'Sport', 4, 2, 2, '{Petrol}', '{Automatic}', '{All-wheel drive}'),
  ('Porsche', '718', 'Boxster', 2016, null, 'Convertible', 2, 2, 2, '{Petrol}', '{Automatic,Manual}', '{Rear-wheel drive}'),
  ('Porsche', '718', 'Cayman', 2016, null, 'Sport', 2, 2, 2, '{Petrol}', '{Automatic,Manual}', '{Rear-wheel drive}'),
  ('Porsche', 'Taycan', null, 2020, null, 'Electric', 4, 4, 3, '{Electric}', '{Automatic}', '{All-wheel drive,Rear-wheel drive}'),
  ('Porsche', 'Panamera', null, 2017, null, 'Luxury', 4, 4, 3, '{Petrol,Hybrid}', '{Automatic}', '{All-wheel drive}'),
  ('Porsche', 'Cayenne', null, 2018, null, 'SUV', 5, 5, 4, '{Petrol,Hybrid}', '{Automatic}', '{All-wheel drive}'),
  ('Porsche', 'Macan', null, 2018, null, 'SUV', 5, 5, 3, '{Petrol,Electric}', '{Automatic}', '{All-wheel drive}'),
  ('Ferrari', 'Roma', null, 2020, null, 'Sport', 4, 2, 2, '{Petrol}', '{Automatic}', '{Rear-wheel drive}'),
  ('Ferrari', 'F8 Tributo', null, 2019, 2023, 'Sport', 2, 2, 1, '{Petrol}', '{Automatic}', '{Rear-wheel drive}'),
  ('Ferrari', '296 GTB', null, 2022, null, 'Sport', 2, 2, 1, '{Hybrid}', '{Automatic}', '{Rear-wheel drive}'),
  ('Ferrari', 'Portofino', null, 2018, 2023, 'Convertible', 4, 2, 2, '{Petrol}', '{Automatic}', '{Rear-wheel drive}'),
  ('Lamborghini', 'Huracán', null, 2015, null, 'Sport', 2, 2, 1, '{Petrol}', '{Automatic}', '{All-wheel drive,Rear-wheel drive}'),
  ('Lamborghini', 'Urus', null, 2019, null, 'SUV', 5, 5, 4, '{Petrol,Hybrid}', '{Automatic}', '{All-wheel drive}'),
  ('Mercedes-Benz', 'AMG GT', null, 2015, null, 'Sport', 2, 2, 1, '{Petrol}', '{Automatic}', '{Rear-wheel drive,All-wheel drive}'),
  ('Mercedes-Benz', 'C-Class', null, 2019, null, 'Luxury', 5, 4, 3, '{Petrol,Diesel,Hybrid}', '{Automatic}', '{Rear-wheel drive,All-wheel drive}'),
  ('Mercedes-Benz', 'S-Class', null, 2018, null, 'Luxury', 5, 4, 3, '{Petrol,Diesel,Hybrid}', '{Automatic}', '{Rear-wheel drive,All-wheel drive}'),
  ('Mercedes-Benz', 'G-Class', null, 2018, null, 'SUV', 5, 5, 3, '{Petrol,Diesel}', '{Automatic}', '{All-wheel drive}'),
  ('Mercedes-Benz', 'GLE', null, 2019, null, 'SUV', 5, 5, 4, '{Petrol,Diesel,Hybrid}', '{Automatic}', '{All-wheel drive}'),
  ('BMW', 'M2', null, 2016, null, 'Sport', 4, 2, 2, '{Petrol}', '{Automatic,Manual}', '{Rear-wheel drive}'),
  ('BMW', 'M3', null, 2018, null, 'Sport', 5, 4, 3, '{Petrol}', '{Automatic,Manual}', '{Rear-wheel drive,All-wheel drive}'),
  ('BMW', 'M4', null, 2018, null, 'Sport', 4, 2, 2, '{Petrol}', '{Automatic,Manual}', '{Rear-wheel drive,All-wheel drive}'),
  ('BMW', 'X5', null, 2019, null, 'SUV', 5, 5, 4, '{Petrol,Diesel,Hybrid}', '{Automatic}', '{All-wheel drive}'),
  ('BMW', 'i4', null, 2022, null, 'Electric', 5, 4, 3, '{Electric}', '{Automatic}', '{Rear-wheel drive,All-wheel drive}'),
  ('BMW', '3 Series', null, 2019, null, 'Family', 5, 4, 3, '{Petrol,Diesel,Hybrid}', '{Automatic,Manual}', '{Rear-wheel drive,All-wheel drive}'),
  ('Audi', 'R8', null, 2016, 2023, 'Sport', 2, 2, 1, '{Petrol}', '{Automatic}', '{All-wheel drive,Rear-wheel drive}'),
  ('Audi', 'RS6 Avant', null, 2020, null, 'Family', 5, 5, 4, '{Petrol}', '{Automatic}', '{All-wheel drive}'),
  ('Audi', 'RS3', null, 2018, null, 'Sport', 5, 4, 3, '{Petrol}', '{Automatic}', '{All-wheel drive}'),
  ('Audi', 'Q8', null, 2019, null, 'SUV', 5, 5, 4, '{Petrol,Diesel,Hybrid}', '{Automatic}', '{All-wheel drive}'),
  ('Audi', 'e-tron GT', null, 2021, null, 'Electric', 4, 4, 3, '{Electric}', '{Automatic}', '{All-wheel drive}'),
  ('Jaguar', 'F-Type', null, 2014, 2024, 'Sport', 2, 2, 2, '{Petrol}', '{Automatic}', '{Rear-wheel drive,All-wheel drive}'),
  ('Bentley', 'Continental GT', null, 2018, null, 'Luxury', 4, 2, 3, '{Petrol,Hybrid}', '{Automatic}', '{All-wheel drive}'),
  ('Aston Martin', 'Vantage', null, 2018, null, 'Sport', 2, 2, 1, '{Petrol}', '{Automatic}', '{Rear-wheel drive}'),
  ('McLaren', '720S', null, 2017, 2023, 'Sport', 2, 2, 1, '{Petrol}', '{Automatic}', '{Rear-wheel drive}'),
  ('Maserati', 'Levante', null, 2017, null, 'SUV', 5, 5, 4, '{Petrol,Diesel}', '{Automatic}', '{All-wheel drive}'),
  ('Range Rover', 'Sport', null, 2018, null, 'SUV', 5, 5, 4, '{Petrol,Diesel,Hybrid}', '{Automatic}', '{All-wheel drive}'),
  ('Tesla', 'Model 3', null, 2019, null, 'Electric', 5, 4, 3, '{Electric}', '{Automatic}', '{Rear-wheel drive,All-wheel drive}'),
  ('Tesla', 'Model Y', null, 2021, null, 'Electric', 5, 5, 4, '{Electric}', '{Automatic}', '{All-wheel drive,Rear-wheel drive}'),
  ('Tesla', 'Model S', null, 2016, null, 'Electric', 5, 4, 3, '{Electric}', '{Automatic}', '{All-wheel drive}'),
  ('Mini', 'Cooper', null, 2018, null, 'Economy', 4, 3, 1, '{Petrol,Electric}', '{Automatic,Manual}', '{Front-wheel drive}'),
  ('Fiat', '500', null, 2016, null, 'Economy', 4, 3, 1, '{Petrol,Hybrid,Electric}', '{Manual,Automatic}', '{Front-wheel drive}'),
  ('Volkswagen', 'Golf', null, 2018, null, 'Family', 5, 5, 3, '{Petrol,Diesel,Hybrid}', '{Manual,Automatic}', '{Front-wheel drive}'),
  ('Alfa Romeo', 'Giulia', null, 2017, null, 'Luxury', 5, 4, 3, '{Petrol,Diesel}', '{Automatic}', '{Rear-wheel drive,All-wheel drive}'),
  ('Ford', 'Mustang', null, 2018, null, 'Sport', 4, 2, 2, '{Petrol}', '{Automatic,Manual}', '{Rear-wheel drive}')
on conflict do nothing;
