-- CX Configurator — real configuration options + saved builds.
--
-- NOT YET APPLIED. Run this (supabase db push, or the SQL editor) to turn
-- the configurator's Exterior/Wheels/Interior panels on. Until then they
-- render an honest "not published for this vehicle" state — the client
-- deliberately invents nothing (see src/lib/data/carConfig.ts).
--
-- There is intentionally NO seed data here: a colour or wheel option is a
-- claim about a specific physical vehicle, so only the host who owns the
-- listing can truthfully populate it. Seeding plausible-looking values
-- would put un-honourable options in front of renters.

create table public.car_config_options (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars (id) on delete cascade,
  kind text not null check (kind in ('exterior', 'wheels', 'interior')),
  label text not null,
  -- '#rrggbb' for a paint/interior swatch; null for wheels, which use image_url.
  swatch text check (swatch is null or swatch ~ '^#[0-9a-fA-F]{6}$'),
  image_url text,
  position int not null default 0,
  -- Whether picking this actually changes what gets delivered. False means
  -- the UI must present it as a visual preference only.
  is_orderable boolean not null default false,
  created_at timestamptz not null default now(),
  unique (car_id, kind, label)
);

create index car_config_options_car_idx on public.car_config_options (car_id, kind, position);

alter table public.car_config_options enable row level security;

-- Readable by anyone who can already see the car (same visibility rule as
-- the listing itself), writable only by the host who owns it.
create policy "Config options readable for published cars"
  on public.car_config_options for select
  using (exists (
    select 1 from public.cars c
    where c.id = car_config_options.car_id
      and (c.status = 'published' or c.host_id = auth.uid())
  ));

create policy "Hosts manage their own car config options"
  on public.car_config_options for all
  using (exists (
    select 1 from public.cars c
    where c.id = car_config_options.car_id and c.host_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.cars c
    where c.id = car_config_options.car_id and c.host_id = auth.uid()
  ));

-- A renter's saved build. Currently localStorage-backed on the client;
-- this table is what makes a build follow the user across devices.
create table public.saved_configurations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  car_id uuid not null references public.cars (id) on delete cascade,
  view_index int not null default 0,
  exterior_option_id uuid references public.car_config_options (id) on delete set null,
  wheels_option_id uuid references public.car_config_options (id) on delete set null,
  interior_option_id uuid references public.car_config_options (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, car_id)
);

alter table public.saved_configurations enable row level security;

-- Strictly private: a saved build is only ever visible to its owner.
create policy "Users manage only their own saved configurations"
  on public.saved_configurations for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
