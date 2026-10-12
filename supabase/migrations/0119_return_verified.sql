-- 0119 — The second scan: the return. Pickup scan = the trip starts; return scan = the trip is closed.
-- Same pass, same checks, in the other direction. The pickup row (0117) gains the return columns.

alter table public.booking_handovers add column if not exists return_verified_at timestamptz;
alter table public.booking_handovers add column if not exists return_verified_by uuid references public.profiles (id) on delete set null;

insert into public.cx_texts (key, lang, body) values
  ('return_verified_t', 'en', 'Return confirmed ✓'),
  ('return_verified_t', 'it', 'Riconsegna confermata ✓'),
  ('return_verified_t', 'ro', 'Returnare confirmată ✓'),
  ('return_verified_t', 'es', 'Devolución confirmada ✓'),
  ('return_verified_b', 'en', 'You both scanned your CX Pass — the car is back and the trip is closed.'),
  ('return_verified_b', 'it', 'Vi siete inquadrati i CX Pass: l’auto è rientrata e il viaggio è chiuso.'),
  ('return_verified_b', 'ro', 'Ați scanat amândoi CX Pass — mașina s-a întors, iar călătoria este închisă.'),
  ('return_verified_b', 'es', 'Ambos escanearon su CX Pass: el coche está de vuelta y el viaje queda cerrado.')
on conflict (key, lang) do nothing;

create or replace function public.verify_return(p_booking_id uuid, p_counterpart uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_renter uuid;
  v_host uuid;
  v_me uuid := auth.uid();
  v_other uuid;
  v_lang text;
  v_open boolean;
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  select b.renter_id, b.host_id into v_renter, v_host from public.bookings b where b.id = p_booking_id;
  if v_renter is null then raise exception 'Booking not found'; end if;
  if v_me not in (v_renter, v_host) then raise exception 'This is not your booking'; end if;
  v_other := case when v_me = v_renter then v_host else v_renter end;
  if p_counterpart is distinct from v_other then raise exception 'This pass is not the other person on this booking'; end if;
  if not exists (select 1 from public.booking_handovers h where h.booking_id = p_booking_id) then
    raise exception 'Scan at pickup first — the trip has not started yet';
  end if;

  update public.booking_handovers
     set return_verified_at = now(), return_verified_by = v_me
   where booking_id = p_booking_id and return_verified_at is null
  returning true into v_open;

  if v_open then
    v_lang := public.user_lang(v_other);
    perform public.create_app_notification(
      v_other, 'return_verified',
      public.cx_text('return_verified_t', v_lang),
      public.cx_text('return_verified_b', v_lang),
      '/trips/' || p_booking_id::text
    );
  end if;
  return true;
end;
$$;
grant execute on function public.verify_return(uuid, uuid) to authenticated;

-- Where a booking stands: when the trip started and when it was closed (null = not yet).
create or replace function public.booking_handover_state(p_booking_id uuid)
returns table (pickup_at timestamptz, return_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select h.verified_at, h.return_verified_at
  from public.booking_handovers h
  join public.bookings b on b.id = h.booking_id
  where h.booking_id = p_booking_id and auth.uid() in (b.renter_id, b.host_id);
$$;
grant execute on function public.booking_handover_state(uuid) to authenticated;
