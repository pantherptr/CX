-- EMPIRE Stories — ephemeral (24h), Owner/Admin-only, multi-slide stories
-- permanently pinned above the feed. Same house pattern as the rest of
-- Empire: RLS select policies only, every write through a security-
-- definer RPC gated on public.is_admin() (already true for Owner too).

create table public.empire_stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index empire_stories_expires_idx on public.empire_stories (expires_at);
alter table public.empire_stories enable row level security;
create policy "Signed-in users view stories"
  on public.empire_stories for select
  using (auth.uid() is not null);

create table public.empire_story_slides (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.empire_stories(id) on delete cascade,
  media_path text not null,
  media_type text not null check (media_type in ('image')),
  caption text,
  cta_label text,
  cta_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
-- No unique(story_id, sort_order): it would fight reorder_empire_story_
-- slides' in-place position swaps. `order by sort_order, id` in every
-- read is the tiebreaker instead.
create index empire_story_slides_story_order_idx on public.empire_story_slides (story_id, sort_order);
alter table public.empire_story_slides enable row level security;
create policy "Signed-in users view story slides"
  on public.empire_story_slides for select
  using (auth.uid() is not null);

create table public.empire_story_views (
  story_id uuid not null references public.empire_stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, user_id)
);
alter table public.empire_story_views enable row level security;
create policy "Users view their own story views"
  on public.empire_story_views for select
  using (auth.uid() = user_id);

-- ---- Writes: Owner/Admin only ----

create or replace function public.create_empire_story(p_title text default null)
returns public.empire_stories
language plpgsql security definer set search_path = public
as $$
declare
  v_story public.empire_stories;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  insert into public.empire_stories (author_id, title)
  values (auth.uid(), nullif(trim(p_title), ''))
  returning * into v_story;
  return v_story;
end;
$$;
grant execute on function public.create_empire_story(text) to authenticated;

create or replace function public.add_empire_story_slide(
  p_story_id uuid, p_media_path text, p_media_type text,
  p_caption text default null, p_cta_label text default null, p_cta_url text default null
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
  insert into public.empire_story_slides (story_id, media_path, media_type, caption, cta_label, cta_url, sort_order)
  values (p_story_id, p_media_path, p_media_type, nullif(trim(p_caption), ''), nullif(trim(p_cta_label), ''), nullif(trim(p_cta_url), ''), v_next_order)
  returning * into v_slide;
  return v_slide;
end;
$$;
grant execute on function public.add_empire_story_slide(uuid, text, text, text, text, text) to authenticated;

create or replace function public.delete_empire_story_slide(p_slide_id uuid)
returns public.empire_story_slides
language plpgsql security definer set search_path = public
as $$
declare
  v_slide public.empire_story_slides;
begin
  if not public.is_admin() then
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
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  update public.empire_story_slides as sl
  set sort_order = o.idx
  from unnest(p_slide_ids) with ordinality as o(id, idx)
  where sl.id = o.id and sl.story_id = p_story_id;
end;
$$;
grant execute on function public.reorder_empire_story_slides(uuid, uuid[]) to authenticated;

-- Returns every slide's media_path (not a row — the paths live on the
-- cascaded child table) so the client can clean up Storage in one round
-- trip rather than selecting first, which would be a TOCTOU gap.
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
  select coalesce(array_agg(media_path), '{}') into v_paths
    from public.empire_story_slides where story_id = p_story_id;
  delete from public.empire_stories where id = p_story_id;
  if not found then
    raise exception 'Story not found';
  end if;
  return v_paths;
end;
$$;
grant execute on function public.delete_empire_story(uuid) to authenticated;

-- ---- Writes: any signed-in user ----

create or replace function public.mark_empire_story_viewed(p_story_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  insert into public.empire_story_views (story_id, user_id)
  values (p_story_id, auth.uid())
  on conflict (story_id, user_id) do nothing;
end;
$$;
grant execute on function public.mark_empire_story_viewed(uuid) to authenticated;

-- ---- Reads ----

create or replace function public.fetch_active_empire_stories()
returns table (
  id uuid,
  author_id uuid,
  title text,
  created_at timestamptz,
  expires_at timestamptz,
  view_count integer,
  viewed_by_me boolean,
  slides jsonb
)
language sql stable security definer set search_path = public
as $$
  select
    s.id, s.author_id, s.title, s.created_at, s.expires_at,
    (select count(*)::int from public.empire_story_views v where v.story_id = s.id),
    exists(select 1 from public.empire_story_views v where v.story_id = s.id and v.user_id = auth.uid()),
    (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', sl.id, 'media_path', sl.media_path, 'media_type', sl.media_type,
        'caption', sl.caption, 'cta_label', sl.cta_label, 'cta_url', sl.cta_url,
        'sort_order', sl.sort_order
      ) order by sl.sort_order, sl.id), '[]'::jsonb)
      from public.empire_story_slides sl where sl.story_id = s.id
    )
  from public.empire_stories s
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
  title text,
  created_at timestamptz,
  expires_at timestamptz,
  view_count integer,
  viewed_by_me boolean,
  slides jsonb
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  return query
    select
      s.id, s.author_id, s.title, s.created_at, s.expires_at,
      (select count(*)::int from public.empire_story_views v where v.story_id = s.id),
      exists(select 1 from public.empire_story_views v where v.story_id = s.id and v.user_id = auth.uid()),
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', sl.id, 'media_path', sl.media_path, 'media_type', sl.media_type,
          'caption', sl.caption, 'cta_label', sl.cta_label, 'cta_url', sl.cta_url,
          'sort_order', sl.sort_order
        ) order by sl.sort_order, sl.id), '[]'::jsonb)
        from public.empire_story_slides sl where sl.story_id = s.id
      )
    from public.empire_stories s
    order by s.created_at desc;
end;
$$;
grant execute on function public.fetch_all_empire_stories_admin() to authenticated;
