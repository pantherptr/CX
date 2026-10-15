-- "I want to be a Creator": until payments are switched on, a member asks from the SIGNAL Creator page and the
-- team (Owner / Admins) gets a notice in their inbox; granting the plan from Admin → Users closes the request.
--
--   creator_requests          one open request per person
--   request_creator()         the member asks (once; asking again changes nothing)
--   admin_set_signal_plan()   (replaces 0138's) also closes the request when the plan is granted

create table if not exists public.creator_requests (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.creator_requests enable row level security;

drop policy if exists "Members see their own Creator request" on public.creator_requests;
create policy "Members see their own Creator request"
  on public.creator_requests for select using (user_id = (select auth.uid()));
drop policy if exists "Team sees Creator requests" on public.creator_requests;
create policy "Team sees Creator requests"
  on public.creator_requests for select
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and (p.is_owner or p.is_admin)));
-- no insert / update / delete policies: request_creator() and admin_set_signal_plan() are the only writers.

create or replace function public.request_creator()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_name text;
  v_new boolean := false;
  r record;
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  if public.has_creator_access(v_me) then return false; end if;

  insert into public.creator_requests (user_id) values (v_me) on conflict (user_id) do nothing;
  get diagnostics v_new = row_count;
  if not v_new then return false; end if; -- already asked: nothing more to send

  select coalesce(nullif(btrim(full_name), ''), 'A member') into v_name from public.profiles where id = v_me;
  for r in select id from public.profiles where is_owner or is_admin loop
    perform public.create_app_notification(r.id, 'creator_request', 'Creator request', v_name || ' would like the Creator plan.', '/admin#users');
  end loop;
  return true;
end;
$$;
revoke all on function public.request_creator() from public;
revoke all on function public.request_creator() from anon;
grant execute on function public.request_creator() to authenticated;

create or replace function public.admin_set_signal_plan(p_user_id uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.profiles where id = auth.uid() and (is_owner or is_admin)) then
    raise exception 'Not allowed';
  end if;
  if p_plan not in ('free', 'creator') then raise exception 'Unknown plan'; end if;
  update public.profiles
  set signal_plan = p_plan,
      signal_plan_since = case when p_plan = 'creator' then now() else null end
  where id = p_user_id;
  if p_plan = 'creator' then
    delete from public.creator_requests where user_id = p_user_id;
  end if;
end;
$$;
revoke all on function public.admin_set_signal_plan(uuid, text) from public;
revoke all on function public.admin_set_signal_plan(uuid, text) from anon;
grant execute on function public.admin_set_signal_plan(uuid, text) to authenticated;
