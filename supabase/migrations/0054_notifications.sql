-- A real, general notifications system — Notifications.tsx has existed
-- since early on as a hardcoded empty state with its own comment
-- explaining why ("no notification-generating events exist yet"). SIGNAL
-- now has several: Follow, Respect, Comment, Share. This table is
-- deliberately generic (a `type` + optional `post_id`), not SIGNAL-
-- specific, so a future booking/message event can reuse it the same way
-- rather than this becoming the first of several parallel notification
-- systems.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  -- The account whose action caused this — null is reserved for a future
  -- system-generated notification (none exist yet), never a spoofable
  -- client-supplied value (see create_signal_notification below).
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null,
  post_id uuid references public.empire_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow', 'post_respect', 'post_comment', 'post_share'));
create index if not exists notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "Users view their own notifications" on public.notifications;
create policy "Users view their own notifications"
  on public.notifications for select
  using (recipient_id = auth.uid());

-- Internal helper only — deliberately NEVER granted to `authenticated`.
-- Every write RPC below calls this directly (same schema/owner, so no
-- grant is needed for that); a client calling it straight over RPC would
-- get a permission error. `actor_id` is always `auth.uid()`, never a
-- parameter, so even a future accidental grant couldn't be used to spoof
-- a notification as coming from someone else. Silently no-ops for a
-- self-action (liking your own post, etc.) or when nobody's signed in,
-- rather than making every call site remember to check that.
create or replace function public.create_signal_notification(p_recipient_id uuid, p_type text, p_post_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or p_recipient_id is null or p_recipient_id = auth.uid() then
    return;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, post_id)
  values (p_recipient_id, auth.uid(), p_type, p_post_id);
end;
$$;

-- ---- Reads (all caller-scoped via recipient_id = auth.uid()) ----

create or replace function public.fetch_my_notifications(p_limit integer default 30, p_before timestamptz default null)
returns table (
  id uuid, type text, created_at timestamptz, read_at timestamptz,
  actor_id uuid, actor_name text, actor_avatar_url text,
  post_id uuid, post_body text
)
language sql stable security definer set search_path = public
as $$
  select
    n.id, n.type, n.created_at, n.read_at,
    n.actor_id, pr.full_name, pr.avatar_url,
    n.post_id, p.body
  from public.notifications n
  left join public.profiles pr on pr.id = n.actor_id
  left join public.empire_posts p on p.id = n.post_id
  where n.recipient_id = auth.uid()
    and (p_before is null or n.created_at < p_before)
  order by n.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_my_notifications(integer, timestamptz) to authenticated;

create or replace function public.fetch_unread_notification_count()
returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::int from public.notifications where recipient_id = auth.uid() and read_at is null;
$$;
grant execute on function public.fetch_unread_notification_count() to authenticated;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.notifications set read_at = now() where id = p_notification_id and recipient_id = auth.uid() and read_at is null;
end;
$$;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.notifications set read_at = now() where recipient_id = auth.uid() and read_at is null;
end;
$$;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- ---- Wiring into the four real interactions that exist today ----
-- Each keeps its exact prior signature/behavior; the only addition is a
-- `perform create_signal_notification(...)` call on the real triggering
-- edge (a new follow, a like — not an unlike, a posted comment, a
-- completed share), so a plain `create or replace function` is safe with
-- no drop needed anywhere in this section.

create or replace function public.toggle_profile_follow(p_followee_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_following boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if auth.uid() = p_followee_id then
    raise exception 'Cannot follow yourself';
  end if;
  if not exists (select 1 from public.profiles where id = p_followee_id) then
    raise exception 'Profile not found';
  end if;
  if exists (select 1 from public.profile_follows where follower_id = auth.uid() and followee_id = p_followee_id) then
    delete from public.profile_follows where follower_id = auth.uid() and followee_id = p_followee_id;
    v_following := false;
  else
    insert into public.profile_follows (follower_id, followee_id) values (auth.uid(), p_followee_id);
    v_following := true;
    perform public.create_signal_notification(p_followee_id, 'follow');
  end if;
  return v_following;
end;
$$;
grant execute on function public.toggle_profile_follow(uuid) to authenticated;

create or replace function public.toggle_empire_post_like(p_post_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_existing uuid;
  v_author uuid;
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
    select author_id into v_author from public.empire_posts where id = p_post_id;
    perform public.create_signal_notification(v_author, 'post_respect', p_post_id);
    return true;
  end if;
end;
$$;
grant execute on function public.toggle_empire_post_like(uuid) to authenticated;

create or replace function public.add_empire_post_comment(p_post_id uuid, p_body text)
returns public.empire_post_comments
language plpgsql security definer set search_path = public
as $$
declare
  v_disabled boolean;
  v_author uuid;
  v_comment public.empire_post_comments;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Comment cannot be empty';
  end if;
  select comments_disabled, author_id into v_disabled, v_author from public.empire_posts where id = p_post_id;
  if v_disabled is null then
    raise exception 'Post not found';
  end if;
  if v_disabled then
    raise exception 'Comments are disabled for this post';
  end if;
  insert into public.empire_post_comments (post_id, user_id, body)
  values (p_post_id, auth.uid(), p_body)
  returning * into v_comment;
  perform public.create_signal_notification(v_author, 'post_comment', p_post_id);
  return v_comment;
end;
$$;
grant execute on function public.add_empire_post_comment(uuid, text) to authenticated;

create or replace function public.increment_empire_post_share(p_post_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_author uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.empire_posts set shares = shares + 1 where id = p_post_id returning author_id into v_author;
  perform public.create_signal_notification(v_author, 'post_share', p_post_id);
end;
$$;
grant execute on function public.increment_empire_post_share(uuid) to authenticated;
