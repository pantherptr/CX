-- Owner messaging identity — lets the Owner send under either their real
-- Owner identity or an "Owner Assistant" (support) identity, with the
-- recipient always able to see which one sent a given message.
--
-- Deliberately a column on `messages`, not on `profiles`: the Owner
-- switches identity per message, not permanently, so "which identity"
-- has to be recorded per row, not per account.
alter table public.messages
  add column sender_role text check (sender_role is null or sender_role in ('owner', 'owner_assistant'));

-- Only the real check that matters — a client could send any sender_role
-- value it wants in the request payload, so the same "server re-checks
-- the database's own row" pattern used everywhere else in this schema
-- applies here too: a non-owner's insert with a non-null sender_role is
-- rejected outright, not just hidden by the UI.
drop policy "Participants can send messages" on public.messages;
create policy "Participants can send messages"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and public.is_conversation_participant(conversation_id, auth.uid())
    and (sender_role is null or public.is_owner())
  );
