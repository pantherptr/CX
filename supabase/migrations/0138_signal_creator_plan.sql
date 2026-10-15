-- SIGNAL plan, step one: who is a Creator. Nothing is limited yet and nothing is charged: this only records
-- the plan, lets Owner / Admin grant it by hand, and lets the app show the grey Creator badge.
--
--   profiles.signal_plan        'free' (default) | 'creator'
--   signal_plan_config          the limits for the free plan, with an `enforce` switch that stays OFF
--   has_creator_access(uid)     creator plan, or host, or Owner / Admin (hosts get Creator included)
--   admin_set_signal_plan()     Owner / Admin grant or remove the plan
--   get_creator_ids(ids)        which of these people wear the Creator badge (public information)

alter table public.profiles add column if not exists signal_plan text not null default 'free';
alter table public.profiles add column if not exists signal_plan_since timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_signal_plan_check') then
    alter table public.profiles add constraint profiles_signal_plan_check check (signal_plan in ('free', 'creator'));
  end if;
end $$;

-- One row. `enforce` is false: the numbers are written down, not applied.
create table if not exists public.signal_plan_config (
  id boolean primary key default true check (id),
  enforce boolean not null default false,
  free_video_max_seconds integer not null default 180,
  free_videos_per_month integer not null default 10
);
insert into public.signal_plan_config (id) values (true) on conflict (id) do nothing;
alter table public.signal_plan_config enable row level security;
drop policy if exists "Signed-in read plan config" on public.signal_plan_config;
create policy "Signed-in read plan config" on public.signal_plan_config for select using (auth.uid() is not null);

create or replace function public.has_creator_access(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.signal_plan = 'creator' or p.is_host or p.is_owner or p.is_admin
    from public.profiles p where p.id = p_user
  ), false);
$$;
grant execute on function public.has_creator_access(uuid) to authenticated;

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
end;
$$;
revoke all on function public.admin_set_signal_plan(uuid, text) from public;
revoke all on function public.admin_set_signal_plan(uuid, text) from anon;
grant execute on function public.admin_set_signal_plan(uuid, text) to authenticated;

-- The badge is for people on the Creator plan who are not already marked as host / team (those keep their own).
create or replace function public.get_creator_ids(p_ids uuid[])
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.id = any (p_ids) and p.signal_plan = 'creator' and not p.is_host and not p.is_owner and not p.is_admin;
$$;
revoke all on function public.get_creator_ids(uuid[]) from public;
revoke all on function public.get_creator_ids(uuid[]) from anon;
grant execute on function public.get_creator_ids(uuid[]) to authenticated;
