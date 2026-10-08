-- CX Keychain + Roadbook.
--
-- A "verified trip" is a real booking the renter actually drove. After it ends
-- the renter may turn it into a Keychain card: either "Pubblica" (a public
-- SIGNAL post about the car, also shown in their Keychain and in that car's
-- Roadbook) or "Solo io" (a private memory only they can see). Nothing is ever
-- published automatically. Only the car's general city is stored — never an
-- address or exact position.

-- ------------------------------------------------------------ trip memories
create table if not exists public.signal_trip_memories (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  city text not null,
  start_date date not null,
  end_date date not null,
  body text not null default '' check (char_length(body) <= 400),
  visibility text not null check (visibility in ('public', 'private')),
  post_id uuid references public.empire_posts(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists signal_trip_memories_user_idx on public.signal_trip_memories (user_id, created_at desc);
create index if not exists signal_trip_memories_car_idx on public.signal_trip_memories (car_id, created_at desc)
  where visibility = 'public' and post_id is not null;
create index if not exists signal_trip_memories_post_idx on public.signal_trip_memories (post_id) where post_id is not null;

alter table public.signal_trip_memories enable row level security;
revoke all on public.signal_trip_memories from anon, authenticated;
-- Reads and writes go through the functions below only.

create or replace function public.publish_trip_memory(p_booking_id uuid, p_body text, p_visibility text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  b public.bookings%rowtype;
  v_city text;
  v_body text := left(btrim(coalesce(p_body, '')), 400);
  v_post uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_visibility not in ('public', 'private') then raise exception 'Invalid visibility'; end if;

  select * into b from public.bookings where id = p_booking_id and renter_id = auth.uid();
  if not found then raise exception 'Booking not found'; end if;
  if not (b.status = 'completed' or (b.status = 'confirmed' and b.end_date < current_date)) then
    raise exception 'The trip is not over yet';
  end if;
  if exists (select 1 from public.signal_trip_memories where booking_id = p_booking_id) then
    raise exception 'This trip already has a Keychain card';
  end if;

  select c.city into v_city from public.cars c where c.id = b.car_id;
  if v_city is null then raise exception 'Car not found'; end if;

  if p_visibility = 'public' then
    insert into public.empire_posts (author_id, category, title, body, media_paths, comments_disabled, publisher_type, vehicle_id)
    values (auth.uid(), 'community', null, case when v_body = '' then chr(8203) else v_body end, '{}', true, 'self', b.car_id)
    returning id into v_post;
  end if;

  insert into public.signal_trip_memories (booking_id, user_id, car_id, city, start_date, end_date, body, visibility, post_id)
  values (b.id, auth.uid(), b.car_id, v_city, b.start_date, b.end_date, v_body, p_visibility, v_post)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.publish_trip_memory(uuid, text, text) to authenticated;

-- Whether a booking already has a card (so the trip page can offer it once).
create or replace function public.my_trip_memory_for_booking(p_booking_id uuid)
returns table (id uuid, visibility text)
language sql stable security definer set search_path = public
as $$
  select m.id, m.visibility from public.signal_trip_memories m
  where m.booking_id = p_booking_id and m.user_id = auth.uid();
$$;
grant execute on function public.my_trip_memory_for_booking(uuid) to authenticated;

-- A person's Keychain: their public cards for everyone, plus their private
-- ones when you are that person.
create or replace function public.fetch_user_keychain(p_user_id uuid)
returns table (
  id uuid, post_id uuid, visibility text, city text, start_date date, end_date date, body text, created_at timestamptz,
  car_id uuid, car_slug text, car_make text, car_model text, car_year integer, car_image text, car_price numeric
)
language sql stable security definer set search_path = public
as $$
  select m.id, m.post_id, m.visibility, m.city, m.start_date, m.end_date, m.body, m.created_at,
    c.id, c.slug, c.make, c.model, c.year,
    (select ci.url from public.car_images ci where ci.car_id = c.id order by ci.position asc limit 1),
    c.price_per_day
  from public.signal_trip_memories m
  join public.cars c on c.id = m.car_id
  where auth.uid() is not null
    and m.user_id = p_user_id
    and (m.user_id = auth.uid() or (m.visibility = 'public' and m.post_id is not null))
  order by m.created_at desc;
$$;
grant execute on function public.fetch_user_keychain(uuid) to authenticated;

-- A car's Roadbook: the public verified trips about that exact car.
create or replace function public.fetch_car_roadbook(p_car_id uuid)
returns table (
  id uuid, post_id uuid, city text, start_date date, end_date date, body text, created_at timestamptz,
  author_id uuid, author_name text, author_avatar text, author_username text
)
language sql stable security definer set search_path = public
as $$
  select m.id, m.post_id, m.city, m.start_date, m.end_date, m.body, m.created_at,
    p.id, p.full_name, p.avatar_url, p.username
  from public.signal_trip_memories m
  join public.profiles p on p.id = m.user_id
  where auth.uid() is not null and m.car_id = p_car_id and m.visibility = 'public' and m.post_id is not null
  order by m.created_at desc
  limit 20;
$$;
grant execute on function public.fetch_car_roadbook(uuid) to authenticated;

-- Which of these posts are verified trips (for the badge).
create or replace function public.fetch_trip_badges(p_post_ids uuid[])
returns table (post_id uuid, city text, start_date date, end_date date)
language sql stable security definer set search_path = public
as $$
  select m.post_id, m.city, m.start_date, m.end_date
  from public.signal_trip_memories m
  where auth.uid() is not null and m.post_id = any (p_post_ids) and m.visibility = 'public';
$$;
grant execute on function public.fetch_trip_badges(uuid[]) to authenticated;

-- ------------------------------------------------------- "On the Road" stories
create table if not exists public.signal_story_trips (
  story_id uuid primary key references public.empire_stories(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  city text not null,
  created_at timestamptz not null default now()
);
alter table public.signal_story_trips enable row level security;
revoke all on public.signal_story_trips from anon, authenticated;

-- The caller's trip that is happening right now, if any (for the toggle).
create or replace function public.my_active_trip()
returns table (booking_id uuid, city text)
language sql stable security definer set search_path = public
as $$
  select b.id, c.city
  from public.bookings b join public.cars c on c.id = b.car_id
  where auth.uid() is not null and b.renter_id = auth.uid()
    and b.status = 'confirmed' and b.start_date <= current_date and b.end_date >= current_date
  order by b.start_date desc limit 1;
$$;
grant execute on function public.my_active_trip() to authenticated;

-- Marks one of your own fresh stories "On the Road" (only your active trip).
create or replace function public.tag_story_on_the_road(p_story_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.empire_stories s where s.id = p_story_id and s.author_id = auth.uid()) then
    raise exception 'Not your story';
  end if;
  select * into t from public.my_active_trip();
  if t.booking_id is null then raise exception 'No active trip'; end if;
  insert into public.signal_story_trips (story_id, booking_id, city) values (p_story_id, t.booking_id, t.city)
  on conflict (story_id) do nothing;
end;
$$;
grant execute on function public.tag_story_on_the_road(uuid) to authenticated;

create or replace function public.fetch_story_trip_labels(p_story_ids uuid[])
returns table (story_id uuid, city text)
language sql stable security definer set search_path = public
as $$
  select st.story_id, st.city from public.signal_story_trips st
  where auth.uid() is not null and st.story_id = any (p_story_ids);
$$;
grant execute on function public.fetch_story_trip_labels(uuid[]) to authenticated;
