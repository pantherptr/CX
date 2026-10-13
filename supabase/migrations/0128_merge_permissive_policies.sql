-- 0128 · Merge overlapping PERMISSIVE policies (advisor "Multiple Permissive Policies")
--
-- Postgres ORs every permissive policy that applies to a command, but evaluates all of them on every
-- query. For each table in public where two or more permissive policies overlap on a command (this
-- includes a FOR ALL policy overlapping a FOR SELECT one), the table's permissive policies are replaced
-- by at most four: "Merged select / insert / update / delete", whose expressions are the OR of the
-- originals. Access is therefore identical; only the work per query goes down.
--
--   - USING   of a command = OR of the USING of every policy for that command (or ALL)
--   - CHECK   of insert/update = OR of (WITH CHECK, falling back to USING as Postgres does)
--   - RESTRICTIVE policies are not touched.
--   - A table is SKIPPED (with a NOTICE) if its overlapping policies target different roles, or if one
--     has no USING expression: those need a human look.
--   - Each table is done in its own sub-transaction: if anything fails, that table is left as it was.
--   - Idempotent: after a run nothing overlaps any more, so a second run changes nothing.
--
-- Table policies are read from the live catalog at run time, so this is correct whatever earlier
-- migrations or the dashboard did to them.

do $$
declare
  t record;
  k text;
  v_overlap int;
  v_roles_n int;
  v_roles text;
  v_bad int;
  v_using text;
  v_check text;
  v_stmts text[];
  s text;
  n_done int := 0;
begin
  for t in
    select distinct tablename from pg_policies
    where schemaname = 'public' and permissive = 'PERMISSIVE'
    order by 1
  loop
    -- does any command have more than one applicable permissive policy?
    select count(*) into v_overlap
    from unnest(array['SELECT','INSERT','UPDATE','DELETE']) c
    where (select count(*) from pg_policies x
           where x.schemaname = 'public' and x.tablename = t.tablename
             and x.permissive = 'PERMISSIVE' and x.cmd in (c, 'ALL')) > 1;
    continue when v_overlap = 0;

    select count(distinct roles::text) into v_roles_n
    from pg_policies
    where schemaname = 'public' and tablename = t.tablename and permissive = 'PERMISSIVE';
    if v_roles_n <> 1 then
      raise notice 'skipped %: policies target different roles', t.tablename;
      continue;
    end if;

    select count(*) into v_bad
    from pg_policies
    where schemaname = 'public' and tablename = t.tablename and permissive = 'PERMISSIVE'
      and cmd in ('SELECT','UPDATE','DELETE','ALL') and qual is null;
    if v_bad > 0 then
      raise notice 'skipped %: a policy has no USING expression', t.tablename;
      continue;
    end if;

    -- roles are identical across policies (checked above); take them from one policy
    select string_agg(quote_ident(r), ', ') into v_roles
    from unnest((select roles from pg_policies
                 where schemaname = 'public' and tablename = t.tablename and permissive = 'PERMISSIVE'
                 limit 1)) r;

    v_stmts := '{}';
    foreach k in array array['select','insert','update','delete'] loop
      select string_agg('(' || qual || ')', ' or '),
             string_agg('(' || coalesce(with_check, qual) || ')', ' or ')
        into v_using, v_check
      from pg_policies
      where schemaname = 'public' and tablename = t.tablename and permissive = 'PERMISSIVE'
        and cmd in (upper(k), 'ALL');

      if k = 'insert' then
        -- INSERT policies carry only WITH CHECK; ALL policies fall back to USING
        select string_agg('(' || coalesce(with_check, qual) || ')', ' or ') into v_check
        from pg_policies
        where schemaname = 'public' and tablename = t.tablename and permissive = 'PERMISSIVE'
          and cmd in ('INSERT', 'ALL');
        if v_check is not null then
          v_stmts := v_stmts || format('create policy "Merged insert" on public.%I for insert to %s with check (%s)',
                                       t.tablename, v_roles, v_check);
        end if;
      elsif v_using is not null then
        if k = 'select' then
          v_stmts := v_stmts || format('create policy "Merged select" on public.%I for select to %s using (%s)',
                                       t.tablename, v_roles, v_using);
        elsif k = 'update' then
          v_stmts := v_stmts || format('create policy "Merged update" on public.%I for update to %s using (%s) with check (%s)',
                                       t.tablename, v_roles, v_using, v_check);
        else
          v_stmts := v_stmts || format('create policy "Merged delete" on public.%I for delete to %s using (%s)',
                                       t.tablename, v_roles, v_using);
        end if;
      end if;
    end loop;

    begin
      for s in
        select format('drop policy %I on public.%I', policyname, tablename)
        from pg_policies
        where schemaname = 'public' and tablename = t.tablename and permissive = 'PERMISSIVE'
      loop
        execute s;
      end loop;
      foreach s in array v_stmts loop
        execute s;
      end loop;
      n_done := n_done + 1;
      raise notice 'merged policies on %', t.tablename;
    exception when others then
      raise notice 'skipped %: %', t.tablename, sqlerrm;
    end;
  end loop;

  raise notice '0128: % table(s) merged', n_done;
end
$$;
