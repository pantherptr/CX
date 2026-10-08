-- Notifications aggregate while they sit unread: if your post already has an
-- unread "received a Respect" notification, the next Respect bumps its count
-- (and moves it to the top, with the latest person as its actor) instead of
-- adding a second row. Reading it, or a day going by, starts a fresh count.
-- A "follow" notification is about one specific person following you, so it
-- never aggregates.

alter table public.notifications add column if not exists count integer not null default 1;

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

  if p_type <> 'follow' and p_post_id is not null then
    update public.notifications
      set count = count + 1, created_at = now(), read_at = null
      where recipient_id = p_recipient_id and type = p_type and post_id = p_post_id
        and read_at is null and created_at > now() - interval '24 hours'
      returning id into v_id;
  end if;

  if v_id is not null then
    update public.notification_actors set actor_id = auth.uid() where notification_id = v_id;
    return;
  end if;

  insert into public.notifications (recipient_id, type, post_id)
  values (p_recipient_id, p_type, p_post_id)
  returning id into v_id;
  insert into public.notification_actors (notification_id, actor_id) values (v_id, auth.uid());
end;
$$;

-- The list now also returns each notification's count.
drop function if exists public.fetch_my_notifications(integer, timestamptz);
create or replace function public.fetch_my_notifications(p_limit integer default 30, p_before timestamptz default null)
returns table (
  id uuid, type text, created_at timestamptz, read_at timestamptz, count integer,
  actor_id uuid, actor_name text, actor_avatar_url text, actor_username text,
  actor_is_owner boolean, actor_is_admin boolean, actor_is_host boolean, actor_is_verified_client boolean,
  post_id uuid, post_body text
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
