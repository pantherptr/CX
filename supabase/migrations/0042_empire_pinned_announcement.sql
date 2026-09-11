-- Promotes the pinned post to its own "Featured Announcement" fetch,
-- independent of the paginated feed, and simplifies fetch_empire_feed
-- back to a plain paginated query now that it no longer needs the
-- fragile "only prepend the pinned post on the first page" logic. Also
-- adds server-side category filtering so the feed's category chips stay
-- coherent across pagination (filtering only the current page client-
-- side would make "load more" silently drop the active filter).

-- Adding p_category changes the signature (2 args -> 3) — `create or
-- replace` only updates a function in place when the argument list
-- matches exactly, otherwise it silently creates a second overload and
-- leaves the old 2-arg version behind. Drop the old signature first.
drop function if exists public.fetch_empire_feed(integer, timestamptz);

create or replace function public.fetch_empire_feed(
  p_limit integer default 20, p_before timestamptz default null, p_category text default null
)
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_avatar_url text,
  author_is_owner boolean,
  author_is_admin boolean,
  category text,
  title text,
  body text,
  media_paths text[],
  is_pinned boolean,
  comments_disabled boolean,
  created_at timestamptz,
  updated_at timestamptz,
  edited_at timestamptz,
  like_count integer,
  comment_count integer,
  save_count integer,
  liked_by_me boolean,
  saved_by_me boolean
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid())
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null
    and not p.is_pinned
    and (p_before is null or p.created_at < p_before)
    and (p_category is null or p.category = p_category)
  order by p.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_empire_feed(integer, timestamptz, text) to authenticated;

-- Same column shape/order as fetch_empire_feed so the client can reuse
-- its existing row mapper verbatim.
create or replace function public.fetch_empire_pinned_post()
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_avatar_url text,
  author_is_owner boolean,
  author_is_admin boolean,
  category text,
  title text,
  body text,
  media_paths text[],
  is_pinned boolean,
  comments_disabled boolean,
  created_at timestamptz,
  updated_at timestamptz,
  edited_at timestamptz,
  like_count integer,
  comment_count integer,
  save_count integer,
  liked_by_me boolean,
  saved_by_me boolean
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid())
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null and p.is_pinned = true
  limit 1;
$$;
grant execute on function public.fetch_empire_pinned_post() to authenticated;
