-- SIGNAL Story Viewer: server-authoritative View Once authorization.
--
-- The previous mark_empire_story_viewed just recorded a view (void
-- return) — the "don't show a View Once Story to a viewer who already
-- consumed it" rule lived entirely in fetch_active_empire_stories'
-- WHERE clause (0064), which keeps the tile out of a *fresh* fetch but
-- does nothing about a tile already sitting in a client's already-
-- fetched, not-yet-refreshed story list: that viewer could tap the same
-- tile a second time and the old function would happily re-serve (and
-- re-mark, a no-op thanks to the primary key) the same content. This
-- turns marking a view into an authorization check the viewer gates on
-- *before* ever rendering a View Once story's media — the boolean
-- return is the single source of truth for "is this legitimately the
-- first viewing," not anything the client infers from its own stale
-- list.
drop function if exists public.mark_empire_story_viewed(uuid);
create or replace function public.mark_empire_story_viewed(p_story_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_author uuid;
  v_view_once boolean;
  v_already_viewed boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select author_id, is_view_once into v_author, v_view_once
    from public.empire_stories where id = p_story_id;
  if v_author is null then
    raise exception 'Story not found';
  end if;
  -- The author previewing their own View Once Story never burns it —
  -- same exemption fetch_active_empire_stories already grants them.
  if v_view_once and v_author <> auth.uid() then
    select exists(
      select 1 from public.empire_story_views where story_id = p_story_id and user_id = auth.uid()
    ) into v_already_viewed;
    if v_already_viewed then
      return false;
    end if;
  end if;
  insert into public.empire_story_views (story_id, user_id)
  values (p_story_id, auth.uid())
  on conflict (story_id, user_id) do nothing;
  return true;
end;
$$;
grant execute on function public.mark_empire_story_viewed(uuid) to authenticated;
