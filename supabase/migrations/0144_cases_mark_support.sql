-- 0144 · A written problem always makes its conversation a support case.
-- A case sent into an older chat with the CX team (created before 0131, so kind 'chat') was invisible in
-- Admin → Cases and could not be closed as a case. From now on a '[[case]]' message marks its conversation
-- as 'support', and the ones that already have one are marked too.
-- Run this in the Supabase SQL Editor.

update public.conversations c
   set kind = 'support'
 where c.kind = 'chat'
   and exists (select 1 from public.messages m where m.conversation_id = c.id and m.body like '[[case]]%');

create or replace function public.mark_case_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.body like '[[case]]%' then
    update public.conversations set kind = 'support' where id = new.conversation_id and kind = 'chat';
  end if;
  return new;
end;
$$;

drop trigger if exists mark_case_conversation on public.messages;
create trigger mark_case_conversation
  after insert on public.messages
  for each row execute function public.mark_case_conversation();
