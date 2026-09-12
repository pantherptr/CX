-- SIGNAL video support for Stories — extends the existing image-only
-- Story/Highlight slide system rather than replacing it. Posts need no
-- schema change at all: empire_posts.media_paths stays an opaque text[]
-- of storage paths, and a post's media kind is inferred client-side from
-- the path's own extension (see empireFeed.ts's mediaKindFromPath).

alter table public.empire_story_slides drop constraint if exists empire_story_slides_media_type_check;
alter table public.empire_story_slides add constraint empire_story_slides_media_type_check
  check (media_type in ('image', 'video'));
alter table public.empire_story_slides add column poster_path text;

alter table public.empire_story_highlight_slides drop constraint if exists empire_story_highlight_slides_media_type_check;
alter table public.empire_story_highlight_slides add constraint empire_story_highlight_slides_media_type_check
  check (media_type in ('image', 'video'));
alter table public.empire_story_highlight_slides add column poster_path text;

-- ---- Writes: thread poster_path through slide-adding RPCs ----

create or replace function public.add_empire_story_slide(
  p_story_id uuid, p_media_path text, p_media_type text,
  p_caption text default null, p_cta_label text default null, p_cta_url text default null,
  p_poster_path text default null
)
returns public.empire_story_slides
language plpgsql security definer set search_path = public
as $$
declare
  v_slide public.empire_story_slides;
  v_next_order integer;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if (select count(*) from public.empire_story_slides where story_id = p_story_id) >= 10 then
    raise exception 'A story can have at most 10 slides';
  end if;
  select coalesce(max(sort_order), -1) + 1 into v_next_order
    from public.empire_story_slides where story_id = p_story_id;
  insert into public.empire_story_slides (story_id, media_path, media_type, caption, cta_label, cta_url, sort_order, poster_path)
  values (p_story_id, p_media_path, p_media_type, nullif(trim(p_caption), ''), nullif(trim(p_cta_label), ''), nullif(trim(p_cta_url), ''), v_next_order, p_poster_path)
  returning * into v_slide;
  return v_slide;
end;
$$;
drop function if exists public.add_empire_story_slide(uuid, text, text, text, text, text);
grant execute on function public.add_empire_story_slide(uuid, text, text, text, text, text, text) to authenticated;

create or replace function public.add_empire_highlight_slide(
  p_highlight_id uuid, p_media_path text, p_media_type text,
  p_caption text default null, p_cta_label text default null, p_cta_url text default null,
  p_poster_path text default null
)
returns public.empire_story_highlight_slides
language plpgsql security definer set search_path = public
as $$
declare
  v_slide public.empire_story_highlight_slides;
  v_next_order integer;
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  select count(*) into v_count from public.empire_story_highlight_slides where highlight_id = p_highlight_id;
  if v_count >= 30 then
    raise exception 'A Highlight can have up to 30 slides';
  end if;
  select coalesce(max(sort_order), -1) + 1 into v_next_order from public.empire_story_highlight_slides where highlight_id = p_highlight_id;
  insert into public.empire_story_highlight_slides (highlight_id, media_path, media_type, caption, cta_label, cta_url, sort_order, poster_path)
  values (p_highlight_id, p_media_path, p_media_type, p_caption, p_cta_label, p_cta_url, v_next_order, p_poster_path)
  returning * into v_slide;
  return v_slide;
end;
$$;
drop function if exists public.add_empire_highlight_slide(uuid, text, text, text, text, text);
grant execute on function public.add_empire_highlight_slide(uuid, text, text, text, text, text, text) to authenticated;

-- save_empire_story_to_highlight copies slide rows wholesale — extend the
-- copied column list to carry poster_path across too, otherwise a video
-- Story saved to a Highlight would lose its poster.
create or replace function public.save_empire_story_to_highlight(p_story_id uuid, p_highlight_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_next_order integer;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if not exists (select 1 from public.empire_story_highlights where id = p_highlight_id) then
    raise exception 'Highlight not found';
  end if;
  select coalesce(max(sort_order), -1) + 1 into v_next_order
  from public.empire_story_highlight_slides where highlight_id = p_highlight_id;
  insert into public.empire_story_highlight_slides (highlight_id, media_path, media_type, caption, cta_label, cta_url, sort_order, poster_path)
  select p_highlight_id, s.media_path, s.media_type, s.caption, s.cta_label, s.cta_url, v_next_order + row_number() over (order by s.sort_order) - 1, s.poster_path
  from public.empire_story_slides s
  where s.story_id = p_story_id;
end;
$$;
grant execute on function public.save_empire_story_to_highlight(uuid, uuid) to authenticated;

-- ---- Delete RPCs already return the path(s) to clean up from Storage
-- in one round trip — extend them to also include poster_path, so a
-- video slide's generated thumbnail doesn't leak as an orphaned file. ----

create or replace function public.delete_empire_story(p_story_id uuid)
returns text[]
language plpgsql security definer set search_path = public
as $$
declare
  v_paths text[];
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  select coalesce(array_agg(media_path), '{}') || coalesce(array_agg(poster_path) filter (where poster_path is not null), '{}')
    into v_paths
    from public.empire_story_slides where story_id = p_story_id;
  delete from public.empire_stories where id = p_story_id;
  if not found then
    raise exception 'Story not found';
  end if;
  return v_paths;
end;
$$;
grant execute on function public.delete_empire_story(uuid) to authenticated;

create or replace function public.delete_empire_highlight(p_highlight_id uuid)
returns text[]
language plpgsql security definer set search_path = public
as $$
declare
  v_paths text[];
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  select array_agg(media_path) || coalesce(array_agg(poster_path) filter (where poster_path is not null), '{}')
    into v_paths
    from public.empire_story_highlight_slides where highlight_id = p_highlight_id;
  delete from public.empire_story_highlights where id = p_highlight_id;
  return coalesce(v_paths, '{}');
end;
$$;
grant execute on function public.delete_empire_highlight(uuid) to authenticated;

-- ---- Reads: poster_path added to every slide JSON shape ----

drop function if exists public.fetch_active_empire_stories();
create or replace function public.fetch_active_empire_stories()
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, title text,
  created_at timestamptz, expires_at timestamptz,
  view_count integer, viewed_by_me boolean, slides jsonb, publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    s.id, s.author_id, pr.full_name, pr.avatar_url, s.title, s.created_at, s.expires_at,
    (select count(*)::int from public.empire_story_views v where v.story_id = s.id),
    exists(select 1 from public.empire_story_views v where v.story_id = s.id and v.user_id = auth.uid()),
    (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', sl.id, 'media_path', sl.media_path, 'media_type', sl.media_type,
        'caption', sl.caption, 'cta_label', sl.cta_label, 'cta_url', sl.cta_url,
        'sort_order', sl.sort_order, 'poster_path', sl.poster_path
      ) order by sl.sort_order, sl.id), '[]'::jsonb)
      from public.empire_story_slides sl where sl.story_id = s.id
    ),
    s.publisher_type
  from public.empire_stories s
  join public.profiles pr on pr.id = s.author_id
  where auth.uid() is not null
    and s.expires_at > now()
    and exists (select 1 from public.empire_story_slides sl where sl.story_id = s.id)
  order by s.created_at asc;
$$;
grant execute on function public.fetch_active_empire_stories() to authenticated;

drop function if exists public.fetch_all_empire_stories_admin();
create or replace function public.fetch_all_empire_stories_admin()
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, title text,
  created_at timestamptz, expires_at timestamptz,
  view_count integer, viewed_by_me boolean, slides jsonb, publisher_type text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  return query
    select
      s.id, s.author_id, pr.full_name, pr.avatar_url, s.title, s.created_at, s.expires_at,
      (select count(*)::int from public.empire_story_views v where v.story_id = s.id),
      exists(select 1 from public.empire_story_views v where v.story_id = s.id and v.user_id = auth.uid()),
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', sl.id, 'media_path', sl.media_path, 'media_type', sl.media_type,
          'caption', sl.caption, 'cta_label', sl.cta_label, 'cta_url', sl.cta_url,
          'sort_order', sl.sort_order, 'poster_path', sl.poster_path
        ) order by sl.sort_order, sl.id), '[]'::jsonb)
        from public.empire_story_slides sl where sl.story_id = s.id
      ),
      s.publisher_type
    from public.empire_stories s
    join public.profiles pr on pr.id = s.author_id
    order by s.created_at desc;
end;
$$;
grant execute on function public.fetch_all_empire_stories_admin() to authenticated;

create or replace function public.fetch_empire_highlights()
returns table (id uuid, title text, sort_order integer, created_at timestamptz, slides jsonb)
language sql stable security definer set search_path = public
as $$
  select
    h.id, h.title, h.sort_order, h.created_at,
    coalesce(
      (select jsonb_agg(to_jsonb(sl) - 'highlight_id' order by sl.sort_order)
       from public.empire_story_highlight_slides sl where sl.highlight_id = h.id),
      '[]'::jsonb
    )
  from public.empire_story_highlights h
  where auth.uid() is not null
  order by h.sort_order asc;
$$;
grant execute on function public.fetch_empire_highlights() to authenticated;

-- ---- Storage hardening: real server-side type/size limits for the
-- first time — previously gated only by is_admin() on insert, with no
-- constraint at all on what an admin could upload. ----

update storage.buckets
set file_size_limit = 83886080, -- 80MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
where id = 'empire-post-media';
