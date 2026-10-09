-- Owner/Admin boosts reach the author as a growing number.
--
-- When the team adds Respects or Saves to a post, the author now gets an Activity item
-- ("Your post received N new Respects" / "Your post was saved N times") that keeps growing
-- while it is unread — 1, then 3, then 30 — instead of one single "1" on the first tap.
-- It never names anyone (no actor is stored), so it is the same anonymous aggregate as a
-- Respect from a stranger. Views are not notified. Builds on 0081 / 0094 / 0098.

create or replace function public._notify_team_boost(p_author uuid, p_type text, p_post_id uuid, p_amount integer)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if p_author is null or p_author = auth.uid() or coalesce(p_amount, 0) < 1 then return; end if;
  if not public._notif_allowed(p_author, p_type) then return; end if;
  update public.notifications n
    set count = n.count + p_amount, created_at = now(), read_at = null
    where n.recipient_id = p_author and n.type = p_type and n.post_id = p_post_id
      and n.read_at is null and n.created_at > now() - interval '24 hours'
      and not exists (select 1 from public.notification_actors na where na.notification_id = n.id)
    returning n.id into v_id;
  if v_id is null then
    insert into public.notifications (recipient_id, type, post_id, count) values (p_author, p_type, p_post_id, p_amount);
  end if;
end;
$$;

create or replace function public.add_empire_post_respect(p_post_id uuid, p_amount integer default 1)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_author uuid;
  v_count integer;
  v_n integer := greatest(1, least(coalesce(p_amount, 1), 100000));
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  insert into public.empire_post_likes (post_id, user_id) select p_post_id, auth.uid() from generate_series(1, v_n);
  select author_id into v_author from public.empire_posts where id = p_post_id;
  perform public._notify_team_boost(v_author, 'post_respect', p_post_id, v_n);
  select count(*)::int into v_count from public.empire_post_likes where post_id = p_post_id and user_id = auth.uid();
  return v_count;
end;
$$;

create or replace function public.add_empire_post_save(p_post_id uuid, p_amount integer default 1)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_next integer;
  v_author uuid;
  v_count integer;
  v_n integer := greatest(1, least(coalesce(p_amount, 1), 100000));
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  select coalesce(max(bump), -1) + 1 into v_next from public.empire_post_saves where post_id = p_post_id and user_id = auth.uid();
  insert into public.empire_post_saves (post_id, user_id, bump)
    select p_post_id, auth.uid(), v_next + g from generate_series(0, v_n - 1) g;
  select author_id into v_author from public.empire_posts where id = p_post_id;
  perform public._notify_team_boost(v_author, 'post_save', p_post_id, v_n);
  select count(*)::int into v_count from public.empire_post_saves where post_id = p_post_id and user_id = auth.uid();
  return v_count;
end;
$$;

-- A Save boost has no actor: show it (real Saves are still shown only for people you are connected to).
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
    or (n.type = 'collab_invite' and exists (
      select 1 from public.signal_collabs c
      where c.collaborator_id = n.recipient_id and c.status = 'pending'
        and c.content_id = coalesce(n.post_id, n.vision_id)
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
      when n.type in ('collab_invite', 'collab_left') and n.vision_id is not null then
        sv.id is not null and public.signal_can_view(auth.uid(), 'vision', sv.id, sv.author_id)
      when n.type in ('vision_selected', 'vision_featured') then
        sv.id is not null and sv.author_id = auth.uid() and public._vision_is_public(sv.id)
        and exists (select 1 from public.signal_visions_profiles vp where vp.user_id = sv.author_id and vp.enabled)
      else true
    end as ok
  ) a
  where n.recipient_id = auth.uid()
    and not public.signal_is_blocked(auth.uid(), na.actor_id)
    and (n.type <> 'post_save' or v.visible or na.actor_id is null)
    and (p_before is null or n.created_at < p_before)
  order by n.created_at desc
  limit p_limit;
$$;
grant execute on function public.fetch_my_notifications(integer, timestamptz) to authenticated;
