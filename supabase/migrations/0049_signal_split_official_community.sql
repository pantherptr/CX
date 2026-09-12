-- SIGNAL splits into two spaces: OFFICIAL (Owner/CX Assistant/CX —
-- publisher_type in ('owner','assistant','cx')) and COMMUNITY (Host/
-- Verified Client, publisher_type = 'self'). That column already encodes
-- exactly this distinction, so this migration is pure read-side scoping
-- — no new table, no new column, no change to who can publish what
-- (already fully enforced by can_publish_signal_content() and the
-- force-to-'self' logic in 0048_signal_community.sql).

drop function if exists public.fetch_empire_feed(integer, timestamptz, text);
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
  liked_by_me boolean, saved_by_me boolean, publisher_type text
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
    p.publisher_type
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
    -- Official keeps its editorial announcement/exclusive-first weighting;
    -- Community is a plain social feed, always straight recency.
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

drop function if exists public.fetch_empire_trending_posts(integer);
create or replace function public.fetch_empire_trending_posts(
  p_limit integer default 5, p_publisher_scope text default null, p_author_kind text default null
)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    id, author_id, author_name, author_avatar_url, author_is_owner, author_is_admin, author_is_host, author_is_verified_client,
    category, title, body, media_paths, is_pinned, is_featured, comments_disabled,
    created_at, updated_at, edited_at, like_count, comment_count, save_count, view_count, share_count,
    liked_by_me, saved_by_me, publisher_type
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
