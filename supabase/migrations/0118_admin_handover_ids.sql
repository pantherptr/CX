-- 0118 — Admins can see which bookings have a verified handover (evidence in a dispute).
create or replace function public.admin_verified_handover_ids()
returns table (booking_id uuid, verified_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select h.booking_id, h.verified_at
  from public.booking_handovers h
  where public.is_admin();
$$;
grant execute on function public.admin_verified_handover_ids() to authenticated;
