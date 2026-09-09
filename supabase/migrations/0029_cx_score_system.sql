-- CX Score — the professional loyalty system that replaces the old
-- CX Drive Challenge score/reward pair (game_sessions/game_rewards,
-- 0010_drive_challenge.sql). Those tables are left in place untouched —
-- they hold real history for players who already claimed a discount —
-- but nothing new is ever written to them after this migration, because
-- the racing game that fed them is being retired from the app's
-- navigation in this same change.
--
-- Security model (identical in spirit to claim_game_reward /
-- validate_game_score): CX Score can only move through
-- `public.award_cx_score`, a function with no grant to `authenticated` —
-- it is only ever called *from inside* other `security definer`
-- functions that have already validated a real, server-observed event
-- (a booking that has actually ended, a car actually bought in the
-- Empire game, a business tier actually reached). The client never
-- passes a point value; it only ever names *which* thing happened, and
-- the amount is decided in this file.
--
-- Anti-farming: every award is deduplicated by
-- `unique (user_id, event_type, ref_id)` on `cx_score_events` — the same
-- concrete event (a specific booking, a specific purchased car, a
-- specific business-tier milestone) can only ever pay out once, no
-- matter how many times the RPC that grants it is called or retried.

-- ============================================================
-- 1. Deterministic ref ids — lets an "achievement" style award (keyed by
--    a semantic string like "business_tier:4", not a real row id) get
--    the same anti-duplicate guarantee as row-keyed events.
-- ============================================================
create or replace function public.deterministic_ref(p_key text)
returns uuid
language sql
immutable
as $$
  select (
    substr(md5(p_key), 1, 8) || '-' ||
    substr(md5(p_key), 9, 4) || '-' ||
    substr(md5(p_key), 13, 4) || '-' ||
    substr(md5(p_key), 17, 4) || '-' ||
    substr(md5(p_key), 21, 12)
  )::uuid;
$$;

-- ============================================================
-- 2. cx_score_levels — the exact ladder from the spec. `benefit_percentage`
--    is the CX Rent booking discount unlocked at that level; once a
--    level introduces a discount, later levels keep at least that much
--    (a member never loses a perk by levelling up) until a higher one is
--    explicitly configured. `max_discount_eur` is the absolute cap per
--    booking — the business-protection rule from the spec.
-- ============================================================
create table public.cx_score_levels (
  level_key text primary key,
  sort_order integer not null unique,
  min_score integer not null,
  max_score integer,
  label text not null,
  benefit_percentage integer not null default 0 check (benefit_percentage between 0 and 100),
  max_discount_eur numeric not null default 50 check (max_discount_eur >= 0)
);

insert into public.cx_score_levels (level_key, sort_order, min_score, max_score, label, benefit_percentage, max_discount_eur) values
  ('new_member', 1, 0,     499,   'New Member',   0,  0),
  ('starter',    2, 500,   1499,  'Starter',      0,  0),
  ('trusted',    3, 1500,  2999,  'Trusted',      0,  0),
  ('cx_member',  4, 3000,  4999,  'CX Member',    5,  50),
  ('cx_plus',    5, 5000,  9999,  'CX Plus',      5,  50),
  ('cx_premium', 6, 10000, 19999, 'CX Premium',   7,  50),
  ('cx_elite',   7, 20000, 49999, 'CX Elite',     10, 50),
  ('cx_legend',  8, 50000, null,  'CX Legend',    10, 50);

alter table public.cx_score_levels enable row level security;
create policy "CX Score levels are publicly readable"
  on public.cx_score_levels for select
  using (true);

create or replace function public.cx_current_level(p_score integer)
returns public.cx_score_levels
language sql
stable
as $$
  select * from public.cx_score_levels
  where p_score >= min_score and (max_score is null or p_score <= max_score)
  order by min_score desc
  limit 1;
$$;

-- ============================================================
-- 3. cx_scores — one row per member, the current total only. History
--    lives in cx_score_events; this is a maintained running total so
--    reading "my score" never means summing a growing ledger.
-- ============================================================
create table public.cx_scores (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  score integer not null default 0 check (score >= 0),
  updated_at timestamptz not null default now()
);

alter table public.cx_scores enable row level security;
create policy "Users view their own CX Score"
  on public.cx_scores for select
  using (auth.uid() = user_id);
-- No insert/update/delete policy for clients — every change goes
-- through award_cx_score(), a security definer function.

-- ============================================================
-- 4. cx_score_events — the append-only ledger, and the anti-abuse
--    backbone. `ref_id` is either a real row id (a booking, an owned
--    car) or a deterministic_ref() of a semantic key — either way, the
--    unique constraint makes the *same* event pay out exactly once.
-- ============================================================
create table public.cx_score_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null,
  points integer not null,
  ref_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, event_type, ref_id)
);

create index cx_score_events_user_id_idx on public.cx_score_events (user_id, created_at desc);

alter table public.cx_score_events enable row level security;
create policy "Users view their own CX Score history"
  on public.cx_score_events for select
  using (auth.uid() = user_id);
-- No client insert/update/delete — award_cx_score() only.

-- ============================================================
-- 5. award_cx_score — the one and only place score is ever added.
--    Deliberately NOT granted to `authenticated`: it is only reachable
--    from other security definer functions that already validated a
--    real event server-side. Returns whether it actually paid out
--    (false means "already awarded, skipped" — callers can use this to
--    report an accurate total without double-announcing).
-- ============================================================
create or replace function public.award_cx_score(
  p_user_id uuid,
  p_event_type text,
  p_points integer,
  p_ref_id uuid
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if p_points <= 0 then
    return false;
  end if;

  insert into public.cx_score_events (user_id, event_type, points, ref_id)
  values (p_user_id, p_event_type, p_points, p_ref_id)
  on conflict (user_id, event_type, ref_id) do nothing;

  if not found then
    return false;
  end if;

  insert into public.cx_scores (user_id, score, updated_at)
  values (p_user_id, p_points, now())
  on conflict (user_id) do update
    set score = public.cx_scores.score + excluded.score,
        updated_at = now();

  return true;
end;
$$;

-- ============================================================
-- 6. claim_rental_cx_score — the one real "did something happen" event
--    this pass wires up to an actual, already-existing part of CX Rent
--    (there is no reviews table and no referral system yet, so those
--    §13 examples aren't awarded here — only what the app can actually
--    verify). A trip only qualifies once its return date has genuinely
--    passed, and only its own renter can claim it, once, ever — the
--    unique ledger constraint keyed on the booking id makes a second
--    call a no-op rather than a double payout.
-- ============================================================
create or replace function public.claim_rental_cx_score(p_booking_id uuid)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_booking record;
  v_days integer;
  v_awarded integer := 0;
  v_is_premium boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_booking from public.bookings
  where id = p_booking_id and renter_id = auth.uid();

  if v_booking is null then
    raise exception 'Booking not found';
  end if;
  if v_booking.status = 'cancelled' then
    raise exception 'This booking was cancelled';
  end if;
  if v_booking.end_date >= current_date then
    raise exception 'This trip has not ended yet';
  end if;

  if public.award_cx_score(auth.uid(), 'rental_completed', 100, p_booking_id) then
    v_awarded := v_awarded + 100;
  end if;

  v_days := v_booking.end_date - v_booking.start_date;
  if v_days >= 7 then
    if public.award_cx_score(auth.uid(), 'rental_length_bonus', 300, p_booking_id) then
      v_awarded := v_awarded + 300;
    end if;
  elsif v_days >= 3 then
    if public.award_cx_score(auth.uid(), 'rental_length_bonus', 150, p_booking_id) then
      v_awarded := v_awarded + 150;
    end if;
  end if;

  select exists (
    select 1 from public.cars c
    where c.id = v_booking.car_id and c.category in ('Luxury', 'Sport', 'Convertible')
  ) into v_is_premium;

  if v_is_premium and public.award_cx_score(auth.uid(), 'premium_vehicle_rental', 200, p_booking_id) then
    v_awarded := v_awarded + 200;
  end if;

  return v_awarded;
end;
$$;

grant execute on function public.claim_rental_cx_score(uuid) to authenticated;

-- ============================================================
-- 7. My-eligible-claims helper — lets the client find completed,
--    unclaimed trips without needing to know the event-type/ref
--    bookkeeping above. Read-only, safe to expose directly.
-- ============================================================
create or replace function public.my_unclaimed_rental_bookings()
returns table (booking_id uuid)
language sql
stable
security definer set search_path = public
as $$
  select b.id
  from public.bookings b
  where b.renter_id = auth.uid()
    and b.status <> 'cancelled'
    and b.end_date < current_date
    and not exists (
      select 1 from public.cx_score_events e
      where e.user_id = b.renter_id and e.event_type = 'rental_completed' and e.ref_id = b.id
    );
$$;

grant execute on function public.my_unclaimed_rental_bookings() to authenticated;
