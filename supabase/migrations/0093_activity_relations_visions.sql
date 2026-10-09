-- Activity / notifications, brought in line with follow, CX Circle, anonymous
-- Respect, Visions and Spotlight. Builds on 0054/0076/0078/0092. No new screen:
-- the same notifications table, list RPC and bell.
--
--   * New events: CX Circle formed (to BOTH people), request accepted (ready for
--     when follow requests exist — nothing creates it yet), and Spotlight:
--     "selected" the first time CX picks a Vision, "featured" when it comes back
--     into the spotlight.
--   * Respect is only ever an aggregate ("Your post received N new Respects").
--     No actor is stored for it at all, and removing a Respect notifies nobody.
--   * A Save never creates a notification (already so since 0092) and the unread
--     badge no longer counts the old ones.
--   * Each notification says whether what it points at is still available to the
--     viewer; if not, the app shows "This content is no longer available" and the
--     post body / Vision is never sent.
--   * Per-person preferences for the five new groups, enforced on the server so a
--     switched-off kind is simply never created.
--   * User blocks do not exist in the product, so there is nothing to apply here.

-- ------------------------------------------------------------------ schema
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow', 'post_respect', 'post_comment', 'post_share', 'post_save',
                  'circle', 'follow_accepted', 'vision_selected', 'vision_featured'));

-- A notification about a Vision points at it; if the Vision is deleted the row
-- stays (and opens the "no longer available" state) instead of vanishing.
alter table public.notifications
  add column if not exists vision_id uuid references public.signal_visions(id) on delete set null;

-- ------------------------------------------------------------- preferences
create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  followers boolean not null default true,
  requests boolean not null default true,
  circle boolean not null default true,
  respects boolean not null default true,
  visions boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
-- No policies: only the functions below touch it.

create or replace function public.get_my_notification_prefs()
returns table (followers boolean, requests boolean, circle boolean, respects boolean, visions boolean)
language sql stable security definer set search_path = public
as $$
  select
    coalesce((select p.followers from public.notification_preferences p where p.user_id = auth.uid()), true),
    coalesce((select p.requests from public.notification_preferences p where p.user_id = auth.uid()), true),
    coalesce((select p.circle from public.notification_preferences p where p.user_id = auth.uid()), true),
    coalesce((select p.respects from public.notification_preferences p where p.user_id = auth.uid()), true),
    coalesce((select p.visions from public.notification_preferences p where p.user_id = auth.uid()), true);
$$;
grant execute on function public.get_my_notification_prefs() to authenticated;

create or replace function public.set_my_notification_prefs(
  p_followers boolean, p_requests boolean, p_circle boolean, p_respects boolean, p_visions boolean
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.notification_preferences (user_id, followers, requests, circle, respects, visions, updated_at)
  values (auth.uid(), p_followers, p_requests, p_circle, p_respects, p_visions, now())
  on conflict (user_id) do update
    set followers = excluded.followers, requests = excluded.requests, circle = excluded.circle,
        respects = excluded.respects, visions = excluded.visions, updated_at = now();
end;
$$;
grant execute on function public.set_my_notification_prefs(boolean, boolean, boolean, boolean, boolean) to authenticated;

-- Does this person want this kind of notification? (comment/share are unchanged)
create or replace function public._notif_allowed(p_recipient uuid, p_type text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when p_type = 'follow' then coalesce((select p.followers from public.notification_preferences p where p.user_id = p_recipient), true)
    when p_type = 'follow_accepted' then coalesce((select p.requests from public.notification_preferences p where p.user_id = p_recipient), true)
    when p_type = 'circle' then coalesce((select p.circle from public.notification_preferences p where p.user_id = p_recipient), true)
    when p_type = 'post_respect' then coalesce((select p.respects from public.notification_preferences p where p.user_id = p_recipient), true)
    when p_type in ('vision_selected', 'vision_featured') then coalesce((select p.visions from public.notification_preferences p where p.user_id = p_recipient), true)
    else true
  end;
$$;

-- --------------------------------------------------------------- creating
-- Internal only (never granted). Old 3-argument form is replaced by one that can
-- also point at a Vision and name an explicit actor (used for CX Circle, where
-- the other person is the actor of MY notification).
drop function if exists public.create_signal_notification(uuid, text, uuid);
create or replace function public.create_signal_notification(
  p_recipient_id uuid, p_type text, p_post_id uuid default null, p_vision_id uuid default null, p_actor uuid default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_actor uuid := coalesce(p_actor, auth.uid());
begin
  if auth.uid() is null or p_recipient_id is null or p_recipient_id = v_actor then
    return;
  end if;
  if p_type = 'post_save' then
    return; -- a Save never notifies anyone
  end if;
  if not public._notif_allowed(p_recipient_id, p_type) then
    return;
  end if;

  -- Respects collapse into one row per post while it is unread (24 h window).
  if p_type = 'post_respect' and p_post_id is not null then
    update public.notifications
      set count = count + 1, created_at = now(), read_at = null
      where recipient_id = p_recipient_id and type = p_type and post_id = p_post_id
        and read_at is null and created_at > now() - interval '24 hours'
      returning id into v_id;
    if v_id is not null then return; end if;
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

  -- Who did it is kept only where the app shows it: a follow, a Circle, an accepted
  -- request, a comment or a share. Never for a Respect, never for a Spotlight.
  if p_type not in ('post_respect', 'vision_selected', 'vision_featured') and v_actor is not null then
    insert into public.notification_actors (notification_id, actor_id) values (v_id, v_actor);
  end if;
end;
$$;

-- Following someone: a plain "started following you", or — when they already
-- follow you — CX Circle for both of you instead.
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
    if exists (select 1 from public.profile_follows where follower_id = p_followee_id and followee_id = auth.uid()) then
      -- mutual: CX Circle, told to both people
      perform public.create_signal_notification(p_followee_id, 'circle');
      perform public.create_signal_notification(auth.uid(), 'circle', null, null, p_followee_id);
    else
      perform public.create_signal_notification(p_followee_id, 'follow');
    end if;
  end if;
  return v_following;
end;
$$;
grant execute on function public.toggle_profile_follow(uuid) to authenticated;

-- Spotlight: tell the Vision's owner when CX picks it. First time (or after it
-- had been removed) = "selected"; coming back after being archived = "featured".
-- Editing a live Spotlight notifies nobody.
create or replace function public.publish_spotlight(
  p_vision_id uuid, p_publisher_id uuid, p_curated_by text, p_city text, p_title text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_post uuid; v_prev text; v_author uuid;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if not exists (select 1 from public.spotlight_publishers where id = p_publisher_id and is_active) then
    raise exception 'Choose an official CX account';
  end if;
  if not exists (
    select 1 from public.signal_visions v
    join public.signal_visions_profiles vp on vp.user_id = v.author_id and vp.enabled
    where v.id = p_vision_id and public._is_verified_author(v.author_id) and public._vision_is_public(v.id)
  ) then
    raise exception 'Only public Visions of verified accounts can be selected';
  end if;
  select status into v_prev from public.signal_spotlight_entries where source_vision_id = p_vision_id;
  insert into public.signal_spotlight_entries (source_vision_id, publisher_id, curated_by, city, editorial_title, status, published_at, created_by)
  values (
    p_vision_id, p_publisher_id,
    nullif(left(btrim(coalesce(p_curated_by, '')), 60), ''),
    nullif(left(btrim(coalesce(p_city, '')), 60), ''),
    nullif(left(btrim(coalesce(p_title, '')), 80), ''),
    'published', now(), auth.uid()
  )
  on conflict (source_vision_id) do update
    set publisher_id = excluded.publisher_id, curated_by = excluded.curated_by, city = excluded.city,
        editorial_title = excluded.editorial_title, status = 'published', published_at = now(), created_by = auth.uid()
  returning id, post_id into v_id, v_post;

  select author_id into v_author from public.signal_visions where id = p_vision_id;
  if v_prev is null or v_prev in ('removed', 'draft') then
    perform public.create_signal_notification(v_author, 'vision_selected', null, p_vision_id);
  elsif v_prev = 'archived' then
    perform public.create_signal_notification(v_author, 'vision_featured', null, p_vision_id);
  end if;
  return jsonb_build_object('entry_id', v_id, 'post_id', v_post);
end;
$$;
grant execute on function public.publish_spotlight(uuid, uuid, text, text, text) to authenticated;

-- ----------------------------------------------------------------- reading
-- The bell: Saves never count (some old ones may exist).
create or replace function public.fetch_unread_notification_count()
returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::int from public.notifications
  where recipient_id = auth.uid() and read_at is null and type <> 'post_save';
$$;
grant execute on function public.fetch_unread_notification_count() to authenticated;

-- The list. The person behind a notification comes back only for follow / Circle /
-- accepted request, or (comments, shares) when you are connected. Never for a
-- Respect, a Save or a Spotlight. `available` says whether what it points at can
-- still be opened by you; when it can't, neither the post text nor the Vision is
-- sent.
drop function if exists public.fetch_my_notifications(integer, timestamptz);
create or replace function public.fetch_my_notifications(p_limit integer default 30, p_before timestamptz default null)
returns table (
  id uuid, type text, created_at timestamptz, read_at timestamptz, count integer,
  actor_id uuid, actor_name text, actor_avatar_url text, actor_username text,
  actor_is_owner boolean, actor_is_admin boolean, actor_is_host boolean, actor_is_verified_client boolean,
  post_id uuid, post_body text, vision_id uuid, available boolean
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
    a.ok
  from public.notifications n
  left join public.notification_actors na on na.notification_id = n.id
  left join public.profiles pr on pr.id = na.actor_id
  left join public.empire_posts p on p.id = n.post_id
  left join public.signal_visions sv on sv.id = n.vision_id
  cross join lateral (
    select (
      n.type in ('follow', 'follow_accepted', 'circle')
      or (
        n.type not in ('post_respect', 'post_save', 'vision_selected', 'vision_featured')
        and exists (
          select 1 from public.profile_follows f
          where (f.follower_id = auth.uid() and f.followee_id = na.actor_id)
             or (f.follower_id = na.actor_id and f.followee_id = auth.uid())
        )
      )
    ) as visible
  ) v
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
    and n.type <> 'post_save'
    and (p_before is null or n.created_at < p_before)
  order by n.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_my_notifications(integer, timestamptz) to authenticated;
