-- Adds the month's figures to admin_media_overview() (0136): uploads since the 1st of the month, active people
-- in the last 30 days and the total number of members. Replaces the function; nothing else changes.

create or replace function public.admin_media_overview()
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_buckets jsonb;
  v_day jsonb;
  v_month jsonb;
  v_top jsonb;
  v_active integer;
  v_members integer;
begin
  if auth.uid() is null
     or not exists (select 1 from public.profiles where id = auth.uid() and (is_owner or is_admin)) then
    raise exception 'Not allowed';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket_id, 'files', files, 'bytes', bytes) order by bytes desc), '[]'::jsonb)
  into v_buckets
  from (
    select bucket_id, count(*) as files, coalesce(sum((metadata ->> 'size')::bigint), 0) as bytes
    from storage.objects group by bucket_id
  ) b;

  select jsonb_build_object('files', count(*), 'bytes', coalesce(sum((metadata ->> 'size')::bigint), 0))
  into v_day
  from storage.objects where created_at > now() - interval '24 hours';

  select jsonb_build_object('files', count(*), 'bytes', coalesce(sum((metadata ->> 'size')::bigint), 0))
  into v_month
  from storage.objects where created_at >= date_trunc('month', now());

  select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'name', name, 'files', files, 'bytes', bytes) order by bytes desc), '[]'::jsonb)
  into v_top
  from (
    select o.owner_id as user_id, coalesce(p.full_name, 'Unknown') as name, count(*) as files,
           coalesce(sum((o.metadata ->> 'size')::bigint), 0) as bytes
    from storage.objects o
    left join public.profiles p on p.id::text = o.owner_id
    where o.created_at > now() - interval '24 hours' and o.owner_id is not null
    group by o.owner_id, p.full_name
    order by bytes desc
    limit 8
  ) t;

  select count(distinct user_id) into v_active from public.user_devices where last_seen > now() - interval '30 days';
  select count(*) into v_members from public.profiles;

  return jsonb_build_object(
    'buckets', v_buckets, 'last24h', v_day, 'month', v_month, 'top_uploaders', v_top,
    'active_30d', v_active, 'members', v_members
  );
end;
$$;

revoke all on function public.admin_media_overview() from public;
revoke all on function public.admin_media_overview() from anon;
grant execute on function public.admin_media_overview() to authenticated;
