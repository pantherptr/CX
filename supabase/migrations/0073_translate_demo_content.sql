-- SIGNAL's seeded demo posts and profiles are published content too, so the
-- translate endpoint may translate them (0069's allow-list only covered real
-- posts). Still an exact-match allow-list: arbitrary text is never translated.
create or replace function public.is_translatable_content(t text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from public.cars c where c.description = t)
    or exists (select 1 from public.reviews r where r.body = t)
    or exists (select 1 from public.profiles p where p.bio = t)
    or exists (select 1 from public.empire_posts e where e.body = t or e.title = t)
    or exists (select 1 from public.empire_post_comments ec where ec.body = t)
    or exists (select 1 from public.empire_story_slides s where s.caption = t)
    or exists (select 1 from public.signal_demo_posts d where d.body = t or d.title = t)
    or exists (select 1 from public.signal_demo_profiles dp where dp.bio = t);
$$;

revoke all on function public.is_translatable_content(text) from public, anon, authenticated;
grant execute on function public.is_translatable_content(text) to service_role;
