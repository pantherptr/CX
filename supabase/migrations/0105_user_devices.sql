-- Devices & access: which devices have been signed in to an account, shown in Settings → Security.
-- Purely informational (the auth sessions themselves live in Supabase Auth); "sign out other
-- devices" / "everywhere" are done with the Auth API from the app, which also clears these rows.

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  label text not null default 'Unknown device',
  platform text not null default 'web',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (user_id, device_id)
);

alter table public.user_devices enable row level security;

drop policy if exists "Users read their own devices" on public.user_devices;
create policy "Users read their own devices"
  on public.user_devices for select
  using (auth.uid() = user_id);
-- No insert/update/delete policies: written only by the functions below.

create or replace function public.touch_device(p_device_id text, p_label text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  insert into public.user_devices (user_id, device_id, label, platform)
  values (auth.uid(), left(p_device_id, 64), left(coalesce(nullif(p_label, ''), 'Unknown device'), 80), left(coalesce(p_platform, 'web'), 16))
  on conflict (user_id, device_id)
  do update set last_seen = now(), label = excluded.label, platform = excluded.platform;

  -- keep the list short: the 12 most recently used devices
  delete from public.user_devices
  where user_id = auth.uid()
    and id not in (
      select id from public.user_devices where user_id = auth.uid() order by last_seen desc limit 12
    );
end;
$$;

create or replace function public.forget_other_devices(p_keep_device_id text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.user_devices where user_id = auth.uid() and device_id <> p_keep_device_id;
$$;

create or replace function public.forget_all_devices()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.user_devices where user_id = auth.uid();
$$;

revoke all on function public.touch_device(text, text, text) from public;
revoke all on function public.forget_other_devices(text) from public;
revoke all on function public.forget_all_devices() from public;
grant execute on function public.touch_device(text, text, text) to authenticated;
grant execute on function public.forget_other_devices(text) to authenticated;
grant execute on function public.forget_all_devices() to authenticated;
