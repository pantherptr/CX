-- Notifications currently show only the actor's name and avatar — no
-- username, no verification badge, so an Owner/Admin/Host/Verified
-- Client notification looks identical to a plain client one and can't
-- deep-link to "@username" the way every other SIGNAL surface (posts,
-- comments, search) already does. Threading the same identity columns
-- those surfaces already read gives the notification row the same
-- verification/official-identity legibility, with no new identity system.
--
-- Return-type change (new output columns), so drop-then-recreate per this
-- project's own established pattern for that.
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
    n.actor_id, pr.full_name, pr.avatar_url, pr.username,
    coalesce(pr.is_owner, false), coalesce(pr.is_admin, false),
    coalesce(pr.is_host, false), coalesce(pr.is_verified_client, false),
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
