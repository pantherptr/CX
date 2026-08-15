-- CX — defensive re-creation of the messaging RLS policies.
--
-- Live testing of real messaging (the first time anything ever wrote to
-- these tables) surfaced that `conversations`' INSERT policy doesn't
-- actually exist in this database, even though it's present in
-- 0001_init.sql — most likely a partial paste when 0001 was first run.
-- SELECT on `conversations` works fine (proves the table + RLS + that
-- policy exist), but INSERT fails with 42501 (RLS violation), which is
-- exactly what "policy never created" looks like — Postgres defaults to
-- deny when RLS is enabled and no matching policy exists.
--
-- Every statement here is a drop-if-exists + re-create, so it's safe to
-- run regardless of which of these specifically are already correct.

drop policy if exists "Participants can view their conversations" on public.conversations;
create policy "Participants can view their conversations"
  on public.conversations for select
  using (public.is_conversation_participant(id, auth.uid()));

drop policy if exists "Signed-in users can start conversations" on public.conversations;
create policy "Signed-in users can start conversations"
  on public.conversations for insert
  with check (auth.uid() is not null);

drop policy if exists "Participants can view participant rows" on public.conversation_participants;
create policy "Participants can view participant rows"
  on public.conversation_participants for select
  using (public.is_conversation_participant(conversation_id, auth.uid()));

drop policy if exists "Signed-in users can add participants" on public.conversation_participants;
create policy "Signed-in users can add participants"
  on public.conversation_participants for insert
  with check (auth.uid() is not null);

drop policy if exists "Participants can view messages" on public.messages;
create policy "Participants can view messages"
  on public.messages for select
  using (public.is_conversation_participant(conversation_id, auth.uid()));

drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages"
  on public.messages for insert
  with check (auth.uid() = sender_id and public.is_conversation_participant(conversation_id, auth.uid()));

drop policy if exists "Participants can mark messages read" on public.messages;
create policy "Participants can mark messages read"
  on public.messages for update
  using (public.is_conversation_participant(conversation_id, auth.uid()));
