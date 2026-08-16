-- CX Drive Challenge — a mini-game with real, anti-abused reward coupons.
--
-- This app has no custom backend (a Vite SPA talking to Supabase
-- directly), so "never trust the score sent from the frontend" has to
-- mean Postgres-side validation — the same principle prepare_booking()
-- already applies to money in 0003/0005. The model here:
--
--   1. A game_sessions row is opened server-side first (started_at is
--      set by a trigger, never by the client).
--   2. The score is written once into that same row, and a trigger
--      rejects it if it's implausible for the elapsed time or exceeds a
--      hard ceiling — no "submit low, resubmit high".
--   3. claim_game_reward() is the ONLY place a game_rewards row is ever
--      created. It re-derives the tier from the session's own stored
--      score (never a client-supplied number), row-locks the session to
--      stop concurrent double-claims, and enforces one reward per tier
--      per user ever (also a real unique constraint), a per-day cap, and
--      a claim window.
--
-- A determined client-side cheat can therefore win at most one coupon
-- per tier per account, rate-limited per day — a bounded, acceptable
-- risk for a marketing coupon mechanic, not an infinite exploit.

-- ---------------------------------------------------------------------
-- Config — the one place every threshold lives.
-- ---------------------------------------------------------------------

create table public.game_config (
  id boolean primary key default true check (id),
  leaderboard_enabled boolean not null default true,
  max_claims_per_day integer not null default 3,
  min_session_seconds integer not null default 5,
  max_session_seconds integer not null default 300,
  max_plausible_score integer not null default 6000,
  session_claim_window_hours integer not null default 24,
  reward_expiry_days integer not null default 30
);

insert into public.game_config (id) values (true);

alter table public.game_config enable row level security;

create policy "Game config is publicly readable"
  on public.game_config for select
  using (true);

create table public.game_reward_tiers (
  id serial primary key,
  points_required integer not null unique,
  discount_percentage integer not null check (discount_percentage between 1 and 100),
  label text not null,
  active boolean not null default true
);

insert into public.game_reward_tiers (points_required, discount_percentage, label) values
  (500, 5, '5% OFF'),
  (1000, 10, '10% OFF'),
  (2000, 15, '15% OFF'),
  (3000, 20, '20% OFF');

alter table public.game_reward_tiers enable row level security;

create policy "Reward tiers are publicly readable"
  on public.game_reward_tiers for select
  using (active);

-- ---------------------------------------------------------------------
-- Sessions — one row per run. user_id/started_at are server-set; score
-- is written once via a validated update.
-- ---------------------------------------------------------------------

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  score integer,
  submitted_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create index game_sessions_user_id_idx on public.game_sessions (user_id);

alter table public.game_sessions enable row level security;

-- Nothing sensitive lives here (a uuid, timestamps, a score) — public
-- read is what lets the leaderboard join to profiles.full_name (already
-- publicly readable) without a bespoke RPC just to list top scores.
create policy "Game sessions are publicly readable"
  on public.game_sessions for select
  using (true);

-- `is not distinct from` (rather than `=`) is what lets an anonymous
-- player (auth.uid() null) write their own null-user_id row, while still
-- blocking anyone else from touching it once a real owner is attached.
create policy "Anyone can start their own session"
  on public.game_sessions for insert
  with check (user_id is not distinct from auth.uid());

-- `with check` blocks a raw client update from transferring a session's
-- ownership to a different account outright — the only path that may
-- attach a still-null user_id to a real account is claim_game_reward(),
-- which runs as the table owner and bypasses RLS entirely, same as
-- every other trusted trigger function in this schema.
create policy "Only the owning session can be updated"
  on public.game_sessions for update
  using (user_id is not distinct from auth.uid())
  with check (user_id is not distinct from auth.uid());

create or replace function public.prepare_game_session()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.user_id := auth.uid();
  new.started_at := now();
  new.score := null;
  new.submitted_at := null;
  new.claimed_at := null;
  return new;
end;
$$;

create trigger game_sessions_prepare
  before insert on public.game_sessions
  for each row execute procedure public.prepare_game_session();

create or replace function public.validate_game_score()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_cfg record;
  v_elapsed numeric;
begin
  -- claim_game_reward() only ever touches claimed_at/user_id on an
  -- already-scored session — let that (and any other no-op-on-score
  -- update) straight through untouched; only a change to `score` itself
  -- goes through the write-once + plausibility checks below.
  if new.score is not distinct from old.score then
    return new;
  end if;

  if old.score is not null then
    raise exception 'Score has already been submitted for this run';
  end if;

  select * into v_cfg from public.game_config limit 1;
  v_elapsed := extract(epoch from (now() - old.started_at));

  if v_elapsed < v_cfg.min_session_seconds or v_elapsed > v_cfg.max_session_seconds then
    raise exception 'This run is not eligible for scoring';
  end if;

  if new.score < 0 or new.score > v_cfg.max_plausible_score then
    raise exception 'This run is not eligible for scoring';
  end if;

  new.submitted_at := now();
  return new;
end;
$$;

create trigger game_sessions_validate_score
  before update on public.game_sessions
  for each row execute procedure public.validate_game_score();

-- ---------------------------------------------------------------------
-- Rewards — only ever created by claim_game_reward(). No client insert/
-- update policy exists at all, so a request payload can never set its
-- own status, coupon_code or discount_percentage.
-- ---------------------------------------------------------------------

create table public.game_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reward_type text not null default 'discount',
  discount_percentage integer not null,
  points_required integer not null,
  coupon_code text not null unique,
  status text not null default 'available' check (status in ('available', 'used', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  unique (user_id, points_required)
);

create index game_rewards_user_id_idx on public.game_rewards (user_id);

alter table public.game_rewards enable row level security;

create policy "Users view their own rewards"
  on public.game_rewards for select
  using (auth.uid() = user_id);

create or replace function public.claim_game_reward(p_session_id uuid)
returns public.game_rewards
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_session record;
  v_tier record;
  v_cfg record;
  v_today_count integer;
  v_code text;
  v_reward public.game_rewards;
begin
  if v_uid is null then
    raise exception 'Sign in to claim a reward';
  end if;

  select * into v_cfg from public.game_config limit 1;

  select * into v_session from public.game_sessions
    where id = p_session_id
    for update;

  if v_session is null then
    raise exception 'Run not found';
  end if;
  if v_session.score is null then
    raise exception 'This run has no submitted score yet';
  end if;
  if v_session.claimed_at is not null then
    raise exception 'This run has already been claimed';
  end if;
  if v_session.user_id is not null and v_session.user_id <> v_uid then
    raise exception 'This run belongs to another account';
  end if;
  if v_session.started_at < now() - make_interval(hours => v_cfg.session_claim_window_hours) then
    raise exception 'This run has expired — play again to claim a reward';
  end if;

  select * into v_tier from public.game_reward_tiers
    where active and points_required <= v_session.score
    order by points_required desc
    limit 1;

  if v_tier is null then
    raise exception 'This score does not qualify for a reward yet';
  end if;

  if exists (
    select 1 from public.game_rewards
    where user_id = v_uid and points_required = v_tier.points_required
  ) then
    raise exception 'You already claimed the reward for this tier';
  end if;

  select count(*) into v_today_count from public.game_rewards
    where user_id = v_uid and created_at >= date_trunc('day', now());

  if v_today_count >= v_cfg.max_claims_per_day then
    raise exception 'Daily reward limit reached — come back tomorrow';
  end if;

  v_code := 'CX-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

  insert into public.game_rewards (
    user_id, reward_type, discount_percentage, points_required, coupon_code, status, expires_at
  ) values (
    v_uid, 'discount', v_tier.discount_percentage, v_tier.points_required, v_code, 'available',
    now() + make_interval(days => v_cfg.reward_expiry_days)
  )
  returning * into v_reward;

  update public.game_sessions
  set claimed_at = now(), user_id = v_uid
  where id = p_session_id;

  return v_reward;
end;
$$;

grant execute on function public.claim_game_reward(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Booking integration — a reward is applied and consumed atomically
-- inside the same trusted trigger that already computes total_price.
-- ---------------------------------------------------------------------

alter table public.bookings
  add column reward_id uuid references public.game_rewards (id),
  add column discount_amount numeric not null default 0;

create or replace function public.prepare_booking()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_price numeric;
  v_host uuid;
  v_days int;
  v_base numeric;
  v_service numeric;
  v_protection numeric;
  v_flex numeric;
  v_pre_discount numeric;
  v_reward record;
begin
  select price_per_day, host_id into v_price, v_host
  from public.cars
  where id = new.car_id and status = 'published';

  if v_price is null then
    raise exception 'Car not found or not published';
  end if;

  v_days := greatest(1, new.end_date - new.start_date);
  v_base := v_price * v_days;
  v_service := round(v_base * 0.12);
  v_protection := round(v_price * 0.18) * v_days;
  v_flex := case when new.fare_tier = 'flexible' then round(v_price * 0.10) * v_days else 0 end;
  v_pre_discount := v_base + v_service + v_protection + v_flex;

  new.discount_amount := 0;
  if new.reward_id is not null then
    select * into v_reward from public.game_rewards
      where id = new.reward_id
        and user_id = new.renter_id
        and status = 'available'
        and expires_at > now()
      for update;

    if v_reward is null then
      raise exception 'This reward is invalid, expired, or already used';
    end if;

    new.discount_amount := round(v_pre_discount * v_reward.discount_percentage / 100.0);

    update public.game_rewards
    set status = 'used', used_at = now()
    where id = new.reward_id;
  end if;

  new.host_id := v_host;
  new.total_price := v_pre_discount - new.discount_amount;
  new.reference := 'VLR-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  return new;
end;
$$;

create or replace function public.recompute_booking_on_date_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_price numeric;
  v_days int;
  v_base numeric;
  v_service numeric;
  v_protection numeric;
  v_flex numeric;
  v_extras numeric;
  v_pre_discount numeric;
  v_discount_pct integer;
begin
  select price_per_day into v_price from public.cars where id = new.car_id;

  v_days := greatest(1, new.end_date - new.start_date);
  v_base := v_price * v_days;
  v_service := round(v_base * 0.12);
  v_protection := round(v_price * 0.18) * v_days;
  v_flex := case when new.fare_tier = 'flexible' then round(v_price * 0.10) * v_days else 0 end;

  update public.booking_extras be
  set unit_price = ec.price * v_days
  from public.extras_catalog ec
  where be.booking_id = new.id and be.extra_id = ec.id and ec.price_model = 'per_day';

  select coalesce(sum(unit_price * quantity), 0) into v_extras
  from public.booking_extras where booking_id = new.id;

  v_pre_discount := v_base + v_service + v_protection + v_flex + v_extras;

  new.discount_amount := 0;
  if new.reward_id is not null then
    -- Already consumed at insert time — just re-read its percentage,
    -- no re-validation needed for an already-owned, already-used reward.
    select discount_percentage into v_discount_pct
    from public.game_rewards where id = new.reward_id;
    new.discount_amount := round(v_pre_discount * coalesce(v_discount_pct, 0) / 100.0);
  end if;

  new.total_price := v_pre_discount - new.discount_amount;
  return new;
end;
$$;
