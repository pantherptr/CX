-- 0127 · bookings: one permissive policy per command (advisor "Multiple Permissive Policies")
--
-- bookings had two SELECT and two UPDATE policies (0001 renter/host, 0016 admin). Postgres ORs them,
-- but evaluates every one on every query. Merging them into one policy per command gives exactly the
-- same access: renter, host or admin. INSERT already had a single policy and is left alone.
--
-- Runs as one script (one transaction): if anything fails nothing changes. Safe to run twice.

drop policy if exists "Renters and hosts view relevant bookings"   on public.bookings;
drop policy if exists "Admins view all bookings"                   on public.bookings;
drop policy if exists "Renters or hosts update relevant bookings"  on public.bookings;
drop policy if exists "Admins update all bookings"                 on public.bookings;
drop policy if exists "Bookings select (renter, host, admin)"      on public.bookings;
drop policy if exists "Bookings update (renter, host, admin)"      on public.bookings;

create policy "Bookings select (renter, host, admin)"
  on public.bookings for select
  using (
    (select auth.uid()) = renter_id
    or (select auth.uid()) = host_id
    or (select public.is_admin())
  );

create policy "Bookings update (renter, host, admin)"
  on public.bookings for update
  using (
    (select auth.uid()) = renter_id
    or (select auth.uid()) = host_id
    or (select public.is_admin())
  );
