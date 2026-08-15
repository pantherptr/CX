-- CX — enable Realtime for the messages table so an open conversation
-- thread receives new messages live. The conversations/
-- conversation_participants/messages tables and their RLS have existed
-- since 0001_init.sql but were never wired up on the frontend; this is
-- the one piece of that schema not already in place.

alter publication supabase_realtime add table public.messages;
