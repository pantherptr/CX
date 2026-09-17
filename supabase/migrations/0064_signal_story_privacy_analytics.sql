-- SIGNAL Story privacy + analytics: Respect on Stories, View Once
-- Stories, and a creator-only "Story Insights" endpoint that is
-- structurally incapable of leaking viewer identity — it only ever
-- executes count(*) queries, never selects a user_id/name/avatar into
-- its output. The view-count/viewed-by-me shape every existing Story
-- fetch already returns (0041_empire_stories.sql) was already
-- aggregate-only by construction; this keeps that invariant for the new
-- Respect counters and adds the same "never a list, only a number"
-- guarantee for a story's own creator-facing stats.

-- ---------------------------------------------------------------------
-- 1. View Once — a story flag; once a *non-author* viewer has recorded a
--    view (via the existing mark_empire_story_viewed/empire_story_views,
--    unchanged), that story simply stops being returned to *that viewer*
--    by the fetch functions below. No separate "consumed" flag needed —
--    the existing per-(story,user) view row already is that state. The
--    author keeps seeing their own Story regardless (so posting one and
--    checking it right after doesn't burn its one view), matching how
--    every other View-Once implementation treats the creator.
-- ---------------------------------------------------------------------
alter table public.empire_stories add column if not exists is_view_once boolean not null default false;

-- ---------------------------------------------------------------------
-- 2. Respect on Stories — same shape as empire_post_likes
--    (0040_empire_feed.sql): RLS only ever lets a user see their OWN
--    respect row, so even a direct (non-RPC) client query against this
--    table can't reveal who else respected a Story. Aggregate counts are
--    computed server-side inside the fetch functions below via count(*),
--    same as views always have been.
-- ---------------------------------------------------------------------
create table if not exists public.empire_story_respects (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.empire_stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (story_id, user_id)
);
alter table public.empire_story_respects enable row level security;
drop policy if exists "Users view their own story respects" on public.empire_story_respects;
create policy "Users view their own story respects"
  on public.empire_story_respects for select
  using (auth.uid() = user_id);

create or replace function public.toggle_empire_story_respect(p_story_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_existing uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select id into v_existing from public.empire_story_respects where story_id = p_story_id and user_id = auth.uid();
  if v_existing is not null then
    delete from public.empire_story_respects where id = v_existing;
    return false;
  else
    insert into public.empire_story_respects (story_id, user_id) values (p_story_id, auth.uid());
    return true;
  end if;
end;
$$;
grant execute on function public.toggle_empire_story_respect(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. create_empire_story — one new trailing default param, so a plain
--    create-or-replace is enough (no drop-then-recreate needed: the
--    return type and existing param order/types are unchanged).
-- ---------------------------------------------------------------------
create or replace function public.create_empire_story(
  p_title text default null,
  p_publisher_type text default 'owner',
  p_view_once boolean default false
)
returns public.empire_stories
language plpgsql security definer set search_path = public
as $$
declare
  v_story public.empire_stories;
  v_type text := p_publisher_type;
begin
  if not public.can_publish_signal_content() then
    raise exception 'Not authorized';
  end if;
  if not public.is_admin() then
    v_type := 'self';
  elsif v_type not in ('owner', 'assistant', 'cx', 'self') then
    raise exception 'Invalid publisher identity';
  end if;
  insert into public.empire_stories (author_id, title, publisher_type, is_view_once)
  values (auth.uid(), nullif(trim(p_title), ''), v_type, coalesce(p_view_once, false))
  returning * into v_story;
  return v_story;
end;
$$;
grant execute on function public.create_empire_story(text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 4. fetch_active_empire_stories / fetch_all_empire_stories_admin —
--    adding output columns is a return-type change, so drop-then-
--    recreate (same reasoning 0059_signal_usernames_and_search.sql's
--    own comment gives for the identical situation).
-- ---------------------------------------------------------------------
drop function if exists public.fetch_active_empire_stories();
create or replace function public.fetch_active_empire_stories()
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_avatar_url text,
  author_username text,
  author_is_owner boolean,
  author_is_admin boolean,
  author_is_host boolean,
  author_is_verified_client boolean,
  title text,
  created_at timestamptz,
  expires_at timestamptz,
  view_count integer,
  viewed_by_me boolean,
  respect_count integer,
  respected_by_me boolean,
  is_view_once boolean,
  slides jsonb,
  publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    s.id, s.author_id,
    coalesce(p.full_name, 'CX Rent'), p.avatar_url, p.username,
    coalesce(p.is_owner, false), coalesce(p.is_admin, false),
    coalesce(p.is_host, false), coalesce(p.is_verified_client, false),
    s.title, s.created_at, s.expires_at,
    (select count(*)::int from public.empire_story_views v where v.story_id = s.id),
    exists(select 1 from public.empire_story_views v where v.story_id = s.id and v.user_id = auth.uid()),
    (select count(*)::int from public.empire_story_respects r where r.story_id = s.id),
    exists(select 1 from public.empire_story_respects r where r.story_id = s.id and r.user_id = auth.uid()),
    s.is_view_once,
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
    -- A View Once story a non-author caller has already viewed simply
    -- isn't returned to them anymore — the author always keeps seeing
    -- their own (see the migration header comment above).
    and (
      s.author_id = auth.uid()
      or not (s.is_view_once and exists(
        select 1 from public.empire_story_views v where v.story_id = s.id and v.user_id = auth.uid()
      ))
    )
  order by s.created_at asc;
$$;
grant execute on function public.fetch_active_empire_stories() to authenticated;

drop function if exists public.fetch_all_empire_stories_admin();
create or replace function public.fetch_all_empire_stories_admin()
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_avatar_url text,
  author_username text,
  author_is_owner boolean,
  author_is_admin boolean,
  author_is_host boolean,
  author_is_verified_client boolean,
  title text,
  created_at timestamptz,
  expires_at timestamptz,
  view_count integer,
  viewed_by_me boolean,
  respect_count integer,
  respected_by_me boolean,
  is_view_once boolean,
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
      coalesce(p.full_name, 'CX Rent'), p.avatar_url, p.username,
      coalesce(p.is_owner, false), coalesce(p.is_admin, false),
      coalesce(p.is_host, false), coalesce(p.is_verified_client, false),
      s.title, s.created_at, s.expires_at,
      (select count(*)::int from public.empire_story_views v where v.story_id = s.id),
      exists(select 1 from public.empire_story_views v where v.story_id = s.id and v.user_id = auth.uid()),
      (select count(*)::int from public.empire_story_respects r where r.story_id = s.id),
      exists(select 1 from public.empire_story_respects r where r.story_id = s.id and r.user_id = auth.uid()),
      s.is_view_once,
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
    -- Admin's own Manage view — deliberately NOT view-once-gated (it's
    -- the moderation list, not a viewer's feed): an admin managing/
    -- deleting a View Once story must still see it after it's been
    -- consumed by everyone else.
    from public.empire_stories s
    join public.profiles p on p.id = s.author_id
    order by s.created_at asc;
end;
$$;
grant execute on function public.fetch_all_empire_stories_admin() to authenticated;

-- ---------------------------------------------------------------------
-- 5. Story Insights — the one endpoint "the creator requests Story
--    statistics" actually calls. Deliberately its own narrow function
--    rather than reusing the richer fetch_* rows above: this one is
--    airtight by construction (two count(*) subqueries, nothing else
--    can ever be added to its output without visibly changing this
--    function), so it stays the safe answer to "can the creator ever
--    see who viewed?" even if a future change touches the broader
--    fetch functions.
-- ---------------------------------------------------------------------
create or replace function public.fetch_empire_story_insights(p_story_id uuid)
returns table (views integer, respects integer)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_author uuid;
begin
  select author_id into v_author from public.empire_stories where id = p_story_id;
  if v_author is null then
    raise exception 'Story not found';
  end if;
  if v_author <> auth.uid() and not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  return query
    select
      (select count(*)::int from public.empire_story_views v where v.story_id = p_story_id),
      (select count(*)::int from public.empire_story_respects r where r.story_id = p_story_id);
end;
$$;
grant execute on function public.fetch_empire_story_insights(uuid) to authenticated;
