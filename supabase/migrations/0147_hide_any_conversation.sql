-- 0147 · Delete / archive ANY of your conversations, including the ones with the CX team.
--
-- 0145 and 0146 only allowed normal chats (and closed cases for archive). Now support cases and CX notices can be
-- deleted or archived too — still only for you: the other side keeps its copy, a case stays open for the team, and a
-- new message brings a deleted conversation back holding only the new messages.
-- Run this in the Supabase SQL Editor.

create or replace function public.hide_conversation(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
  update public.conversation_participants
     set hidden_at = now()
   where conversation_id = p_conversation and user_id = auth.uid();
end;
$$;

create or replace function public.set_conversation_archived(p_conversation uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
  update public.conversation_participants
     set archived_at = case when p_archived then now() else null end
   where conversation_id = p_conversation and user_id = auth.uid();
end;
$$;

revoke all on function public.hide_conversation(uuid) from public, anon;
revoke all on function public.set_conversation_archived(uuid, boolean) from public, anon;
grant execute on function public.hide_conversation(uuid) to authenticated;
grant execute on function public.set_conversation_archived(uuid, boolean) to authenticated;
