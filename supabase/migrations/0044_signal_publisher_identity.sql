-- SIGNAL multi-identity publishing: the Owner/Admin can publish a post or
-- Story under one of three fixed voices — 'owner' (their real profile),
-- 'assistant' (the CX Assistant AI/support persona), or 'cx' (the CX Rent
-- brand account) — recorded permanently at publish time so historical
-- content never drifts if the Owner's own profile changes later.
-- author_id/author_name/author_avatar_url are untouched: they stay the
-- real audit trail of which admin account clicked publish, independent
-- of which voice was chosen to display.

alter table public.empire_posts
  add column publisher_type text not null default 'owner'
  check (publisher_type in ('owner', 'assistant', 'cx'));

alter table public.empire_stories
  add column publisher_type text not null default 'owner'
  check (publisher_type in ('owner', 'assistant', 'cx'));

-- ---- Writes: thread p_publisher_type through, validated after the
-- existing is_admin() gate so a non-admin is rejected before this is
-- ever inspected, and an admin can't smuggle in an arbitrary string. ----

drop function if exists public.create_empire_post(text, text, text, text[], boolean);
create or replace function public.create_empire_post(
  p_category text, p_title text, p_body text, p_media_paths text[] default '{}',
  p_comments_disabled boolean default false, p_publisher_type text default 'owner'
)
returns public.empire_posts
language plpgsql security definer set search_path = public
as $$
declare
  v_post public.empire_posts;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Post body cannot be empty';
  end if;
  if p_publisher_type not in ('owner', 'assistant', 'cx') then
    raise exception 'Invalid publisher identity';
  end if;
  insert into public.empire_posts (author_id, category, title, body, media_paths, comments_disabled, publisher_type)
  values (auth.uid(), p_category, nullif(trim(p_title), ''), p_body, coalesce(p_media_paths, '{}'), coalesce(p_comments_disabled, false), p_publisher_type)
  returning * into v_post;
  return v_post;
end;
$$;
grant execute on function public.create_empire_post(text, text, text, text[], boolean, text) to authenticated;

drop function if exists public.update_empire_post(uuid, text, text, text, text[], boolean);
create or replace function public.update_empire_post(
  p_post_id uuid, p_category text, p_title text, p_body text, p_media_paths text[], p_comments_disabled boolean,
  p_publisher_type text default 'owner'
)
returns public.empire_posts
language plpgsql security definer set search_path = public
as $$
declare
  v_post public.empire_posts;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Post body cannot be empty';
  end if;
  if p_publisher_type not in ('owner', 'assistant', 'cx') then
    raise exception 'Invalid publisher identity';
  end if;
  update public.empire_posts
  set category = p_category,
      title = nullif(trim(p_title), ''),
      body = p_body,
      media_paths = coalesce(p_media_paths, '{}'),
      comments_disabled = coalesce(p_comments_disabled, false),
      publisher_type = p_publisher_type,
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
grant execute on function public.update_empire_post(uuid, text, text, text, text[], boolean, text) to authenticated;

drop function if exists public.create_empire_story(text);
create or replace function public.create_empire_story(p_title text default null, p_publisher_type text default 'owner')
returns public.empire_stories
language plpgsql security definer set search_path = public
as $$
declare
  v_story public.empire_stories;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if p_publisher_type not in ('owner', 'assistant', 'cx') then
    raise exception 'Invalid publisher identity';
  end if;
  insert into public.empire_stories (author_id, title, publisher_type)
  values (auth.uid(), nullif(trim(p_title), ''), p_publisher_type)
  returning * into v_story;
  return v_story;
end;
$$;
grant execute on function public.create_empire_story(text, text) to authenticated;

-- ---- Reads: publisher_type added to every returns-table shape. Each
-- one's old signature is dropped first since adding an output column is
-- a return-type change, not an in-place replace — same pattern already
-- used in 0042/0043 for is_featured/view_count. ----

drop function if exists public.fetch_empire_feed(integer, timestamptz, text);
create or replace function public.fetch_empire_feed(
  p_limit integer default 20, p_before timestamptz default null, p_category text default null
)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, liked_by_me boolean, saved_by_me boolean,
  publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid()),
    p.publisher_type
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null
    and not p.is_pinned
    and not p.is_featured
    and (p_before is null or p.created_at < p_before)
    and (p_category is null or p.category = p_category)
  order by
    case when p_before is null and p_category is null then
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
grant execute on function public.fetch_empire_feed(integer, timestamptz, text) to authenticated;

drop function if exists public.fetch_empire_pinned_post();
create or replace function public.fetch_empire_pinned_post()
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, liked_by_me boolean, saved_by_me boolean,
  publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid()),
    p.publisher_type
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null and p.is_pinned = true
  limit 1;
$$;
grant execute on function public.fetch_empire_pinned_post() to authenticated;

drop function if exists public.fetch_empire_post_by_id(uuid);
create or replace function public.fetch_empire_post_by_id(p_post_id uuid)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, liked_by_me boolean, saved_by_me boolean,
  publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid()),
    p.publisher_type
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null and p.id = p_post_id;
$$;
grant execute on function public.fetch_empire_post_by_id(uuid) to authenticated;

drop function if exists public.fetch_empire_featured_posts(integer);
create or replace function public.fetch_empire_featured_posts(p_limit integer default 6)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, liked_by_me boolean, saved_by_me boolean,
  publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid()),
    p.publisher_type
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null and p.is_featured and not p.is_pinned
  order by p.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_empire_featured_posts(integer) to authenticated;

drop function if exists public.fetch_empire_trending_posts(integer);
create or replace function public.fetch_empire_trending_posts(p_limit integer default 5)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, liked_by_me boolean, saved_by_me boolean,
  publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    id, author_id, author_name, author_avatar_url, author_is_owner, author_is_admin,
    category, title, body, media_paths, is_pinned, is_featured, comments_disabled,
    created_at, updated_at, edited_at, like_count, comment_count, save_count, view_count, liked_by_me, saved_by_me,
    publisher_type
  from (
    select
      p.id, p.author_id, pr.full_name as author_name, pr.avatar_url as author_avatar_url,
      pr.is_owner as author_is_owner, pr.is_admin as author_is_admin,
      p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
      p.created_at, p.updated_at, p.edited_at,
      (select count(*)::int from public.empire_post_likes l where l.post_id = p.id) as like_count,
      (select count(*)::int from public.empire_post_comments c where c.post_id = p.id) as comment_count,
      (select count(*)::int from public.empire_post_saves s where s.post_id = p.id) as save_count,
      (select count(*)::int from public.empire_post_views v where v.post_id = p.id) as view_count,
      exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()) as liked_by_me,
      exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid()) as saved_by_me,
      p.publisher_type,
      (
        (select count(*)::numeric from public.empire_post_likes l where l.post_id = p.id) * 1
        + (select count(*)::numeric from public.empire_post_comments c where c.post_id = p.id) * 2
        + (select count(*)::numeric from public.empire_post_saves s where s.post_id = p.id) * 2
        + (select count(*)::numeric from public.empire_post_views v where v.post_id = p.id) * 0.1
      ) as score
    from public.empire_posts p
    join public.profiles pr on pr.id = p.author_id
    where auth.uid() is not null and p.created_at > now() - interval '14 days'
  ) scored
  where score >= 5
  order by score desc, created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_empire_trending_posts(integer) to authenticated;

drop function if exists public.search_empire_posts(text, text, integer);
create or replace function public.search_empire_posts(p_query text, p_category text default null, p_limit integer default 20)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, liked_by_me boolean, saved_by_me boolean,
  publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid()),
    p.publisher_type
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null
    and (p_category is null or p.category = p_category)
    and (
      coalesce(trim(p_query), '') = ''
      or p.title ilike '%' || p_query || '%'
      or p.body ilike '%' || p_query || '%'
    )
  order by p.created_at desc
  limit p_limit;
$$;
grant execute on function public.search_empire_posts(text, text, integer) to authenticated;

-- author_name/author_avatar_url are new here (Stories never joined
-- profiles before — there was nothing to show but a hardcoded "CX Rent"
-- title fallback). Resolving the 'owner' voice for a viewer who isn't
-- the Owner needs the Owner's real live name/photo from somewhere, and
-- the client has no other way to reach it, so it travels with the row
-- the same way empire_posts already does it.
drop function if exists public.fetch_active_empire_stories();
create or replace function public.fetch_active_empire_stories()
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, title text,
  created_at timestamptz, expires_at timestamptz,
  view_count integer, viewed_by_me boolean, slides jsonb, publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    s.id, s.author_id, pr.full_name, pr.avatar_url, s.title, s.created_at, s.expires_at,
    (select count(*)::int from public.empire_story_views v where v.story_id = s.id),
    exists(select 1 from public.empire_story_views v where v.story_id = s.id and v.user_id = auth.uid()),
    (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', sl.id, 'media_path', sl.media_path, 'media_type', sl.media_type,
        'caption', sl.caption, 'cta_label', sl.cta_label, 'cta_url', sl.cta_url,
        'sort_order', sl.sort_order
      ) order by sl.sort_order, sl.id), '[]'::jsonb)
      from public.empire_story_slides sl where sl.story_id = s.id
    ),
    s.publisher_type
  from public.empire_stories s
  join public.profiles pr on pr.id = s.author_id
  where auth.uid() is not null
    and s.expires_at > now()
    and exists (select 1 from public.empire_story_slides sl where sl.story_id = s.id)
  order by s.created_at asc;
$$;
grant execute on function public.fetch_active_empire_stories() to authenticated;

drop function if exists public.fetch_all_empire_stories_admin();
create or replace function public.fetch_all_empire_stories_admin()
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, title text,
  created_at timestamptz, expires_at timestamptz,
  view_count integer, viewed_by_me boolean, slides jsonb, publisher_type text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  return query
    select
      s.id, s.author_id, pr.full_name, pr.avatar_url, s.title, s.created_at, s.expires_at,
      (select count(*)::int from public.empire_story_views v where v.story_id = s.id),
      exists(select 1 from public.empire_story_views v where v.story_id = s.id and v.user_id = auth.uid()),
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', sl.id, 'media_path', sl.media_path, 'media_type', sl.media_type,
          'caption', sl.caption, 'cta_label', sl.cta_label, 'cta_url', sl.cta_url,
          'sort_order', sl.sort_order
        ) order by sl.sort_order, sl.id), '[]'::jsonb)
        from public.empire_story_slides sl where sl.story_id = s.id
      ),
      s.publisher_type
    from public.empire_stories s
    join public.profiles pr on pr.id = s.author_id
    order by s.created_at desc;
end;
$$;
grant execute on function public.fetch_all_empire_stories_admin() to authenticated;

-- ---- Analytics: breakdown by publisher identity, additive to the
-- existing jsonb result (no signature change, so no drop needed). ----

create or replace function public.fetch_empire_analytics()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  select jsonb_build_object(
    'total_post_views', (select count(*) from public.empire_post_views),
    'total_story_views', (select count(*) from public.empire_story_views),
    'posts_last_7d', (select count(*) from public.empire_posts where created_at > now() - interval '7 days'),
    'posts_prev_7d', (select count(*) from public.empire_posts where created_at > now() - interval '14 days' and created_at <= now() - interval '7 days'),
    'engagement_last_7d', (
      (select count(*) from public.empire_post_likes where created_at > now() - interval '7 days')
      + (select count(*) from public.empire_post_comments where created_at > now() - interval '7 days')
      + (select count(*) from public.empire_post_saves where created_at > now() - interval '7 days')
    ),
    'engagement_prev_7d', (
      (select count(*) from public.empire_post_likes where created_at > now() - interval '14 days' and created_at <= now() - interval '7 days')
      + (select count(*) from public.empire_post_comments where created_at > now() - interval '14 days' and created_at <= now() - interval '7 days')
      + (select count(*) from public.empire_post_saves where created_at > now() - interval '14 days' and created_at <= now() - interval '7 days')
    ),
    'most_viewed', (
      select jsonb_build_object('id', p.id, 'title', coalesce(p.title, left(p.body, 60)), 'count', v.n)
      from public.empire_posts p
      join (select post_id, count(*) n from public.empire_post_views group by post_id order by n desc limit 1) v on v.post_id = p.id
    ),
    'most_liked', (
      select jsonb_build_object('id', p.id, 'title', coalesce(p.title, left(p.body, 60)), 'count', v.n)
      from public.empire_posts p
      join (select post_id, count(*) n from public.empire_post_likes group by post_id order by n desc limit 1) v on v.post_id = p.id
    ),
    'most_commented', (
      select jsonb_build_object('id', p.id, 'title', coalesce(p.title, left(p.body, 60)), 'count', v.n)
      from public.empire_posts p
      join (select post_id, count(*) n from public.empire_post_comments group by post_id order by n desc limit 1) v on v.post_id = p.id
    ),
    'most_saved', (
      select jsonb_build_object('id', p.id, 'title', coalesce(p.title, left(p.body, 60)), 'count', v.n)
      from public.empire_posts p
      join (select post_id, count(*) n from public.empire_post_saves group by post_id order by n desc limit 1) v on v.post_id = p.id
    ),
    'by_publisher', (
      select jsonb_object_agg(pt.publisher_type, jsonb_build_object(
        'views', (select count(*) from public.empire_post_views v join public.empire_posts p on p.id = v.post_id where p.publisher_type = pt.publisher_type),
        'likes', (select count(*) from public.empire_post_likes l join public.empire_posts p on p.id = l.post_id where p.publisher_type = pt.publisher_type),
        'comments', (select count(*) from public.empire_post_comments c join public.empire_posts p on p.id = c.post_id where p.publisher_type = pt.publisher_type),
        'saves', (select count(*) from public.empire_post_saves s join public.empire_posts p on p.id = s.post_id where p.publisher_type = pt.publisher_type)
      ))
      from (select unnest(array['owner', 'assistant', 'cx']) as publisher_type) pt
    )
  ) into v_result;
  return v_result;
end;
$$;
grant execute on function public.fetch_empire_analytics() to authenticated;
