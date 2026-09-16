-- SIGNAL Community — Demo Content Engine.
--
-- A fully separate demo layer so Community never looks empty during
-- development/testing/early launch, without ever touching the real
-- identity system:
--
--   * Demo profiles have NO auth.users row at all — there is nothing
--     for them to authenticate AS, which is a stronger guarantee than
--     a disabled/unusable real account would be. `public.profiles`
--     (and its hard `references auth.users(id)` FK) is untouched.
--   * Demo posts live in their own table, never `empire_posts` — a
--     real post and a demo post can never be confused at the schema
--     level, and deleting all demo content can never risk a real row.
--   * Real users CAN genuinely Respect/Save demo posts (their own real
--     action, stored in its own small join tables) — nothing about a
--     real user's engagement is fabricated. No comments, no follows,
--     no views/shares are modeled for demo content: those specific
--     surfaces simply don't apply here rather than being faked.
--
-- No pg_cron/Edge Functions exist in this project (verified — see
-- 0035_car_flipping_market.sql's own note on this), so "daily
-- generation distributed across the day" follows the exact same lazy-
-- trigger pattern already established for resolve_due_listings/
-- expire_stale_holds: `signal_demo_maybe_generate()` is cheap to call
-- from anywhere in the client on every Community visit, is a no-op
-- unless a scheduled slot (morning/afternoon/evening) is actually due,
-- and a `for update` lock on its singleton state row makes two
-- simultaneous calls safe — the second just sees the slot already
-- marked done and skips.

-- ===========================================================
-- 1. Settings — one configurable row, never hardcoded in the app.
-- ===========================================================
create table public.signal_demo_settings (
  id boolean primary key default true,
  enabled boolean not null default true,
  demo_profiles_per_day integer not null default 2,
  demo_posts_per_day integer not null default 6,
  -- Of a day's posts, how many should carry a photo — the rest post as
  -- text-only. Kept as separate, real config rather than a fixed ratio.
  demo_photos_per_day integer not null default 4,
  -- No real video-asset pipeline exists yet (no Edge Functions / media
  -- generation backend) — this stays a real, respected config value,
  -- just with nothing yet able to produce >0 actual video posts. Not
  -- faked with a fake video file to make the number "work".
  demo_videos_per_day integer not null default 0,
  retention_days integer not null default 14,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint signal_demo_settings_singleton check (id)
);
insert into public.signal_demo_settings (id) values (true) on conflict (id) do nothing;
alter table public.signal_demo_settings enable row level security;
create policy "Admins view demo settings" on public.signal_demo_settings for select using (public.is_admin());

-- ===========================================================
-- 2. Demo profiles — no auth.users row, ever.
-- ===========================================================
create table public.signal_demo_profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  username text not null unique,
  avatar_url text not null,
  bio text,
  role text not null check (role in ('host', 'verified_client')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index signal_demo_profiles_active_idx on public.signal_demo_profiles (is_active);
alter table public.signal_demo_profiles enable row level security;
create policy "Signed-in users view active demo profiles"
  on public.signal_demo_profiles for select
  using (auth.uid() is not null and (is_active or public.is_admin()));

-- ===========================================================
-- 3. Demo posts — never empire_posts.
-- ===========================================================
create table public.signal_demo_posts (
  id uuid primary key default gen_random_uuid(),
  demo_author_id uuid not null references public.signal_demo_profiles(id) on delete cascade,
  theme text not null check (theme in ('city', 'car', 'travel', 'rental', 'lifestyle', 'host_experience', 'client_experience', 'cx_community')),
  title text,
  body text not null,
  -- Unsplash photo ids (see src/lib/img.ts's `unsplash()`, already the
  -- app's one real/licensed stock-photo source for car imagery
  -- elsewhere) — resolved client-side, same as media_paths on a real
  -- post, just through a different helper since there's no Storage
  -- object behind these. Empty = text-only post.
  media_photo_id text,
  generation_batch_id uuid not null,
  generation_slot text not null check (generation_slot in ('morning', 'afternoon', 'evening', 'manual')),
  created_at timestamptz not null default now()
);
create index signal_demo_posts_created_idx on public.signal_demo_posts (created_at desc);
create index signal_demo_posts_batch_idx on public.signal_demo_posts (generation_batch_id);
alter table public.signal_demo_posts enable row level security;
create policy "Signed-in users view demo posts"
  on public.signal_demo_posts for select
  using (auth.uid() is not null);

-- ===========================================================
-- 4. Real engagement ON demo posts — genuinely real, never generated.
-- ===========================================================
create table public.signal_demo_post_likes (
  post_id uuid not null references public.signal_demo_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.signal_demo_post_likes enable row level security;
create policy "Users view their own demo likes" on public.signal_demo_post_likes for select using (auth.uid() = user_id);

create table public.signal_demo_post_saves (
  post_id uuid not null references public.signal_demo_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.signal_demo_post_saves enable row level security;
create policy "Users view their own demo saves" on public.signal_demo_post_saves for select using (auth.uid() = user_id);

-- ===========================================================
-- 5. Scheduling state — one singleton row, `for update` makes a
--    concurrent double-call safe (see header comment).
-- ===========================================================
create table public.signal_demo_schedule_state (
  id boolean primary key default true,
  current_date_utc date not null default ((now() at time zone 'utc')::date),
  morning_done boolean not null default false,
  afternoon_done boolean not null default false,
  evening_done boolean not null default false,
  last_retention_cleanup_at timestamptz,
  constraint signal_demo_schedule_state_singleton check (id)
);
insert into public.signal_demo_schedule_state (id) values (true) on conflict (id) do nothing;
alter table public.signal_demo_schedule_state enable row level security;
create policy "Admins view demo schedule state" on public.signal_demo_schedule_state for select using (public.is_admin());

-- ===========================================================
-- 6. Admin settings read/write.
-- ===========================================================
create or replace function public.fetch_signal_demo_settings()
returns public.signal_demo_settings
language plpgsql stable security definer set search_path = public
as $$
declare
  v_row public.signal_demo_settings;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  select * into v_row from public.signal_demo_settings where id = true;
  return v_row;
end;
$$;
grant execute on function public.fetch_signal_demo_settings() to authenticated;

create or replace function public.set_signal_demo_settings(
  p_enabled boolean, p_demo_profiles_per_day integer, p_demo_posts_per_day integer,
  p_demo_photos_per_day integer, p_demo_videos_per_day integer, p_retention_days integer
)
returns public.signal_demo_settings
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.signal_demo_settings;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if p_demo_profiles_per_day < 0 or p_demo_posts_per_day < 0 or p_demo_photos_per_day < 0
     or p_demo_videos_per_day < 0 or p_retention_days < 1 then
    raise exception 'Values must be non-negative (retention must be at least 1 day)';
  end if;
  update public.signal_demo_settings
  set enabled = p_enabled,
      demo_profiles_per_day = p_demo_profiles_per_day,
      demo_posts_per_day = p_demo_posts_per_day,
      demo_photos_per_day = least(p_demo_photos_per_day, p_demo_posts_per_day),
      demo_videos_per_day = p_demo_videos_per_day,
      retention_days = p_retention_days,
      updated_at = now(),
      updated_by = auth.uid()
  where id = true
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.set_signal_demo_settings(boolean, integer, integer, integer, integer, integer) to authenticated;

-- ===========================================================
-- 7. Core generation — curated template pools, picked and combined
--    randomly for real variation (not one repeated pattern), never a
--    live external call (none of this project's backend can make one).
--    Not granted directly; only called from the gated entry points below.
-- ===========================================================
create or replace function public.signal_demo_run_generation(p_profile_count integer, p_post_count integer, p_slot text, p_photo_count integer default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_batch_id uuid := gen_random_uuid();
  v_profiles_inserted integer := 0;
  v_posts_inserted integer := 0;
  v_photos_target integer;
begin
  -- 7a. Activate up to p_profile_count profiles from the curated pool
  -- that aren't already in use — idempotent via the unique username,
  -- and naturally bounded once the whole pool has been introduced.
  with pool(full_name, username, avatar_seed, bio, role) as (
    values
      ('Marco Bellini', 'marco.b', 34, 'Host in Milano — three cars, always ready for a road trip.', 'host'),
      ('Giulia Romano', 'giulia.romano', 12, 'Verified Client. Weekend explorer, coffee addict.', 'verified_client'),
      ('Alessandro Conti', 'alex.conti', 47, 'Torino-based host. Precision Italian engineering, precision service.', 'host'),
      ('Sofia Ferrari', 'sofia.f', 5, 'Verified Client from Bologna. Rent, drive, repeat.', 'verified_client'),
      ('Luca Moretti', 'luca.moretti', 23, 'Host near the coast. Convertibles are my specialty.', 'host'),
      ('Chiara Esposito', 'chiara.e', 41, 'Verified Client. Photographer, always chasing the next backdrop.', 'verified_client'),
      ('Davide Rinaldi', 'davide.r', 58, 'Firenze host — classic style, modern comfort.', 'host'),
      ('Martina Greco', 'martina.greco', 29, 'Verified Client. City weekends, mountain escapes.', 'verified_client'),
      ('Francesco Villa', 'francesco.v', 15, 'Host in Roma. Family fleet, family service.', 'host'),
      ('Elena Marino', 'elena.marino', 36, 'Verified Client from Napoli. Always up for a drive.', 'verified_client'),
      ('Simone Barbieri', 'simone.b', 62, 'Host — Verona. EVs and everything after.', 'host'),
      ('Valentina Gallo', 'valentina.gallo', 8, 'Verified Client. Frequent flyer, frequent driver.', 'verified_client'),
      ('Riccardo Fontana', 'riccardo.f', 51, 'Host in Genova. Coastal roads, top-down driving.', 'host'),
      ('Beatrice Colombo', 'beatrice.c', 19, 'Verified Client from Milano. Design-obsessed.', 'verified_client'),
      ('Matteo Ricci', 'matteo.ricci', 44, 'Host — Bari. Southern roads, real hospitality.', 'host'),
      ('Alice Santoro', 'alice.santoro', 27, 'Verified Client. First rental turned regular.', 'verified_client')
  ),
  available as (
    select p.* from pool p
    where not exists (select 1 from public.signal_demo_profiles d where d.username = p.username)
    order by random()
    limit greatest(p_profile_count, 0)
  )
  insert into public.signal_demo_profiles (full_name, username, avatar_url, bio, role)
  select full_name, username, 'https://i.pravatar.cc/160?img=' || avatar_seed, bio, role
  from available;
  get diagnostics v_profiles_inserted = row_count;

  -- 7b. Posts — theme-tagged template pool, an author picked randomly
  -- from whichever demo profiles already exist, natural jitter on
  -- created_at so a batch doesn't land as one identical timestamp.
  -- `p_photo_count` is the caller's job to size correctly (a per-slot
  -- share for the lazy trigger, the full daily figure for a manual
  -- one-shot generate) — this function just respects whatever it's
  -- given rather than guessing from the day's total itself.
  v_photos_target := least(
    coalesce(p_photo_count, coalesce((select demo_photos_per_day from public.signal_demo_settings where id = true), 0)),
    p_post_count
  );
  with templates(theme, title, body, has_photo, photo_id) as (
    values
      ('city', null, 'Milano at golden hour hits different when you''re behind the wheel of something special.', true, 'photo-1520175480921-4edfa2983e0f'),
      ('city', null, 'Just wrapped a weekend showing a client around Torino — this city never runs out of good roads.', true, 'photo-1543832923-44667a44c804'),
      ('city', 'Roma by night', 'Nothing beats an evening drive past the Colosseo with the windows down.', true, 'photo-1552832230-c0197dd311b5'),
      ('city', null, 'Firenze traffic is chaos but the drive along the river makes up for it every time.', false, null),
      ('car', 'New to the fleet', 'Just added a fresh set of wheels to the lineup — booking calendar is already filling up.', true, 'photo-1494905998402-395d579af36f'),
      ('car', null, 'Detailing day. There''s something satisfying about handing over a car that looks brand new.', true, 'photo-1541899481282-d53bffe3c35d'),
      ('car', null, 'Had a client ask for the sportiest thing in the fleet this weekend — happy to oblige.', false, null),
      ('car', 'Maintenance done right', 'Full service before every single rental, no exceptions. Worth the wait.', true, 'photo-1503376780353-7e6692767b70'),
      ('travel', null, 'Drove the coastal route down to Cinque Terre this weekend — worth every hairpin turn.', true, 'photo-1533104816931-20fa691ff6ca'),
      ('travel', 'Weekend escape', 'Took the long way to the lake instead of the highway. Best decision all month.', true, 'photo-1493246507139-91e8fad9978e'),
      ('travel', null, 'Road trip season is here. Already planning the next one.', false, null),
      ('rental', null, 'Third time renting through CX this year — the process just keeps getting smoother.', false, null),
      ('rental', 'Smooth pickup', 'Contactless pickup, spotless car, zero hassle. This is how renting should feel.', false, null),
      ('rental', null, 'Booked last minute for a work trip and still had a great car waiting for me.', false, null),
      ('lifestyle', null, 'Sunday morning, empty roads, good music. Simple pleasures.', true, 'photo-1449965408869-eaa3f722e40d'),
      ('lifestyle', null, 'There''s a certain calm to a long solo drive that nothing else replicates.', false, null),
      ('lifestyle', 'Coffee and cars', 'Local meetup this morning turned into an impromptu photoshoot. Great crowd.', true, 'photo-1542282088-fe8426682b8f'),
      ('host_experience', null, 'Hosting on CX has been the easiest side income I''ve ever set up — the platform does the heavy lifting.', false, null),
      ('host_experience', 'One year hosting', 'Hard to believe it''s been a year since I listed my first car. Grateful for every guest.', false, null),
      ('host_experience', null, 'Had a guest extend their trip twice this week. Always a good sign.', false, null),
      ('client_experience', null, 'Renting instead of owning has genuinely changed how I think about having a car in the city.', false, null),
      ('client_experience', 'Worth it', 'Used CX for a family trip this month — smoother than I expected, will book again.', false, null),
      ('client_experience', null, 'Six months of renting through CX and I still haven''t had a single issue.', false, null),
      ('cx_community', null, 'Love seeing what everyone''s driving this week. Great community here.', false, null),
      ('cx_community', 'Shoutout', 'Big thanks to the CX team for sorting out my booking so quickly yesterday.', false, null),
      ('cx_community', null, 'This community is honestly one of the best parts of renting through CX.', false, null),
      ('city', null, 'Napoli traffic taught me patience. The view from the coast road taught me why it''s worth it.', true, 'photo-1580273916550-e323be2ae537'),
      ('car', null, 'Nothing like the smell of a fresh detail job in the morning.', false, null),
      ('travel', null, 'Chasing sunsets along the Amalfi coast this week — the drive alone is worth the trip.', true, 'photo-1533105079780-92b9be482077'),
      ('lifestyle', null, 'Weekday errands feel different in the right car.', false, null),
      ('rental', null, 'Flexible pickup times saved my whole weekend plan. Appreciate it.', false, null),
      ('host_experience', null, 'Every review reminds me why I started hosting in the first place.', false, null)
  ),
  picked as (
    select t.*, row_number() over (order by random()) as rn
    from templates t
    order by random()
    limit greatest(p_post_count, 0)
  ),
  authors as (
    select id, row_number() over (order by random()) as rn
    from public.signal_demo_profiles
    where is_active
  ),
  author_count as (
    select greatest(count(*), 1) as n from authors
  )
  insert into public.signal_demo_posts (demo_author_id, theme, title, body, media_photo_id, generation_batch_id, generation_slot, created_at)
  select
    a.id,
    p.theme, p.title, p.body,
    case when p.rn <= v_photos_target and p.has_photo then p.photo_id else null end,
    v_batch_id, p_slot,
    now() - (random() * interval '90 minutes')
  from picked p
  cross join author_count ac
  join authors a on a.rn = ((p.rn - 1) % ac.n) + 1;
  get diagnostics v_posts_inserted = row_count;

  return jsonb_build_object('batch_id', v_batch_id, 'profiles_inserted', v_profiles_inserted, 'posts_inserted', v_posts_inserted);
end;
$$;

-- ===========================================================
-- 8. Retention — deletes only demo rows, by age; real content is a
--    different table entirely and is never touched by this.
-- ===========================================================
create or replace function public.signal_demo_run_retention()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_retention_days integer;
  v_deleted integer;
begin
  select retention_days into v_retention_days from public.signal_demo_settings where id = true;
  delete from public.signal_demo_posts
  where created_at < now() - make_interval(days => coalesce(v_retention_days, 14));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ===========================================================
-- 9. Lazy trigger entry point — cheap, self-throttling, safe to call
--    from anywhere on every Community visit and safe to call twice.
-- ===========================================================
create or replace function public.signal_demo_maybe_generate()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_settings public.signal_demo_settings;
  v_state public.signal_demo_schedule_state;
  v_today date := ((now() at time zone 'utc')::date);
  v_hour integer := extract(hour from (now() at time zone 'utc'));
  v_slot text := null;
  v_slot_profiles integer;
  v_slot_posts integer;
  v_slot_photos integer;
begin
  if auth.uid() is null then
    return;
  end if;

  select * into v_settings from public.signal_demo_settings where id = true;
  if v_settings is null or not v_settings.enabled then
    return;
  end if;

  select * into v_state from public.signal_demo_schedule_state where id = true for update;

  if v_state.current_date_utc <> v_today then
    update public.signal_demo_schedule_state
    set current_date_utc = v_today, morning_done = false, afternoon_done = false, evening_done = false
    where id = true
    returning * into v_state;
  end if;

  if v_hour >= 8 and v_hour < 12 and not v_state.morning_done then
    v_slot := 'morning';
  elsif v_hour >= 13 and v_hour < 17 and not v_state.afternoon_done then
    v_slot := 'afternoon';
  elsif v_hour >= 18 and v_hour < 22 and not v_state.evening_done then
    v_slot := 'evening';
  end if;

  if v_slot is not null then
    v_slot_profiles := ceil(v_settings.demo_profiles_per_day / 3.0)::integer;
    v_slot_posts := ceil(v_settings.demo_posts_per_day / 3.0)::integer;
    v_slot_photos := ceil(v_settings.demo_photos_per_day / 3.0)::integer;
    perform public.signal_demo_run_generation(v_slot_profiles, v_slot_posts, v_slot, v_slot_photos);
    update public.signal_demo_schedule_state
    set morning_done = morning_done or (v_slot = 'morning'),
        afternoon_done = afternoon_done or (v_slot = 'afternoon'),
        evening_done = evening_done or (v_slot = 'evening')
    where id = true;
  end if;

  if v_state.last_retention_cleanup_at is null or v_state.last_retention_cleanup_at < now() - interval '1 hour' then
    perform public.signal_demo_run_retention();
    update public.signal_demo_schedule_state set last_retention_cleanup_at = now() where id = true;
  end if;
end;
$$;
grant execute on function public.signal_demo_maybe_generate() to authenticated;

-- ===========================================================
-- 10. Admin-only manual controls — the actual "dangerous" surface,
--     fully server-gated (a normal user calling these hits the same
--     `raise exception 'Not authorized'` every other Owner/Admin RPC
--     in this project already uses).
-- ===========================================================
create or replace function public.signal_demo_admin_generate_now(p_profile_count integer default null, p_post_count integer default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_settings public.signal_demo_settings;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  select * into v_settings from public.signal_demo_settings where id = true;
  return public.signal_demo_run_generation(
    coalesce(p_profile_count, v_settings.demo_profiles_per_day),
    coalesce(p_post_count, v_settings.demo_posts_per_day),
    'manual',
    v_settings.demo_photos_per_day
  );
end;
$$;
grant execute on function public.signal_demo_admin_generate_now(integer, integer) to authenticated;

-- Clears all demo content; returns the photo ids that were in use so
-- nothing needs to double-check anything client-side (mirrors
-- delete_empire_post's own "hand back what needs cleanup" shape,
-- though here there's no Storage object to remove — these are
-- Unsplash ids, not uploaded files).
create or replace function public.signal_demo_admin_clear()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_posts_deleted integer;
  v_profiles_deleted integer;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  delete from public.signal_demo_posts;
  get diagnostics v_posts_deleted = row_count;
  delete from public.signal_demo_profiles;
  get diagnostics v_profiles_deleted = row_count;
  return jsonb_build_object('posts_deleted', v_posts_deleted, 'profiles_deleted', v_profiles_deleted);
end;
$$;
grant execute on function public.signal_demo_admin_clear() to authenticated;

create or replace function public.signal_demo_admin_regenerate(p_profile_count integer default null, p_post_count integer default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  perform public.signal_demo_admin_clear();
  return public.signal_demo_admin_generate_now(p_profile_count, p_post_count);
end;
$$;
grant execute on function public.signal_demo_admin_regenerate(integer, integer) to authenticated;

-- ===========================================================
-- 11. Reads — feed supplement, single-post/profile detail fallback,
--     and the real-engagement toggles. Same enrichment shape
--     (like/save counts, likedByMe/savedByMe) fetch_empire_feed
--     already returns for a real post, so the client can map both
--     into the exact same EmpirePost shape.
-- ===========================================================
create or replace function public.fetch_signal_demo_posts(p_limit integer default 20, p_before timestamptz default null, p_before_id uuid default null)
returns table (
  id uuid, demo_author_id uuid, author_name text, author_avatar_url text, author_username text, author_role text,
  theme text, title text, body text, media_photo_id text, created_at timestamptz,
  like_count integer, save_count integer, liked_by_me boolean, saved_by_me boolean
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.demo_author_id, dp.full_name, dp.avatar_url, dp.username, dp.role,
    p.theme, p.title, p.body, p.media_photo_id, p.created_at,
    (select count(*)::int from public.signal_demo_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.signal_demo_post_saves s where s.post_id = p.id),
    exists(select 1 from public.signal_demo_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.signal_demo_post_saves s where s.post_id = p.id and s.user_id = auth.uid())
  from public.signal_demo_posts p
  join public.signal_demo_profiles dp on dp.id = p.demo_author_id
  where auth.uid() is not null
    and (
      p_before is null
      or p.created_at < p_before
      or (p.created_at = p_before and p_before_id is not null and p.id < p_before_id)
    )
  order by p.created_at desc, p.id desc
  limit p_limit;
$$;
grant execute on function public.fetch_signal_demo_posts(integer, timestamptz, uuid) to authenticated;

create or replace function public.fetch_signal_demo_post_by_id(p_post_id uuid)
returns table (
  id uuid, demo_author_id uuid, author_name text, author_avatar_url text, author_username text, author_role text,
  theme text, title text, body text, media_photo_id text, created_at timestamptz,
  like_count integer, save_count integer, liked_by_me boolean, saved_by_me boolean
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.demo_author_id, dp.full_name, dp.avatar_url, dp.username, dp.role,
    p.theme, p.title, p.body, p.media_photo_id, p.created_at,
    (select count(*)::int from public.signal_demo_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.signal_demo_post_saves s where s.post_id = p.id),
    exists(select 1 from public.signal_demo_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.signal_demo_post_saves s where s.post_id = p.id and s.user_id = auth.uid())
  from public.signal_demo_posts p
  join public.signal_demo_profiles dp on dp.id = p.demo_author_id
  where auth.uid() is not null and p.id = p_post_id;
$$;
grant execute on function public.fetch_signal_demo_post_by_id(uuid) to authenticated;

create or replace function public.fetch_signal_demo_profile(p_demo_id uuid)
returns table (id uuid, full_name text, username text, avatar_url text, bio text, role text, post_count integer)
language sql stable security definer set search_path = public
as $$
  select dp.id, dp.full_name, dp.username, dp.avatar_url, dp.bio, dp.role,
    (select count(*)::int from public.signal_demo_posts p where p.demo_author_id = dp.id)
  from public.signal_demo_profiles dp
  where auth.uid() is not null and dp.id = p_demo_id and dp.is_active;
$$;
grant execute on function public.fetch_signal_demo_profile(uuid) to authenticated;

-- Powers a demo profile's own post strip on its /signal/community/
-- profile/:id detail view — same shape as fetch_signal_demo_posts,
-- just scoped to one author instead of the whole feed.
create or replace function public.fetch_signal_demo_posts_by_author(p_demo_author_id uuid, p_limit integer default 20)
returns table (
  id uuid, demo_author_id uuid, author_name text, author_avatar_url text, author_username text, author_role text,
  theme text, title text, body text, media_photo_id text, created_at timestamptz,
  like_count integer, save_count integer, liked_by_me boolean, saved_by_me boolean
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.demo_author_id, dp.full_name, dp.avatar_url, dp.username, dp.role,
    p.theme, p.title, p.body, p.media_photo_id, p.created_at,
    (select count(*)::int from public.signal_demo_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.signal_demo_post_saves s where s.post_id = p.id),
    exists(select 1 from public.signal_demo_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.signal_demo_post_saves s where s.post_id = p.id and s.user_id = auth.uid())
  from public.signal_demo_posts p
  join public.signal_demo_profiles dp on dp.id = p.demo_author_id
  where auth.uid() is not null and p.demo_author_id = p_demo_author_id
  order by p.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_signal_demo_posts_by_author(uuid, integer) to authenticated;

create or replace function public.toggle_signal_demo_post_like(p_post_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_liked boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if exists(select 1 from public.signal_demo_post_likes where post_id = p_post_id and user_id = auth.uid()) then
    delete from public.signal_demo_post_likes where post_id = p_post_id and user_id = auth.uid();
    v_liked := false;
  else
    insert into public.signal_demo_post_likes (post_id, user_id) values (p_post_id, auth.uid());
    v_liked := true;
  end if;
  return v_liked;
end;
$$;
grant execute on function public.toggle_signal_demo_post_like(uuid) to authenticated;

create or replace function public.toggle_signal_demo_post_save(p_post_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_saved boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if exists(select 1 from public.signal_demo_post_saves where post_id = p_post_id and user_id = auth.uid()) then
    delete from public.signal_demo_post_saves where post_id = p_post_id and user_id = auth.uid();
    v_saved := false;
  else
    insert into public.signal_demo_post_saves (post_id, user_id) values (p_post_id, auth.uid());
    v_saved := true;
  end if;
  return v_saved;
end;
$$;
grant execute on function public.toggle_signal_demo_post_save(uuid) to authenticated;
