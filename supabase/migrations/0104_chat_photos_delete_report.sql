-- Chat: photos in messages, deleting your own message, reporting a user.
--
-- * messages.media_path     — a photo attached to a message (private bucket `chat-media`,
--                             read through signed URLs, only by the conversation's participants).
-- * messages.deleted_at     — "message deleted" tombstone: body and photo are wiped, the row stays
--                             so the thread keeps its shape and read/unread counts stay right.
-- * delete_my_message()     — the only way to change a message's content; senders only.
-- * chat_reports            — reports of a user/message, read by the Owner and admins.
--
-- The app keeps working before this is run (photos / delete / report just stay hidden).

alter table public.messages add column if not exists media_path text;
alter table public.messages add column if not exists deleted_at timestamptz;

-- A photo must live inside its own conversation's folder.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'messages_media_in_conversation') then
    alter table public.messages
      add constraint messages_media_in_conversation
      check (media_path is null or media_path like conversation_id::text || '/%');
  end if;
end $$;

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Chat participants upload photos" on storage.objects;
create policy "Chat participants upload photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and public.is_conversation_participant(((storage.foldername(name))[1])::uuid, auth.uid())
  );

drop policy if exists "Chat participants read photos" on storage.objects;
create policy "Chat participants read photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-media'
    and public.is_conversation_participant(((storage.foldername(name))[1])::uuid, auth.uid())
  );

drop policy if exists "Chat senders delete own photos" on storage.objects;
create policy "Chat senders delete own photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media' and owner = auth.uid());

-- ---------------------------------------------------------------- edits
-- The existing "participants can mark messages read" policy lets any participant UPDATE a row.
-- Lock everything except read_at: content only changes through delete_my_message().
create or replace function public.guard_message_update()
returns trigger
language plpgsql
as $$
begin
  if (new.body is distinct from old.body
      or new.sender_id is distinct from old.sender_id
      or new.conversation_id is distinct from old.conversation_id
      or new.created_at is distinct from old.created_at
      or new.media_path is distinct from old.media_path
      or new.deleted_at is distinct from old.deleted_at
      or new.sender_role is distinct from old.sender_role)
     and coalesce(current_setting('cx.msg_delete', true), '') <> 'on' then
    raise exception 'Messages can only be marked read or deleted by their sender';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_guard_update on public.messages;
create trigger messages_guard_update
  before update on public.messages
  for each row execute function public.guard_message_update();

-- Deletes the caller's own message (tombstone). Returns the photo path so the client can remove the
-- file from storage.
create or replace function public.delete_my_message(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
begin
  select media_path into v_path from public.messages where id = p_id and sender_id = auth.uid() and deleted_at is null;
  if not found then
    raise exception 'Message not found';
  end if;
  perform set_config('cx.msg_delete', 'on', true);
  update public.messages set body = '', media_path = null, deleted_at = now() where id = p_id;
  return v_path;
end;
$$;

revoke all on function public.delete_my_message(uuid) from public;
grant execute on function public.delete_my_message(uuid) to authenticated;

-- ---------------------------------------------------------------- reports
create table if not exists public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  message_id uuid references public.messages (id) on delete set null,
  reason text not null default '',
  status text not null default 'open'
);
alter table public.chat_reports enable row level security;

drop policy if exists "Owner and admins read chat reports" on public.chat_reports;
create policy "Owner and admins read chat reports"
  on public.chat_reports for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_owner or p.is_admin)));

drop policy if exists "Owner and admins update chat reports" on public.chat_reports;
create policy "Owner and admins update chat reports"
  on public.chat_reports for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_owner or p.is_admin)));

create or replace function public.report_chat_user(p_conversation_id uuid, p_message_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other uuid;
begin
  if not public.is_conversation_participant(p_conversation_id, auth.uid()) then
    raise exception 'Not part of this conversation';
  end if;
  select user_id into v_other
    from public.conversation_participants
    where conversation_id = p_conversation_id and user_id <> auth.uid()
    limit 1;
  if v_other is null then
    raise exception 'Nobody to report';
  end if;
  insert into public.chat_reports (reporter_id, reported_id, conversation_id, message_id, reason)
  values (auth.uid(), v_other, p_conversation_id, p_message_id, left(coalesce(p_reason, ''), 500));
end;
$$;

revoke all on function public.report_chat_user(uuid, uuid, text) from public;
grant execute on function public.report_chat_user(uuid, uuid, text) to authenticated;
