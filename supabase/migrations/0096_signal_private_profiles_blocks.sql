-- Private profiles with follow requests, and user blocks (step 3).
--
--   * A profile can be private. Following a private profile sends a request; its owner
--     accepts or declines it (from the notification). Until accepted the person sees
--     only the public face of the profile — no posts, Stories or Visions.
--   * Switching a profile back to public accepts every pending request.
--   * Blocking someone removes any follow between you, cancels pending requests, and from
--     then on neither of you can see the other's content, find each other in search or
--     suggestions, follow, or notify each other. Admins keep their moderation view.
--
-- The one rule that decides who may see content, signal_can_view (0092), now also knows
-- about both. Builds on 0092-0095.

-- ----------------------------------------------------------------- tables
create table if not exists public.signal_profile_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  is_private boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.profile_follow_requests (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (requester_id, target_id),
  check (requester_id <> target_id)
);
create index if not exists profile_follow_requests_target_idx on public.profile_follow_requests (target_id);
create table if not exists public.signal_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists signal_blocks_blocked_idx on public.signal_blocks (blocked_id);
alter table public.signal_profile_settings enable row level security;
alter table public.profile_follow_requests enable row level security;
alter table public.signal_blocks enable row level security;
-- No policies: everything goes through the functions below.

create or replace function public.signal_is_blocked(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_a is not null and p_b is not null and exists (
    select 1 from public.signal_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

create or replace function public.signal_is_private(p_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select s.is_private from public.signal_profile_settings s where s.user_id = p_user), false);
$$;

-- ------------------------------------------------ the one visibility rule
create or replace function public.signal_can_view(p_viewer uuid, p_type text, p_id uuid, p_author uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare v text;
begin
  if p_viewer is null then return false; end if;
  if p_author = p_viewer then return true; end if;
  if public.is_admin(p_viewer) then return true; end if;
  if public.signal_is_blocked(p_viewer, p_author) then return false; end if;
  -- a private profile shows its content to its followers only
  if public.signal_is_private(p_author)
     and not exists (select 1 from public.profile_follows where follower_id = p_viewer and followee_id = p_author) then
    return false;
  end if;
  select visibility into v from public.signal_content_visibility where content_type = p_type and content_id = p_id;
  v := coalesce(v, 'public');
  if v = 'public' then return true; end if;
  if v = 'followers' then
    return exists (select 1 from public.profile_follows where follower_id = p_viewer and followee_id = p_author);
  end if;
  if v = 'circle' then
    return public.signal_relation(p_viewer, p_author) = 'mutual';
  end if;
  return false;
end;
$$;

-- ------------------------------------------------------------- notifications
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow', 'post_respect', 'post_comment', 'post_share', 'post_save',
                  'circle', 'follow_accepted', 'follow_request', 'vision_selected', 'vision_featured'));

create or replace function public._notif_allowed(p_recipient uuid, p_type text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when p_type in ('follow', 'follow_request') then coalesce((select p.followers from public.notification_preferences p where p.user_id = p_recipient), true)
    when p_type = 'follow_accepted' then coalesce((select p.requests from public.notification_preferences p where p.user_id = p_recipient), true)
    when p_type = 'circle' then coalesce((select p.circle from public.notification_preferences p where p.user_id = p_recipient), true)
    when p_type = 'post_respect' then coalesce((select p.respects from public.notification_preferences p where p.user_id = p_recipient), true)
    when p_type in ('vision_selected', 'vision_featured') then coalesce((select p.visions from public.notification_preferences p where p.user_id = p_recipient), true)
    else true
  end;
$$;

create or replace function public.create_signal_notification(
  p_recipient_id uuid, p_type text, p_post_id uuid default null, p_vision_id uuid default null, p_actor uuid default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_actor uuid := coalesce(p_actor, auth.uid());
  v_connected boolean;
begin
  if auth.uid() is null or p_recipient_id is null or p_recipient_id = v_actor then
    return;
  end if;
  if public.signal_is_blocked(p_recipient_id, v_actor) then
    return; -- a block silences both directions
  end if;
  if not public._notif_allowed(p_recipient_id, p_type) then
    return;
  end if;

  v_connected := exists (select 1 from public.profile_follows where follower_id = v_actor and followee_id = p_recipient_id);

  if p_type = 'post_save' then
    if not v_connected then return; end if;
  elsif p_type = 'post_respect' and p_post_id is not null and not v_connected then
    update public.notifications n
      set count = n.count + 1, created_at = now(), read_at = null
      where n.recipient_id = p_recipient_id and n.type = 'post_respect' and n.post_id = p_post_id
        and n.read_at is null and n.created_at > now() - interval '24 hours'
        and not exists (select 1 from public.notification_actors na where na.notification_id = n.id)
      returning n.id into v_id;
    if v_id is not null then return; end if;
    insert into public.notifications (recipient_id, type, post_id) values (p_recipient_id, p_type, p_post_id);
    return;
  elsif p_type in ('post_comment', 'post_share') and p_post_id is not null then
    update public.notifications
      set count = count + 1, created_at = now(), read_at = null
      where recipient_id = p_recipient_id and type = p_type and post_id = p_post_id
        and read_at is null and created_at > now() - interval '24 hours'
      returning id into v_id;
    if v_id is not null then
      update public.notification_actors set actor_id = v_actor where notification_id = v_id;
      return;
    end if;
  end if;

  insert into public.notifications (recipient_id, type, post_id, vision_id)
  values (p_recipient_id, p_type, p_post_id, p_vision_id)
  returning id into v_id;

  if p_type not in ('vision_selected', 'vision_featured') and v_actor is not null then
    insert into public.notification_actors (notification_id, actor_id) values (v_id, v_actor);
  end if;
end;
$$;

create or replace function public._notif_actor_visible(p_type text, p_actor uuid, p_recipient uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when p_actor is null then false
    when p_type in ('follow', 'follow_request', 'follow_accepted', 'circle') then true
    when p_type in ('vision_selected', 'vision_featured') then false
    when p_type in ('post_respect', 'post_save') then
      exists (select 1 from public.profile_follows f where f.follower_id = p_actor and f.followee_id = p_recipient)
    else
      exists (
        select 1 from public.profile_follows f
        where (f.follower_id = p_recipient and f.followee_id = p_actor)
           or (f.follower_id = p_actor and f.followee_id = p_recipient)
      )
  end;
$$;

drop function if exists public.fetch_my_notifications(integer, timestamptz);
create or replace function public.fetch_my_notifications(p_limit integer default 30, p_before timestamptz default null)
returns table (
  id uuid, type text, created_at timestamptz, read_at timestamptz, count integer,
  actor_id uuid, actor_name text, actor_avatar_url text, actor_username text,
  actor_is_owner boolean, actor_is_admin boolean, actor_is_host boolean, actor_is_verified_client boolean,
  post_id uuid, post_body text, vision_id uuid, available boolean, pending_request boolean
)
language sql stable security definer set search_path = public
as $$
  select
    n.id, n.type, n.created_at, n.read_at, n.count,
    case when v.visible then pr.id end,
    case when v.visible then pr.full_name end,
    case when v.visible then pr.avatar_url end,
    case when v.visible then pr.username end,
    case when v.visible then coalesce(pr.is_owner, false) else false end,
    case when v.visible then coalesce(pr.is_admin, false) else false end,
    case when v.visible then coalesce(pr.is_host, false) else false end,
    case when v.visible then coalesce(pr.is_verified_client, false) else false end,
    n.post_id,
    case when a.ok then replace(p.body, chr(8203), '') end,
    case when a.ok then n.vision_id end,
    a.ok,
    (n.type = 'follow_request' and exists (
      select 1 from public.profile_follow_requests r where r.requester_id = na.actor_id and r.target_id = n.recipient_id
    ))
  from public.notifications n
  left join public.notification_actors na on na.notification_id = n.id
  left join public.profiles pr on pr.id = na.actor_id
  left join public.empire_posts p on p.id = n.post_id
  left join public.signal_visions sv on sv.id = n.vision_id
  cross join lateral (select public._notif_actor_visible(n.type, na.actor_id, n.recipient_id) as visible) v
  cross join lateral (
    select case
      when n.post_id is not null then p.id is not null and public.signal_can_view(auth.uid(), 'post', p.id, p.author_id)
      when n.type in ('vision_selected', 'vision_featured') then
        sv.id is not null and sv.author_id = auth.uid() and public._vision_is_public(sv.id)
        and exists (select 1 from public.signal_visions_profiles vp where vp.user_id = sv.author_id and vp.enabled)
      else true
    end as ok
  ) a
  where n.recipient_id = auth.uid()
    and not public.signal_is_blocked(auth.uid(), na.actor_id)
    and (n.type <> 'post_save' or v.visible)
    and (p_before is null or n.created_at < p_before)
  order by n.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_my_notifications(integer, timestamptz) to authenticated;

-- ------------------------------------------------------------ following
-- Returns where the follow ended up: 'following', 'requested' (private profile) or 'none'.
create or replace function public.toggle_follow(p_followee_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if auth.uid() = p_followee_id then raise exception 'Cannot follow yourself'; end if;
  if not exists (select 1 from public.profiles where id = p_followee_id) then raise exception 'Profile not found'; end if;
  if public.signal_is_blocked(auth.uid(), p_followee_id) then raise exception 'Not available'; end if;

  if exists (select 1 from public.profile_follows where follower_id = auth.uid() and followee_id = p_followee_id) then
    delete from public.profile_follows where follower_id = auth.uid() and followee_id = p_followee_id;
    return 'none';
  end if;
  if exists (select 1 from public.profile_follow_requests where requester_id = auth.uid() and target_id = p_followee_id) then
    delete from public.profile_follow_requests where requester_id = auth.uid() and target_id = p_followee_id;
    return 'none';
  end if;

  if public.signal_is_private(p_followee_id) then
    insert into public.profile_follow_requests (requester_id, target_id) values (auth.uid(), p_followee_id) on conflict do nothing;
    perform public.create_signal_notification(p_followee_id, 'follow_request');
    return 'requested';
  end if;

  insert into public.profile_follows (follower_id, followee_id) values (auth.uid(), p_followee_id);
  if exists (select 1 from public.profile_follows where follower_id = p_followee_id and followee_id = auth.uid()) then
    perform public.create_signal_notification(p_followee_id, 'circle');
    perform public.create_signal_notification(auth.uid(), 'circle', null, null, p_followee_id);
  else
    perform public.create_signal_notification(p_followee_id, 'follow');
  end if;
  return 'following';
end;
$$;
grant execute on function public.toggle_follow(uuid) to authenticated;

-- The old boolean entry point now goes through the same rules (a private profile
-- cannot be followed around the request).
create or replace function public.toggle_profile_follow(p_followee_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  return public.toggle_follow(p_followee_id) = 'following';
end;
$$;
grant execute on function public.toggle_profile_follow(uuid) to authenticated;

-- A private profile's owner answers a request.
create or replace function public.respond_follow_request(p_requester_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.profile_follow_requests where requester_id = p_requester_id and target_id = auth.uid()) then
    return;
  end if;
  delete from public.profile_follow_requests where requester_id = p_requester_id and target_id = auth.uid();
  update public.notifications n set read_at = coalesce(n.read_at, now())
    where n.recipient_id = auth.uid() and n.type = 'follow_request'
      and exists (select 1 from public.notification_actors na where na.notification_id = n.id and na.actor_id = p_requester_id);
  if p_accept and not public.signal_is_blocked(auth.uid(), p_requester_id) then
    insert into public.profile_follows (follower_id, followee_id) values (p_requester_id, auth.uid()) on conflict do nothing;
    perform public.create_signal_notification(p_requester_id, 'follow_accepted');
    if exists (select 1 from public.profile_follows where follower_id = auth.uid() and followee_id = p_requester_id) then
      perform public.create_signal_notification(p_requester_id, 'circle');
      perform public.create_signal_notification(auth.uid(), 'circle', null, null, p_requester_id);
    end if;
  end if;
end;
$$;
grant execute on function public.respond_follow_request(uuid, boolean) to authenticated;

-- Make my profile private / public. Going public accepts every pending request.
create or replace function public.set_my_profile_private(p_private boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  insert into public.signal_profile_settings (user_id, is_private, updated_at) values (auth.uid(), p_private, now())
  on conflict (user_id) do update set is_private = excluded.is_private, updated_at = now();
  if not p_private then
    insert into public.profile_follows (follower_id, followee_id)
      select r.requester_id, r.target_id from public.profile_follow_requests r
      where r.target_id = auth.uid() and not public.signal_is_blocked(r.requester_id, r.target_id)
    on conflict do nothing;
    delete from public.profile_follow_requests where target_id = auth.uid();
  end if;
end;
$$;
grant execute on function public.set_my_profile_private(boolean) to authenticated;

-- ---------------------------------------------------------------- blocks
-- Returns true when the person is now blocked, false when the block was lifted.
create or replace function public.toggle_block(p_user_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if auth.uid() = p_user_id then raise exception 'Cannot block yourself'; end if;
  if exists (select 1 from public.signal_blocks where blocker_id = auth.uid() and blocked_id = p_user_id) then
    delete from public.signal_blocks where blocker_id = auth.uid() and blocked_id = p_user_id;
    return false;
  end if;
  insert into public.signal_blocks (blocker_id, blocked_id) values (auth.uid(), p_user_id);
  delete from public.profile_follows
    where (follower_id = auth.uid() and followee_id = p_user_id) or (follower_id = p_user_id and followee_id = auth.uid());
  delete from public.profile_follow_requests
    where (requester_id = auth.uid() and target_id = p_user_id) or (requester_id = p_user_id and target_id = auth.uid());
  return true;
end;
$$;
grant execute on function public.toggle_block(uuid) to authenticated;

create or replace function public.fetch_my_blocks()
returns table (id uuid, full_name text, avatar_url text, username text)
language sql stable security definer set search_path = public
as $$
  select pr.id, pr.full_name, pr.avatar_url, pr.username
  from public.signal_blocks b join public.profiles pr on pr.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;
grant execute on function public.fetch_my_blocks() to authenticated;

-- ---------------------------------------------------- the public profile card
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
  -- someone who blocked me does not exist for me
  if exists (select 1 from public.signal_blocks where blocker_id = p_user_id and blocked_id = auth.uid()) then
    raise exception 'Profile not found';
  end if;
  select jsonb_build_object(
    'id', pr.id,
    'full_name', pr.full_name,
    'avatar_url', pr.avatar_url,
    'bio', pr.bio,
    'cover_url', pr.cover_url,
    'username', pr.username,
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
    'joined', pr.joined,
    'followers_count', case when pr.id = auth.uid() then (select count(*)::int from public.profile_follows f where f.followee_id = pr.id) else 0 end,
    'following_count', case when pr.id = auth.uid() then (select count(*)::int from public.profile_follows f where f.follower_id = pr.id) else 0 end,
    'followed_by_me', exists(select 1 from public.profile_follows f where f.follower_id = auth.uid() and f.followee_id = pr.id),
    'is_private', public.signal_is_private(pr.id),
    'follow_status', case
      when exists(select 1 from public.profile_follows f where f.follower_id = auth.uid() and f.followee_id = pr.id) then 'following'
      when exists(select 1 from public.profile_follow_requests r where r.requester_id = auth.uid() and r.target_id = pr.id) then 'requested'
      else 'none' end,
    'blocked_by_me', exists(select 1 from public.signal_blocks b where b.blocker_id = auth.uid() and b.blocked_id = pr.id)
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

-- ------------------------------------------------- search, suggestions, comments
create or replace function public.search_signal_people(p_query text, p_limit integer default 20)
returns table (
  id uuid, full_name text, avatar_url text, username text,
  is_owner boolean, is_admin boolean, is_host boolean, is_verified_client boolean,
  followed_by_me boolean
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_norm text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  v_norm := lower(trim(p_query));
  if left(v_norm, 1) = '@' then
    v_norm := substring(v_norm from 2);
  end if;
  if v_norm = '' then
    return;
  end if;
  return query
    select
      pr.id, pr.full_name, pr.avatar_url, pr.username,
      pr.is_owner, pr.is_admin, pr.is_host, pr.is_verified_client,
      exists(select 1 from public.profile_follows f where f.follower_id = auth.uid() and f.followee_id = pr.id)
    from public.profiles pr
    where pr.id <> auth.uid()
      and not public.signal_is_blocked(auth.uid(), pr.id)
      and (
        pr.username_normalized = v_norm
        or left(coalesce(pr.username_normalized, ''), length(v_norm)) = v_norm
        or left(lower(coalesce(pr.full_name, '')), length(v_norm)) = v_norm
        or position(v_norm in coalesce(pr.username_normalized, '')) > 0
        or position(v_norm in lower(coalesce(pr.full_name, ''))) > 0
      )
    order by
      case
        when pr.username_normalized = v_norm then 0
        when left(coalesce(pr.username_normalized, ''), length(v_norm)) = v_norm then 1
        when left(lower(coalesce(pr.full_name, '')), length(v_norm)) = v_norm then 2
        when position(v_norm in coalesce(pr.username_normalized, '')) > 0 then 3
        else 4
      end,
      pr.full_name asc
    limit p_limit;
end;
$$;
grant execute on function public.search_signal_people(text, integer) to authenticated;

create or replace function public.fetch_people_suggestions(p_limit integer default 12)
returns table (
  id uuid, full_name text, avatar_url text, username text,
  is_host boolean, is_verified_client boolean, mutual_follows integer
)
language sql stable security definer set search_path = public
as $$
  with me as (select auth.uid() as uid),
  followed as (
    select f.followee_id as id from public.profile_follows f, me where f.follower_id = me.uid
  ),
  fof as (
    select f2.followee_id as id, count(*)::int as n
    from public.profile_follows f2
    join followed on followed.id = f2.follower_id
    group by f2.followee_id
  )
  select pr.id, pr.full_name, pr.avatar_url, pr.username, pr.is_host, pr.is_verified_client, coalesce(fof.n, 0)
  from public.profiles pr
  cross join me
  left join fof on fof.id = pr.id
  where me.uid is not null
    and pr.id <> me.uid
    and not exists (select 1 from followed where followed.id = pr.id)
    and not exists (select 1 from public.profile_follow_requests r where r.requester_id = me.uid and r.target_id = pr.id)
    and not public.signal_is_blocked(me.uid, pr.id)
    and not coalesce(pr.suspended, false)
    and (fof.n > 0 or pr.is_host or pr.is_verified_client)
  order by coalesce(fof.n, 0) desc,
           (select count(*) from public.profile_follows x where x.followee_id = pr.id) desc,
           pr.created_at desc
  limit least(coalesce(p_limit, 12), 40);
$$;
grant execute on function public.fetch_people_suggestions(integer) to authenticated;

-- Comments by someone you blocked (or who blocked you) are not shown to you.
drop policy if exists "Signed-in users view comments" on public.empire_post_comments;
create policy "Signed-in users view comments"
  on public.empire_post_comments for select
  using (
    auth.uid() is not null
    and not public.signal_is_blocked(auth.uid(), user_id)
    and exists (select 1 from public.empire_posts p where p.id = post_id)
  );
