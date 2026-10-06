-- Lets the Owner and admins mark contact-guard flags as handled.
-- Only these two columns are writable; the flagged text itself is not.
alter table public.contact_guard_flags
  add column if not exists handled_at timestamptz,
  add column if not exists handled_by uuid;

create index if not exists contact_guard_flags_open_idx
  on public.contact_guard_flags (created_at desc)
  where handled_at is null;

revoke update on public.contact_guard_flags from anon, authenticated;
grant update (handled_at, handled_by) on public.contact_guard_flags to authenticated;

drop policy if exists "Owner and admins mark contact flags handled" on public.contact_guard_flags;
create policy "Owner and admins mark contact flags handled"
  on public.contact_guard_flags for update
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.is_owner or p.is_admin)
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.is_owner or p.is_admin)
  ));
