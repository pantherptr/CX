-- 0131 · Support conversations: one per request, closable, and read-only notices from CX.
--
--  * Every "talk to a person" request is its own conversation (kind 'support'). The team can close it;
--    a closed conversation cannot receive new messages, and the next request starts a fresh one.
--  * Messages the CX team sends on its own (verification decisions…) go to a separate, read-only
--    conversation (kind 'notice'): they show up in Messages but cannot be replied to.
-- Run this in the Supabase SQL Editor. Until it is run the app behaves exactly as before.

alter table public.conversations add column if not exists kind text not null default 'chat';
alter table public.conversations add column if not exists closed_at timestamptz;
alter table public.conversations add column if not exists closed_by uuid references public.profiles (id) on delete set null;

do $$
begin
  alter table public.conversations add constraint conversations_kind_check check (kind in ('chat', 'support', 'notice'));
exception when duplicate_object then null;
end $$;

-- ------------------------------------------------------------ nobody writes into a closed conversation or a notice
create or replace function public.guard_conversation_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_closed timestamptz;
  v_owner uuid;
begin
  select kind, closed_at into v_kind, v_closed from public.conversations where id = new.conversation_id;
  if v_closed is not null then
    raise exception 'This conversation is closed.' using errcode = 'P0001';
  end if;
  if v_kind = 'notice' then
    select id into v_owner from public.profiles where is_owner limit 1;
    if new.sender_id is distinct from v_owner then
      raise exception 'This is a notice from CX: it cannot be replied to.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_conversation_writes on public.messages;
create trigger guard_conversation_writes
  before insert on public.messages
  for each row execute function public.guard_conversation_writes();

-- ------------------------------------------------------------ the team closes a support conversation
create or replace function public.close_support_conversation(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and (is_owner or is_admin)) then
    raise exception 'Not allowed.';
  end if;
  update public.conversations
     set closed_at = now(), closed_by = auth.uid()
   where id = p_conversation and closed_at is null and kind <> 'notice';
end;
$$;

revoke all on function public.close_support_conversation(uuid) from public, anon;
grant execute on function public.close_support_conversation(uuid) to authenticated;

-- ------------------------------------------------------------ CX messages go to the person's notice conversation
create or replace function public.send_cx_message(p_user_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_conv uuid;
begin
  select id into v_owner from public.profiles where is_owner limit 1;
  if v_owner is null or v_owner = p_user_id then
    return;
  end if;

  select c.id into v_conv
    from public.conversations c
    join public.conversation_participants a on a.conversation_id = c.id and a.user_id = v_owner
    join public.conversation_participants b on b.conversation_id = c.id and b.user_id = p_user_id
   where c.kind = 'notice'
   order by c.created_at
   limit 1;

  if v_conv is null then
    insert into public.conversations (car_id, kind) values (null, 'notice') returning id into v_conv;
    insert into public.conversation_participants (conversation_id, user_id) values (v_conv, v_owner), (v_conv, p_user_id);
  end if;

  insert into public.messages (conversation_id, sender_id, body) values (v_conv, v_owner, p_body);
exception when others then
  -- a notification must never fail a review
  return;
end;
$$;

revoke all on function public.send_cx_message(uuid, text) from public;
