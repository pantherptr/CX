-- 0133 · Admins can delete a published Spotlight for good.
--
-- "Archive" only takes a Spotlight off the feed and "Remove" hides the Vision from the queue. This removes
-- a published Spotlight completely: its team post (with its Respect, comments and saves) and its entry.
-- The creator's Vision itself is never touched. Run this in the Supabase SQL Editor.

create or replace function public.delete_spotlight(p_vision_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post uuid;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;

  select post_id into v_post from public.signal_spotlight_entries where source_vision_id = p_vision_id;

  -- the team post that carries the Spotlight (only ever the marker post, never anything else)
  if v_post is not null then
    delete from public.empire_posts
     where id = v_post and publisher_type = 'cx' and body = '[[signal-spotlight]]';
  end if;

  -- the entry stays as "removed" so the Vision is not offered again by accident; it is out of every feed
  update public.signal_spotlight_entries
     set status = 'removed', post_id = null, published_at = null
   where source_vision_id = p_vision_id;
end;
$$;

revoke all on function public.delete_spotlight(uuid) from public, anon;
grant execute on function public.delete_spotlight(uuid) to authenticated;
