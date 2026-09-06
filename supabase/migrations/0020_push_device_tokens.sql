-- Push notification device tokens (iOS/APNs) — see api/_lib/push.ts and
-- src/lib/push.ts.
--
-- One row per device token, not per user: the same person can be signed in
-- on more than one device, and re-installing the app (or iOS rotating the
-- token) gets a fresh token that must not collide with the old one still
-- pointing at a device that may no longer have it. `token` itself is the
-- unique key so `upsert` (on conflict token) reassigns a token to whoever
-- currently holds it — including across accounts, if someone logs out and
-- a different person logs in on the same physical device.
create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique,
  platform text not null default 'ios' check (platform in ('ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index device_tokens_user_id_idx on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;

-- No public select policy: a device token is only ever read by
-- api/_lib/push.ts through the service-role key (which bypasses RLS), so a
-- user reading their own tokens back isn't a real need and isn't exposed.
create policy "Users can register their own device tokens"
  on public.device_tokens for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own device tokens"
  on public.device_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can remove their own device tokens"
  on public.device_tokens for delete
  using (auth.uid() = user_id);
