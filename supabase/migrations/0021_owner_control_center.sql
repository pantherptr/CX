-- CX Rent — the platform Owner: a tier strictly above Admin, held by
-- exactly one hardcoded account, with real server-side capabilities an
-- ordinary admin doesn't have.
--
-- Deliberately additive, not a rewrite: `is_admin` (migration 0016) keeps
-- meaning exactly what it already means, and every existing admin-gated
-- policy keeps working unchanged. `is_admin()` is redefined below so the
-- Owner automatically satisfies every one of those checks too — the
-- Owner is a superset of Admin, not a parallel, disconnected role. What's
-- new here is `is_owner` itself (a second, independent, single-account
-- invariant using the exact same bootstrap pattern 0018 already
-- established), plus the handful of capabilities that go beyond what
-- Admin's existing view/update-any-row policies cover: suspending a
-- host's account, managing any car's photos, and a real audit trail.
--
-- Same non-negotiable rule as before: no self-serve path exists anywhere
-- to grant is_owner (or is_admin) to any account. Changing who holds
-- either role means editing the hardcoded email literal in a new
-- migration — never a UI, never an API.

-- ---------------------------------------------------------------------
-- 1. New car lifecycle states. 'draft'/'published' already covered
--    "approve" (draft -> published, via the existing adminSetCarStatus).
--    'suspended' is a reversible pull (dispute, quality issue) that keeps
--    the listing and all its history intact but hides it from the public
--    feed exactly like 'draft' does. 'removed' is the Owner's permanent
--    delisting of a car — still never a real SQL DELETE, since
--    bookings.car_id is `on delete cascade` and hard-deleting a car with
--    real trip/payment history would destroy that history along with it.
--    A status change is the only form "remove a vehicle" ever takes here.
-- ---------------------------------------------------------------------
alter type public.car_status add value if not exists 'suspended';
alter type public.car_status add value if not exists 'removed';

-- ---------------------------------------------------------------------
-- 2. profiles.is_owner + profiles.suspended
-- ---------------------------------------------------------------------
alter table public.profiles
  add column is_owner boolean not null default false,
  add column suspended boolean not null default false;

-- Extends the existing is_admin lock (migration 0016) to also cover
-- is_owner (never client-settable, same as is_admin) and suspended
-- (settable, but ONLY by the Owner — a suspended host must not be able
-- to un-suspend themselves by re-saving their own profile, and nobody
-- but the Owner may suspend anyone else's account either).
create or replace function public.lock_is_admin_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.is_admin := old.is_admin;
  new.is_owner := old.is_owner;
  if not public.is_owner() then
    new.suspended := old.suspended;
  end if;
  return new;
end;
$$;

create or replace function public.is_owner(uid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select p.is_owner from public.profiles p where p.id = uid), false);
$$;

grant execute on function public.is_owner(uuid) to authenticated;

-- The Owner passes every existing is_admin()-gated policy automatically —
-- cars, bookings and verifications' "Admins view/update all ..." policies
-- (migration 0016) now cover the Owner with zero duplicated policies.
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select p.is_admin or p.is_owner from public.profiles p where p.id = uid), false);
$$;

-- ---------------------------------------------------------------------
-- 3. Owner can edit any profile — needed to edit a host's bio/contact
--    info and to flip `suspended`. is_admin/is_owner themselves stay
--    locked even from the Owner's own bulk update, via the trigger above.
-- ---------------------------------------------------------------------
create policy "Owner can update any profile"
  on public.profiles for update
  using (public.is_owner());

-- ---------------------------------------------------------------------
-- 4. Owner can manage any car's photos — upload, delete, reorder
--    (car_images.position), replace. Mirrors "Hosts manage own car
--    images" (migration 0001) but scoped to is_admin() (Owner included)
--    instead of ownership.
-- ---------------------------------------------------------------------
create policy "Admins manage all car images"
  on public.car_images for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 5. Real audit trail — every privileged action the Owner Control Center
--    takes (suspend a host, remove a car, cancel a booking, etc.) writes
--    one row here. Only the Owner can ever read or write it.
-- ---------------------------------------------------------------------
create table public.owner_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  target_type text not null,
  target_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index owner_audit_log_created_at_idx on public.owner_audit_log (created_at desc);

alter table public.owner_audit_log enable row level security;

create policy "Owner can view audit log"
  on public.owner_audit_log for select
  using (public.is_owner());

create policy "Owner can write audit log"
  on public.owner_audit_log for insert
  with check (public.is_owner() and actor_id = auth.uid());

-- ---------------------------------------------------------------------
-- 6. Bootstrap — pantherptrbusiness@gmail.com is the Owner. Same
--    three-part pattern as migration 0018: grant at profile-creation
--    time, one-time backfill for the account that already exists, and a
--    hard unique-index invariant so at most one row can ever be Owner.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, is_admin, is_owner)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    lower(new.email) = lower('pantherptrbusiness@gmail.com'),
    lower(new.email) = lower('pantherptrbusiness@gmail.com')
  );
  return new;
end;
$$;

alter table public.profiles disable trigger profiles_lock_is_admin_update;

update public.profiles p
set is_owner = (lower(u.email) = lower('pantherptrbusiness@gmail.com')),
    is_admin = is_admin or (lower(u.email) = lower('pantherptrbusiness@gmail.com'))
from auth.users u
where p.id = u.id
  and p.is_owner is distinct from (lower(u.email) = lower('pantherptrbusiness@gmail.com'));

alter table public.profiles enable trigger profiles_lock_is_admin_update;

create unique index if not exists profiles_single_owner
  on public.profiles (is_owner)
  where is_owner;
