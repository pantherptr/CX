-- 0124 — Admin → Users: when each person was last seen, on what, and how many devices.
--
-- Built from user_devices (0105), which the app touches on use. Only the Owner and admins may ask;
-- everyone else gets nothing back.

create or replace function public.admin_user_access()
returns table (user_id uuid, last_seen timestamptz, first_seen timestamptz, device_count integer, last_platform text, last_label text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin = true or p.is_owner = true)
  ) then
    return;
  end if;
  return query
    select d.user_id,
           max(d.last_seen),
           min(d.first_seen),
           count(*)::int,
           (array_agg(d.platform order by d.last_seen desc))[1],
           (array_agg(d.label order by d.last_seen desc))[1]
    from public.user_devices d
    group by d.user_id;
end;
$$;
grant execute on function public.admin_user_access() to authenticated;
