-- 0129 · Security Advisor: public bucket listing + helper functions callable by signed-out visitors
--
-- 1) "Public Bucket Allows Listing" (avatars, car-photos, empire-post-media)
--    The broad SELECT policies on storage.objects let anyone LIST every file in these buckets.
--    The buckets are public, so image URLs (getPublicUrl) keep working without any SELECT policy.
--    The app never calls storage .list(), so the listing policies are dropped. Upload/update/delete
--    policies are separate and stay as they are.
--
-- 2) "Public Can Execute SECURITY DEFINER Function" (the underscore helpers: _author_badge, ...)
--    These are internal helpers: they are called only from other SECURITY DEFINER functions, which run
--    as the owner, and never from policies, views or the app. Signed-out visitors (anon) and PUBLIC
--    lose EXECUTE; signed-in users and the service role keep it. Idempotent.

drop policy if exists "Avatar images are publicly accessible"       on storage.objects;
drop policy if exists "Car photos are publicly accessible"          on storage.objects;
drop policy if exists "Empire post media is publicly accessible"    on storage.objects;

do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prosecdef
      and p.proname like '\_%'
      and not exists (select 1 from pg_depend d
                      where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    begin
      execute format('revoke execute on function %s from public, anon', r.sig);
      execute format('grant execute on function %s to authenticated, service_role', r.sig);
      n := n + 1;
    exception when others then
      raise notice 'skipped %: %', r.sig, sqlerrm;
    end;
  end loop;
  raise notice '0129: % helper function(s) restricted', n;
end
$$;
