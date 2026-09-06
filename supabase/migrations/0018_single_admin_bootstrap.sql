-- Velora — designate exactly one, hardcoded platform administrator.
--
-- This is a deliberate, explicit, server-side-only grant. It is NOT based
-- on email domain, sign-in provider (Google or otherwise), "first user
-- registered", host status, or anything a client could ever influence —
-- it checks one exact, hardcoded email address, in Postgres, on the
-- server. There is still no self-serve "become an admin" path; this is
-- the same one-time, by-hand bootstrap philosophy migration 0016 already
-- established for is_admin, just automated for this one specific address
-- instead of requiring a manual `update ... set is_admin = true` in the
-- SQL editor.
--
-- To ever change who the admin is: edit the email literal below in a new
-- migration. There is intentionally no UI, API, or column anywhere that
-- can change it.

-- ---------------------------------------------------------------------
-- 1. Auto-grant at profile-creation time, for this exact email only.
--    Covers a brand-new sign-up (Google or email/password) matching this
--    address, on any environment this migration is applied to.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    lower(new.email) = lower('pantherptrbusiness@gmail.com')
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. One-time backfill, for the case where that account already exists
--    (signed up before this migration ran). Also strips is_admin from
--    anyone else who might already have it by hand, so applying this
--    migration always converges the table to exactly the intended state.
--
--    profiles_lock_is_admin_update (migration 0016) would normally
--    overwrite is_admin back to its old value on every UPDATE — that's
--    exactly what stops a client from ever doing this, but it would also
--    block this migration's own legitimate one-time correction, so it's
--    disabled for the duration of this single statement only.
-- ---------------------------------------------------------------------
alter table public.profiles disable trigger profiles_lock_is_admin_update;

update public.profiles p
set is_admin = (lower(u.email) = lower('pantherptrbusiness@gmail.com'))
from auth.users u
where p.id = u.id
  and p.is_admin is distinct from (lower(u.email) = lower('pantherptrbusiness@gmail.com'));

alter table public.profiles enable trigger profiles_lock_is_admin_update;

-- ---------------------------------------------------------------------
-- 3. Hard database-level invariant: at most one row can ever have
--    is_admin = true, full stop. This is enforced independently of the
--    trigger above and of any application code — even a mistaken manual
--    `update profiles set is_admin = true` for a second account in the
--    SQL editor would be rejected outright by this constraint, rather
--    than silently creating a second admin.
-- ---------------------------------------------------------------------
create unique index if not exists profiles_single_admin
  on public.profiles (is_admin)
  where is_admin;
