-- SIGNAL Community — Follow system + vehicle-attached posts.
--
-- Follow: a plain, public (like every other social graph in this app —
-- posts/comments/stories are all "any signed-in user may read") edge
-- table between two existing profiles. No second identity, no new user
-- table — `follower_id`/`followee_id` are both `profiles.id`.
--
-- Vehicle posts: a nullable `vehicle_id` on `empire_posts` referencing
-- the CX Rent host's own existing `cars` row — never a copy of vehicle
-- data, just a reference resolved at read time (same "join to profiles
-- for identity" pattern this whole feed already uses). Ownership is
-- checked server-side in both create_empire_post and update_empire_post:
-- only the car's own host may attach it, regardless of admin status —
-- the brief's own wording is "their existing vehicles."

-- ---------------------------------------------------------------------
-- 1. Follow
-- ---------------------------------------------------------------------
create table if not exists public.profile_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id)
);
alter table public.profile_follows drop constraint if exists profile_follows_no_self_follow;
alter table public.profile_follows add constraint profile_follows_no_self_follow check (follower_id <> followee_id);
create index if not exists profile_follows_followee_idx on public.profile_follows (followee_id);
create index if not exists profile_follows_follower_idx on public.profile_follows (follower_id);
alter table public.profile_follows enable row level security;
drop policy if exists "Signed-in users view follows" on public.profile_follows;
create policy "Signed-in users view follows"
  on public.profile_follows for select
  using (auth.uid() is not null);

create or replace function public.toggle_profile_follow(p_followee_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_following boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if auth.uid() = p_followee_id then
    raise exception 'Cannot follow yourself';
  end if;
  if not exists (select 1 from public.profiles where id = p_followee_id) then
    raise exception 'Profile not found';
  end if;
  if exists (select 1 from public.profile_follows where follower_id = auth.uid() and followee_id = p_followee_id) then
    delete from public.profile_follows where follower_id = auth.uid() and followee_id = p_followee_id;
    v_following := false;
  else
    insert into public.profile_follows (follower_id, followee_id) values (auth.uid(), p_followee_id);
    v_following := true;
  end if;
  return v_following;
end;
$$;
grant execute on function public.toggle_profile_follow(uuid) to authenticated;

-- Adds follower/following counts + "do I follow them" to the existing
-- safe profile projection — same jsonb shape, no signature change, so a
-- plain create-or-replace is enough (no drop needed).
create or replace function public.fetch_signal_profile(p_user_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select jsonb_build_object(
    'id', pr.id,
    'full_name', pr.full_name,
    'avatar_url', pr.avatar_url,
    'bio', pr.bio,
    'is_host', pr.is_host,
    'is_verified_client', pr.is_verified_client,
    'is_owner', pr.is_owner,
    'is_admin', pr.is_admin,
    'verified', pr.verified,
    'is_superhost', pr.is_superhost,
    'rating', pr.rating,
    'trips', pr.trips,
    'response_time', pr.response_time,
    'response_rate', pr.response_rate,
    'joined', pr.joined,
    'followers_count', (select count(*)::int from public.profile_follows f where f.followee_id = pr.id),
    'following_count', (select count(*)::int from public.profile_follows f where f.follower_id = pr.id),
    'followed_by_me', exists(select 1 from public.profile_follows f where f.follower_id = auth.uid() and f.followee_id = pr.id)
  )
  into v_result
  from public.profiles pr
  where pr.id = p_user_id;
  if v_result is null then
    raise exception 'Profile not found';
  end if;
  return v_result;
end;
$$;
grant execute on function public.fetch_signal_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Vehicle-attached posts
-- ---------------------------------------------------------------------
alter table public.empire_posts add column if not exists vehicle_id uuid references public.cars(id) on delete set null;
create index if not exists empire_posts_vehicle_id_idx on public.empire_posts (vehicle_id) where vehicle_id is not null;

drop function if exists public.create_empire_post(text, text, text, text[], boolean, text);
create or replace function public.create_empire_post(
  p_category text, p_title text, p_body text, p_media_paths text[] default '{}',
  p_comments_disabled boolean default false, p_publisher_type text default 'owner',
  p_vehicle_id uuid default null
)
returns public.empire_posts
language plpgsql security definer set search_path = public
as $$
declare
  v_post public.empire_posts;
  v_type text := p_publisher_type;
begin
  if not public.can_publish_signal_content() then
    raise exception 'Not authorized';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Post body cannot be empty';
  end if;
  if not public.is_admin() then
    v_type := 'self';
  elsif v_type not in ('owner', 'assistant', 'cx', 'self') then
    raise exception 'Invalid publisher identity';
  end if;
  if p_vehicle_id is not null and not exists (select 1 from public.cars where id = p_vehicle_id and host_id = auth.uid()) then
    raise exception 'Not authorized to attach this vehicle';
  end if;
  insert into public.empire_posts (author_id, category, title, body, media_paths, comments_disabled, publisher_type, vehicle_id)
  values (auth.uid(), p_category, nullif(trim(p_title), ''), p_body, coalesce(p_media_paths, '{}'), coalesce(p_comments_disabled, false), v_type, p_vehicle_id)
  returning * into v_post;
  return v_post;
end;
$$;
grant execute on function public.create_empire_post(text, text, text, text[], boolean, text, uuid) to authenticated;

drop function if exists public.update_empire_post(uuid, text, text, text, text[], boolean, text);
create or replace function public.update_empire_post(
  p_post_id uuid, p_category text, p_title text, p_body text, p_media_paths text[], p_comments_disabled boolean,
  p_publisher_type text default 'owner', p_vehicle_id uuid default null
)
returns public.empire_posts
language plpgsql security definer set search_path = public
as $$
declare
  v_post public.empire_posts;
  v_type text := p_publisher_type;
begin
  if not (public.is_admin() or exists (select 1 from public.empire_posts where id = p_post_id and author_id = auth.uid())) then
    raise exception 'Not authorized';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Post body cannot be empty';
  end if;
  if not public.is_admin() then
    v_type := 'self';
  elsif v_type not in ('owner', 'assistant', 'cx', 'self') then
    raise exception 'Invalid publisher identity';
  end if;
  if p_vehicle_id is not null and not exists (select 1 from public.cars where id = p_vehicle_id and host_id = auth.uid()) then
    raise exception 'Not authorized to attach this vehicle';
  end if;
  update public.empire_posts
  set category = p_category,
      title = nullif(trim(p_title), ''),
      body = p_body,
      media_paths = coalesce(p_media_paths, '{}'),
      comments_disabled = coalesce(p_comments_disabled, false),
      publisher_type = v_type,
      vehicle_id = p_vehicle_id,
      updated_at = now(),
      edited_at = now()
  where id = p_post_id
  returning * into v_post;
  if v_post.id is null then
    raise exception 'Post not found';
  end if;
  return v_post;
end;
$$;
grant execute on function public.update_empire_post(uuid, text, text, text, text[], boolean, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Read RPCs — each gains one `vehicle jsonb` output column (null when
--    the post has none), resolved from `cars`/`car_images` at read time.
--    Every one of these changes its RETURNS TABLE shape, so each needs
--    an explicit drop first (a bare create-or-replace only works when
--    the return type is unchanged — see 0051's own note on this).
-- ---------------------------------------------------------------------

drop function if exists public.fetch_empire_feed(integer, timestamptz, text, text, text);
create or replace function public.fetch_empire_feed(
  p_limit integer default 20, p_before timestamptz default null, p_category text default null,
  p_publisher_scope text default null, p_author_kind text default null
)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text, vehicle jsonb
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    p.shares,
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid()),
    p.publisher_type,
    (
      select jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'make', c.make, 'model', c.model, 'year', c.year,
        'city', c.city, 'price_per_day', c.price_per_day,
        'image_url', (select ci.url from public.car_images ci where ci.car_id = c.id order by ci.position asc limit 1)
      )
      from public.cars c where c.id = p.vehicle_id
    )
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null
    and not p.is_pinned
    and not p.is_featured
    and (p_before is null or p.created_at < p_before)
    and (p_category is null or p.category = p_category)
    and (
      p_publisher_scope is null
      or (p_publisher_scope = 'official' and p.publisher_type in ('owner', 'assistant', 'cx'))
      or (p_publisher_scope = 'community' and p.publisher_type = 'self')
    )
    and (
      p_author_kind is null
      or (p_author_kind = 'host' and pr.is_host)
      or (p_author_kind = 'verified_client' and pr.is_verified_client)
    )
  order by
    case when p_publisher_scope = 'community' then 0 when p_before is null and p_category is null then
      case p.category
        when 'announcement' then 1
        when 'exclusive' then 2
        when 'news' then 3
        when 'new_car' then 4
        when 'feature' then 4
        when 'event' then 5
        when 'offer' then 5
        else 6
      end
    else 0 end,
    p.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_empire_feed(integer, timestamptz, text, text, text) to authenticated;

drop function if exists public.fetch_empire_trending_posts(integer, text, text);
create or replace function public.fetch_empire_trending_posts(
  p_limit integer default 5, p_publisher_scope text default null, p_author_kind text default null
)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text, vehicle jsonb
)
language sql stable security definer set search_path = public
as $$
  select
    id, author_id, author_name, author_avatar_url, author_is_owner, author_is_admin, author_is_host, author_is_verified_client,
    category, title, body, media_paths, is_pinned, is_featured, comments_disabled,
    created_at, updated_at, edited_at, like_count, comment_count, save_count, view_count, share_count,
    liked_by_me, saved_by_me, publisher_type, vehicle
  from (
    select
      p.id, p.author_id, pr.full_name as author_name, pr.avatar_url as author_avatar_url,
      pr.is_owner as author_is_owner, pr.is_admin as author_is_admin,
      pr.is_host as author_is_host, pr.is_verified_client as author_is_verified_client,
      p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
      p.created_at, p.updated_at, p.edited_at,
      (select count(*)::int from public.empire_post_likes l where l.post_id = p.id) as like_count,
      (select count(*)::int from public.empire_post_comments c where c.post_id = p.id) as comment_count,
      (select count(*)::int from public.empire_post_saves s where s.post_id = p.id) as save_count,
      (select count(*)::int from public.empire_post_views v where v.post_id = p.id) as view_count,
      p.shares as share_count,
      exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()) as liked_by_me,
      exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid()) as saved_by_me,
      p.publisher_type,
      (
        select jsonb_build_object(
          'id', c.id, 'slug', c.slug, 'make', c.make, 'model', c.model, 'year', c.year,
          'city', c.city, 'price_per_day', c.price_per_day,
          'image_url', (select ci.url from public.car_images ci where ci.car_id = c.id order by ci.position asc limit 1)
        )
        from public.cars c where c.id = p.vehicle_id
      ) as vehicle,
      (
        (select count(*)::numeric from public.empire_post_likes l where l.post_id = p.id) * 1
        + (select count(*)::numeric from public.empire_post_comments c where c.post_id = p.id) * 2
        + (select count(*)::numeric from public.empire_post_saves s where s.post_id = p.id) * 2
        + (select count(*)::numeric from public.empire_post_views v where v.post_id = p.id) * 0.1
      ) as score
    from public.empire_posts p
    join public.profiles pr on pr.id = p.author_id
    where auth.uid() is not null
      and p.created_at > now() - interval '14 days'
      and (
        p_publisher_scope is null
        or (p_publisher_scope = 'official' and p.publisher_type in ('owner', 'assistant', 'cx'))
        or (p_publisher_scope = 'community' and p.publisher_type = 'self')
      )
      and (
        p_author_kind is null
        or (p_author_kind = 'host' and pr.is_host)
        or (p_author_kind = 'verified_client' and pr.is_verified_client)
      )
  ) scored
  where score >= 5
  order by score desc, created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_empire_trending_posts(integer, text, text) to authenticated;

drop function if exists public.fetch_empire_post_by_id(uuid);
create or replace function public.fetch_empire_post_by_id(p_post_id uuid)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text, vehicle jsonb
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    p.shares,
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid()),
    p.publisher_type,
    (
      select jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'make', c.make, 'model', c.model, 'year', c.year,
        'city', c.city, 'price_per_day', c.price_per_day,
        'image_url', (select ci.url from public.car_images ci where ci.car_id = c.id order by ci.position asc limit 1)
      )
      from public.cars c where c.id = p.vehicle_id
    )
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null and p.id = p_post_id;
$$;
grant execute on function public.fetch_empire_post_by_id(uuid) to authenticated;

drop function if exists public.fetch_empire_posts_by_author(uuid, integer, timestamptz);
create or replace function public.fetch_empire_posts_by_author(p_author_id uuid, p_limit integer default 20, p_before timestamptz default null)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text, vehicle jsonb
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    p.shares,
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid()),
    p.publisher_type,
    (
      select jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'make', c.make, 'model', c.model, 'year', c.year,
        'city', c.city, 'price_per_day', c.price_per_day,
        'image_url', (select ci.url from public.car_images ci where ci.car_id = c.id order by ci.position asc limit 1)
      )
      from public.cars c where c.id = p.vehicle_id
    )
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null
    and p.author_id = p_author_id
    and (p_before is null or p.created_at < p_before)
  order by p.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_empire_posts_by_author(uuid, integer, timestamptz) to authenticated;

drop function if exists public.fetch_empire_saved_posts(integer, timestamptz);
create or replace function public.fetch_empire_saved_posts(p_limit integer default 20, p_before timestamptz default null)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text, vehicle jsonb
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s2 where s2.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    p.shares,
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    true,
    p.publisher_type,
    (
      select jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'make', c.make, 'model', c.model, 'year', c.year,
        'city', c.city, 'price_per_day', c.price_per_day,
        'image_url', (select ci.url from public.car_images ci where ci.car_id = c.id order by ci.position asc limit 1)
      )
      from public.cars c where c.id = p.vehicle_id
    )
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  join public.empire_post_saves s on s.post_id = p.id and s.user_id = auth.uid()
  where auth.uid() is not null
    and (p_before is null or s.created_at < p_before)
  order by s.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_empire_saved_posts(integer, timestamptz) to authenticated;

drop function if exists public.search_empire_posts(text, text, integer);
create or replace function public.search_empire_posts(p_query text, p_category text default null, p_limit integer default 20)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text, vehicle jsonb
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    p.shares,
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid()),
    p.publisher_type,
    (
      select jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'make', c.make, 'model', c.model, 'year', c.year,
        'city', c.city, 'price_per_day', c.price_per_day,
        'image_url', (select ci.url from public.car_images ci where ci.car_id = c.id order by ci.position asc limit 1)
      )
      from public.cars c where c.id = p.vehicle_id
    )
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null
    and (p_category is null or p.category = p_category)
    and (
      coalesce(trim(p_query), '') = ''
      or p.title ilike '%' || p_query || '%'
      or p.body ilike '%' || p_query || '%'
      or pr.full_name ilike '%' || p_query || '%'
    )
  order by p.created_at desc
  limit p_limit;
$$;
grant execute on function public.search_empire_posts(text, text, integer) to authenticated;
