-- 0143 · Cases for Owner / Admin: every support conversation (a problem opened from X), listed with the written
-- problem, and a way for an admin to join one to answer it.
-- Run this in the Supabase SQL Editor. Until it is run, the Cases tab shows only what the account can already read.

-- ------------------------------------------------------------ the list
create or replace function public.admin_support_cases(p_limit integer default 80)
returns table (
  id uuid,
  created_at timestamptz,
  closed_at timestamptz,
  customer_id uuid,
  customer_name text,
  problem text,
  message_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_owner or p.is_admin)) then
    raise exception 'Not allowed.';
  end if;
  return query
  select
    c.id,
    c.created_at,
    c.closed_at,
    cu.id,
    coalesce(nullif(cu.full_name, ''), 'Customer'),
    coalesce(
      (select regexp_replace(m.body, '^\[\[case\]\]', '')
         from public.messages m
        where m.conversation_id = c.id
        order by (m.body like '[[case]]%') desc, m.created_at asc
        limit 1),
      ''),
    (select count(*)::integer from public.messages m2 where m2.conversation_id = c.id)
  from public.conversations c
  left join lateral (
    select pr.id, pr.full_name
      from public.conversation_participants cp
      join public.profiles pr on pr.id = cp.user_id
     where cp.conversation_id = c.id and not pr.is_owner and not pr.is_admin
     order by cp.user_id
     limit 1
  ) cu on true
  where c.kind = 'support'
  order by (c.closed_at is null) desc, c.created_at desc
  limit greatest(1, least(p_limit, 200));
end;
$$;

grant execute on function public.admin_support_cases(integer) to authenticated;

-- ------------------------------------------------------------ an admin joins a case to answer it
create or replace function public.admin_join_case(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_owner or p.is_admin)) then
    raise exception 'Not allowed.';
  end if;
  if not exists (select 1 from public.conversations c where c.id = p_conversation and c.kind = 'support') then
    raise exception 'Not a support case.';
  end if;
  insert into public.conversation_participants (conversation_id, user_id)
  select p_conversation, auth.uid()
  where not exists (
    select 1 from public.conversation_participants x
     where x.conversation_id = p_conversation and x.user_id = auth.uid()
  );
end;
$$;

grant execute on function public.admin_join_case(uuid) to authenticated;
