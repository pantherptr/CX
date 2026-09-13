-- Text Stories — a third slide type alongside image/video, real (not a
-- disguised image render): a colored background + a caption, matching
-- how a modern Story app's text-only composer works. `media_path` was
-- `not null` because every prior slide type genuinely had an uploaded
-- file; a text slide has none, so it's relaxed to nullable — enforced
-- the other way instead (media_type='text' requires text_content and
-- forbids media_path; image/video require media_path) inside the RPC,
-- server-side, never trusted from the client alone. Idempotent throughout
-- (see 0048's own lesson on this) so a partial prior run can be re-applied.

alter table public.empire_story_slides alter column media_path drop not null;

alter table public.empire_story_slides drop constraint if exists empire_story_slides_media_type_check;
alter table public.empire_story_slides add constraint empire_story_slides_media_type_check
  check (media_type in ('image', 'video', 'text'));

alter table public.empire_story_slides add column if not exists text_content text;
alter table public.empire_story_slides add column if not exists text_align text;
alter table public.empire_story_slides add column if not exists text_size text;
alter table public.empire_story_slides add column if not exists bg_style text;

alter table public.empire_story_slides drop constraint if exists empire_story_slides_text_align_check;
alter table public.empire_story_slides add constraint empire_story_slides_text_align_check
  check (text_align is null or text_align in ('left', 'center', 'right'));

alter table public.empire_story_slides drop constraint if exists empire_story_slides_text_size_check;
alter table public.empire_story_slides add constraint empire_story_slides_text_size_check
  check (text_size is null or text_size in ('sm', 'md', 'lg'));

-- A small fixed set of original CX Rent-branded backgrounds (black,
-- signature green, gold, and two subtle two-stop gradients) — not a free
-- color picker, per the brief's own "do not create hundreds of options."
alter table public.empire_story_slides drop constraint if exists empire_story_slides_bg_style_check;
alter table public.empire_story_slides add constraint empire_story_slides_bg_style_check
  check (bg_style is null or bg_style in ('noir', 'accent', 'gold', 'gradient-signal', 'gradient-gold'));

-- `create or replace function` only replaces a function with the EXACT
-- same parameter list — a different one (adding the four p_text_*/p_bg_*
-- params below) creates a second overload alongside the old one instead
-- of replacing it, and PostgREST then can't tell which one a call naming
-- only the original params should resolve to ("function is not unique").
-- The old 7-arg signature (0047/0050) must be dropped explicitly first.
drop function if exists public.add_empire_story_slide(uuid, text, text, text, text, text, text);

create or replace function public.add_empire_story_slide(
  p_story_id uuid, p_media_path text, p_media_type text,
  p_caption text default null, p_cta_label text default null, p_cta_url text default null,
  p_poster_path text default null,
  p_text_content text default null, p_text_align text default null,
  p_text_size text default null, p_bg_style text default null
)
returns public.empire_story_slides
language plpgsql security definer set search_path = public
as $$
declare
  v_slide public.empire_story_slides;
  v_next_order integer;
  v_text_content text := nullif(trim(p_text_content), '');
begin
  if not (public.is_admin() or exists (select 1 from public.empire_stories s where s.id = p_story_id and s.author_id = auth.uid())) then
    raise exception 'Not authorized';
  end if;
  if p_media_type = 'text' then
    if v_text_content is null then
      raise exception 'A text Story needs some text.';
    end if;
    if p_media_path is not null then
      raise exception 'A text Story cannot also carry a media file.';
    end if;
  else
    if p_media_path is null then
      raise exception 'This slide is missing its media file.';
    end if;
  end if;
  if (select count(*) from public.empire_story_slides where story_id = p_story_id) >= 10 then
    raise exception 'A story can have at most 10 slides';
  end if;
  select coalesce(max(sort_order), -1) + 1 into v_next_order
    from public.empire_story_slides where story_id = p_story_id;
  insert into public.empire_story_slides (
    story_id, media_path, media_type, caption, cta_label, cta_url, sort_order, poster_path,
    text_content, text_align, text_size, bg_style
  )
  values (
    p_story_id, p_media_path, p_media_type, nullif(trim(p_caption), ''), nullif(trim(p_cta_label), ''), nullif(trim(p_cta_url), ''), v_next_order, p_poster_path,
    v_text_content, p_text_align, p_text_size, p_bg_style
  )
  returning * into v_slide;
  return v_slide;
end;
$$;
grant execute on function public.add_empire_story_slide(uuid, text, text, text, text, text, text, text, text, text, text) to authenticated;

create or replace function public.fetch_active_empire_stories()
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_avatar_url text,
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
    order by s.created_at desc;
end;
$$;
grant execute on function public.fetch_all_empire_stories_admin() to authenticated;
