-- SIGNAL free-plan limits (step two of the Creator plan, 0138). Everything is controlled by the single row of
-- signal_plan_config: while `enforce` is false nobody is limited. Turn it on / off, and change the numbers, from
-- Admin → Users ("SIGNAL plan limits") or with admin_set_signal_limits().
--
--   videos per month   enforced here, when a post (or a scheduled post) with a video is created
--   video length       checked on the phone before the upload (the database cannot see a video's duration)
--
-- Exempt: Creator plan, hosts, Owner and Admin (has_creator_access, 0138).

create or replace function public.my_signal_limits()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c record;
  v_videos integer;
begin
  select enforce, free_video_max_seconds, free_videos_per_month into c from public.signal_plan_config limit 1;
  select count(*) into v_videos
  from public.empire_posts p
  where p.author_id = auth.uid()
    and p.created_at >= date_trunc('month', now())
    and exists (select 1 from unnest(p.media_paths) m where m ~* '\.(mp4|mov|m4v|webm|3gp|mkv|avi)$');
  return jsonb_build_object(
    'enforce', coalesce(c.enforce, false),
    'is_creator', public.has_creator_access(auth.uid()),
    'free_video_max_seconds', coalesce(c.free_video_max_seconds, 180),
    'free_videos_per_month', coalesce(c.free_videos_per_month, 10),
    'videos_this_month', coalesce(v_videos, 0)
  );
end;
$$;
grant execute on function public.my_signal_limits() to authenticated;

create or replace function public.admin_set_signal_limits(p_enforce boolean, p_max_seconds integer, p_per_month integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.profiles where id = auth.uid() and (is_owner or is_admin)) then
    raise exception 'Not allowed';
  end if;
  if p_max_seconds < 10 or p_max_seconds > 7200 or p_per_month < 0 or p_per_month > 1000 then
    raise exception 'Those numbers are out of range';
  end if;
  update public.signal_plan_config
  set enforce = p_enforce, free_video_max_seconds = p_max_seconds, free_videos_per_month = p_per_month
  where id;
end;
$$;
revoke all on function public.admin_set_signal_limits(boolean, integer, integer) from public;
revoke all on function public.admin_set_signal_limits(boolean, integer, integer) from anon;
grant execute on function public.admin_set_signal_limits(boolean, integer, integer) to authenticated;

-- the per-month limit, applied when a post with a video is created
create or replace function public.enforce_free_video_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v_videos integer;
begin
  if not exists (select 1 from unnest(new.media_paths) m where m ~* '\.(mp4|mov|m4v|webm|3gp|mkv|avi)$') then
    return new;
  end if;
  select enforce, free_videos_per_month into c from public.signal_plan_config limit 1;
  if not coalesce(c.enforce, false) then return new; end if;
  if public.has_creator_access(new.author_id) then return new; end if;
  select count(*) into v_videos
  from public.empire_posts p
  where p.author_id = new.author_id
    and p.created_at >= date_trunc('month', now())
    and exists (select 1 from unnest(p.media_paths) m where m ~* '\.(mp4|mov|m4v|webm|3gp|mkv|avi)$');
  if v_videos >= c.free_videos_per_month then
    raise exception 'The free plan includes % videos a month. Photos are unlimited, and Creator removes the limit.', c.free_videos_per_month;
  end if;
  return new;
end;
$$;

drop trigger if exists empire_posts_video_limit on public.empire_posts;
create trigger empire_posts_video_limit
  before insert on public.empire_posts
  for each row execute function public.enforce_free_video_limit();

do $$
begin
  if to_regclass('public.empire_scheduled_posts') is not null then
    drop trigger if exists empire_scheduled_posts_video_limit on public.empire_scheduled_posts;
    create trigger empire_scheduled_posts_video_limit
      before insert on public.empire_scheduled_posts
      for each row execute function public.enforce_free_video_limit();
  end if;
end $$;
