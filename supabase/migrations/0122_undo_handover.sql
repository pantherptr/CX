-- 0122 — "Undo" for a scan made by mistake.
--
-- The person who scanned can take the scan back within 5 minutes, as long as nothing irreversible has
-- happened yet: the host's payout is held for those 5 minutes by the API (see api/notify-message.ts), so
-- an undone pickup never has money moved. Undoing the pickup reopens the booking's handover; undoing the
-- return reopens the trip. The other person is told.

insert into public.cx_texts (key, lang, body) values
  ('handover_undone_t', 'en', 'A scan was undone'),
  ('handover_undone_t', 'it', 'Una scansione è stata annullata'),
  ('handover_undone_t', 'ro', 'O scanare a fost anulată'),
  ('handover_undone_t', 'es', 'Se anuló un escaneo'),
  ('handover_undone_b', 'en', 'The last CX Pass scan on this trip was taken back. Scan again when you are both ready.'),
  ('handover_undone_b', 'it', 'L’ultima scansione del CX Pass su questo viaggio è stata annullata. Inquadratevi di nuovo quando siete pronti.'),
  ('handover_undone_b', 'ro', 'Ultima scanare a CX Pass pentru această călătorie a fost anulată. Scanați din nou când sunteți gata.'),
  ('handover_undone_b', 'es', 'Se anuló el último escaneo del CX Pass de este viaje. Escaneen de nuevo cuando estén listos.')
on conflict (key, lang) do nothing;

create or replace function public.undo_handover(p_booking_id uuid, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_renter uuid;
  v_host uuid;
  v_other uuid;
  v_lang text;
  v_h public.booking_handovers%rowtype;
  v_payout text;
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  if p_kind not in ('pickup', 'return') then raise exception 'Unknown scan'; end if;
  select b.renter_id, b.host_id, b.payout_status into v_renter, v_host, v_payout
    from public.bookings b where b.id = p_booking_id;
  if v_renter is null then raise exception 'Booking not found'; end if;
  if v_me not in (v_renter, v_host) then raise exception 'This is not your booking'; end if;
  v_other := case when v_me = v_renter then v_host else v_renter end;

  select * into v_h from public.booking_handovers where booking_id = p_booking_id;
  if not found then raise exception 'There is no scan to undo'; end if;

  if p_kind = 'pickup' then
    if v_h.return_verified_at is not null then raise exception 'The trip is already closed'; end if;
    if v_h.verified_by <> v_me then raise exception 'Only the person who scanned can undo it'; end if;
    if now() - v_h.verified_at > interval '5 minutes' then raise exception 'The undo window has closed'; end if;
    if v_payout = 'paid' then raise exception 'The payout has already been released'; end if;
    delete from public.booking_handovers where booking_id = p_booking_id;
  else
    if v_h.return_verified_at is null then raise exception 'There is no return scan to undo'; end if;
    if v_h.return_verified_by is distinct from v_me then raise exception 'Only the person who scanned can undo it'; end if;
    if now() - v_h.return_verified_at > interval '5 minutes' then raise exception 'The undo window has closed'; end if;
    update public.booking_handovers
       set return_verified_at = null, return_verified_by = null
     where booking_id = p_booking_id;
  end if;

  v_lang := public.user_lang(v_other);
  perform public.create_app_notification(
    v_other, 'handover_undone',
    public.cx_text('handover_undone_t', v_lang),
    public.cx_text('handover_undone_b', v_lang),
    '/trips/' || p_booking_id::text
  );
  return true;
end;
$$;
grant execute on function public.undo_handover(uuid, text) to authenticated;

-- The state now also says who scanned and whether the money is still held, so the app can show "Undo".
drop function if exists public.booking_handover_state(uuid);
create or replace function public.booking_handover_state(p_booking_id uuid)
returns table (pickup_at timestamptz, return_at timestamptz, pickup_by uuid, return_by uuid)
language sql
stable
security definer
set search_path = public
as $$
  select h.verified_at, h.return_verified_at, h.verified_by, h.return_verified_by
  from public.booking_handovers h
  join public.bookings b on b.id = h.booking_id
  where h.booking_id = p_booking_id and auth.uid() in (b.renter_id, b.host_id);
$$;
grant execute on function public.booking_handover_state(uuid) to authenticated;
