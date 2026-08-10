-- Velora — initial schema (Phase 1: profiles/auth foundation, plus the
-- tables later phases will populate: cars, bookings, messaging).
-- Run this once in the Supabase SQL editor (or via `supabase db push`)
-- against a fresh project.

-- ============================================================
-- Enums
-- ============================================================
create type public.car_category as enum
  ('Economy', 'Luxury', 'SUV', 'Sport', 'Electric', 'Convertible', 'Family');
create type public.transmission_type as enum ('Automatic', 'Manual');
create type public.fuel_type as enum ('Petrol', 'Diesel', 'Electric', 'Hybrid');
create type public.car_status as enum ('draft', 'published');
create type public.booking_status as enum ('upcoming', 'completed', 'cancelled');

-- ============================================================
-- profiles — one row per signed-up user (renter and/or host)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  phone text,
  location text,
  bio text,
  is_host boolean not null default false,
  response_time text,
  response_rate numeric,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row whenever someone signs up via Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- cars
-- ============================================================
create table public.cars (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  make text not null,
  model text not null,
  trim text,
  year int not null,
  category public.car_category not null,
  city text not null,
  location text not null,
  price_per_day numeric not null check (price_per_day > 0),
  transmission public.transmission_type not null,
  fuel public.fuel_type not null,
  seats int not null,
  doors int not null,
  mileage text,
  drive text,
  description text,
  features text[] not null default '{}',
  instant_book boolean not null default false,
  status public.car_status not null default 'draft',
  created_at timestamptz not null default now()
);

create index cars_host_id_idx on public.cars (host_id);
create index cars_status_idx on public.cars (status);

alter table public.cars enable row level security;

create policy "Published cars are viewable by everyone"
  on public.cars for select
  using (status = 'published' or host_id = auth.uid());

create policy "Hosts can insert own cars"
  on public.cars for insert
  with check (host_id = auth.uid());

create policy "Hosts can update own cars"
  on public.cars for update
  using (host_id = auth.uid());

create policy "Hosts can delete own cars"
  on public.cars for delete
  using (host_id = auth.uid());

-- ============================================================
-- car_images
-- ============================================================
create table public.car_images (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars (id) on delete cascade,
  url text not null,
  position int not null default 0
);

create index car_images_car_id_idx on public.car_images (car_id);

alter table public.car_images enable row level security;

create policy "Car images viewable with their car"
  on public.car_images for select
  using (
    exists (
      select 1 from public.cars
      where cars.id = car_images.car_id
        and (cars.status = 'published' or cars.host_id = auth.uid())
    )
  );

create policy "Hosts manage own car images"
  on public.car_images for all
  using (exists (select 1 from public.cars where cars.id = car_images.car_id and cars.host_id = auth.uid()))
  with check (exists (select 1 from public.cars where cars.id = car_images.car_id and cars.host_id = auth.uid()));

-- ============================================================
-- reviews
-- ============================================================
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  rating numeric not null check (rating >= 1 and rating <= 5),
  body text not null,
  created_at timestamptz not null default now()
);

create index reviews_car_id_idx on public.reviews (car_id);

alter table public.reviews enable row level security;

create policy "Reviews are viewable by everyone"
  on public.reviews for select
  using (true);

create policy "Signed-in users can write reviews"
  on public.reviews for insert
  with check (auth.uid() = author_id);

-- ============================================================
-- favorites
-- ============================================================
create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  car_id uuid not null references public.cars (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, car_id)
);

create index favorites_car_id_idx on public.favorites (car_id);

alter table public.favorites enable row level security;

create policy "Users manage own favorites"
  on public.favorites for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- bookings
-- ============================================================
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars (id) on delete cascade,
  renter_id uuid not null references public.profiles (id) on delete cascade,
  host_id uuid not null references public.profiles (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status public.booking_status not null default 'upcoming',
  total_price numeric not null,
  protection_addon boolean not null default false,
  reference text not null unique,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  check (end_date > start_date)
);

create index bookings_renter_id_idx on public.bookings (renter_id);
create index bookings_host_id_idx on public.bookings (host_id);
create index bookings_car_id_idx on public.bookings (car_id);

alter table public.bookings enable row level security;

create policy "Renters and hosts view relevant bookings"
  on public.bookings for select
  using (auth.uid() = renter_id or auth.uid() = host_id);

create policy "Renters create own bookings"
  on public.bookings for insert
  with check (auth.uid() = renter_id);

create policy "Renters or hosts update relevant bookings"
  on public.bookings for update
  using (auth.uid() = renter_id or auth.uid() = host_id);

-- ============================================================
-- Messaging: conversations / conversation_participants / messages
--
-- A helper function is used (instead of a self-referencing policy on
-- conversation_participants) to avoid recursive RLS evaluation — the
-- classic gotcha when a table's own policy queries that same table.
-- ============================================================
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  car_id uuid references public.cars (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (conversation_id, user_id)
);

create index conversation_participants_user_id_idx on public.conversation_participants (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index messages_conversation_id_idx on public.messages (conversation_id);

create or replace function public.is_conversation_participant(conv_id uuid, uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = conv_id and user_id = uid
  );
$$;

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

create policy "Participants can view their conversations"
  on public.conversations for select
  using (public.is_conversation_participant(id, auth.uid()));

create policy "Signed-in users can start conversations"
  on public.conversations for insert
  with check (auth.uid() is not null);

create policy "Participants can view participant rows"
  on public.conversation_participants for select
  using (public.is_conversation_participant(conversation_id, auth.uid()));

create policy "Signed-in users can add participants"
  on public.conversation_participants for insert
  with check (auth.uid() is not null);

create policy "Participants can view messages"
  on public.messages for select
  using (public.is_conversation_participant(conversation_id, auth.uid()));

create policy "Participants can send messages"
  on public.messages for insert
  with check (auth.uid() = sender_id and public.is_conversation_participant(conversation_id, auth.uid()));

create policy "Participants can mark messages read"
  on public.messages for update
  using (public.is_conversation_participant(conversation_id, auth.uid()));

-- ============================================================
-- Storage buckets: avatars, car-photos
-- Upload paths are expected to be prefixed with the uploader's own
-- auth.uid() as the first folder segment, e.g. `{uid}/photo-1.jpg`.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('car-photos', 'car-photos', true)
on conflict (id) do nothing;

create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can update their own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Car photos are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'car-photos');

create policy "Hosts can upload their own car photos"
  on storage.objects for insert
  with check (bucket_id = 'car-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Hosts can update their own car photos"
  on storage.objects for update
  using (bucket_id = 'car-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Hosts can delete their own car photos"
  on storage.objects for delete
  using (bucket_id = 'car-photos' and auth.uid()::text = (storage.foldername(name))[1]);
