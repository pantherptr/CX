-- SIGNAL becomes a real community space: Hosts and Verified Clients can
-- publish under their own real CX Rent identity (never a fourth/fifth
-- fixed "voice" — see the new 'self' publisher_type below), comments come
-- back, and a handful of new read RPCs power a public profile view,
-- "My Posts", and "Saved".

-- ---------------------------------------------------------------------
-- 1. profiles.is_verified_client — a new, reversible, admin-grantable
--    feature flag. Investigated first: there is NO existing admin UI/RPC
--    that flips `verified` (the "verified host" flag on HostCard) or
--    `is_superhost` — both are write-path-less today. The real precedent
--    for "a boolean only Owner/Admin can flip" is is_admin/is_owner/
--    suspended's lock_is_admin_update trigger (0021_owner_control_center.sql).
--    Extended here rather than reusing `verified` (that flag already
--    means something specific — host identity verification — and
--    reusing it for a totally different "trusted community publisher"
--    concept would silently conflate the two).
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists is_verified_client boolean not null default false;

create or replace function public.lock_is_admin_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.is_admin := old.is_admin;
  new.is_owner := old.is_owner;
  if not public.is_owner() then
    new.suspended := old.suspended;
  end if;
  -- Gated on is_admin() (Owner-or-Admin), not the stricter is_owner()-only
  -- used for suspended — this is a reversible feature flag, not an
  -- account-suspension-grade action, so Admin can grant/revoke it too.
  if not public.is_admin() then
    new.is_verified_client := old.is_verified_client;
  end if;
  return new;
end;
$$;

-- A dedicated RPC rather than relying on RLS + the trigger alone (the
-- way setHostSuspended does for `suspended`) — the only existing
-- "update any profile" RLS policy is Owner-only, and broadening it to
-- Admin would let Admin edit *any* field on *any* profile (name, bio,
-- phone...), not just this one flag. security definer sidesteps RLS
-- entirely, same as every other privileged write in this app, and the
-- trigger above still double-guards the column regardless of caller.
create or replace function public.set_verified_client(p_user_id uuid, p_value boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  update public.profiles set is_verified_client = p_value where id = p_user_id;
  if not found then
    raise exception 'User not found';
  end if;
end;
$$;
grant execute on function public.set_verified_client(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 2. One new publisher_type value: 'self'. A 'self' post's displayed
--    identity (Host / Verified Client / plain Client) is resolved LIVE
--    from the author's own profile at read time via the author_id join
--    every read RPC already does — never a static string baked in at
--    publish time. That's what makes "if the user changes their profile,
--    SIGNAL reflects it automatically" true by construction. The three
--    official voices stay reserved for is_admin(); everyone else who's
--    allowed to publish at all is forced to 'self' server-side.
-- ---------------------------------------------------------------------
alter table public.empire_posts drop constraint if exists empire_posts_publisher_type_check;
alter table public.empire_posts add constraint empire_posts_publisher_type_check
  check (publisher_type in ('owner', 'assistant', 'cx', 'self'));

alter table public.empire_stories drop constraint if exists empire_stories_publisher_type_check;
alter table public.empire_stories add constraint empire_stories_publisher_type_check
  check (publisher_type in ('owner', 'assistant', 'cx', 'self'));

create or replace function public.can_publish_signal_content(uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin(uid) or coalesce(
    (select p.is_host or p.is_verified_client from public.profiles p where p.id = uid),
    false
  );
$$;
grant execute on function public.can_publish_signal_content(uuid) to authenticated;

-- ---- Writes: widen the publish gate, force 'self' for non-admins ----

create or replace function public.create_empire_post(
  p_category text, p_title text, p_body text, p_media_paths text[] default '{}',
  p_comments_disabled boolean default false, p_publisher_type text default 'owner'
)
returns public.empire_posts
language plpgsql security definer set search_path = public
as $$
declare
  v_post public.empire_posts;
  v_type text := p_publisher_type;
begin
  if not public.can_publish_signal_content() then
    raise exception 'Not authorized';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Post body cannot be empty';
  end if;
  -- The three official voices are Owner/Admin-only, checked server-side —
  -- never trust the frontend value. Anyone else publishing (Host/Verified
  -- Client) is always forced to 'self' regardless of what was sent.
  if not public.is_admin() then
    v_type := 'self';
  elsif v_type not in ('owner', 'assistant', 'cx', 'self') then
    raise exception 'Invalid publisher identity';
  end if;
  insert into public.empire_posts (author_id, category, title, body, media_paths, comments_disabled, publisher_type)
  values (auth.uid(), p_category, nullif(trim(p_title), ''), p_body, coalesce(p_media_paths, '{}'), coalesce(p_comments_disabled, false), v_type)
  returning * into v_post;
  return v_post;
end;
$$;
grant execute on function public.create_empire_post(text, text, text, text[], boolean, text) to authenticated;

create or replace function public.update_empire_post(
  p_post_id uuid, p_category text, p_title text, p_body text, p_media_paths text[], p_comments_disabled boolean,
  p_publisher_type text default 'owner'
)
returns public.empire_posts
language plpgsql security definer set search_path = public
as $$
declare
  v_post public.empire_posts;
  v_type text := p_publisher_type;
begin
  if not (public.is_admin() or exists (select 1 from public.empire_posts where id = p_post_id and author_id = auth.uid())) then
    raise exception 'Not authorized';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Post body cannot be empty';
  end if;
  if not public.is_admin() then
    v_type := 'self';
  elsif v_type not in ('owner', 'assistant', 'cx', 'self') then
    raise exception 'Invalid publisher identity';
  end if;
  update public.empire_posts
  set category = p_category,
      title = nullif(trim(p_title), ''),
      body = p_body,
      media_paths = coalesce(p_media_paths, '{}'),
      comments_disabled = coalesce(p_comments_disabled, false),
      publisher_type = v_type,
      updated_at = now(),
      edited_at = now()
  where id = p_post_id
  returning * into v_post;
  if v_post.id is null then
    raise exception 'Post not found';
  end if;
  return v_post;
end;
$$;
grant execute on function public.update_empire_post(uuid, text, text, text, text[], boolean, text) to authenticated;

-- Edit/delete ownership: an author can now manage their own post; Admin
-- keeps full moderation over everyone's, same as before.
create or replace function public.delete_empire_post(p_post_id uuid)
returns public.empire_posts
language plpgsql security definer set search_path = public
as $$
declare
  v_post public.empire_posts;
begin
  if not (public.is_admin() or exists (select 1 from public.empire_posts where id = p_post_id and author_id = auth.uid())) then
    raise exception 'Not authorized';
  end if;
  delete from public.empire_posts where id = p_post_id returning * into v_post;
  if v_post.id is null then
    raise exception 'Post not found';
  end if;
  return v_post;
end;
$$;
grant execute on function public.delete_empire_post(uuid) to authenticated;

create or replace function public.create_empire_story(p_title text default null, p_publisher_type text default 'owner')
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
  insert into public.empire_stories (author_id, title, publisher_type)
  values (auth.uid(), nullif(trim(p_title), ''), v_type)
  returning * into v_story;
  return v_story;
end;
$$;
grant execute on function public.create_empire_story(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Storage: widen upload to any publisher, but namespace new uploads
--    by uploader folder (matching the verification-documents bucket's
--    own established pattern) so delete can be scoped to "your own file
--    or admin" instead of "any signed-in user" — the bucket is public-
--    read with random-UUID paths today, so a blanket authenticated-
--    delete policy would let any signed-in user vandalize anyone else's
--    already-public image by path. Existing flat (non-namespaced) paths
--    from before this migration keep working for read/is_admin()-delete;
--    they just aren't self-deletable by a non-admin author, which only
--    ever affects Owner/Admin-era posts (the only publishers that
--    existed before this migration).
-- ---------------------------------------------------------------------
drop policy if exists "Owner/Admin can upload Empire post media" on storage.objects;
drop policy if exists "Authorized publishers can upload Signal media" on storage.objects;
create policy "Authorized publishers can upload Signal media"
  on storage.objects for insert
  with check (
    bucket_id = 'empire-post-media'
    and public.can_publish_signal_content()
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Owner/Admin can delete Empire post media" on storage.objects;
drop policy if exists "Authors and admins can delete Signal media" on storage.objects;
create policy "Authors and admins can delete Signal media"
  on storage.objects for delete
  using (
    bucket_id = 'empire-post-media'
    and (public.is_admin() or auth.uid()::text = (storage.foldername(name))[1])
  );

-- ---------------------------------------------------------------------
-- 4. Reports — real, minimal: insert-only for the reporter, readable
--    only by admins. No moderation queue UI this pass, just the backend
--    plus a "Report" action that submits and confirms.
-- ---------------------------------------------------------------------
create table if not exists public.empire_post_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.empire_posts(id) on delete cascade,
  comment_id uuid references public.empire_post_comments(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint empire_post_reports_target_check check (
    (post_id is not null and comment_id is null) or (post_id is null and comment_id is not null)
  )
);
create index if not exists empire_post_reports_created_idx on public.empire_post_reports (created_at desc);
alter table public.empire_post_reports enable row level security;
drop policy if exists "Admins view reports" on public.empire_post_reports;
create policy "Admins view reports"
  on public.empire_post_reports for select
  using (public.is_admin());

create or replace function public.report_empire_content(p_post_id uuid, p_comment_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if (p_post_id is null) = (p_comment_id is null) then
    raise exception 'Report exactly one post or comment';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required';
  end if;
  insert into public.empire_post_reports (reporter_id, post_id, comment_id, reason)
  values (auth.uid(), p_post_id, p_comment_id, trim(p_reason));
end;
$$;
grant execute on function public.report_empire_content(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Reads — every returns-table shape that can surface a 'self' post
--    gains author_is_host/author_is_verified_client so the client can
--    resolve the right badge without a second query. Same drop-then-
--    recreate pattern as every prior returns-table change (0042-0047).
-- ---------------------------------------------------------------------

drop function if exists public.fetch_empire_feed(integer, timestamptz, text);
create or replace function public.fetch_empire_feed(
  p_limit integer default 20, p_before timestamptz default null, p_category text default null
)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    p.shares,
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid()),
    p.publisher_type
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null
    and not p.is_pinned
    and not p.is_featured
    and (p_before is null or p.created_at < p_before)
    and (p_category is null or p.category = p_category)
  order by
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
  author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    p.shares,
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid()),
    p.publisher_type
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null and p.is_pinned = true
  limit 1;
$$;
grant execute on function public.fetch_empire_pinned_post() to authenticated;

drop function if exists public.fetch_empire_post_by_id(uuid);
create or replace function public.fetch_empire_post_by_id(p_post_id uuid)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    p.shares,
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid()),
    p.publisher_type
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null and p.id = p_post_id;
$$;
grant execute on function public.fetch_empire_post_by_id(uuid) to authenticated;

drop function if exists public.fetch_empire_featured_posts(integer);
create or replace function public.fetch_empire_featured_posts(p_limit integer default 6)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    p.shares,
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid()),
    p.publisher_type
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null and p.is_featured and not p.is_pinned
  order by p.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_empire_featured_posts(integer) to authenticated;

drop function if exists public.fetch_empire_trending_posts(integer);
create or replace function public.fetch_empire_trending_posts(p_limit integer default 5)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    id, author_id, author_name, author_avatar_url, author_is_owner, author_is_admin, author_is_host, author_is_verified_client,
    category, title, body, media_paths, is_pinned, is_featured, comments_disabled,
    created_at, updated_at, edited_at, like_count, comment_count, save_count, view_count, share_count,
    liked_by_me, saved_by_me, publisher_type
  from (
    select
      p.id, p.author_id, pr.full_name as author_name, pr.avatar_url as author_avatar_url,
      pr.is_owner as author_is_owner, pr.is_admin as author_is_admin,
      pr.is_host as author_is_host, pr.is_verified_client as author_is_verified_client,
      p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
      p.created_at, p.updated_at, p.edited_at,
      (select count(*)::int from public.empire_post_likes l where l.post_id = p.id) as like_count,
      (select count(*)::int from public.empire_post_comments c where c.post_id = p.id) as comment_count,
      (select count(*)::int from public.empire_post_saves s where s.post_id = p.id) as save_count,
      (select count(*)::int from public.empire_post_views v where v.post_id = p.id) as view_count,
      p.shares as share_count,
      exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()) as liked_by_me,
      exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid()) as saved_by_me,
      p.publisher_type,
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

-- Author name now also matches (searching a Host's name surfaces their
-- posts) — the only search infra this app has for Signal content, so
-- extended in place rather than building a second system.
drop function if exists public.search_empire_posts(text, text, integer);
create or replace function public.search_empire_posts(p_query text, p_category text default null, p_limit integer default 20)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    p.shares,
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid()),
    p.publisher_type
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null
    and (p_category is null or p.category = p_category)
    and (
      coalesce(trim(p_query), '') = ''
      or p.title ilike '%' || p_query || '%'
      or p.body ilike '%' || p_query || '%'
      or pr.full_name ilike '%' || p_query || '%'
    )
  order by p.created_at desc
  limit p_limit;
$$;
grant execute on function public.search_empire_posts(text, text, integer) to authenticated;

-- New: a single author's own posts ("My Posts" / a tapped profile's post
-- strip) — same row shape as the feed, so the client reuses one mapper.
create or replace function public.fetch_empire_posts_by_author(p_author_id uuid, p_limit integer default 20, p_before timestamptz default null)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    p.shares,
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid()),
    p.publisher_type
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null
    and p.author_id = p_author_id
    and (p_before is null or p.created_at < p_before)
  order by p.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_empire_posts_by_author(uuid, integer, timestamptz) to authenticated;

-- New: the caller's own saved posts.
create or replace function public.fetch_empire_saved_posts(p_limit integer default 20, p_before timestamptz default null)
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_is_owner boolean, author_is_admin boolean,
  author_is_host boolean, author_is_verified_client boolean,
  category text, title text, body text, media_paths text[], is_pinned boolean, is_featured boolean,
  comments_disabled boolean, created_at timestamptz, updated_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, save_count integer, view_count integer, share_count integer,
  liked_by_me boolean, saved_by_me boolean, publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.is_featured, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s2 where s2.post_id = p.id),
    (select count(*)::int from public.empire_post_views v where v.post_id = p.id),
    p.shares,
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    true,
    p.publisher_type
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  join public.empire_post_saves s on s.post_id = p.id and s.user_id = auth.uid()
  where auth.uid() is not null
    and (p_before is null or s.created_at < p_before)
  order by s.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_empire_saved_posts(integer, timestamptz) to authenticated;

-- New: the safe public-profile projection, same philosophy as
-- fetchCarWithHost's own explicit column list (cars.ts) — never phone,
-- location, suspended, or stripe_customer_id. Cars are NOT embedded here
-- — the client calls the existing `fetchHostCars` (cars.ts) separately
-- when `is_host` is true, reusing that query (and the `cars` table's own
-- RLS, which already restricts a non-owner viewer to published rows)
-- rather than duplicating a car projection inside this function.
create or replace function public.fetch_signal_profile(p_user_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select jsonb_build_object(
    'id', pr.id,
    'full_name', pr.full_name,
    'avatar_url', pr.avatar_url,
    'bio', pr.bio,
    'is_host', pr.is_host,
    'is_verified_client', pr.is_verified_client,
    'is_owner', pr.is_owner,
    'is_admin', pr.is_admin,
    'verified', pr.verified,
    'is_superhost', pr.is_superhost,
    'rating', pr.rating,
    'trips', pr.trips,
    'response_time', pr.response_time,
    'response_rate', pr.response_rate,
    'joined', pr.joined
  )
  into v_result
  from public.profiles pr
  where pr.id = p_user_id;
  if v_result is null then
    raise exception 'Profile not found';
  end if;
  return v_result;
end;
$$;
grant execute on function public.fetch_signal_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Stories — publisher_type widened above already covers the check
--    constraint; the story read RPCs also gain the two author role
--    columns for identity-resolution consistency with posts (no Story
--    composer UI change for community publishers this pass — backend
--    gate widened for forward-compatibility only, per the approved plan).
-- ---------------------------------------------------------------------

drop function if exists public.fetch_active_empire_stories();
create or replace function public.fetch_active_empire_stories()
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text,
  author_is_host boolean, author_is_verified_client boolean, title text,
  created_at timestamptz, expires_at timestamptz,
  view_count integer, viewed_by_me boolean, slides jsonb, publisher_type text
)
language sql stable security definer set search_path = public
as $$
  select
    s.id, s.author_id, pr.full_name, pr.avatar_url, pr.is_host, pr.is_verified_client, s.title, s.created_at, s.expires_at,
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

-- Analytics' by-publisher breakdown: add 'self' alongside the three
-- official voices so a Host/Verified Client's real engagement shows up
-- too, not just zeros. No signature change (still returns jsonb), so no
-- drop needed — additive create or replace like 0044's own version.
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
    'total_impressions', (select coalesce(sum(impressions), 0) from public.empire_posts),
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
    ),
    'by_publisher', (
      select jsonb_object_agg(pt.publisher_type, jsonb_build_object(
        'views', (select count(*) from public.empire_post_views v join public.empire_posts p on p.id = v.post_id where p.publisher_type = pt.publisher_type),
        'likes', (select count(*) from public.empire_post_likes l join public.empire_posts p on p.id = l.post_id where p.publisher_type = pt.publisher_type),
        'comments', (select count(*) from public.empire_post_comments c join public.empire_posts p on p.id = c.post_id where p.publisher_type = pt.publisher_type),
        'saves', (select count(*) from public.empire_post_saves s join public.empire_posts p on p.id = s.post_id where p.publisher_type = pt.publisher_type)
      ))
      from (select unnest(array['owner', 'assistant', 'cx', 'self']) as publisher_type) pt
    )
  ) into v_result;
  return v_result;
end;
$$;
grant execute on function public.fetch_empire_analytics() to authenticated;

drop function if exists public.fetch_all_empire_stories_admin();
create or replace function public.fetch_all_empire_stories_admin()
returns table (
  id uuid, author_id uuid, author_name text, author_avatar_url text,
  author_is_host boolean, author_is_verified_client boolean, title text,
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
      s.id, s.author_id, pr.full_name, pr.avatar_url, pr.is_host, pr.is_verified_client, s.title, s.created_at, s.expires_at,
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
