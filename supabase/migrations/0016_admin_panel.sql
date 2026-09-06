-- Velora — a real platform admin role.
--
-- Until now "admin" work only ever meant flipping a row directly in the
-- database — that's literally called out in migration 0006's own comment
-- ("There is no admin/review UI in this app... status honestly stays
-- 'pending' until someone flips it directly"). This migration adds the
-- one thing every admin-facing policy below needs: a trustworthy way to
-- ask "is the calling user an admin?", plus the visibility/actions an
-- admin dashboard actually needs — reviewing verifications, seeing every
-- booking and every car (including drafts other hosts can't see), and
-- cancelling a booking or pulling a listing when a dispute needs it.
--
-- profiles.is_admin follows the exact same bootstrap story is_host
-- already has in this project: there's no self-serve "become an admin"
-- flow, on purpose. The first (and any later) admin is made by running
--   update public.profiles set is_admin = true where id = '<user-uuid>';
-- once, by hand, in the Supabase SQL editor — see the trigger below for
-- why that's the *only* way it can ever be set.

alter table public.profiles
  add column is_admin boolean not null default false;

-- Mirrors lock_verification_status_update's approach: a client can send
-- whatever it wants in an update payload, but is_admin always comes back
-- out as whatever it already was. This is what actually makes "no
-- self-serve admin" true — without it, the existing "Users can update
-- own profile" policy (using (auth.uid() = id), no column restriction)
-- would let anyone PATCH their own is_admin to true.
create or replace function public.lock_is_admin_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.is_admin := old.is_admin;
  return new;
end;
$$;

create trigger profiles_lock_is_admin_update
  before update on public.profiles
  for each row execute procedure public.lock_is_admin_update();

-- SECURITY DEFINER + reading profiles directly (not through a policy) is
-- what lets this be used safely *inside other tables' policies* without
-- the recursive-RLS gotcha already flagged elsewhere in this schema (see
-- is_conversation_participant in migration 0001) — and, separately, it's
-- also safe to use inside a policy *on profiles itself*, which a plain
-- `exists (select 1 from profiles where ...)` policy body would not be.
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = uid), false);
$$;

grant execute on function public.is_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- cars — admins can see every listing (including other hosts' drafts,
-- which "Published cars are viewable by everyone" deliberately hides)
-- and can update any car, which is what pulling a listing needs.
-- ---------------------------------------------------------------------
create policy "Admins view all cars"
  on public.cars for select
  using (public.is_admin());

create policy "Admins update all cars"
  on public.cars for update
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- bookings — same idea: full visibility and the ability to cancel any
-- booking, for dispute resolution.
-- ---------------------------------------------------------------------
create policy "Admins view all bookings"
  on public.bookings for select
  using (public.is_admin());

create policy "Admins update all bookings"
  on public.bookings for update
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- verifications — this is the actual gap migration 0006 flagged. The
-- existing lock_verification_status_update trigger unconditionally reset
-- status back to old.status on every update; it's redefined here (same
-- function name, so the existing trigger picks this up automatically —
-- no need to touch the trigger itself) to allow the status transition
-- only when the caller is an admin, and to stamp reviewed_at at the same
-- time. A non-admin's own update (resubmitting documents) still can't
-- move status, exactly as before.
-- ---------------------------------------------------------------------
create policy "Admins view all verifications"
  on public.verifications for select
  using (public.is_admin());

create policy "Admins update all verifications"
  on public.verifications for update
  using (public.is_admin());

create or replace function public.lock_verification_status_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if public.is_admin() and new.status is distinct from old.status then
    new.reviewed_at := now();
  else
    new.status := old.status;
    new.reviewed_at := old.reviewed_at;
  end if;
  return new;
end;
$$;
