-- CX Keychain: one travel stamp per finished, CX-verified trip.
--
-- A stamp is created automatically for every booking that is over (status
-- 'completed', or 'confirmed' with an end date in the past). It is PRIVATE by
-- default and only its owner can make it public. It carries just the car, the
-- general city and the dates — never an address, a route or a time.

create table if not exists public.signal_trip_stamps (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  city text not null,
  start_date date not null,
  end_date date not null,
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  verified boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists signal_trip_stamps_user_idx on public.signal_trip_stamps (user_id, start_date desc);
create index if not exists signal_trip_stamps_car_idx on public.signal_trip_stamps (car_id, start_date desc) where visibility = 'public';

alter table public.signal_trip_stamps enable row level security;
revoke all on public.signal_trip_stamps from anon, authenticated;

-- Creates the missing stamps for the caller's finished trips. Safe to call any
-- number of times. Returns how many were created.
create or replace function public.sync_my_trip_stamps()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null then return 0; end if;
  insert into public.signal_trip_stamps (booking_id, user_id, car_id, city, start_date, end_date)
  select b.id, b.renter_id, b.car_id, c.city, b.start_date, b.end_date
  from public.bookings b
  join public.cars c on c.id = b.car_id
  where b.renter_id = auth.uid()
    and (b.status = 'completed' or (b.status = 'confirmed' and b.end_date < current_date))
  on conflict (booking_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function public.sync_my_trip_stamps() to authenticated;

-- A person's stamps: everything for the owner, only public ones for others.
create or replace function public.fetch_user_stamps(p_user_id uuid)
returns table (
  id uuid, visibility text, city text, start_date date, end_date date,
  car_id uuid, car_slug text, car_make text, car_model text, car_year integer
)
language sql stable security definer set search_path = public
as $$
  select s.id, s.visibility, s.city, s.start_date, s.end_date, c.id, c.slug, c.make, c.model, c.year
  from public.signal_trip_stamps s
  join public.cars c on c.id = s.car_id
  where auth.uid() is not null and s.verified and s.user_id = p_user_id
    and (s.user_id = auth.uid() or s.visibility = 'public')
  order by s.start_date desc;
$$;
grant execute on function public.fetch_user_stamps(uuid) to authenticated;

-- The public stamps of one car (for its Roadbook).
create or replace function public.fetch_car_stamps(p_car_id uuid)
returns table (
  id uuid, city text, start_date date, end_date date,
  car_id uuid, car_slug text, car_make text, car_model text, car_year integer
)
language sql stable security definer set search_path = public
as $$
  select s.id, s.city, s.start_date, s.end_date, c.id, c.slug, c.make, c.model, c.year
  from public.signal_trip_stamps s
  join public.cars c on c.id = s.car_id
  where auth.uid() is not null and s.verified and s.car_id = p_car_id and s.visibility = 'public'
  order by s.start_date desc
  limit 12;
$$;
grant execute on function public.fetch_car_stamps(uuid) to authenticated;

-- Only the owner of a stamp can change who sees it.
create or replace function public.set_trip_stamp_visibility(p_stamp_id uuid, p_visibility text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_visibility not in ('public', 'private') then raise exception 'Invalid visibility'; end if;
  update public.signal_trip_stamps set visibility = p_visibility where id = p_stamp_id and user_id = auth.uid();
  if not found then raise exception 'Stamp not found'; end if;
end;
$$;
grant execute on function public.set_trip_stamp_visibility(uuid, text) to authenticated;

-- The stamp of one booking (for the trip page).
create or replace function public.my_stamp_for_booking(p_booking_id uuid)
returns table (id uuid, visibility text)
language sql stable security definer set search_path = public
as $$
  select s.id, s.visibility from public.signal_trip_stamps s
  where s.booking_id = p_booking_id and s.user_id = auth.uid();
$$;
grant execute on function public.my_stamp_for_booking(uuid) to authenticated;
