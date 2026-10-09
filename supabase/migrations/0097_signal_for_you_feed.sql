-- "For you" and "Following" feeds, the X way.
--
-- fetch_for_you_feed returns the same rows as fetch_empire_feed, but instead of strictly
-- newest-first it ranks a pool of recent posts (the latest 600 the viewer may see):
--
--   score = recency (soft, ~3 days)  + engagement (Respects and comments, damped)
--         + a boost for posts you have not seen yet / a penalty for ones you have
--         + a boost for people you follow
--         + a random share, different for every `p_seed`
--
-- so every refresh (a new seed) brings a different mix of new and older posts, while
-- scrolling down the same load stays consistent (same seed, same `p_since` = the moment
-- the feed was loaded, so nothing shifts or repeats between pages). The seen/unseen part
-- looks only at what was seen BEFORE that moment.
--
-- p_mode = 'following' is the plain chronological feed of the people you follow (and you).
--
-- Same visibility rules as everywhere (signal_can_view, blocks, private profiles).
-- Builds on 0095/0096.

create or replace function public.fetch_for_you_feed(
  p_limit integer default 20, p_offset integer default 0, p_seed integer default 0,
  p_since timestamptz default null, p_mode text default 'foryou',
  p_publisher_scope text default 'community', p_author_kind text default null
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
  with pool as (
    select p.id, p.created_at
    from public.empire_posts p
    join public.profiles pr on pr.id = p.author_id
    where auth.uid() is not null
      and public.signal_can_view(auth.uid(), 'post', p.id, p.author_id)
      and not p.is_pinned
      and not p.is_featured
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
      and (
        p_mode <> 'following'
        or p.author_id = auth.uid()
        or exists (select 1 from public.profile_follows f where f.follower_id = auth.uid() and f.followee_id = p.author_id)
      )
    order by p.created_at desc, p.id desc
    limit 600
  ),
  scored as (
    select
      pool.id, pool.created_at,
      (
        exp(- greatest(extract(epoch from (coalesce(p_since, now()) - pool.created_at)), 0) / 3600.0 / 72.0)
        + 0.6 * least(
            ln(1 + (select count(*) from public.empire_post_likes l where l.post_id = pool.id)
                 + 2 * (select count(*) from public.empire_post_comments c where c.post_id = pool.id)) / ln(61.0),
            1.2)
        + case when exists (
            select 1 from public.empire_post_views v
            where v.post_id = pool.id and v.user_id = auth.uid() and v.viewed_at < coalesce(p_since, now())
          ) then -0.7 else 0.4 end
        + case when exists (
            select 1 from public.empire_posts q join public.profile_follows f on f.followee_id = q.author_id
            where q.id = pool.id and f.follower_id = auth.uid()
          ) then 0.5 else 0 end
        + 0.9 * ((abs(hashtext(pool.id::text || ':' || p_seed::text)::bigint) % 10000) / 10000.0)
      ) as score
    from pool
  ),
  page as (
    select s.id
    from scored s
    order by
      case when p_mode = 'following' then 0 else s.score end desc nulls last,
      s.created_at desc, s.id desc
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(coalesce(p_limit, 20), 50)
  )
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
  from page
  join public.empire_posts p on p.id = page.id
  join public.profiles pr on pr.id = p.author_id
  -- keep the ranked order of `page` (a join does not)
  join (
    select s.id, row_number() over (
      order by case when p_mode = 'following' then 0 else s.score end desc nulls last, s.created_at desc, s.id desc
    ) as rn
    from scored s
  ) ord on ord.id = page.id
  order by ord.rn;
$$;
grant execute on function public.fetch_for_you_feed(integer, integer, integer, timestamptz, text, text, text) to authenticated;
