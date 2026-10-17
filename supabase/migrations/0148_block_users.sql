-- 0148 · Block a person.
--
--  * user_blocks: who blocked whom. Nobody reads or writes it directly: the functions below do.
--  * Blocking hides your normal chats with that person (like deleting them) and stops messages both ways: the trigger
--    on messages refuses an insert when either side of the conversation has blocked the sender (or the sender has
--    blocked them). The other person is not told that they are blocked: their message just fails to send.
--  * The CX team (Owner / Admins) cannot be blocked: that is how a person always reaches support.
-- Run this in the Supabase SQL Editor. Until it is run the app behaves exactly as before (blocking reports an error).

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from anon, authenticated;

create or replace function public.block_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  if p_user is null or p_user = auth.uid() then raise exception 'You cannot block yourself.'; end if;
  if exists (select 1 from public.profiles where id = p_user and (is_owner or is_admin)) then
    raise exception 'You cannot block the CX team.';
  end if;
  insert into public.user_blocks (blocker_id, blocked_id) values (auth.uid(), p_user) on conflict do nothing;
  -- their normal chats with me leave my list (history cleared on my side, as when deleting a chat)
  update public.conversation_participants me
     set hidden_at = now()
   where me.user_id = auth.uid()
     and me.conversation_id in (
       select o.conversation_id
         from public.conversation_participants o
         join public.conversations c on c.id = o.conversation_id
        where o.user_id = p_user and c.kind = 'chat'
     );
end;
$$;

create or replace function public.unblock_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  delete from public.user_blocks where blocker_id = auth.uid() and blocked_id = p_user;
end;
$$;

create or replace function public.my_blocked_users()
returns table (id uuid, full_name text, avatar_url text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.avatar_url, b.created_at
    from public.user_blocks b
    join public.profiles p on p.id = b.blocked_id
   where b.blocker_id = auth.uid()
   order by b.created_at desc;
$$;

-- nobody writes into a closed conversation or a notice, and nobody writes across a block (replaces the 0131 version)
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
  if v_kind = 'chat' and exists (
    select 1
      from public.conversation_participants p
      join public.user_blocks b
        on (b.blocker_id = p.user_id and b.blocked_id = new.sender_id)
        or (b.blocker_id = new.sender_id and b.blocked_id = p.user_id)
     where p.conversation_id = new.conversation_id and p.user_id <> new.sender_id
  ) then
    raise exception 'You can''t send messages to this person.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.block_user(uuid), public.unblock_user(uuid), public.my_blocked_users() from public, anon;
grant execute on function public.block_user(uuid), public.unblock_user(uuid), public.my_blocked_users() to authenticated;
