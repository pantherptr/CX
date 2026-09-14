-- SIGNAL — unique usernames + people search.
--
-- One username per real profiles row (no second identity table).
-- `username` keeps the user's chosen casing for display; `username_
-- normalized` is the lowercase canonical form the unique index and every
-- lookup/search actually key off, so "Mohamed"/"MOHAMED"/"mOhAmEd" can
-- never become three different claims.

alter table public.profiles add column username text;
alter table public.profiles add column username_normalized text;
-- Plain unique index — Postgres unique indexes already treat NULL as
-- distinct from every other NULL, so accounts that haven't chosen a
-- username yet never collide with each other.
create unique index profiles_username_normalized_key on public.profiles (username_normalized);
create index profiles_full_name_lower_idx on public.profiles (lower(full_name));

-- Format + reserved-word validation shared by both the live-typing
-- availability check and the actual claim, so they can never disagree
-- with each other. Raises a real, user-facing error message on
-- anything invalid; returns the normalized form on success.
create or replace function public.validate_signal_username(p_username text)
returns text
language plpgsql immutable
as $$
declare
  v_norm text;
begin
  v_norm := lower(trim(coalesce(p_username, '')));
  if v_norm = '' then
    raise exception 'Username cannot be empty';
  end if;
  if length(v_norm) < 3 or length(v_norm) > 20 then
    raise exception 'Username must be 3-20 characters';
  end if;
  if v_norm !~ '^[a-z0-9_]+$' then
    raise exception 'Username can only contain letters, numbers and underscores';
  end if;
  if v_norm ~ '^_' or v_norm ~ '_$' or v_norm ~ '__' then
    raise exception 'Username cannot start or end with an underscore, or repeat one';
  end if;
  -- Official/system identities — real users can never claim these,
  -- regardless of casing (already normalized above).
  if v_norm in (
    'cx', 'cxrent', 'cx_rent', 'cxassistant', 'cx_assistant', 'assistant',
    'owner', 'admin', 'administrator', 'official', 'signal', 'support',
    'help', 'system', 'root', 'moderator', 'staff', 'team', 'security',
    'verified', 'settings', 'notifications', 'messages', 'profile',
    'community', 'bot', 'null', 'undefined'
  ) then
    raise exception 'This username is reserved';
  end if;
  return v_norm;
end;
$$;

create or replace function public.check_signal_username_available(p_username text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_norm text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  begin
    v_norm := public.validate_signal_username(p_username);
  exception when others then
    return false;
  end;
  return not exists (
    select 1 from public.profiles where username_normalized = v_norm and id <> auth.uid()
  );
end;
$$;
grant execute on function public.check_signal_username_available(text) to authenticated;

-- The actual claim — atomic via the unique index itself, not a
-- check-then-write race. Two concurrent claims of the same name can
-- both pass validation, but only one UPDATE can ever commit; the loser
-- hits unique_violation and gets a clean error instead of a raw
-- Postgres exception.
create or replace function public.set_signal_username(p_username text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_norm text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  v_norm := public.validate_signal_username(p_username);
  begin
    update public.profiles set username = trim(p_username), username_normalized = v_norm where id = auth.uid();
  exception when unique_violation then
    raise exception 'That username is already taken';
  end;
  return v_norm;
end;
$$;
grant execute on function public.set_signal_username(text) to authenticated;

-- fetch_signal_profile already returns a flexible jsonb shape — adding
-- a key is a body-only change, no signature/drop needed.
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
    'username', pr.username,
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

-- Ranked people search — 1. exact username, 2. username starts with,
-- 3. display name starts with, 4. username contains, 5. display name
-- contains. `@` is stripped as optional search syntax. `position()`/
-- `left()` instead of LIKE so a raw query can never be interpreted as
-- a wildcard pattern.
create or replace function public.search_signal_people(p_query text, p_limit integer default 20)
returns table (
  id uuid, full_name text, avatar_url text, username text,
  is_owner boolean, is_admin boolean, is_host boolean, is_verified_client boolean,
  followed_by_me boolean
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_norm text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  v_norm := lower(trim(p_query));
  if left(v_norm, 1) = '@' then
    v_norm := substring(v_norm from 2);
  end if;
  if v_norm = '' then
    return;
  end if;
  return query
    select
      pr.id, pr.full_name, pr.avatar_url, pr.username,
      pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
      exists(select 1 from public.profile_follows f where f.follower_id = auth.uid() and f.followee_id = pr.id)
    from public.profiles pr
    where pr.id <> auth.uid()
      and (
        pr.username_normalized = v_norm
        or left(coalesce(pr.username_normalized, ''), length(v_norm)) = v_norm
        or left(lower(coalesce(pr.full_name, '')), length(v_norm)) = v_norm
        or position(v_norm in coalesce(pr.username_normalized, '')) > 0
        or position(v_norm in lower(coalesce(pr.full_name, ''))) > 0
      )
    order by
      case
        when pr.username_normalized = v_norm then 0
        when left(coalesce(pr.username_normalized, ''), length(v_norm)) = v_norm then 1
        when left(lower(coalesce(pr.full_name, '')), length(v_norm)) = v_norm then 2
        when position(v_norm in coalesce(pr.username_normalized, '')) > 0 then 3
        else 4
      end,
      pr.full_name asc
    limit p_limit;
end;
$$;
grant execute on function public.search_signal_people(text, integer) to authenticated;

-- ---------------------------------------------------------------------
-- Thread `author_username` through the feed/post/Story read paths so
-- SIGNAL's own post cards, comments, and Story viewer can show @username
-- alongside the name — same real column, no per-surface re-fetch.
-- ---------------------------------------------------------------------
drop function if exists public.fetch_empire_feed(integer, timestamptz, text, text, text);
create or replace function public.fetch_empire_feed(
  p_limit integer default 20, p_before timestamptz default null, p_category text default null,
  p_publisher_scope text default null, p_author_kind text default null
)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_username text,
  author_is_owner boolean, author_is_admin boolean, author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  pinned_to_profile boolean, is_archived boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text, vehicle jsonb
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.username,
    pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.pinned_to_profile, p.is_archived,
    p.comments_disabled,
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
    and not p.is_archived
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

drop function if exists public.fetch_empire_post_by_id(uuid);
create or replace function public.fetch_empire_post_by_id(p_post_id uuid)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_username text,
  author_is_owner boolean, author_is_admin boolean, author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  pinned_to_profile boolean, is_archived boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text, vehicle jsonb
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.username,
    pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.pinned_to_profile, p.is_archived,
    p.comments_disabled,
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
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_username text,
  author_is_owner boolean, author_is_admin boolean, author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  pinned_to_profile boolean, is_archived boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text, vehicle jsonb
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.username,
    pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.pinned_to_profile, p.is_archived,
    p.comments_disabled,
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
    and (not p.is_archived or p.author_id = auth.uid())
    and (p_before is null or p.created_at < p_before)
  order by p.pinned_to_profile desc, p.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_empire_posts_by_author(uuid, integer, timestamptz) to authenticated;

-- Stories — same addition, same drop-then-recreate reasoning (adding an
-- output column is a return-type change).
drop function if exists public.fetch_active_empire_stories();
create or replace function public.fetch_active_empire_stories()
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_avatar_url text,
  author_username text,
  author_is_owner boolean,
  author_is_admin boolean,
  author_is_host boolean,
  author_is_verified_client boolean,
  title text,
  created_at timestamptz,
  expires_at timestamptz,
  view_count integer,
  viewed_by_me boolean,
  slides jsonb,
  publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    s.id, s.author_id,
    coalesce(p.full_name, 'CX Rent'), p.avatar_url, p.username,
    coalesce(p.is_owner, false), coalesce(p.is_admin, false),
    coalesce(p.is_host, false), coalesce(p.is_verified_client, false),
    s.title, s.created_at, s.expires_at,
    (select count(*)::int from public.empire_story_views v where v.story_id = s.id),
    exists(select 1 from public.empire_story_views v where v.story_id = s.id and v.user_id = auth.uid()),
    (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', sl.id, 'media_path', sl.media_path, 'media_type', sl.media_type,
        'caption', sl.caption, 'cta_label', sl.cta_label, 'cta_url', sl.cta_url,
        'sort_order', sl.sort_order, 'poster_path', sl.poster_path,
        'text_content', sl.text_content, 'text_align', sl.text_align,
        'text_size', sl.text_size, 'bg_style', sl.bg_style
      ) order by sl.sort_order, sl.id), '[]'::jsonb)
      from public.empire_story_slides sl where sl.story_id = s.id
    ),
    s.publisher_type
  from public.empire_stories s
  join public.profiles p on p.id = s.author_id
  where auth.uid() is not null
    and s.expires_at > now()
    and exists (select 1 from public.empire_story_slides sl where sl.story_id = s.id)
  order by s.created_at asc;
$$;
grant execute on function public.fetch_active_empire_stories() to authenticated;

drop function if exists public.fetch_all_empire_stories_admin();
create or replace function public.fetch_all_empire_stories_admin()
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_avatar_url text,
  author_username text,
  author_is_owner boolean,
  author_is_admin boolean,
  author_is_host boolean,
  author_is_verified_client boolean,
  title text,
  created_at timestamptz,
  expires_at timestamptz,
  view_count integer,
  viewed_by_me boolean,
  slides jsonb,
  publisher_type text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  return query
    select
      s.id, s.author_id,
      coalesce(p.full_name, 'CX Rent'), p.avatar_url, p.username,
      coalesce(p.is_owner, false), coalesce(p.is_admin, false),
      coalesce(p.is_host, false), coalesce(p.is_verified_client, false),
      s.title, s.created_at, s.expires_at,
      (select count(*)::int from public.empire_story_views v where v.story_id = s.id),
      exists(select 1 from public.empire_story_views v where v.story_id = s.id and v.user_id = auth.uid()),
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', sl.id, 'media_path', sl.media_path, 'media_type', sl.media_type,
          'caption', sl.caption, 'cta_label', sl.cta_label, 'cta_url', sl.cta_url,
          'sort_order', sl.sort_order, 'poster_path', sl.poster_path,
          'text_content', sl.text_content, 'text_align', sl.text_align,
          'text_size', sl.text_size, 'bg_style', sl.bg_style
        ) order by sl.sort_order, sl.id), '[]'::jsonb)
        from public.empire_story_slides sl where sl.story_id = s.id
      ),
      s.publisher_type
    from public.empire_stories s
    join public.profiles p on p.id = s.author_id
    where s.expires_at > now()
    order by s.created_at asc;
end;
$$;
grant execute on function public.fetch_all_empire_stories_admin() to authenticated;
