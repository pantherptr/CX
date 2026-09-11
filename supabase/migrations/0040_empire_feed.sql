-- EMPIRE — the official CX Rent social/news feed. Owner/Admin publish
-- (news, announcements, new vehicles, events, offers); every signed-in
-- user can view, like, comment, save and share. Same house pattern used
-- everywhere else: RLS select policies only, every write through a
-- security-definer RPC gated on public.is_admin() (which already returns
-- true for the Owner too, per 0021_owner_control_center.sql).

create table public.empire_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('news','update','new_car','feature','event','offer','announcement','exclusive')),
  title text,
  body text not null,
  media_paths text[] not null default '{}',
  is_pinned boolean not null default false,
  comments_disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz
);
create unique index empire_posts_one_pinned_idx on public.empire_posts (is_pinned) where is_pinned;
create index empire_posts_created_idx on public.empire_posts (created_at desc);
alter table public.empire_posts enable row level security;
create policy "Signed-in users view Empire posts"
  on public.empire_posts for select
  using (auth.uid() is not null);

create table public.empire_post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.empire_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
alter table public.empire_post_likes enable row level security;
create policy "Users view their own likes"
  on public.empire_post_likes for select
  using (auth.uid() = user_id);

create table public.empire_post_saves (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.empire_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create index empire_post_saves_user_idx on public.empire_post_saves (user_id, created_at desc);
alter table public.empire_post_saves enable row level security;
create policy "Users view their own saves"
  on public.empire_post_saves for select
  using (auth.uid() = user_id);

create table public.empire_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.empire_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index empire_post_comments_post_created_idx on public.empire_post_comments (post_id, created_at);
alter table public.empire_post_comments enable row level security;
create policy "Signed-in users view comments"
  on public.empire_post_comments for select
  using (auth.uid() is not null);

create table public.empire_post_reads (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.empire_post_reads enable row level security;
create policy "Users view their own read state"
  on public.empire_post_reads for select
  using (auth.uid() = user_id);

-- ---- Writes: posts (Owner/Admin only) ----

create or replace function public.create_empire_post(
  p_category text, p_title text, p_body text, p_media_paths text[] default '{}', p_comments_disabled boolean default false
)
returns public.empire_posts
language plpgsql security definer set search_path = public
as $$
declare
  v_post public.empire_posts;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Post body cannot be empty';
  end if;
  insert into public.empire_posts (author_id, category, title, body, media_paths, comments_disabled)
  values (auth.uid(), p_category, nullif(trim(p_title), ''), p_body, coalesce(p_media_paths, '{}'), coalesce(p_comments_disabled, false))
  returning * into v_post;
  return v_post;
end;
$$;
grant execute on function public.create_empire_post(text, text, text, text[], boolean) to authenticated;

create or replace function public.update_empire_post(
  p_post_id uuid, p_category text, p_title text, p_body text, p_media_paths text[], p_comments_disabled boolean
)
returns public.empire_posts
language plpgsql security definer set search_path = public
as $$
declare
  v_post public.empire_posts;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Post body cannot be empty';
  end if;
  update public.empire_posts
  set category = p_category,
      title = nullif(trim(p_title), ''),
      body = p_body,
      media_paths = coalesce(p_media_paths, '{}'),
      comments_disabled = coalesce(p_comments_disabled, false),
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
grant execute on function public.update_empire_post(uuid, text, text, text, text[], boolean) to authenticated;

-- Returns the deleted row (including its media_paths) so the client can
-- clean up Storage in the same round trip rather than fetching first.
create or replace function public.delete_empire_post(p_post_id uuid)
returns public.empire_posts
language plpgsql security definer set search_path = public
as $$
declare
  v_post public.empire_posts;
begin
  if not public.is_admin() then
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

create or replace function public.set_empire_post_pinned(p_post_id uuid, p_pinned boolean)
returns public.empire_posts
language plpgsql security definer set search_path = public
as $$
declare
  v_post public.empire_posts;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if p_pinned then
    -- Only one post can be pinned at a time (empire_posts_one_pinned_idx)
    -- — clear any existing pin first so the target's own update below
    -- never collides with the partial unique index.
    update public.empire_posts set is_pinned = false where is_pinned and id <> p_post_id;
  end if;
  update public.empire_posts set is_pinned = p_pinned, updated_at = now() where id = p_post_id returning * into v_post;
  if v_post.id is null then
    raise exception 'Post not found';
  end if;
  return v_post;
end;
$$;
grant execute on function public.set_empire_post_pinned(uuid, boolean) to authenticated;

-- ---- Writes: likes, saves, comments (any signed-in user) ----

create or replace function public.toggle_empire_post_like(p_post_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_existing uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select id into v_existing from public.empire_post_likes where post_id = p_post_id and user_id = auth.uid();
  if v_existing is not null then
    delete from public.empire_post_likes where id = v_existing;
    return false;
  else
    insert into public.empire_post_likes (post_id, user_id) values (p_post_id, auth.uid());
    return true;
  end if;
end;
$$;
grant execute on function public.toggle_empire_post_like(uuid) to authenticated;

create or replace function public.toggle_empire_post_save(p_post_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_existing uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select id into v_existing from public.empire_post_saves where post_id = p_post_id and user_id = auth.uid();
  if v_existing is not null then
    delete from public.empire_post_saves where id = v_existing;
    return false;
  else
    insert into public.empire_post_saves (post_id, user_id) values (p_post_id, auth.uid());
    return true;
  end if;
end;
$$;
grant execute on function public.toggle_empire_post_save(uuid) to authenticated;

create or replace function public.add_empire_post_comment(p_post_id uuid, p_body text)
returns public.empire_post_comments
language plpgsql security definer set search_path = public
as $$
declare
  v_disabled boolean;
  v_comment public.empire_post_comments;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Comment cannot be empty';
  end if;
  select comments_disabled into v_disabled from public.empire_posts where id = p_post_id;
  if v_disabled is null then
    raise exception 'Post not found';
  end if;
  if v_disabled then
    raise exception 'Comments are disabled for this post';
  end if;
  insert into public.empire_post_comments (post_id, user_id, body)
  values (p_post_id, auth.uid(), p_body)
  returning * into v_comment;
  return v_comment;
end;
$$;
grant execute on function public.add_empire_post_comment(uuid, text) to authenticated;

create or replace function public.delete_empire_post_comment(p_comment_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_author uuid;
begin
  select user_id into v_author from public.empire_post_comments where id = p_comment_id;
  if v_author is null then
    raise exception 'Comment not found';
  end if;
  if v_author <> auth.uid() and not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  delete from public.empire_post_comments where id = p_comment_id;
end;
$$;
grant execute on function public.delete_empire_post_comment(uuid) to authenticated;

-- ---- Reads: feed, unread count ----

create or replace function public.fetch_empire_feed(p_limit integer default 20, p_before timestamptz default null)
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_avatar_url text,
  author_is_owner boolean,
  author_is_admin boolean,
  category text,
  title text,
  body text,
  media_paths text[],
  is_pinned boolean,
  comments_disabled boolean,
  created_at timestamptz,
  updated_at timestamptz,
  edited_at timestamptz,
  like_count integer,
  comment_count integer,
  save_count integer,
  liked_by_me boolean,
  saved_by_me boolean
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.author_id, pr.full_name, pr.avatar_url, pr.is_owner, pr.is_admin,
    p.category, p.title, p.body, p.media_paths, p.is_pinned, p.comments_disabled,
    p.created_at, p.updated_at, p.edited_at,
    (select count(*)::int from public.empire_post_likes l where l.post_id = p.id),
    (select count(*)::int from public.empire_post_comments c where c.post_id = p.id),
    (select count(*)::int from public.empire_post_saves s where s.post_id = p.id),
    exists(select 1 from public.empire_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.empire_post_saves s where s.post_id = p.id and s.user_id = auth.uid())
  from public.empire_posts p
  join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null
    and (p_before is null or p.created_at < p_before)
    -- The pinned post is only ever included on the first page (p_before
    -- is null) and excluded from every cursor-paginated page after that
    -- — otherwise it would duplicate across pages, or drop out entirely
    -- once it ages past the requested cursor.
    and (p_before is null or p.is_pinned = false)
  order by p.is_pinned desc, p.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_empire_feed(integer, timestamptz) to authenticated;

create or replace function public.mark_empire_feed_seen()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  insert into public.empire_post_reads (user_id, last_seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set last_seen_at = now();
end;
$$;
grant execute on function public.mark_empire_feed_seen() to authenticated;

create or replace function public.fetch_empire_unread_count()
returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::int
  from public.empire_posts p
  where p.created_at > coalesce(
    (select last_seen_at from public.empire_post_reads where user_id = auth.uid()),
    'epoch'::timestamptz
  );
$$;
grant execute on function public.fetch_empire_unread_count() to authenticated;

-- ---- Storage: empire-post-media ----
-- Public read (matches avatars/car-photos — getPublicUrl, no signed
-- URLs), but INSERT is gated directly on is_admin() rather than the
-- per-uploader-folder pattern those buckets use: there's exactly one
-- class of writer here (Owner/Admin), no per-user ownership to encode.

insert into storage.buckets (id, name, public)
values ('empire-post-media', 'empire-post-media', true)
on conflict (id) do nothing;

create policy "Empire post media is publicly accessible"
  on storage.objects for select
  using (bucket_id = 'empire-post-media');

create policy "Owner/Admin can upload Empire post media"
  on storage.objects for insert
  with check (bucket_id = 'empire-post-media' and public.is_admin());

create policy "Owner/Admin can delete Empire post media"
  on storage.objects for delete
  using (bucket_id = 'empire-post-media' and public.is_admin());
