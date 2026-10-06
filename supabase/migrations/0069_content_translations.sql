-- Cache for machine-translated user-written content (car descriptions,
-- host bios, reviews, SIGNAL posts/comments/captions).
--
-- Read and written ONLY by api/translate.ts with the service-role key:
-- RLS is on and there are deliberately no policies, so the anon and
-- authenticated roles can neither read nor write it.
create table if not exists public.content_translations (
  source_hash text not null,
  lang text not null check (lang in ('it', 'ro', 'es')),
  translated text not null,
  created_at timestamptz not null default now(),
  primary key (source_hash, lang)
);
alter table public.content_translations enable row level security;

-- The translate endpoint only spends model tokens on text that really is
-- published content, never on arbitrary strings a visitor sends it. Private
-- messages are not in this list on purpose.
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
    or exists (select 1 from public.empire_story_slides s where s.caption = t);
$$;

revoke all on function public.is_translatable_content(text) from public, anon, authenticated;
grant execute on function public.is_translatable_content(text) to service_role;
