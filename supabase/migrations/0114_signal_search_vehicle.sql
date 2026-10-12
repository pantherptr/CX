-- 0114 — SIGNAL search also finds posts by the car they show: its city, make and model.
-- Same function as 0095, one extra condition. Powers the "Trending" city chips in the search.

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
    and public.signal_can_view(auth.uid(), 'post', p.id, p.author_id)
    and public._post_is_public(p.id)
    and (p_category is null or p.category = p_category)
    and (
      coalesce(trim(p_query), '') = ''
      or p.title ilike '%' || p_query || '%'
      or p.body ilike '%' || p_query || '%'
      or pr.full_name ilike '%' || p_query || '%'
      or exists (
        select 1 from public.cars cv
        where cv.id = p.vehicle_id
          and (cv.city ilike '%' || p_query || '%'
               or (cv.make || ' ' || cv.model) ilike '%' || p_query || '%')
      )
    )
  order by p.created_at desc
  limit p_limit;
$$;
grant execute on function public.search_empire_posts(text, text, integer) to authenticated;
