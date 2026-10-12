-- 0121 — "For you" learns what you like: posts about cars in the cities you saved or booked in, of the
-- makes you saved or booked, or from a host you booked from, rank higher. Same function as 0098
-- plus the `my_interest` part — recency, engagement, seen/unseen, follows and the random share are unchanged.

drop function if exists public.fetch_for_you_feed(integer, integer, integer, timestamptz, text, text, text);
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
    select p.id, p.created_at, p.author_id, p.vehicle_id
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
        or public._collab_partner_followed(p.id)
      )
    order by p.created_at desc, p.id desc
    limit 600
  ),
  -- What this person has shown interest in: cars they saved or booked (their cities, makes, hosts).
  my_interest as (
    select c.city, c.make, c.host_id
    from public.favorites f join public.cars c on c.id = f.car_id
    where f.user_id = auth.uid()
    union
    select c.city, c.make, c.host_id
    from public.bookings b join public.cars c on c.id = b.car_id
    where b.renter_id = auth.uid()
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
          ) or public._collab_partner_followed(pool.id) then 0.5 else 0 end
        -- posts about a car in a city you looked at / booked in, of a make you like, or from a host you booked
        + case when exists (select 1 from public.cars vc join my_interest mi on mi.city = vc.city where vc.id = pool.vehicle_id) then 0.45 else 0 end
        + case when exists (select 1 from public.cars vc join my_interest mi on mi.make = vc.make where vc.id = pool.vehicle_id) then 0.3 else 0 end
        + case when exists (select 1 from my_interest mi where mi.host_id = pool.author_id) then 0.4 else 0 end
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
  join (
    select s.id, row_number() over (
      order by case when p_mode = 'following' then 0 else s.score end desc nulls last, s.created_at desc, s.id desc
    ) as rn
    from scored s
  ) ord on ord.id = page.id
  order by ord.rn;
$$;
grant execute on function public.fetch_for_you_feed(integer, integer, integer, timestamptz, text, text, text) to authenticated;
