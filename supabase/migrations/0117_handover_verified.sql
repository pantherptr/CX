-- 0117 — Verified handover + a thank-you when the host Respects a trip card.
--
-- 1. The host and the renter scan each other's CX Pass at the handover. The booking then carries a
--    "verified handover" seal; the count shows on both profiles (achievements).
-- 2. When the HOST of a trip gives Respect to the renter's trip post, the renter is told.

-- ---------------------------------------------------------------- 1. verified handover
create table if not exists public.booking_handovers (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  verified_by uuid not null references public.profiles (id) on delete cascade,
  verified_at timestamptz not null default now()
);
alter table public.booking_handovers enable row level security;
revoke all on public.booking_handovers from anon, authenticated;
-- no policies: written and read only through the functions below.

create or replace function public.verify_handover(p_booking_id uuid, p_counterpart uuid)
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
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  select b.renter_id, b.host_id into v_renter, v_host from public.bookings b where b.id = p_booking_id;
  if v_renter is null then raise exception 'Booking not found'; end if;
  if v_me not in (v_renter, v_host) then raise exception 'This is not your booking'; end if;
  v_other := case when v_me = v_renter then v_host else v_renter end;
  if p_counterpart is distinct from v_other then raise exception 'This pass is not the other person on this booking'; end if;

  insert into public.booking_handovers (booking_id, verified_by) values (p_booking_id, v_me)
  on conflict (booking_id) do nothing;

  if found then
    v_lang := public.user_lang(v_other);
    perform public.create_app_notification(
      v_other, 'handover_verified',
      public.cx_text('handover_verified_t', v_lang),
      public.cx_text('handover_verified_b', v_lang),
      '/trips/' || p_booking_id::text
    );
  end if;
  return true;
end;
$$;
grant execute on function public.verify_handover(uuid, uuid) to authenticated;

-- Is this booking's handover verified? Only the two people on the booking may ask.
create or replace function public.booking_handover_verified(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.booking_handovers h
    join public.bookings b on b.id = h.booking_id
    where h.booking_id = p_booking_id and auth.uid() in (b.renter_id, b.host_id)
  );
$$;
grant execute on function public.booking_handover_verified(uuid) to authenticated;

create or replace function public.verified_handovers_count(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.booking_handovers h
  join public.bookings b on b.id = h.booking_id
  where b.renter_id = p_user or b.host_id = p_user;
$$;
grant execute on function public.verified_handovers_count(uuid) to authenticated;

-- ---------------------------------------------------------------- 2. host Respects the trip card
insert into public.cx_texts (key, lang, body) values
  ('handover_verified_t', 'en', 'Handover verified ✓'),
  ('handover_verified_t', 'it', 'Consegna verificata ✓'),
  ('handover_verified_t', 'ro', 'Predare verificată ✓'),
  ('handover_verified_t', 'es', 'Entrega verificada ✓'),
  ('handover_verified_b', 'en', 'You both scanned your CX Pass — this handover now carries the verified seal.'),
  ('handover_verified_b', 'it', 'Vi siete inquadrati i CX Pass: questa consegna ora ha il sigillo di verifica.'),
  ('handover_verified_b', 'ro', 'Ați scanat amândoi CX Pass — această predare are acum sigiliul de verificare.'),
  ('handover_verified_b', 'es', 'Ambos escanearon su CX Pass: esta entrega ya lleva el sello de verificada.'),
  ('host_respect_trip_t', 'en', 'Your host gave Respect to your trip'),
  ('host_respect_trip_t', 'it', 'Il tuo host ha dato Respect al tuo viaggio'),
  ('host_respect_trip_t', 'ro', 'Gazda ta a dat Respect călătoriei tale'),
  ('host_respect_trip_t', 'es', 'Tu anfitrión dio Respect a tu viaje'),
  ('host_respect_trip_b', 'en', 'The host of your trip liked the card you shared on SIGNAL.'),
  ('host_respect_trip_b', 'it', 'L’host del tuo viaggio ha apprezzato la card che hai condiviso su SIGNAL.'),
  ('host_respect_trip_b', 'ro', 'Gazda călătoriei tale a apreciat cardul pe care l-ai distribuit pe SIGNAL.'),
  ('host_respect_trip_b', 'es', 'El anfitrión de tu viaje valoró la tarjeta que compartiste en SIGNAL.')
on conflict (key, lang) do nothing;

create or replace function public.notify_host_respect_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_host uuid;
  v_lang text;
begin
  select m.user_id, b.host_id into v_author, v_host
  from public.signal_trip_memories m
  join public.bookings b on b.id = m.booking_id
  where m.post_id = new.post_id
  limit 1;
  if v_author is null or v_host is null then return new; end if;
  if new.user_id is distinct from v_host or v_author = v_host then return new; end if;
  v_lang := public.user_lang(v_author);
  perform public.create_app_notification(
    v_author, 'host_respect_trip',
    public.cx_text('host_respect_trip_t', v_lang),
    public.cx_text('host_respect_trip_b', v_lang),
    '/signal/post/' || new.post_id::text
  );
  return new;
end;
$$;

drop trigger if exists empire_post_likes_host_respect on public.empire_post_likes;
create trigger empire_post_likes_host_respect
  after insert on public.empire_post_likes
  for each row execute function public.notify_host_respect_trip();
