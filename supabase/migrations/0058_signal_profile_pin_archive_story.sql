-- SIGNAL — real connected social profiles: per-author profile pin,
-- personal archive, and self-service Story deletion. All additive to
-- the existing empire_posts/empire_stories tables — no parallel schema.

-- ---------------------------------------------------------------------
-- Profile pin — distinct from the existing `is_pinned` (that one is a
-- single, global, Owner/Admin-controlled "Pinned Announcement" slot in
-- Official). This is a per-author "pin one of my own posts to the top
-- of my own profile" — any eligible publisher, enforced one-at-a-time
-- per author via the partial unique index below.
-- ---------------------------------------------------------------------
alter table public.empire_posts add column pinned_to_profile boolean not null default false;
create unique index empire_posts_one_profile_pin_per_author
  on public.empire_posts (author_id) where pinned_to_profile;

create or replace function public.set_empire_post_profile_pin(p_post_id uuid, p_pinned boolean)
returns public.empire_posts
language plpgsql security definer set search_path = public
as $$
declare
  v_post public.empire_posts;
begin
  if not exists (select 1 from public.empire_posts where id = p_post_id and author_id = auth.uid()) then
    raise exception 'Not authorized';
  end if;
  if p_pinned then
    -- Only one pinned post per author — clear any previous one first
    -- (mirrors set_empire_post_pinned's own single-slot pattern).
    update public.empire_posts set pinned_to_profile = false where author_id = auth.uid() and pinned_to_profile;
  end if;
  update public.empire_posts set pinned_to_profile = p_pinned where id = p_post_id returning * into v_post;
  return v_post;
end;
$$;
grant execute on function public.set_empire_post_profile_pin(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Personal archive — hide from the public feed/other viewers' view of
-- the profile without deleting; the author can still see it themselves
-- (see the query changes below).
-- ---------------------------------------------------------------------
alter table public.empire_posts add column is_archived boolean not null default false;

create or replace function public.set_empire_post_archived(p_post_id uuid, p_archived boolean)
returns public.empire_posts
language plpgsql security definer set search_path = public
as $$
declare
  v_post public.empire_posts;
begin
  if not exists (select 1 from public.empire_posts where id = p_post_id and author_id = auth.uid()) then
    raise exception 'Not authorized';
  end if;
  -- Archiving your own pinned post unpins it too — a hidden post has no
  -- business still occupying the one profile-pin slot.
  update public.empire_posts
  set is_archived = p_archived,
      pinned_to_profile = case when p_archived then false else pinned_to_profile end
  where id = p_post_id
  returning * into v_post;
  return v_post;
end;
$$;
grant execute on function public.set_empire_post_archived(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Read paths — add the two new columns and apply the archive filter.
-- Return-type changes require an explicit drop first.
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
  pinned_to_profile boolean, is_archived boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text, vehicle jsonb
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
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
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  pinned_to_profile boolean, is_archived boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text, vehicle jsonb
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
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
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  pinned_to_profile boolean, is_archived boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text, vehicle jsonb
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
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

-- ---------------------------------------------------------------------
-- Story self-deletion — a Host/Verified Client can now delete their own
-- active Story, not just Owner/Admin. Same signature, body-only change.
-- ---------------------------------------------------------------------
create or replace function public.delete_empire_story(p_story_id uuid)
returns text[]
language plpgsql security definer set search_path = public
as $$
declare
  v_paths text[];
begin
  if not (public.is_admin() or exists (select 1 from public.empire_stories where id = p_story_id and author_id = auth.uid())) then
    raise exception 'Not authorized';
  end if;
  select coalesce(array_agg(media_path), '{}') || coalesce(array_agg(poster_path) filter (where poster_path is not null), '{}')
    into v_paths
    from public.empire_story_slides where story_id = p_story_id;
  delete from public.empire_stories where id = p_story_id;
  if not found then
    raise exception 'Story not found';
  end if;
  return v_paths;
end;
$$;
grant execute on function public.delete_empire_story(uuid) to authenticated;
