-- Host payouts: CX's commission on the host's earnings, and a ledger of what was paid.
--
-- (Run it again if a first attempt stopped half-way: every statement is safe to repeat.)
--
-- Money flow (unchanged): the renter pays CX's own Stripe account; the day after the return the
-- daily sweep (api/send-pickup-reminders.ts) transfers the host's share to their Stripe Express
-- account, and Stripe pays that out to their bank. What is new:
--   * a host commission, kept by CX out of the base rental price (default 5%), kept in
--     platform_settings.host_commission_pct so it can be changed with one UPDATE, no deploy;
--   * booking_payouts: one row per paid booking (gross, commission %, commission, net, transfer),
--     read by the host dashboard so a host sees exactly what they earned and what CX kept.
-- The 12% service fee, protection and delivery fees already charged to the renter stay CX revenue.

-- platform_settings already exists (0022): ONE row, id = 'main'. The commission is one more column
-- on it, so it sits next to the other owner-controlled switches and the same owner-only update
-- policy protects it.
alter table public.platform_settings
  add column if not exists host_commission_pct numeric not null default 5
  check (host_commission_pct >= 0 and host_commission_pct <= 50);

-- What hosts are told (the number only).
create or replace function public.fetch_host_commission_pct()
returns numeric
language sql stable security definer set search_path = public
as $$
  select coalesce((select host_commission_pct from public.platform_settings where id = 'main'), 0);
$$;
grant execute on function public.fetch_host_commission_pct() to authenticated;

create table if not exists public.booking_payouts (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  gross numeric not null,
  commission_pct numeric not null,
  commission numeric not null,
  net numeric not null,
  stripe_transfer_id text,
  paid_at timestamptz not null default now()
);
create index if not exists booking_payouts_host_idx on public.booking_payouts (host_id, paid_at desc);
alter table public.booking_payouts enable row level security;

drop policy if exists "Hosts read their own payouts" on public.booking_payouts;
create policy "Hosts read their own payouts"
  on public.booking_payouts for select
  to authenticated
  using (host_id = auth.uid() or public.is_admin());
-- Written only by the sweep (service role); nobody else gets an insert/update/delete policy.
