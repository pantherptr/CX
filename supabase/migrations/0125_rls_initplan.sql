-- 0125 · RLS "Auth RLS Initialization Plan" advisor fix
--
-- Supabase flags policies that call auth.uid() / auth.role() / auth.jwt() directly: Postgres then
-- re-evaluates the function for every row. Wrapping the call as (select auth.uid()) makes it a
-- one-off InitPlan. Same result, much cheaper on big tables (profiles, cars, car_images, reviews...).
--
-- This rewrites every policy in schema public in place (ALTER POLICY keeps name, command and roles;
-- only USING / WITH CHECK change). It is idempotent: calls already wrapped are left alone, so
-- running it twice changes nothing. A policy that cannot be altered is skipped with a NOTICE and
-- the rest carry on.

do $$
declare
  r record;
  new_qual text;
  new_check text;
  stmt text;
  n_done int := 0;
  -- auth.uid() / auth.role() / auth.jwt() that is NOT already directly after "select "
  pat constant text := '(?<!select )auth\.(uid|role|jwt)\(\)';
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (qual ~* pat or with_check ~* pat)
  loop
    new_qual  := case when r.qual       is null then null
                      else regexp_replace(r.qual,       pat, '(select auth.\1())', 'gi') end;
    new_check := case when r.with_check is null then null
                      else regexp_replace(r.with_check, pat, '(select auth.\1())', 'gi') end;

    stmt := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if new_qual  is not null then stmt := stmt || format(' using (%s)', new_qual); end if;
    if new_check is not null then stmt := stmt || format(' with check (%s)', new_check); end if;

    begin
      execute stmt;
      n_done := n_done + 1;
    exception when others then
      raise notice 'skipped policy % on %.%: %', r.policyname, r.schemaname, r.tablename, sqlerrm;
    end;
  end loop;

  raise notice '0125: % polic(ies) rewritten', n_done;
end
$$;
