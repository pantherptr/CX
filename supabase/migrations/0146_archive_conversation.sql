-- 0146 · Archive a chat (for you only).
--
--  * conversation_participants.archived_at: an archived chat leaves the main list and sits in "Archive". It STAYS there
--    when new messages arrive (the Archive tab shows a dot instead), until you restore it.
--  * Normal chats (kind 'chat') and support cases the team has already closed can be archived; open cases and CX
--    notices stay in view.
-- Run this in the Supabase SQL Editor. Until it is run the app behaves exactly as before (no Archive tab).

alter table public.conversation_participants add column if not exists archived_at timestamptz;

create or replace function public.set_conversation_archived(p_conversation uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_closed timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation and user_id = auth.uid()
  ) then
    raise exception 'Not allowed.';
  end if;
  select kind, closed_at into v_kind, v_closed from public.conversations where id = p_conversation;
  if not (v_kind = 'chat' or (v_kind = 'support' and v_closed is not null)) then
    raise exception 'This conversation cannot be archived.';
  end if;
  update public.conversation_participants
     set archived_at = case when p_archived then now() else null end
   where conversation_id = p_conversation and user_id = auth.uid();
end;
$$;

revoke all on function public.set_conversation_archived(uuid, boolean) from public, anon;
grant execute on function public.set_conversation_archived(uuid, boolean) to authenticated;
