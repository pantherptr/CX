-- 0134 · delete_spotlight, made unbreakable.
-- Same function as 0133, but if the post cannot be deleted for any reason (a constraint, a trigger), the post
-- is archived instead — out of every feed — and the entry is still removed, so the admin always gets a result.
-- Safe to run more than once. Run this in the Supabase SQL Editor.

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

  if v_post is not null then
    begin
      delete from public.empire_posts
       where id = v_post and publisher_type = 'cx' and body = '[[signal-spotlight]]';
    exception when others then
      -- could not be deleted: hide it everywhere instead
      update public.empire_posts set is_archived = true where id = v_post;
    end;
  end if;

  insert into public.signal_spotlight_entries (source_vision_id, status, created_by)
  values (p_vision_id, 'removed', auth.uid())
  on conflict (source_vision_id) do update
    set status = 'removed', post_id = null, published_at = null;
end;
$$;

revoke all on function public.delete_spotlight(uuid) from public, anon;
grant execute on function public.delete_spotlight(uuid) to authenticated;
