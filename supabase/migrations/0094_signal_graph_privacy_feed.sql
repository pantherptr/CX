-- Signal as a real social graph (step 1).
--
-- The feed itself is NOT narrowed: a new member sees the normal feed, everyone in it,
-- verified or not. What the graph changes is who may see what a person chose to keep
-- for followers / CX Circle / themselves (0092), who sees the follower numbers, and who
-- gets named when someone reacts.
--
-- 1. Follower privacy: only a person sees their own follower / following numbers
--    and lists. Everyone else gets nothing (the follow button still works).
-- 2. Who reacted: a Respect or a Save from someone who follows you (or follows you
--    back) names them; from a stranger you only learn "your post received N new
--    Respects" — a stranger's Save tells you nothing at all.
-- 3. People to follow: friends-of-friends first, then well-followed hosts and
--    verified accounts. API only for now.
--
-- Builds on 0052, 0072, 0092, 0093.

-- -------------------------------------------------- 1. follower privacy
drop policy if exists "Signed-in users view follows" on public.profile_follows;
drop policy if exists "People see their own follow edges" on public.profile_follows;
create policy "People see their own follow edges"
  on public.profile_follows for select
  using (follower_id = auth.uid() or followee_id = auth.uid());

-- The public profile projection: counts only for the owner of the profile.
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
    'followed_by_me', exists(select 1 from public.profile_follows f where f.follower_id = auth.uid() and f.followee_id = pr.id)
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

-- ------------------------------------------- 2. who reacted: connected only
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
  if not public._notif_allowed(p_recipient_id, p_type) then
    return;
  end if;

  -- "Connected" = this person follows the recipient (a mutual follow includes it).
  v_connected := exists (select 1 from public.profile_follows where follower_id = v_actor and followee_id = p_recipient_id);

  if p_type = 'post_save' then
    if not v_connected then return; end if; -- a stranger's Save is invisible
  elsif p_type = 'post_respect' and p_post_id is not null and not v_connected then
    -- Strangers' Respects fold into one anonymous row per post while it is unread.
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

-- Whether this notification may name its actor to me (right now).
create or replace function public._notif_actor_visible(p_type text, p_actor uuid, p_recipient uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when p_actor is null then false
    when p_type in ('follow', 'follow_accepted', 'circle') then true
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

create or replace function public.fetch_unread_notification_count()
returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::int
  from public.notifications n
  left join public.notification_actors na on na.notification_id = n.id
  where n.recipient_id = auth.uid() and n.read_at is null
    and (n.type <> 'post_save' or public._notif_actor_visible(n.type, na.actor_id, n.recipient_id));
$$;
grant execute on function public.fetch_unread_notification_count() to authenticated;

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
    -- an old Save from someone who is not (or no longer) your follower stays hidden
    and (n.type <> 'post_save' or v.visible)
    and (p_before is null or n.created_at < p_before)
  order by n.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_my_notifications(integer, timestamptz) to authenticated;

-- -------------------------------------------------- 3. people to follow
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
    -- people followed by the people I follow
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
    and not coalesce(pr.suspended, false)
    and (fof.n > 0 or pr.is_host or pr.is_verified_client)
  order by coalesce(fof.n, 0) desc,
           (select count(*) from public.profile_follows x where x.followee_id = pr.id) desc,
           pr.created_at desc
  limit least(coalesce(p_limit, 12), 40);
$$;
grant execute on function public.fetch_people_suggestions(integer) to authenticated;
