-- EMPIRE content platform pass: Featured content (distinct from the single
-- Pinned announcement — many posts can be featured at once), deduplicated
-- post view tracking (foundation for Trending + Owner analytics), a
-- permanent Story Highlights system (Owner curates expired/active Stories
-- into named collections that never expire), lightweight search, a simple
-- Trending query, and one compact Owner/Admin analytics RPC. Same house
-- pattern throughout: RLS select policies only, every write through a
-- security-definer RPC gated on public.is_admin().

-- ---- View tracking (dedup: one row per user per post, same idiom as
-- empire_story_views) — created first since fetch_empire_featured_posts,
-- fetch_empire_feed and friends below all read from it, and `language sql`
-- functions (unlike plpgsql) validate table references at CREATE time —
-- this table has to exist before anything selects from it. ----

create table if not exists public.empire_post_views (
  post_id uuid not null references public.empire_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists empire_post_views_post_idx on public.empire_post_views (post_id);
alter table public.empire_post_views enable row level security;
create policy "Users view their own post views" on public.empire_post_views for select using (auth.uid() = user_id);

create or replace function public.mark_empire_post_viewed(p_post_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  insert into public.empire_post_views (post_id, user_id) values (p_post_id, auth.uid())
  on conflict (post_id, user_id) do nothing;
end;
$$;
grant execute on function public.mark_empire_post_viewed(uuid) to authenticated;

-- ---- Featured content ----

alter table public.empire_posts add column if not exists is_featured boolean not null default false;
create index if not exists empire_posts_featured_idx on public.empire_posts (created_at desc) where is_featured;

create or replace function public.set_empire_post_featured(p_post_id uuid, p_featured boolean)
returns public.empire_posts
language plpgsql security definer set search_path = public
as $$
declare
  v_post public.empire_posts;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  update public.empire_posts set is_featured = p_featured, updated_at = now() where id = p_post_id returning * into v_post;
  if v_post.id is null then
    raise exception 'Post not found';
  end if;
  return v_post;
end;
$$;
grant execute on function public.set_empire_post_featured(uuid, boolean) to authenticated;

-- Same column shape as fetch_empire_feed so the client reuses its mapper.
create or replace function public.fetch_empire_featured_posts(p_limit integer default 6)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, liked_by_me boolean, saved_by_me boolean
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid())
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null and p.is_featured and not p.is_pinned
  order by p.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_empire_featured_posts(integer) to authenticated;

-- Rebuild fetch_empire_feed / fetch_empire_pinned_post to also return
-- view_count and is_featured (additive columns -> new overload, drop the
-- old 3-arg signature first) and to apply the "smart order" for the plain
-- feed: pinned/featured already live in their own sections above it, so
-- this is just a light, predictable category-priority tiering (not a
-- scoring algorithm) with recency as the tiebreaker within each tier —
-- and pure recency once a category filter is applied, since the tiering
-- is meaningless within a single category.
drop function if exists public.fetch_empire_feed(integer, timestamptz, text);

create or replace function public.fetch_empire_feed(
  p_limit integer default 20, p_before timestamptz default null, p_category text default null
)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, liked_by_me boolean, saved_by_me boolean
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid())
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null
    and not p.is_pinned
    and not p.is_featured
    and (p_before is null or p.created_at < p_before)
    and (p_category is null or p.category = p_category)
  order by
    -- Only the first (uncursored) page applies the category tiering — once
    -- paginating, ordering must stay purely chronological or "load more"
    -- would skip/duplicate rows across pages as tiers interleave.
    case when p_before is null and p_category is null then
      case p.category
        when 'announcement' then 1
        when 'exclusive' then 2
        when 'news' then 3
        when 'new_car' then 4
        when 'feature' then 4
        when 'event' then 5
        when 'offer' then 5
        else 6
      end
    else 0 end,
    p.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_empire_feed(integer, timestamptz, text) to authenticated;

drop function if exists public.fetch_empire_pinned_post();

create or replace function public.fetch_empire_pinned_post()
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, liked_by_me boolean, saved_by_me boolean
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid())
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null and p.is_pinned = true
  limit 1;
$$;
grant execute on function public.fetch_empire_pinned_post() to authenticated;

-- Single-post fetch for the /empire/post/:id deep link — same shape again.
create or replace function public.fetch_empire_post_by_id(p_post_id uuid)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, liked_by_me boolean, saved_by_me boolean
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid())
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null and p.id = p_post_id;
$$;
grant execute on function public.fetch_empire_post_by_id(uuid) to authenticated;

-- ---- Trending: real engagement only, recent window, minimum bar so a
-- single early like doesn't "trend". Deliberately a plain weighted sum,
-- not a decay curve or ML score — "keep it simple" per spec. ----

create or replace function public.fetch_empire_trending_posts(p_limit integer default 5)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, liked_by_me boolean, saved_by_me boolean
)
language sql stable security definer set search_path = public
as $$
  -- The outer select names exactly the 22 declared return columns —
  -- `select *` would also pass through the inner `score` column used only
  -- for filtering/ordering here, one column too many for the RETURNS TABLE.
  select
    id, author_id, author_name, author_avatar_url, author_is_owner, author_is_admin,
    category, title, body, media_paths, is_pinned, is_featured, comments_disabled,
    created_at, updated_at, edited_at, like_count, comment_count, save_count, view_count, liked_by_me, saved_by_me
  from (
    select
      p.id, p.author_id, pr.full_name as author_name, pr.avatar_url as author_avatar_url,
      pr.is_owner as author_is_owner, pr.is_admin as author_is_admin,
      p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
      p.created_at, p.updated_at, p.edited_at,
      (select count(*)::int from public.empire_post_likes l where l.post_id = p.id) as like_count,
      (select count(*)::int from public.empire_post_comments c where c.post_id = p.id) as comment_count,
      (select count(*)::int from public.empire_post_saves s where s.post_id = p.id) as save_count,
      (select count(*)::int from public.empire_post_views v where v.post_id = p.id) as view_count,
      exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()) as liked_by_me,
      exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid()) as saved_by_me,
      (
        (select count(*)::numeric from public.empire_post_likes l where l.post_id = p.id) * 1
        + (select count(*)::numeric from public.empire_post_comments c where c.post_id = p.id) * 2
        + (select count(*)::numeric from public.empire_post_saves s where s.post_id = p.id) * 2
        + (select count(*)::numeric from public.empire_post_views v where v.post_id = p.id) * 0.1
      ) as score
    from public.empire_posts p
    join public.profiles pr on pr.id = p.author_id
    where auth.uid() is not null and p.created_at > now() - interval '14 days'
  ) scored
  where score >= 5
  order by score desc, created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_empire_trending_posts(integer) to authenticated;

-- ---- Lightweight search — title/body ilike, any signed-in user. ----

create or replace function public.search_empire_posts(p_query text, p_category text default null, p_limit integer default 20)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, liked_by_me boolean, saved_by_me boolean
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid())
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null
    and (p_category is null or p.category = p_category)
    and (
      coalesce(trim(p_query), '') = ''
      or p.title ilike '%' || p_query || '%'
      or p.body ilike '%' || p_query || '%'
    )
  order by p.created_at desc
  limit p_limit;
$$;
grant execute on function public.search_empire_posts(text, text, integer) to authenticated;

-- ---- Story Highlights: permanent, Owner-curated collections. A Story's
-- own slides get *copied* into a Highlight (new slide rows, new ids) —
-- keeping the source Story free to expire/be deleted independently, and
-- keeping "delete this Highlight" from ever silently deleting a live
-- Story's media out from under it. ----

create table public.empire_story_highlights (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.empire_story_highlights enable row level security;
create policy "Signed-in users view highlights" on public.empire_story_highlights for select using (auth.uid() is not null);

create table public.empire_story_highlight_slides (
  id uuid primary key default gen_random_uuid(),
  highlight_id uuid not null references public.empire_story_highlights(id) on delete cascade,
  media_path text not null,
  media_type text not null check (media_type in ('image')),
  caption text,
  cta_label text,
  cta_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index empire_highlight_slides_highlight_order_idx on public.empire_story_highlight_slides (highlight_id, sort_order);
alter table public.empire_story_highlight_slides enable row level security;
create policy "Signed-in users view highlight slides" on public.empire_story_highlight_slides for select using (auth.uid() is not null);

create or replace function public.create_empire_highlight(p_title text)
returns public.empire_story_highlights
language plpgsql security definer set search_path = public
as $$
declare
  v_highlight public.empire_story_highlights;
  v_next_order integer;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Highlight needs a title';
  end if;
  select coalesce(max(sort_order), -1) + 1 into v_next_order from public.empire_story_highlights;
  insert into public.empire_story_highlights (title, sort_order) values (trim(p_title), v_next_order)
  returning * into v_highlight;
  return v_highlight;
end;
$$;
grant execute on function public.create_empire_highlight(text) to authenticated;

create or replace function public.rename_empire_highlight(p_highlight_id uuid, p_title text)
returns public.empire_story_highlights
language plpgsql security definer set search_path = public
as $$
declare
  v_highlight public.empire_story_highlights;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Highlight needs a title';
  end if;
  update public.empire_story_highlights set title = trim(p_title) where id = p_highlight_id returning * into v_highlight;
  if v_highlight.id is null then
    raise exception 'Highlight not found';
  end if;
  return v_highlight;
end;
$$;
grant execute on function public.rename_empire_highlight(uuid, text) to authenticated;

create or replace function public.reorder_empire_highlights(p_highlight_ids uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  update public.empire_story_highlights h
  set sort_order = o.idx
  from unnest(p_highlight_ids) with ordinality as o(id, idx)
  where h.id = o.id;
end;
$$;
grant execute on function public.reorder_empire_highlights(uuid[]) to authenticated;

-- Copies one Story's slides into an existing Highlight in one round trip.
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
  insert into public.empire_story_highlight_slides (highlight_id, media_path, media_type, caption, cta_label, cta_url, sort_order)
  select p_highlight_id, s.media_path, s.media_type, s.caption, s.cta_label, s.cta_url, v_next_order + row_number() over (order by s.sort_order) - 1
  from public.empire_story_slides s
  where s.story_id = p_story_id;
end;
$$;
grant execute on function public.save_empire_story_to_highlight(uuid, uuid) to authenticated;

create or replace function public.add_empire_highlight_slide(
  p_highlight_id uuid, p_media_path text, p_media_type text,
  p_caption text default null, p_cta_label text default null, p_cta_url text default null
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
  insert into public.empire_story_highlight_slides (highlight_id, media_path, media_type, caption, cta_label, cta_url, sort_order)
  values (p_highlight_id, p_media_path, p_media_type, p_caption, p_cta_label, p_cta_url, v_next_order)
  returning * into v_slide;
  return v_slide;
end;
$$;
grant execute on function public.add_empire_highlight_slide(uuid, text, text, text, text, text) to authenticated;

create or replace function public.delete_empire_highlight_slide(p_slide_id uuid)
returns public.empire_story_highlight_slides
language plpgsql security definer set search_path = public
as $$
declare
  v_slide public.empire_story_highlight_slides;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  delete from public.empire_story_highlight_slides where id = p_slide_id returning * into v_slide;
  if v_slide.id is null then
    raise exception 'Slide not found';
  end if;
  return v_slide;
end;
$$;
grant execute on function public.delete_empire_highlight_slide(uuid) to authenticated;

create or replace function public.reorder_empire_highlight_slides(p_highlight_id uuid, p_slide_ids uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  update public.empire_story_highlight_slides sl
  set sort_order = o.idx
  from unnest(p_slide_ids) with ordinality as o(id, idx)
  where sl.id = o.id and sl.highlight_id = p_highlight_id;
end;
$$;
grant execute on function public.reorder_empire_highlight_slides(uuid, uuid[]) to authenticated;

-- Returns every slide's media_path so the client can clean up Storage in
-- one round trip, same idiom as delete_empire_story.
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
  select array_agg(media_path) into v_paths from public.empire_story_highlight_slides where highlight_id = p_highlight_id;
  delete from public.empire_story_highlights where id = p_highlight_id;
  return coalesce(v_paths, '{}');
end;
$$;
grant execute on function public.delete_empire_highlight(uuid) to authenticated;

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

-- ---- Owner/Admin analytics: a handful of aggregate numbers, not a
-- dashboard — one round trip, admin-gated. ----

create or replace function public.fetch_empire_analytics()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  select jsonb_build_object(
    'total_post_views', (select count(*) from public.empire_post_views),
    'total_story_views', (select count(*) from public.empire_story_views),
    'posts_last_7d', (select count(*) from public.empire_posts where created_at > now() - interval '7 days'),
    'posts_prev_7d', (select count(*) from public.empire_posts where created_at > now() - interval '14 days' and created_at <= now() - interval '7 days'),
    'engagement_last_7d', (
      (select count(*) from public.empire_post_likes where created_at > now() - interval '7 days')
      + (select count(*) from public.empire_post_comments where created_at > now() - interval '7 days')
      + (select count(*) from public.empire_post_saves where created_at > now() - interval '7 days')
    ),
    'engagement_prev_7d', (
      (select count(*) from public.empire_post_likes where created_at > now() - interval '14 days' and created_at <= now() - interval '7 days')
      + (select count(*) from public.empire_post_comments where created_at > now() - interval '14 days' and created_at <= now() - interval '7 days')
      + (select count(*) from public.empire_post_saves where created_at > now() - interval '14 days' and created_at <= now() - interval '7 days')
    ),
    'most_viewed', (
      select jsonb_build_object('id', p.id, 'title', coalesce(p.title, left(p.body, 60)), 'count', v.n)
      from public.empire_posts p
      join (select post_id, count(*) n from public.empire_post_views group by post_id order by n desc limit 1) v on v.post_id = p.id
    ),
    'most_liked', (
      select jsonb_build_object('id', p.id, 'title', coalesce(p.title, left(p.body, 60)), 'count', v.n)
      from public.empire_posts p
      join (select post_id, count(*) n from public.empire_post_likes group by post_id order by n desc limit 1) v on v.post_id = p.id
    ),
    'most_commented', (
      select jsonb_build_object('id', p.id, 'title', coalesce(p.title, left(p.body, 60)), 'count', v.n)
      from public.empire_posts p
      join (select post_id, count(*) n from public.empire_post_comments group by post_id order by n desc limit 1) v on v.post_id = p.id
    ),
    'most_saved', (
      select jsonb_build_object('id', p.id, 'title', coalesce(p.title, left(p.body, 60)), 'count', v.n)
      from public.empire_posts p
      join (select post_id, count(*) n from public.empire_post_saves group by post_id order by n desc limit 1) v on v.post_id = p.id
    )
  ) into v_result;
  return v_result;
end;
$$;
grant execute on function public.fetch_empire_analytics() to authenticated;
