-- Real reports/complaints — the one piece of the Owner Control Center
-- that genuinely didn't exist anywhere in the product before now (there
-- was no report affordance on a listing, a message, anything). Scoped to
-- car listings for this first version — CarDetails.tsx is the one place
-- this ships a real "Report this listing" action; anyone signed in can
-- file one, only the Owner can see or resolve the queue.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  car_id uuid references public.cars (id) on delete cascade,
  reason text not null,
  message text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index reports_status_idx on public.reports (status);

alter table public.reports enable row level security;

-- Filing a report never reveals whether the queue itself is readable —
-- same principle as every other write-only-for-non-privileged-users
-- policy in this schema.
create policy "Signed-in users can file a report"
  on public.reports for insert
  with check (auth.uid() = reporter_id);

create policy "Owner can view all reports"
  on public.reports for select
  using (public.is_owner());

create policy "Owner can resolve reports"
  on public.reports for update
  using (public.is_owner());
