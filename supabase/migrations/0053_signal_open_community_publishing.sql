-- Widens Community publishing from "Owner/Admin, Host, or Verified
-- Client" to "any signed-in user" — a deliberate policy change (explicit
-- instruction, not a bug fix). Every post/Story write RPC already funnels
-- through this one function (create_empire_post, update_empire_post,
-- create_empire_story — see 0048/0052), so widening it here is the
-- single change needed; nothing else to touch.
--
-- No client-side identity work needed either: resolveSignalIdentity's
-- 'self' case (signalIdentity.ts) already falls back to a plain
-- 'client' selfRole/"Client" subtitle when the author is neither a Host
-- nor a Verified Client — built that way from the start, never exercised
-- until now. A plain client is still always forced to publisher_type =
-- 'self' (never one of the three official voices) by the existing
-- non-admin branch in create_empire_post/update_empire_post/
-- create_empire_story, same as a Host or Verified Client today. Vehicle
-- attachment stays effectively Host-only on its own separate check
-- (ownership against `cars.host_id`) — a plain client has no cars to
-- attach regardless of this change.
create or replace function public.can_publish_signal_content(uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select uid is not null;
$$;
grant execute on function public.can_publish_signal_content(uuid) to authenticated;
