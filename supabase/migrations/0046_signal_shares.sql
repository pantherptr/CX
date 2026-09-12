-- Real share tracking for SIGNAL posts — a genuine event counter (a user
-- actually completed the native share sheet or copied the link), same
-- "plain incrementing column, no per-user dedup" shape as impressions
-- (0045): unlike a view, the same person sharing a post twice to two
-- different people is two real, distinct share events, not a duplicate
-- to collapse.

alter table public.empire_posts add column shares integer not null default 0;

create or replace function public.increment_empire_post_share(p_post_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.empire_posts set shares = shares + 1 where id = p_post_id;
end;
$$;
grant execute on function public.increment_empire_post_share(uuid) to authenticated;

-- `shares` joins view_count/like_count/save_count in every per-row fetch
-- so the Owner-only "Post performance" line on each card (SignalPostCard,
-- canManage only — public users never see counters at all per this
-- redesign) has real numbers to show without a second round trip.
-- Same drop-then-recreate pattern as every prior returns-table change
-- in this file's lineage (0042/0043/0044/0045).

drop function if exists public.fetch_empire_feed(integer, timestamptz, text);
create or replace function public.fetch_empire_feed(
  p_limit integer default 20, p_before timestamptz default null, p_category text default null
)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text
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
    p.shares,
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
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text
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
    p.shares,
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
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text
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
    p.shares,
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
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text
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
    p.shares,
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
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    id, author_id, author_name, author_avatar_url, author_is_owner, author_is_admin,
    category, title, body, media_paths, is_pinned, is_featured, comments_disabled,
    created_at, updated_at, edited_at, like_count, comment_count, save_count, view_count, share_count,
    liked_by_me, saved_by_me, publisher_type
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
      p.shares as share_count,
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
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text
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
    p.shares,
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
