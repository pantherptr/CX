-- CX — real availability calendar support.
--
-- `bookings`' SELECT RLS policy (0001_init.sql) correctly scopes rows to
-- `renter_id = auth.uid() OR host_id = auth.uid()` — a browsing customer
-- cannot see another renter's booking rows, which is right (no identity,
-- price, or contact info should leak). But it also means there is today no
-- way for a browsing customer to see which dates are already booked for a
-- car, which a real availability calendar needs.
--
-- These two `security definer` functions expose only date ranges — never
-- renter identity, price, or any other booking field — for a car (or a
-- batch of cars, for Browse's date filter). Same "narrow, controlled
-- exposure via a function" pattern already used by
-- `is_conversation_participant()` in 0001_init.sql.

create function public.car_booked_ranges(p_car_id uuid)
returns table(start_date date, end_date date)
language sql stable security definer set search_path = public as $$
  select start_date, end_date
  from public.bookings
  where car_id = p_car_id and status <> 'cancelled'
$$;

create function public.car_booked_ranges_bulk(p_car_ids uuid[])
returns table(car_id uuid, start_date date, end_date date)
language sql stable security definer set search_path = public as $$
  select car_id, start_date, end_date
  from public.bookings
  where car_id = any(p_car_ids) and status <> 'cancelled'
$$;

grant execute on function public.car_booked_ranges(uuid) to anon, authenticated;
grant execute on function public.car_booked_ranges_bulk(uuid[]) to anon, authenticated;
