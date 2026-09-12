-- Real, non-deduped "impressions" for SIGNAL posts — every time a post's
-- card actually renders (see incrementEmpirePostImpression, called from
-- SignalPostCard's mount effect, same fire-and-forget idiom as
-- mark_empire_post_viewed), not just once per unique viewer the way
-- empire_post_views/"Views" already works. This is the honest metric a
-- future promoted/boosted-post feature would need (comparing organic
-- impressions against paid reach) — added now because it's real and
-- useful today on its own, not to pre-build that future feature.
--
-- A plain counter column, not a per-event table like empire_post_views:
-- impressions have no per-user dedup to enforce, so there's nothing a
-- row-per-event table would buy here that a single increment doesn't.

alter table public.empire_posts add column impressions integer not null default 0;

create or replace function public.increment_empire_post_impression(p_post_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.empire_posts set impressions = impressions + 1 where id = p_post_id;
end;
$$;
grant execute on function public.increment_empire_post_impression(uuid) to authenticated;

-- Additive to the existing jsonb result — no signature change, so no
-- drop-and-recreate needed the way a returns-table change would require.
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
    'total_impressions', (select coalesce(sum(impressions), 0) from public.empire_posts),
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
