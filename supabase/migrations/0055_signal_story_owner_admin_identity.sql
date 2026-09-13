-- Stories carry the same 'self' publisher-identity gap posts just had:
-- fetch_active_empire_stories/fetch_all_empire_stories_admin only ever
-- returned author_is_host/author_is_verified_client, so an Owner or
-- Admin publishing a Story under their own real identity (not the fixed
-- 'owner' voice) showed up as a plain, unbadged "Client" — the same bug
-- just fixed for posts (empireFeed.ts already selects author_is_owner/
-- author_is_admin there). Adds the same two columns here so
-- resolveSignalIdentity can recognize them for Stories too.
--
-- Changing a table-returning function's output columns requires an
-- explicit drop first — CREATE OR REPLACE FUNCTION refuses to alter an
-- existing return type.
drop function if exists public.fetch_active_empire_stories();
drop function if exists public.fetch_all_empire_stories_admin();

create or replace function public.fetch_active_empire_stories()
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_avatar_url text,
  author_is_owner boolean,
  author_is_admin boolean,
  author_is_host boolean,
  author_is_verified_client boolean,
  title text,
  created_at timestamptz,
  expires_at timestamptz,
  view_count integer,
  viewed_by_me boolean,
  slides jsonb,
  publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    s.id, s.author_id,
    coalesce(p.full_name, 'CX Rent'), p.avatar_url,
    coalesce(p.is_owner, false), coalesce(p.is_admin, false),
    coalesce(p.is_host, false), coalesce(p.is_verified_client, false),
    s.title, s.created_at, s.expires_at,
    (select count(*)::int from public.empire_story_views v where v.story_id = s.id),
    exists(select 1 from public.empire_story_views v where v.story_id = s.id and v.user_id = auth.uid()),
    (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', sl.id, 'media_path', sl.media_path, 'media_type', sl.media_type,
        'caption', sl.caption, 'cta_label', sl.cta_label, 'cta_url', sl.cta_url,
        'sort_order', sl.sort_order, 'poster_path', sl.poster_path,
        'text_content', sl.text_content, 'text_align', sl.text_align,
        'text_size', sl.text_size, 'bg_style', sl.bg_style
      ) order by sl.sort_order, sl.id), '[]'::jsonb)
      from public.empire_story_slides sl where sl.story_id = s.id
    ),
    s.publisher_type
  from public.empire_stories s
  join public.profiles p on p.id = s.author_id
  where auth.uid() is not null
    and s.expires_at > now()
    and exists (select 1 from public.empire_story_slides sl where sl.story_id = s.id)
  order by s.created_at asc;
$$;
grant execute on function public.fetch_active_empire_stories() to authenticated;

create or replace function public.fetch_all_empire_stories_admin()
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_avatar_url text,
  author_is_owner boolean,
  author_is_admin boolean,
  author_is_host boolean,
  author_is_verified_client boolean,
  title text,
  created_at timestamptz,
  expires_at timestamptz,
  view_count integer,
  viewed_by_me boolean,
  slides jsonb,
  publisher_type text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  return query
    select
      s.id, s.author_id,
      coalesce(p.full_name, 'CX Rent'), p.avatar_url,
      coalesce(p.is_owner, false), coalesce(p.is_admin, false),
      coalesce(p.is_host, false), coalesce(p.is_verified_client, false),
      s.title, s.created_at, s.expires_at,
      (select count(*)::int from public.empire_story_views v where v.story_id = s.id),
      exists(select 1 from public.empire_story_views v where v.story_id = s.id and v.user_id = auth.uid()),
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', sl.id, 'media_path', sl.media_path, 'media_type', sl.media_type,
          'caption', sl.caption, 'cta_label', sl.cta_label, 'cta_url', sl.cta_url,
          'sort_order', sl.sort_order, 'poster_path', sl.poster_path,
          'text_content', sl.text_content, 'text_align', sl.text_align,
          'text_size', sl.text_size, 'bg_style', sl.bg_style
        ) order by sl.sort_order, sl.id), '[]'::jsonb)
        from public.empire_story_slides sl where sl.story_id = s.id
      ),
      s.publisher_type
    from public.empire_stories s
    join public.profiles p on p.id = s.author_id
    where s.expires_at > now()
    order by s.created_at asc;
end;
$$;
grant execute on function public.fetch_all_empire_stories_admin() to authenticated;
