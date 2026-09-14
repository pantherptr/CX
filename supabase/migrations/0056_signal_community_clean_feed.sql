-- SIGNAL — Community clean feed + Official publishing rules.
--
-- 1. Community posts are not News/Update/etc. — they never had a real
--    category of their own, the composer just silently sent 'news'.
--    Widen the category check to a real 'community' value, and force it
--    server-side for every self-published post regardless of whatever
--    the client sends (frontend no longer even offers a picker for
--    these, but the RPC is the actual authority, not the UI).
-- 2. Comment CREATION becomes CX-team-only (Owner/Admin — is_admin()
--    already covers both) across both Official and Community content.
--    Reading, Respect, Save, Share, Follow are all unaffected — only
--    inserting a new comment is gated. Existing comments from
--    non-team users stay exactly as they are (not retroactively hidden
--    or removed).
alter table public.empire_posts drop constraint empire_posts_category_check;
alter table public.empire_posts add constraint empire_posts_category_check
  check (category in ('news','update','new_car','feature','event','offer','announcement','exclusive','community'));

create or replace function public.create_empire_post(
  p_category text, p_title text, p_body text, p_media_paths text[] default '{}',
  p_comments_disabled boolean default false, p_publisher_type text default 'owner',
  p_vehicle_id uuid default null
)
returns public.empire_posts
language plpgsql security definer set search_path = public
as $$
declare
  v_post public.empire_posts;
  v_type text := p_publisher_type;
  v_category text := p_category;
begin
  if not public.can_publish_signal_content() then
    raise exception 'Not authorized';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Post body cannot be empty';
  end if;
  if not public.is_admin() then
    v_type := 'self';
  elsif v_type not in ('owner', 'assistant', 'cx', 'self') then
    raise exception 'Invalid publisher identity';
  end if;
  -- Community ('self') posts never carry a real editorial category —
  -- force it server-side so a manipulated client request can't tag
  -- personal content as News/Exclusive/etc.
  if v_type = 'self' then
    v_category := 'community';
  end if;
  if p_vehicle_id is not null and not exists (select 1 from public.cars where id = p_vehicle_id and host_id = auth.uid()) then
    raise exception 'Not authorized to attach this vehicle';
  end if;
  insert into public.empire_posts (author_id, category, title, body, media_paths, comments_disabled, publisher_type, vehicle_id)
  values (auth.uid(), v_category, nullif(trim(p_title), ''), p_body, coalesce(p_media_paths, '{}'), coalesce(p_comments_disabled, false), v_type, p_vehicle_id)
  returning * into v_post;
  return v_post;
end;
$$;
grant execute on function public.create_empire_post(text, text, text, text[], boolean, text, uuid) to authenticated;

create or replace function public.update_empire_post(
  p_post_id uuid, p_category text, p_title text, p_body text, p_media_paths text[], p_comments_disabled boolean,
  p_publisher_type text default 'owner', p_vehicle_id uuid default null
)
returns public.empire_posts
language plpgsql security definer set search_path = public
as $$
declare
  v_post public.empire_posts;
  v_type text := p_publisher_type;
  v_category text := p_category;
begin
  if not (public.is_admin() or exists (select 1 from public.empire_posts where id = p_post_id and author_id = auth.uid())) then
    raise exception 'Not authorized';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Post body cannot be empty';
  end if;
  if not public.is_admin() then
    v_type := 'self';
  elsif v_type not in ('owner', 'assistant', 'cx', 'self') then
    raise exception 'Invalid publisher identity';
  end if;
  if v_type = 'self' then
    v_category := 'community';
  end if;
  if p_vehicle_id is not null and not exists (select 1 from public.cars where id = p_vehicle_id and host_id = auth.uid()) then
    raise exception 'Not authorized to attach this vehicle';
  end if;
  update public.empire_posts
  set category = v_category,
      title = nullif(trim(p_title), ''),
      body = p_body,
      media_paths = coalesce(p_media_paths, '{}'),
      comments_disabled = coalesce(p_comments_disabled, false),
      publisher_type = v_type,
      vehicle_id = p_vehicle_id,
      updated_at = now(),
      edited_at = now()
  where id = p_post_id
  returning * into v_post;
  if v_post.id is null then
    raise exception 'Post not found';
  end if;
  return v_post;
end;
$$;
grant execute on function public.update_empire_post(uuid, text, text, text, text[], boolean, text, uuid) to authenticated;

create or replace function public.add_empire_post_comment(p_post_id uuid, p_body text)
returns public.empire_post_comments
language plpgsql security definer set search_path = public
as $$
declare
  v_disabled boolean;
  v_author uuid;
  v_comment public.empire_post_comments;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_admin() then
    raise exception 'Only the CX Rent team can comment';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Comment cannot be empty';
  end if;
  select comments_disabled, author_id into v_disabled, v_author from public.empire_posts where id = p_post_id;
  if v_disabled is null then
    raise exception 'Post not found';
  end if;
  if v_disabled then
    raise exception 'Comments are disabled for this post';
  end if;
  insert into public.empire_post_comments (post_id, user_id, body)
  values (p_post_id, auth.uid(), p_body)
  returning * into v_comment;
  perform public.create_signal_notification(v_author, 'post_comment', p_post_id);
  return v_comment;
end;
$$;
grant execute on function public.add_empire_post_comment(uuid, text) to authenticated;
