-- 0145 · Delete a normal chat (for you only).
--
--  * conversation_participants.hidden_at: when you delete a chat it disappears from YOUR list and the history up to
--    that moment is cleared for you. The other person keeps their copy. If they write again, the chat comes back
--    holding only the new messages.
--  * Only normal chats (kind 'chat') can be deleted; support cases and CX notices stay.
-- Run this in the Supabase SQL Editor. Until it is run the app behaves exactly as before (the button reports an error).

alter table public.conversation_participants add column if not exists hidden_at timestamptz;

create or replace function public.hide_conversation(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
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
  select kind into v_kind from public.conversations where id = p_conversation;
  if v_kind is distinct from 'chat' then
    raise exception 'Only normal chats can be deleted.';
  end if;
  update public.conversation_participants
     set hidden_at = now()
   where conversation_id = p_conversation and user_id = auth.uid();
end;
$$;

revoke all on function public.hide_conversation(uuid) from public, anon;
grant execute on function public.hide_conversation(uuid) to authenticated;
