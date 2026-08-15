-- Velora — real digital check-in (identity verification + rental
-- agreement e-sign) and vehicle inspection photos.
--
-- Verification: the client can submit/resubmit documents at any time, but
-- can never set its own approval status — two triggers lock `status` to
-- 'pending' on insert and to its previous value on update, mirroring the
-- "server always computes trust-sensitive fields" pattern already used by
-- prepare_booking/prepare_booking_extra. There is no admin/review UI in
-- this app, so status honestly stays 'pending' until someone flips it
-- directly in the database — the same bootstrapping approach already used
-- to set profiles.is_host on the seeded hosts.
--
-- Rental agreement: agreement_accepted_at is a plain column the renter
-- sets directly on e-sign — the same trust level as protection_addon,
-- which the client already sets at booking time. The existing "Renters or
-- hosts update relevant bookings" policy already covers writing to it.
--
-- Inspection photos: no approval step needed — just structured before/
-- after evidence tied to a booking, scoped to that booking's renter/host.

create table public.verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  licence_photo_path text,
  selfie_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.verifications enable row level security;

create policy "Users manage their own verification"
  on public.verifications for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.lock_verification_status_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.status := 'pending';
  return new;
end;
$$;

create trigger verifications_lock_status_insert
  before insert on public.verifications
  for each row execute procedure public.lock_verification_status_insert();

create or replace function public.lock_verification_status_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.status := old.status;
  return new;
end;
$$;

create trigger verifications_lock_status_update
  before update on public.verifications
  for each row execute procedure public.lock_verification_status_update();

alter table public.bookings
  add column agreement_accepted_at timestamptz;

create table public.booking_inspections (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  phase text not null check (phase in ('pre', 'post')),
  angle text not null check (angle in ('front', 'rear', 'left', 'right', 'interior', 'dashboard', 'fuel')),
  photo_path text not null,
  uploaded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (booking_id, phase, angle)
);

alter table public.booking_inspections enable row level security;

create policy "Renter and host view their booking inspections"
  on public.booking_inspections for select
  using (exists (
    select 1 from public.bookings b
    where b.id = booking_inspections.booking_id
      and (b.renter_id = auth.uid() or b.host_id = auth.uid())
  ));

create policy "Renter or host add inspection photos for their booking"
  on public.booking_inspections for insert
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_inspections.booking_id
        and (b.renter_id = auth.uid() or b.host_id = auth.uid())
    )
  );

create policy "Renter or host update inspection photos for their booking"
  on public.booking_inspections for update
  using (exists (
    select 1 from public.bookings b
    where b.id = booking_inspections.booking_id
      and (b.renter_id = auth.uid() or b.host_id = auth.uid())
  ));

-- Storage buckets: both private (public: false) — ID documents are
-- sensitive, inspection photos are booking-scoped. Signed URLs are used
-- to display either.
insert into storage.buckets (id, name, public)
values ('verification-documents', 'verification-documents', false),
       ('inspection-photos', 'inspection-photos', false)
on conflict (id) do nothing;

create policy "Users manage their own verification documents"
  on storage.objects for all
  using (bucket_id = 'verification-documents' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'verification-documents' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Renter and host manage inspection photos for their booking"
  on storage.objects for all
  using (
    bucket_id = 'inspection-photos'
    and exists (
      select 1 from public.bookings b
      where b.id::text = (storage.foldername(name))[1]
        and (b.renter_id = auth.uid() or b.host_id = auth.uid())
    )
  )
  with check (
    bucket_id = 'inspection-photos'
    and exists (
      select 1 from public.bookings b
      where b.id::text = (storage.foldername(name))[1]
        and (b.renter_id = auth.uid() or b.host_id = auth.uid())
    )
  );
