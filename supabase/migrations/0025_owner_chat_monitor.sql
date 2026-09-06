-- Owner Chat Monitor — full platform-wide visibility into every
-- conversation, plus real moderation states (pause/block/close) that
-- actually stop messages from flowing, not just a label in a UI.

-- ---------------------------------------------------------------------
-- 1. Conversation moderation state.
-- ---------------------------------------------------------------------
alter table public.conversations
  add column status text not null default 'active' check (status in ('active', 'paused', 'blocked', 'closed')),
  add column status_changed_by uuid references public.profiles (id) on delete set null,
  add column status_changed_at timestamptz;

-- ---------------------------------------------------------------------
-- 2. Owner sees everything — every conversation, every participant row,
--    every message, regardless of whether they're one of the two
--    original participants. Mirrors the "Admins view all ..." pattern
--    from migration 0016, scoped to is_owner() since this is
--    conversation *content*, a step beyond what plain Admin sees
--    elsewhere in this schema.
-- ---------------------------------------------------------------------
create policy "Owner can view all conversations"
  on public.conversations for select
  using (public.is_owner());

create policy "Owner can update any conversation"
  on public.conversations for update
  using (public.is_owner());

create policy "Owner can view all conversation participants"
  on public.conversation_participants for select
  using (public.is_owner());

create policy "Owner can view all messages"
  on public.messages for select
  using (public.is_owner());

-- ---------------------------------------------------------------------
-- 3. Messages only flow through an 'active' conversation for its
--    ordinary participants — paused/blocked/closed genuinely stops them,
--    not just hides a button in the UI. The Owner is exempt: "Intervene"
--    means being able to post into a conversation regardless of its
--    status (that's the whole point of stepping into a paused or blocked
--    thread), always under their own sender_role, never a silent
--    participant.
-- ---------------------------------------------------------------------
drop policy "Participants can send messages" on public.messages;
create policy "Participants can send messages"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and (
      public.is_owner()
      or (
        sender_role is null
        and public.is_conversation_participant(conversation_id, auth.uid())
        and exists (select 1 from public.conversations c where c.id = conversation_id and c.status = 'active')
      )
    )
  );

-- ---------------------------------------------------------------------
-- 4. Reports can now reference a conversation, not just a car listing —
--    "Report" from inside the Monitor files a real row in the same
--    table CarDetails.tsx's report button already writes to.
-- ---------------------------------------------------------------------
alter table public.reports
  add column conversation_id uuid references public.conversations (id) on delete cascade;
