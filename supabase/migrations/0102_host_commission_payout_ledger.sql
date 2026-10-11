-- Host payouts: CX's commission on the host's earnings, and a ledger of what was paid.
--
-- Money flow (unchanged): the renter pays CX's own Stripe account; the day after the return the
-- daily sweep (api/send-pickup-reminders.ts) transfers the host's share to their Stripe Express
-- account, and Stripe pays that out to their bank. What is new:
--   * a host commission, kept by CX out of the base rental price (default 5%), read from
--     platform_settings so it can be changed with one UPDATE, no deploy;
--   * booking_payouts: one row per paid booking (gross, commission %, commission, net, transfer),
--     read by the host dashboard so a host sees exactly what they earned and what CX kept.
-- The 12% service fee, protection and delivery fees already charged to the renter stay CX revenue.

create table if not exists public.platform_settings (
  key text primary key,
  value numeric not null,
  updated_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;
-- No policies: read only through the function below, written by the owner in SQL.

insert into public.platform_settings (key, value) values ('host_commission_pct', 5)
on conflict (key) do nothing;

-- What hosts are told (the number only; nothing else in the table is exposed).
create or replace function public.fetch_host_commission_pct()
returns numeric
language sql stable security definer set search_path = public
as $$
  select coalesce((select value from public.platform_settings where key = 'host_commission_pct'), 0);
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
