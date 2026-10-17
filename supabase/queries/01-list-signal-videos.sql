-- READ ONLY. Nothing is changed. Run each block on its own in the Supabase SQL Editor and tell me what you see.

-- 1) How much space each bucket takes, and how much of it is video
select bucket_id,
       count(*)                                                                              as files,
       round(sum((metadata->>'size')::bigint) / 1048576.0, 1)                                 as total_mb,
       round(sum(case when lower(name) ~ '\.(mp4|mov|m4v|webm|3gp)$' then (metadata->>'size')::bigint else 0 end) / 1048576.0, 1) as video_mb
from storage.objects
group by bucket_id
order by total_mb desc;

-- 2) Every video file, biggest first, and where it is used (posts, portfolio, published Spotlight)
select o.bucket_id,
       o.name,
       round((o.metadata->>'size')::bigint / 1048576.0, 1)                                    as mb,
       o.created_at::date                                                                    as uploaded,
       (select count(*) from public.empire_posts p where o.name = any (p.media_paths))       as in_posts,
       (select count(*) from public.signal_visions v where v.media_path = o.name)            as in_portfolio,
       (select count(*) from public.signal_spotlight_entries e
          join public.signal_visions v on v.id = e.source_vision_id
         where v.media_path = o.name and e.status = 'published')                             as in_spotlight
from storage.objects o
where lower(o.name) ~ '\.(mp4|mov|m4v|webm|3gp)$'
order by (o.metadata->>'size')::bigint desc nulls last
limit 60;
