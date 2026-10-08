-- SIGNAL notifications: who did it stays private unless you are connected.
--
-- A Respect / comment / share / Save on your post names the person only when
-- you follow them, they follow you, or you follow each other; otherwise you
-- just learn that the post received it. A "follow" notification always shows
-- its actor (they follow you by definition).
--
-- The privacy is enforced here, not in the app: the actor of every
-- notification moves out of `notifications` (which the recipient can read
-- directly) into `notification_actors`, a table nobody but these functions
-- can read, and the list RPC only hands the actor back when connected.

-- 1. A Save is a notification-worthy event too.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow', 'post_respect', 'post_comment', 'post_share', 'post_save'));

-- 2. The private actor table.
create table if not exists public.notification_actors (
  notification_id uuid primary key references public.notifications(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade
);
alter table public.notification_actors enable row level security;
revoke all on public.notification_actors from anon, authenticated;

insert into public.notification_actors (notification_id, actor_id)
select id, actor_id from public.notifications where actor_id is not null
on conflict do nothing;
update public.notifications set actor_id = null where actor_id is not null;

-- 3. New notifications record the actor privately.
create or replace function public.create_signal_notification(p_recipient_id uuid, p_type text, p_post_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or p_recipient_id is null or p_recipient_id = auth.uid() then
    return;
  end if;
  insert into public.notifications (recipient_id, type, post_id)
  values (p_recipient_id, p_type, p_post_id)
  returning id into v_id;
  insert into public.notification_actors (notification_id, actor_id) values (v_id, auth.uid());
end;
$$;

-- 4. The list: the actor comes back only for a connection (or a follow).
--    (Dropped first: the live function's column list can differ from the one
--    in the migration history, and Postgres won't change a return type in place.)
drop function if exists public.fetch_my_notifications(integer, timestamptz);
create or replace function public.fetch_my_notifications(p_limit integer default 30, p_before timestamptz default null)
returns table (
  id uuid, type text, created_at timestamptz, read_at timestamptz,
  actor_id uuid, actor_name text, actor_avatar_url text, actor_username text,
  actor_is_owner boolean, actor_is_admin boolean, actor_is_host boolean, actor_is_verified_client boolean,
  post_id uuid, post_body text
)
language sql stable security definer set search_path = public
as $$
  select
    n.id, n.type, n.created_at, n.read_at,
    case when v.visible then pr.id end,
    case when v.visible then pr.full_name end,
    case when v.visible then pr.avatar_url end,
    case when v.visible then pr.username end,
    case when v.visible then coalesce(pr.is_owner, false) else false end,
    case when v.visible then coalesce(pr.is_admin, false) else false end,
    case when v.visible then coalesce(pr.is_host, false) else false end,
    case when v.visible then coalesce(pr.is_verified_client, false) else false end,
    n.post_id, replace(p.body, chr(8203), '')
  from public.notifications n
  left join public.notification_actors na on na.notification_id = n.id
  left join public.profiles pr on pr.id = na.actor_id
  left join public.empire_posts p on p.id = n.post_id
  cross join lateral (
    select (
      n.type = 'follow'
      or exists (
        select 1 from public.profile_follows f
        where (f.follower_id = auth.uid() and f.followee_id = na.actor_id)
           or (f.follower_id = na.actor_id and f.followee_id = auth.uid())
      )
    ) as visible
  ) v
  where n.recipient_id = auth.uid()
    and (p_before is null or n.created_at < p_before)
  order by n.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_my_notifications(integer, timestamptz) to authenticated;

-- 5. Saving a post notifies its author (once per Save, like a Respect).
create or replace function public.toggle_empire_post_save(p_post_id uuid)
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
  select id into v_existing from public.empire_post_saves where post_id = p_post_id and user_id = auth.uid() limit 1;
  if v_existing is not null then
    delete from public.empire_post_saves where post_id = p_post_id and user_id = auth.uid();
    return false;
  else
    insert into public.empire_post_saves (post_id, user_id) values (p_post_id, auth.uid());
    select author_id into v_author from public.empire_posts where id = p_post_id;
    perform public.create_signal_notification(v_author, 'post_save', p_post_id);
    return true;
  end if;
end;
$$;
grant execute on function public.toggle_empire_post_save(uuid) to authenticated;

-- ...and the team's repeat Saves (0075) notify once, on the first.
create or replace function public.add_empire_post_save(p_post_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_next integer;
  v_count integer;
  v_author uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  select coalesce(max(bump), -1) + 1 into v_next from public.empire_post_saves where post_id = p_post_id and user_id = auth.uid();
  insert into public.empire_post_saves (post_id, user_id, bump) values (p_post_id, auth.uid(), v_next);
  if v_next = 0 then
    select author_id into v_author from public.empire_posts where id = p_post_id;
    perform public.create_signal_notification(v_author, 'post_save', p_post_id);
  end if;
  select count(*)::int into v_count from public.empire_post_saves where post_id = p_post_id and user_id = auth.uid();
  return v_count;
end;
$$;
grant execute on function public.add_empire_post_save(uuid) to authenticated;
