-- Media guards: invisible, generous limits against abuse (nothing a normal member will ever meet), and an
-- Owner/Admin overview of what is being uploaded.
--
--   * posts per hour per member        (empire_posts, before insert)
--   * files per hour per member        (storage.objects, before insert; a photo is 3 files with its copies)
--   * admin_media_overview()           storage by bucket, last 24 h, top uploaders
--
-- Owner / Admin accounts are exempt. The limits are numbers in the two functions: change them there.

create or replace function public.enforce_post_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent integer;
begin
  if exists (select 1 from public.profiles p where p.id = new.author_id and (p.is_owner or p.is_admin)) then
    return new;
  end if;
  select count(*) into v_recent
  from public.empire_posts
  where author_id = new.author_id and created_at > now() - interval '1 hour';
  if v_recent >= 40 then
    raise exception 'You are posting very fast. Please wait a little and try again.';
  end if;
  return new;
end;
$$;

drop trigger if exists empire_posts_rate_limit on public.empire_posts;
create trigger empire_posts_rate_limit
  before insert on public.empire_posts
  for each row execute function public.enforce_post_rate_limit();

-- files per hour (the storage schema belongs to Supabase: if this account may not add a trigger there, the
-- block says so and the rest of the migration still applies)
create or replace function public.enforce_upload_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_owner text := coalesce(new.owner_id, new.owner::text);
  v_recent integer;
begin
  if v_owner is null then return new; end if;
  if exists (select 1 from public.profiles p where p.id::text = v_owner and (p.is_owner or p.is_admin)) then
    return new;
  end if;
  select count(*) into v_recent
  from storage.objects o
  where coalesce(o.owner_id, o.owner::text) = v_owner and o.created_at > now() - interval '1 hour';
  if v_recent >= 600 then
    raise exception 'Too many uploads in a short time. Please wait a little and try again.';
  end if;
  return new;
end;
$$;

do $$
begin
  drop trigger if exists storage_objects_rate_limit on storage.objects;
  create trigger storage_objects_rate_limit
    before insert on storage.objects
    for each row execute function public.enforce_upload_rate_limit();
exception when insufficient_privilege then
  raise notice 'Could not add the upload-rate trigger on storage.objects (insufficient privilege) - skipped.';
end $$;

-- ---------------------------------------------------------------- overview for the team
create or replace function public.admin_media_overview()
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_buckets jsonb;
  v_day jsonb;
  v_top jsonb;
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

  return jsonb_build_object('buckets', v_buckets, 'last24h', v_day, 'top_uploaders', v_top);
end;
$$;

revoke all on function public.admin_media_overview() from public;
revoke all on function public.admin_media_overview() from anon;
grant execute on function public.admin_media_overview() to authenticated;
