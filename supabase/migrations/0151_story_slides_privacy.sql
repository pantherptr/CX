-- 0151 — Story slides follow their story's privacy; old game sessions are no longer public.
--
-- empire_stories already obeys signal_can_view (private profiles, blocks, visibility — 0095), but the
-- slides table kept "any signed-in user", so the pictures/captions of a private or blocked person's story
-- could still be read directly. Now a slide is readable exactly where its story is (the subquery obeys
-- the empire_stories policy). Team highlights stay readable by signed-in people (team content).
--
-- game_sessions (the retired drive game) was readable by everyone with user ids; nothing in the app reads
-- it any more, so only the player sees their own rows.
--
-- Safe to run more than once. Existing SELECT policies (also the "Merged select" ones from 0128) are replaced.

do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('empire_story_slides', 'game_sessions') and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy "Story slides visible with their story"
  on public.empire_story_slides for select
  using (
    (select auth.uid()) is not null
    and exists (select 1 from public.empire_stories s where s.id = story_id)
  );

create policy "Players see their own game sessions"
  on public.game_sessions for select
  using (user_id = (select auth.uid()));

-- The demo-content generator had no grant/revoke, so anyone (even signed out) could run it and fill the
-- feed. Only our own functions call it (they run as the owner and keep working).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'signal_demo_run_generation'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
