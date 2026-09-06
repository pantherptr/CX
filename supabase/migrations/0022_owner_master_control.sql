-- CX Rent — the last real pieces of the Owner Control Center: platform
-- settings (maintenance mode, a site-wide announcement), and the Owner's
-- own private notes/tasks. Both genuinely new capabilities, not present
-- anywhere else in the schema — additive, same is_owner() boundary as
-- migration 0021, nothing here touches an existing table's meaning.

-- ---------------------------------------------------------------------
-- 1. platform_settings — a single row, not a key/value table, because
--    there is exactly one platform to configure. Readable by literally
--    everyone, including signed-out visitors — a maintenance page or
--    announcement banner has to render before anyone has a session.
--    Writable only by the Owner.
-- ---------------------------------------------------------------------
create table public.platform_settings (
  id text primary key default 'main',
  maintenance_mode boolean not null default false,
  maintenance_message text not null default 'CX Rent is briefly down for maintenance. We''ll be back shortly.',
  announcement_active boolean not null default false,
  announcement_message text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint platform_settings_singleton check (id = 'main')
);

insert into public.platform_settings (id) values ('main');

alter table public.platform_settings enable row level security;

create policy "Anyone can read platform settings"
  on public.platform_settings for select
  using (true);

create policy "Owner can update platform settings"
  on public.platform_settings for update
  using (public.is_owner());

-- ---------------------------------------------------------------------
-- 2. owner_notes — a private scratchpad/task list for the Owner only.
--    Not visible to anyone else, including other admins, by RLS.
-- ---------------------------------------------------------------------
create table public.owner_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index owner_notes_owner_id_idx on public.owner_notes (owner_id);

alter table public.owner_notes enable row level security;

create policy "Owner can manage own notes"
  on public.owner_notes for all
  using (public.is_owner() and owner_id = auth.uid())
  with check (public.is_owner() and owner_id = auth.uid());
