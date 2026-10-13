-- 0126 · "Function Search Path Mutable" advisor fix
--
-- Functions without a fixed search_path resolve names through the caller's path, which Supabase flags
-- as a security warning. This pins search_path on every function in schema public that we own.
--
-- - Functions that belong to an extension (btree_gist's gbtreekey*, pg_net, ...) are skipped: they are
--   not ours to alter and the advisor warning for them is about the extension living in public.
-- - search_path = public, extensions, pg_temp keeps unqualified calls to our own tables/functions and to
--   extension functions (crypt, unaccent, similarity ...) working exactly as before.
-- - Idempotent: functions that already have a search_path are left alone. A function that cannot be
--   altered is skipped with a NOTICE and the rest carry on.

do $$
declare
  r record;
  n_done int := 0;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and (p.proconfig is null
           or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
  loop
    begin
      execute format('alter function %s set search_path = public, extensions, pg_temp', r.sig);
      n_done := n_done + 1;
    exception when others then
      raise notice 'skipped %: %', r.sig, sqlerrm;
    end;
  end loop;

  raise notice '0126: % function(s) pinned', n_done;
end
$$;
