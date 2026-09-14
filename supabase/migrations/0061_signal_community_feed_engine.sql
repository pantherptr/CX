-- SIGNAL Community — feed engine hardening pass.
--
-- Two small, targeted changes for the premium Community feed, on top of
-- the existing real feed/pagination/engagement system (no new tables, no
-- second feed implementation):
--
-- 1. A composite index matching the feed's own hot filter+sort shape
--    (`publisher_type = 'self'`/`in ('owner','assistant','cx')`, ordered
--    by `created_at desc`) — the existing `empire_posts_created_idx
--    (created_at desc)` alone means Community's scoped query has to walk
--    the whole date-ordered index filtering out Official rows (and vice
--    versa) rather than seeking straight to matching rows in order.
--
-- 2. A stable `(created_at, id)` keyset cursor for `fetch_empire_feed`,
--    replacing the single-column `created_at <` cursor — two posts can
--    share the exact same `created_at` (bulk-seeded rows, or genuinely
--    simultaneous inserts at scale), and a single-timestamp cursor either
--    skips or repeats whichever tied row lands on a page boundary. Adding
--    `p_before_id` as a trailing, defaulted parameter keeps every existing
--    caller (which only ever passes the first five args) working
--    unchanged; the frontend is updated alongside this to pass the last
--    loaded post's id too. Return type is unchanged, so this still needs
--    the project's usual drop-then-recreate treatment only because a new
--    parameter is being added, not because any output column changed.

create index if not exists empire_posts_publisher_created_idx
  on public.empire_posts (publisher_type, created_at desc);

drop function if exists public.fetch_empire_feed(integer, timestamptz, text, text, text);
create or replace function public.fetch_empire_feed(
  p_limit integer default 20, p_before timestamptz default null, p_category text default null,
  p_publisher_scope text default null, p_author_kind text default null, p_before_id uuid default null
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
    and (
      p_before is null
      or p.created_at < p_before
      or (p.created_at = p_before and p_before_id is not null and p.id < p_before_id)
    )
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
    p.created_at desc,
    p.id desc
  limit p_limit;
$$;
grant execute on function public.fetch_empire_feed(integer, timestamptz, text, text, text, uuid) to authenticated;
