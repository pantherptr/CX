-- Bug fix, caught in this session's own test pass: 0048/0049 widened
-- create_empire_story to let a Host/Verified Client start a Community
-- Story, but the slide-level write RPCs a publish actually needs
-- (add/delete/reorder) were still is_admin()-only from 0041/0047 — so a
-- Community Story composer would create an empty story shell, silently
-- fail to attach any media (add_empire_story_slide rejecting with "Not
-- authorized"), and the story would never appear anywhere (Stories only
-- surface once they have at least one slide). Widened here to the same
-- "admin OR you own this story" pattern already used for posts
-- (update_empire_post/delete_empire_post). Deliberately NOT touching
-- delete_empire_story itself — deleting an already-published Story stays
-- Owner/Admin-only, a separate scope decision from being able to compose
-- one in the first place.

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
  if not (public.is_admin() or exists (select 1 from public.empire_stories s where s.id = p_story_id and s.author_id = auth.uid())) then
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
grant execute on function public.add_empire_story_slide(uuid, text, text, text, text, text, text) to authenticated;

create or replace function public.delete_empire_story_slide(p_slide_id uuid)
returns public.empire_story_slides
language plpgsql security definer set search_path = public
as $$
declare
  v_slide public.empire_story_slides;
begin
  if not (
    public.is_admin()
    or exists (
      select 1 from public.empire_story_slides sl
      join public.empire_stories s on s.id = sl.story_id
      where sl.id = p_slide_id and s.author_id = auth.uid()
    )
  ) then
    raise exception 'Not authorized';
  end if;
  delete from public.empire_story_slides where id = p_slide_id returning * into v_slide;
  if v_slide.id is null then
    raise exception 'Slide not found';
  end if;
  return v_slide;
end;
$$;
grant execute on function public.delete_empire_story_slide(uuid) to authenticated;

create or replace function public.reorder_empire_story_slides(p_story_id uuid, p_slide_ids uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not (public.is_admin() or exists (select 1 from public.empire_stories s where s.id = p_story_id and s.author_id = auth.uid())) then
    raise exception 'Not authorized';
  end if;
  update public.empire_story_slides as sl
  set sort_order = o.idx
  from unnest(p_slide_ids) with ordinality as o(id, idx)
  where sl.id = o.id and sl.story_id = p_story_id;
end;
$$;
grant execute on function public.reorder_empire_story_slides(uuid, uuid[]) to authenticated;
