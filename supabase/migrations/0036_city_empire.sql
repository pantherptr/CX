-- CX City Empire — a rental-tycoon gameplay layer on top of the existing
-- buy/customize/flip loop from 0030_luxury_car_empire.sql and
-- 0035_car_flipping_market.sql, which this migration does NOT modify.
--
-- The player assigns owned cars out to city districts for recurring
-- rental income (the new primary loop), fulfills urgent customer
-- requests, takes on one flagship corporate contract, and works through
-- missions/daily objectives/achievements — all layered on the same
-- game_player_state row and the same CX Score ledger (0029) as
-- everything else in Empire.
--
-- Same trust model and lazy-resolution pattern as every other Empire
-- table: no client insert/update/delete policy on any new table, every
-- mutation goes through a security definer RPC below, and anything
-- time-gated resolves lazily on the next client read (no cron, no Edge
-- Functions exist in this project) rather than via a background worker.

-- ============================================================
-- 0. game_inventory / game_player_state — a 'rented' status alongside
--    'owned'/'listed'/'sold', and three new lifetime counters matching
--    the existing total_revenue/total_expenses/cars_sold convention.
-- ============================================================
alter table public.game_inventory drop constraint game_inventory_status_check;
alter table public.game_inventory
  add constraint game_inventory_status_check check (status in ('owned', 'listed', 'sold', 'rented'));

alter table public.game_player_state
  add column rentals_completed integer not null default 0,
  add column contracts_completed integer not null default 0,
  add column requests_fulfilled integer not null default 0;

-- ============================================================
-- 1. game_districts — the 5 city districts. Static reference data, not
--    a per-player table.
-- ============================================================
create table public.game_districts (
  district_key text primary key,
  name text not null,
  description text not null,
  icon text not null,
  base_rate_multiplier numeric not null
);

insert into public.game_districts (district_key, name, description, icon, base_rate_multiplier) values
  ('airport', 'Airport', 'High turnover, business travelers, fast pickups.', 'plane', 1.15),
  ('city_center', 'City Center', 'Steady, broad demand across every category.', 'building', 1.00),
  ('luxury_district', 'Luxury District', 'Premium clientele — the best rates for rare-and-up vehicles.', 'gem', 1.35),
  ('business_district', 'Business District', 'Corporate travel — sedans and executive cars in demand.', 'bag', 1.20),
  ('tourist_district', 'Tourist District', 'Convertibles and iconic cars catch a premium here.', 'compass', 1.10);

alter table public.game_districts enable row level security;
create policy "Districts are publicly readable"
  on public.game_districts for select
  using (true);

-- ============================================================
-- 2. game_district_demand — per (district, vehicle category) daily-
--    rotating demand, exact mirror of game_vehicle_demand (0035).
-- ============================================================
create table public.game_district_demand (
  district_key text not null references public.game_districts(district_key) on delete cascade,
  category text not null,
  demand_tier text not null default 'normal' check (demand_tier in ('low', 'normal', 'high', 'hot', 'iconic')),
  demand_pct integer not null default 0,
  rotated_at date not null default current_date,
  primary key (district_key, category)
);

alter table public.game_district_demand enable row level security;
create policy "District demand is publicly readable"
  on public.game_district_demand for select
  using (true);

-- Seeds any missing (district, category) pair and re-rolls anything
-- stale, same lazy-ensure-or-refresh idiom as ensure_vehicle_demand().
-- Luxury/Tourist districts skew toward hot/iconic.
create or replace function public.ensure_district_demand()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.game_district_demand (district_key, category, demand_tier, demand_pct, rotated_at)
  select
    d.district_key,
    c.category,
    (case
      when d.district_key in ('luxury_district', 'tourist_district') and random() < 0.35 then 'iconic'
      when d.district_key in ('luxury_district', 'tourist_district') and random() < 0.35 then 'hot'
      when random() < 0.3 then 'high'
      when random() < 0.6 then 'normal'
      else 'low'
    end),
    round(random() * 30)::int,
    current_date
  from public.game_districts d
  cross join (select distinct category from public.game_vehicle_templates where active) c
  on conflict (district_key, category) do nothing;

  update public.game_district_demand dd
  set
    demand_tier = (case
      when dd.district_key in ('luxury_district', 'tourist_district') and random() < 0.2 then 'iconic'
      when random() < 0.25 then 'hot'
      when random() < 0.5 then 'high'
      when random() < 0.8 then 'normal'
      else 'low'
    end),
    demand_pct = round(random() * 30)::int,
    rotated_at = current_date
  where dd.rotated_at < current_date;
end;
$$;

grant execute on function public.ensure_district_demand() to authenticated;

-- ============================================================
-- 3. game_city_events — time-boxed demand modifiers, lazily rolled by
--    ensure_city_events() using a single-row mutex (no client access at
--    all, matching game_config's singleton pattern but with no read
--    policy since nothing needs to read the mutex row itself).
-- ============================================================
create table public.game_city_events (
  id uuid primary key default gen_random_uuid(),
  district_key text not null references public.game_districts(district_key) on delete cascade,
  category text,
  title text not null,
  description text not null,
  effect_pct integer not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.game_city_events enable row level security;
create policy "City events are publicly readable"
  on public.game_city_events for select
  using (true);

create table public.game_city_events_state (
  id boolean primary key default true check (id),
  last_rolled_at timestamptz
);
insert into public.game_city_events_state (id) values (true);
alter table public.game_city_events_state enable row level security;

create or replace function public.ensure_city_events()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_state public.game_city_events_state;
  v_active_count integer;
  v_district text;
  v_category text;
  v_titles text[] := array['Rush Hour', 'VIP Weekend', 'Concert Night', 'Business Conference', 'Tourist Season', 'Local Festival'];
begin
  select * into v_state from public.game_city_events_state where id = true for update;

  if v_state.last_rolled_at is not null and v_state.last_rolled_at > now() - interval '20 minutes' then
    return;
  end if;

  update public.game_city_events_state set last_rolled_at = now() where id = true;

  select count(*) into v_active_count from public.game_city_events where ends_at > now();
  if v_active_count >= 2 or random() >= 0.4 then
    return;
  end if;

  select district_key into v_district from public.game_districts order by random() limit 1;

  if random() < 0.4 then
    select category into v_category from public.game_vehicle_templates where active order by random() limit 1;
  else
    v_category := null;
  end if;

  insert into public.game_city_events (district_key, category, title, description, effect_pct, ends_at)
  values (
    v_district,
    v_category,
    v_titles[1 + floor(random() * array_length(v_titles, 1))::int],
    case when v_category is null
      then 'Demand is up across every category in this district.'
      else 'Demand for ' || v_category || ' vehicles is spiking in this district.'
    end,
    25 + floor(random() * 36)::int,
    now() + (interval '2 hours' * (1 + random() * 2))
  );
end;
$$;

grant execute on function public.ensure_city_events() to authenticated;

-- ============================================================
-- 4. game_corporate_contracts — reference data. Exactly one contract for
--    this first slice, not a generic marketplace.
-- ============================================================
create table public.game_corporate_contracts (
  id text primary key,
  title text not null,
  description text not null,
  required_vehicle_count integer not null,
  required_min_rarity text not null check (required_min_rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic')),
  duration_days integer not null,
  lump_sum_payout numeric not null,
  cx_score_bonus integer not null,
  min_business_tier integer not null default 1
);

insert into public.game_corporate_contracts
  (id, title, description, required_vehicle_count, required_min_rarity, duration_days, lump_sum_payout, cx_score_bonus, min_business_tier)
values (
  'apex_logistics_hq',
  'Apex Logistics HQ Fleet Deal',
  'Apex Logistics needs 3 Rare-or-better vehicles on standby for their executive team for 5 days.',
  3, 'rare', 5, 60000, 2000, 2
);

alter table public.game_corporate_contracts enable row level security;
create policy "Corporate contracts are publicly readable"
  on public.game_corporate_contracts for select
  using (true);

-- ============================================================
-- 5. game_mission_templates — reference data for lifetime + daily
--    missions. metric_key is a closed enum read via a fixed `case` in
--    claim_mission(), never dynamic SQL.
-- ============================================================
create table public.game_mission_templates (
  id text primary key,
  scope text not null check (scope in ('lifetime', 'daily')),
  title text not null,
  description text not null,
  metric_key text not null check (metric_key in (
    'rentals_completed', 'contracts_completed', 'requests_fulfilled',
    'daily_rentals_completed', 'daily_requests_fulfilled'
  )),
  target integer not null,
  reward_cash numeric not null default 0,
  reward_cx_points integer not null default 0,
  icon text not null,
  sort_order integer not null
);

insert into public.game_mission_templates
  (id, scope, title, description, metric_key, target, reward_cash, reward_cx_points, icon, sort_order)
values
  ('first_rental', 'lifetime', 'First Fleet Move', 'Complete your first district rental.', 'rentals_completed', 1, 1000, 100, 'pin', 1),
  ('ten_rentals', 'lifetime', 'Rental Operator', 'Complete 10 district rentals.', 'rentals_completed', 10, 5000, 400, 'trending', 2),
  ('fifty_rentals', 'lifetime', 'Fleet Veteran', 'Complete 50 district rentals.', 'rentals_completed', 50, 20000, 1500, 'trophy', 3),
  ('first_request', 'lifetime', 'First VIP', 'Fulfill your first customer request.', 'requests_fulfilled', 1, 1500, 150, 'target', 4),
  ('first_contract', 'lifetime', 'Corporate Partner', 'Complete your first corporate contract.', 'contracts_completed', 1, 5000, 500, 'handshake', 5),
  ('daily_three_rentals', 'daily', 'Busy Day', 'Complete 3 rentals today.', 'daily_rentals_completed', 3, 2000, 150, 'pin', 6),
  ('daily_one_request', 'daily', 'On Call', 'Fulfill 1 customer request today.', 'daily_requests_fulfilled', 1, 1000, 100, 'target', 7);

alter table public.game_mission_templates enable row level security;
create policy "Mission templates are publicly readable"
  on public.game_mission_templates for select
  using (true);

-- ============================================================
-- 6. game_achievement_templates — one-time-unlock reference data.
-- ============================================================
create table public.game_achievement_templates (
  id text primary key,
  title text not null,
  description text not null,
  metric_key text not null check (metric_key in (
    'rentals_completed', 'contracts_completed', 'requests_fulfilled', 'total_profit', 'reputation'
  )),
  target numeric not null,
  reward_cx_points integer not null default 0,
  icon text not null,
  rarity text not null default 'common' check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic')),
  sort_order integer not null
);

insert into public.game_achievement_templates
  (id, title, description, metric_key, target, reward_cx_points, icon, rarity, sort_order)
values
  ('first_rental_ach', 'First Fleet Move', 'Complete your first district rental.', 'rentals_completed', 1, 200, 'pin', 'common', 1),
  ('hundred_rentals', 'City Operator', 'Complete 100 district rentals.', 'rentals_completed', 100, 3000, 'trophy', 'epic', 2),
  ('first_profit_10k', 'First €10K Profit', 'Reach €10,000 in total lifetime profit.', 'total_profit', 10000, 1000, 'trending', 'rare', 3),
  ('first_contract_ach', 'Corporate Partner', 'Complete your first corporate contract.', 'contracts_completed', 1, 1500, 'handshake', 'rare', 4),
  ('city_icon', 'City Icon', 'Reach 90 reputation.', 'reputation', 90, 2500, 'gem', 'legendary', 5);

alter table public.game_achievement_templates enable row level security;
create policy "Achievement templates are publicly readable"
  on public.game_achievement_templates for select
  using (true);

-- ============================================================
-- 7. game_customer_requests — urgent, lazily-generated one-off rental
--    offers. Created before game_rentals since game_rentals FKs to it;
--    the reverse FK (fulfilled_rental_id) is added after game_rentals
--    exists, below.
-- ============================================================
create table public.game_customer_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  district_key text not null references public.game_districts(district_key),
  category text not null,
  customer_name text not null,
  bonus_pct integer not null check (bonus_pct between 10 and 100),
  duration_days integer not null check (duration_days in (1, 3)),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  fulfilled_rental_id uuid
);
create index game_customer_requests_user_status_idx on public.game_customer_requests (user_id, status);
alter table public.game_customer_requests enable row level security;
create policy "Users view their own customer requests"
  on public.game_customer_requests for select
  using (auth.uid() = user_id);

-- ============================================================
-- 8. game_rentals — a player's active/resolved assignment of one of
--    their own owned cars to a district (or to a customer request).
-- ============================================================
create table public.game_rentals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  inventory_id uuid not null references public.game_inventory(id) on delete cascade,
  district_key text not null references public.game_districts(district_key),
  category text not null,
  duration_days integer not null check (duration_days in (1, 3, 7)),
  daily_rate numeric not null,
  demand_tier text not null check (demand_tier in ('low', 'normal', 'high', 'hot', 'iconic')),
  payout numeric not null,
  source text not null default 'standard' check (source in ('standard', 'customer_request')),
  customer_request_id uuid references public.game_customer_requests(id),
  started_at timestamptz not null default now(),
  resolves_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  resolved_at timestamptz
);
create index game_rentals_user_status_idx on public.game_rentals (user_id, status);
alter table public.game_rentals enable row level security;
create policy "Users view their own rentals"
  on public.game_rentals for select
  using (auth.uid() = user_id);

alter table public.game_customer_requests
  add constraint game_customer_requests_fulfilled_rental_fkey
  foreign key (fulfilled_rental_id) references public.game_rentals(id);

-- ============================================================
-- 9. game_contract_commitments — a player's active/resolved commitment
--    to a corporate contract.
-- ============================================================
create table public.game_contract_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  contract_id text not null references public.game_corporate_contracts(id),
  inventory_ids uuid[] not null,
  started_at timestamptz not null default now(),
  resolves_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  payout numeric not null,
  resolved_at timestamptz
);
create unique index game_contract_commitments_one_active_idx
  on public.game_contract_commitments (user_id, contract_id) where status = 'active';
alter table public.game_contract_commitments enable row level security;
create policy "Users view their own contract commitments"
  on public.game_contract_commitments for select
  using (auth.uid() = user_id);

-- ============================================================
-- 10. game_daily_progress — one row per player, reset in place when a
--     new day is seen (same rotated_at idiom as game_vehicle_demand).
-- ============================================================
create table public.game_daily_progress (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  day date not null default current_date,
  daily_rentals_completed integer not null default 0,
  daily_requests_fulfilled integer not null default 0
);
alter table public.game_daily_progress enable row level security;
create policy "Users view their own daily progress"
  on public.game_daily_progress for select
  using (auth.uid() = user_id);

-- ============================================================
-- 11. game_mission_claims — one row per claimed mission. scope is
--     denormalized from the template at claim time since a partial
--     index predicate can't subquery another table.
-- ============================================================
create table public.game_mission_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mission_id text not null references public.game_mission_templates(id),
  scope text not null check (scope in ('lifetime', 'daily')),
  claim_date date not null default current_date,
  claimed_at timestamptz not null default now()
);
create unique index game_mission_claims_lifetime_idx
  on public.game_mission_claims (user_id, mission_id) where scope = 'lifetime';
create unique index game_mission_claims_daily_idx
  on public.game_mission_claims (user_id, mission_id, claim_date) where scope = 'daily';
alter table public.game_mission_claims enable row level security;
create policy "Users view their own mission claims"
  on public.game_mission_claims for select
  using (auth.uid() = user_id);

-- ============================================================
-- 12. game_achievement_unlocks — one row per unlocked achievement.
-- ============================================================
create table public.game_achievement_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null references public.game_achievement_templates(id),
  unlocked_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);
alter table public.game_achievement_unlocks enable row level security;
create policy "Users view their own achievement unlocks"
  on public.game_achievement_unlocks for select
  using (auth.uid() = user_id);

-- ============================================================
-- 13. RPCs
-- ============================================================

-- Internal — not granted. Rarity → rank, for the contract's minimum-
-- rarity gate.
create or replace function public._rarity_rank(p_rarity text)
returns integer
language sql
immutable
as $$
  select case p_rarity
    when 'common' then 1 when 'uncommon' then 2 when 'rare' then 3
    when 'epic' then 4 when 'legendary' then 5 when 'mythic' then 6
    else 0
  end;
$$;

-- Internal — not granted. Server-computed daily rental rate for a given
-- owned car in a given district: base market value, district multiplier,
-- live demand + any active city event bonus for that (district,
-- category), scaled down for a car in poor condition.
create or replace function public._rental_daily_rate(p_inventory_id uuid, p_district_key text)
returns numeric
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_car public.game_inventory;
  v_template public.game_vehicle_templates;
  v_district public.game_districts;
  v_demand public.game_district_demand;
  v_event_bonus integer;
  v_condition_factor numeric;
begin
  select * into v_car from public.game_inventory where id = p_inventory_id;
  select * into v_template from public.game_vehicle_templates where id = v_car.template_id;
  select * into v_district from public.game_districts where district_key = p_district_key;
  select * into v_demand from public.game_district_demand
  where district_key = p_district_key and category = v_template.category;

  select coalesce(sum(effect_pct), 0) into v_event_bonus
  from public.game_city_events
  where district_key = p_district_key and ends_at > now()
    and (category is null or category = v_template.category);

  v_condition_factor := (v_car.condition_engine + v_car.condition_body + v_car.condition_interior) / 300.0;

  return round(
    v_car.market_value * 0.012
    * v_district.base_rate_multiplier
    * (1 + (coalesce(v_demand.demand_pct, 0) + v_event_bonus) / 100.0)
    * greatest(0.4, v_condition_factor)
  );
end;
$$;

-- Assign an owned car to a district for a fixed duration.
create or replace function public.assign_car_to_rental(p_inventory_id uuid, p_district_key text, p_duration_days integer)
returns public.game_rentals
language plpgsql
security definer set search_path = public
as $$
declare
  v_car public.game_inventory;
  v_template public.game_vehicle_templates;
  v_demand public.game_district_demand;
  v_daily_rate numeric;
  v_multiplier numeric;
  v_rental public.game_rentals;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_duration_days not in (1, 3, 7) then
    raise exception 'Invalid rental duration';
  end if;

  select * into v_car from public.game_inventory
  where id = p_inventory_id and user_id = auth.uid() and status = 'owned' for update;
  if v_car is null then
    raise exception 'Vehicle not found';
  end if;

  select * into v_template from public.game_vehicle_templates where id = v_car.template_id;

  perform public.ensure_district_demand();
  select * into v_demand from public.game_district_demand
  where district_key = p_district_key and category = v_template.category;

  v_daily_rate := public._rental_daily_rate(p_inventory_id, p_district_key);
  v_multiplier := case when p_duration_days >= 7 then 1.10 when p_duration_days >= 3 then 1.05 else 1.0 end;

  update public.game_inventory set status = 'rented' where id = p_inventory_id;

  insert into public.game_rentals (
    user_id, inventory_id, district_key, category, duration_days,
    daily_rate, demand_tier, payout, resolves_at
  ) values (
    auth.uid(), p_inventory_id, p_district_key, v_template.category, p_duration_days,
    v_daily_rate, coalesce(v_demand.demand_tier, 'normal'),
    round(v_daily_rate * p_duration_days * v_multiplier),
    now() + (p_duration_days || ' days')::interval
  )
  returning * into v_rental;

  return v_rental;
end;
$$;

-- Insert-if-missing, reset if the day has rolled over.
create or replace function public.ensure_daily_progress()
returns public.game_daily_progress
language plpgsql
security definer set search_path = public
as $$
declare
  v_progress public.game_daily_progress;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.game_daily_progress (user_id) values (auth.uid())
  on conflict (user_id) do nothing;

  update public.game_daily_progress
  set day = current_date, daily_rentals_completed = 0, daily_requests_fulfilled = 0
  where user_id = auth.uid() and day < current_date;

  select * into v_progress from public.game_daily_progress where user_id = auth.uid();
  return v_progress;
end;
$$;

-- The lazy-resolution entry point for district rentals — mirrors
-- resolve_due_listings() exactly.
create or replace function public.resolve_due_rentals()
returns setof public.game_rentals
language plpgsql
security definer set search_path = public
as $$
declare
  v_rental record;
  v_cx_points integer;
begin
  if auth.uid() is null then
    return;
  end if;

  perform public.ensure_daily_progress();

  for v_rental in
    select * from public.game_rentals
    where user_id = auth.uid() and status = 'active' and resolves_at <= now()
    for update
  loop
    update public.game_player_state
    set cash = cash + v_rental.payout,
        total_revenue = total_revenue + v_rental.payout,
        rentals_completed = rentals_completed + 1,
        requests_fulfilled = requests_fulfilled + (case when v_rental.source = 'customer_request' then 1 else 0 end)
    where user_id = auth.uid();

    update public.game_daily_progress
    set daily_rentals_completed = daily_rentals_completed + 1,
        daily_requests_fulfilled = daily_requests_fulfilled + (case when v_rental.source = 'customer_request' then 1 else 0 end)
    where user_id = auth.uid();

    update public.game_inventory set status = 'owned' where id = v_rental.inventory_id;

    update public.game_rentals set status = 'completed', resolved_at = now() where id = v_rental.id;

    v_cx_points := least(300, greatest(15, round(v_rental.payout / 150)));
    perform public.award_cx_score(auth.uid(), 'district_rental_completed', v_cx_points, v_rental.id);
    if v_rental.duration_days >= 7 then
      perform public.award_cx_score(auth.uid(), 'district_rental_length_bonus', 150, v_rental.id);
    end if;
  end loop;

  return query
  select * from public.game_rentals
  where user_id = auth.uid()
  order by
    case status when 'active' then 0 else 1 end,
    coalesce(resolved_at, started_at) desc;
end;
$$;

create or replace function public.cancel_rental(p_rental_id uuid)
returns public.game_inventory
language plpgsql
security definer set search_path = public
as $$
declare
  v_rental public.game_rentals;
  v_car public.game_inventory;
begin
  select * into v_rental from public.game_rentals
  where id = p_rental_id and user_id = auth.uid() and status = 'active' for update;
  if v_rental is null then
    raise exception 'Rental not found';
  end if;

  update public.game_rentals set status = 'cancelled', resolved_at = now() where id = p_rental_id;
  update public.game_inventory set status = 'owned' where id = v_rental.inventory_id
  returning * into v_car;

  return v_car;
end;
$$;

-- Expires stale pending requests and, for auth.uid(), rolls a chance at
-- a new one if fewer than 2 remain pending.
create or replace function public.ensure_customer_requests()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_pending_count integer;
  v_district text;
  v_category text;
  v_names text[] := array['Alex Morgan','Daniel Rossi','Noah Bennett','Marco Romano','Lucas Martin',
                           'Sofia Kane','Emma Laurent','Liam Foster','Olivia Chen','Ethan Brooks',
                           'Isabella Cruz','Mason Reid','Ava Sullivan','James Whitfield','Mia Delgado'];
begin
  if auth.uid() is null then
    return;
  end if;

  update public.game_customer_requests
  set status = 'expired'
  where user_id = auth.uid() and status = 'pending' and expires_at < now();

  select count(*) into v_pending_count from public.game_customer_requests
  where user_id = auth.uid() and status = 'pending';

  if v_pending_count >= 2 or random() >= 0.5 then
    return;
  end if;

  select district_key into v_district from public.game_districts order by random() limit 1;
  select category into v_category from public.game_vehicle_templates where active order by random() limit 1;

  insert into public.game_customer_requests (user_id, district_key, category, customer_name, bonus_pct, duration_days, expires_at)
  values (
    auth.uid(), v_district, v_category,
    v_names[1 + floor(random() * array_length(v_names, 1))::int],
    10 + floor(random() * 61)::int,
    (array[1, 3])[1 + floor(random() * 2)::int],
    now() + ((10 + random() * 20) || ' minutes')::interval
  );
end;
$$;

create or replace function public.accept_customer_request(p_request_id uuid, p_inventory_id uuid)
returns public.game_rentals
language plpgsql
security definer set search_path = public
as $$
declare
  v_request public.game_customer_requests;
  v_car public.game_inventory;
  v_template public.game_vehicle_templates;
  v_base numeric;
  v_payout numeric;
  v_demand public.game_district_demand;
  v_rental public.game_rentals;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_request from public.game_customer_requests
  where id = p_request_id and user_id = auth.uid() and status = 'pending' and expires_at > now()
  for update;
  if v_request is null then
    raise exception 'This request is no longer available';
  end if;

  select * into v_car from public.game_inventory
  where id = p_inventory_id and user_id = auth.uid() and status = 'owned' for update;
  if v_car is null then
    raise exception 'Vehicle not found';
  end if;

  select * into v_template from public.game_vehicle_templates where id = v_car.template_id;
  if v_template.category <> v_request.category then
    raise exception 'This vehicle does not match the requested category';
  end if;

  perform public.ensure_district_demand();
  select * into v_demand from public.game_district_demand
  where district_key = v_request.district_key and category = v_template.category;

  v_base := public._rental_daily_rate(p_inventory_id, v_request.district_key) * v_request.duration_days;
  v_payout := round(v_base * (1 + v_request.bonus_pct / 100.0));

  update public.game_inventory set status = 'rented' where id = p_inventory_id;

  insert into public.game_rentals (
    user_id, inventory_id, district_key, category, duration_days,
    daily_rate, demand_tier, payout, source, customer_request_id, resolves_at
  ) values (
    auth.uid(), p_inventory_id, v_request.district_key, v_template.category, v_request.duration_days,
    round(v_base / v_request.duration_days), coalesce(v_demand.demand_tier, 'normal'), v_payout,
    'customer_request', p_request_id,
    now() + (v_request.duration_days || ' days')::interval
  )
  returning * into v_rental;

  update public.game_customer_requests
  set status = 'accepted', fulfilled_rental_id = v_rental.id
  where id = p_request_id;

  perform public.award_cx_score(auth.uid(), 'customer_request_fulfilled', 250, p_request_id);

  return v_rental;
end;
$$;

create or replace function public.decline_customer_request(p_request_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.game_customer_requests
  set status = 'expired'
  where id = p_request_id and user_id = auth.uid() and status = 'pending';
end;
$$;

-- Claim a mission's reward once its target has been reached. metric_key
-- is read via a fixed case, never dynamic SQL.
create or replace function public.claim_mission(p_mission_id text)
returns table (cash_awarded numeric, cx_awarded integer)
language plpgsql
security definer set search_path = public
as $$
declare
  v_mission public.game_mission_templates;
  v_state public.game_player_state;
  v_progress public.game_daily_progress;
  v_value numeric;
  v_ref uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_mission from public.game_mission_templates where id = p_mission_id;
  if v_mission is null then
    raise exception 'Mission not found';
  end if;

  perform public.ensure_my_player_state();
  v_progress := public.ensure_daily_progress();
  select * into v_state from public.game_player_state where user_id = auth.uid() for update;

  v_value := case v_mission.metric_key
    when 'rentals_completed' then v_state.rentals_completed
    when 'contracts_completed' then v_state.contracts_completed
    when 'requests_fulfilled' then v_state.requests_fulfilled
    when 'daily_rentals_completed' then v_progress.daily_rentals_completed
    when 'daily_requests_fulfilled' then v_progress.daily_requests_fulfilled
  end;

  if v_value < v_mission.target then
    raise exception 'Mission not complete yet';
  end if;

  v_ref := case when v_mission.scope = 'daily'
    then public.deterministic_ref('mission:' || p_mission_id || ':' || current_date::text)
    else public.deterministic_ref('mission:' || p_mission_id)
  end;

  insert into public.game_mission_claims (user_id, mission_id, scope, claim_date)
  values (auth.uid(), p_mission_id, v_mission.scope, current_date)
  on conflict do nothing;
  if not found then
    raise exception 'Mission already claimed';
  end if;

  update public.game_player_state
  set cash = cash + v_mission.reward_cash, total_revenue = total_revenue + v_mission.reward_cash
  where user_id = auth.uid();

  perform public.award_cx_score(auth.uid(), 'mission_reward_claimed', v_mission.reward_cx_points, v_ref);

  cash_awarded := v_mission.reward_cash;
  cx_awarded := v_mission.reward_cx_points;
  return next;
end;
$$;

-- Pull-based achievement check — called opportunistically by the
-- client, not hooked into any other RPC. Returns only what was newly
-- unlocked this call (usually nothing).
create or replace function public.check_and_award_achievements()
returns table (achievement_id text, title text, description text, icon text, rarity text, reward_cx_points integer)
language plpgsql
security definer set search_path = public
as $$
declare
  v_state public.game_player_state;
  v_template public.game_achievement_templates;
  v_value numeric;
begin
  if auth.uid() is null then
    return;
  end if;

  perform public.ensure_my_player_state();
  select * into v_state from public.game_player_state where user_id = auth.uid();

  for v_template in
    select t.* from public.game_achievement_templates t
    where not exists (
      select 1 from public.game_achievement_unlocks u
      where u.user_id = auth.uid() and u.achievement_id = t.id
    )
  loop
    v_value := case v_template.metric_key
      when 'rentals_completed' then v_state.rentals_completed
      when 'contracts_completed' then v_state.contracts_completed
      when 'requests_fulfilled' then v_state.requests_fulfilled
      when 'total_profit' then v_state.total_revenue - v_state.total_expenses
      when 'reputation' then v_state.reputation
    end;

    if v_value >= v_template.target then
      insert into public.game_achievement_unlocks (user_id, achievement_id)
      values (auth.uid(), v_template.id)
      on conflict do nothing;

      if found then
        perform public.award_cx_score(
          auth.uid(), 'achievement_unlocked', v_template.reward_cx_points,
          public.deterministic_ref('achievement:' || v_template.id)
        );
        achievement_id := v_template.id;
        title := v_template.title;
        description := v_template.description;
        icon := v_template.icon;
        rarity := v_template.rarity;
        reward_cx_points := v_template.reward_cx_points;
        return next;
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.accept_corporate_contract(p_contract_id text, p_inventory_ids uuid[])
returns public.game_contract_commitments
language plpgsql
security definer set search_path = public
as $$
declare
  v_contract public.game_corporate_contracts;
  v_state public.game_player_state;
  v_id uuid;
  v_car public.game_inventory;
  v_template public.game_vehicle_templates;
  v_commitment public.game_contract_commitments;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_contract from public.game_corporate_contracts where id = p_contract_id;
  if v_contract is null then
    raise exception 'Contract not found';
  end if;

  if exists (
    select 1 from public.game_contract_commitments
    where user_id = auth.uid() and contract_id = p_contract_id and status = 'active'
  ) then
    raise exception 'You already have this contract active';
  end if;

  perform public.ensure_my_player_state();
  select * into v_state from public.game_player_state where user_id = auth.uid() for update;
  if v_state.business_tier < v_contract.min_business_tier then
    raise exception 'Business tier too low for this contract';
  end if;

  if array_length(p_inventory_ids, 1) is null or array_length(p_inventory_ids, 1) <> v_contract.required_vehicle_count then
    raise exception 'This contract requires exactly % vehicles', v_contract.required_vehicle_count;
  end if;

  foreach v_id in array p_inventory_ids loop
    select * into v_car from public.game_inventory
    where id = v_id and user_id = auth.uid() and status = 'owned' for update;
    if v_car is null then
      raise exception 'One of the selected vehicles is not available';
    end if;
    select * into v_template from public.game_vehicle_templates where id = v_car.template_id;
    if public._rarity_rank(v_template.rarity) < public._rarity_rank(v_contract.required_min_rarity) then
      raise exception 'Every selected vehicle must be % or better', v_contract.required_min_rarity;
    end if;
  end loop;

  update public.game_inventory set status = 'rented' where id = any(p_inventory_ids);

  insert into public.game_contract_commitments (user_id, contract_id, inventory_ids, resolves_at, payout)
  values (auth.uid(), p_contract_id, p_inventory_ids, now() + (v_contract.duration_days || ' days')::interval, v_contract.lump_sum_payout)
  returning * into v_commitment;

  return v_commitment;
end;
$$;

create or replace function public.resolve_due_contracts()
returns setof public.game_contract_commitments
language plpgsql
security definer set search_path = public
as $$
declare
  v_commitment record;
begin
  if auth.uid() is null then
    return;
  end if;

  for v_commitment in
    select * from public.game_contract_commitments
    where user_id = auth.uid() and status = 'active' and resolves_at <= now()
    for update
  loop
    update public.game_player_state
    set cash = cash + v_commitment.payout,
        total_revenue = total_revenue + v_commitment.payout,
        contracts_completed = contracts_completed + 1
    where user_id = auth.uid();

    update public.game_inventory set status = 'owned' where id = any(v_commitment.inventory_ids);

    update public.game_contract_commitments set status = 'completed', resolved_at = now() where id = v_commitment.id;

    perform public.award_cx_score(
      auth.uid(), 'corporate_contract_completed',
      (select cx_score_bonus from public.game_corporate_contracts where id = v_commitment.contract_id),
      v_commitment.id
    );
  end loop;

  return query
  select * from public.game_contract_commitments
  where user_id = auth.uid()
  order by
    case status when 'active' then 0 else 1 end,
    coalesce(resolved_at, started_at) desc;
end;
$$;

create or replace function public.cancel_contract_commitment(p_commitment_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_commitment public.game_contract_commitments;
begin
  select * into v_commitment from public.game_contract_commitments
  where id = p_commitment_id and user_id = auth.uid() and status = 'active' for update;
  if v_commitment is null then
    raise exception 'Commitment not found';
  end if;

  update public.game_contract_commitments set status = 'cancelled', resolved_at = now() where id = p_commitment_id;
  update public.game_inventory set status = 'owned' where id = any(v_commitment.inventory_ids);
end;
$$;

-- Cross-player leaderboard read — the one RPC that legitimately bypasses
-- another player's row-level select restriction, scoped to only the
-- columns needed for display. Net-worth formula matches empire.ts's
-- client-side estimateNetWorth() exactly.
create or replace function public.fetch_empire_leaderboard(p_limit integer default 20)
returns table (user_id uuid, full_name text, avatar_url text, business_tier integer, net_worth numeric)
language sql
stable
security definer set search_path = public
as $$
  select
    gps.user_id,
    p.full_name,
    p.avatar_url,
    gps.business_tier,
    round(gps.cash + coalesce(inv.value, 0)) as net_worth
  from public.game_player_state gps
  join public.profiles p on p.id = gps.user_id
  left join (
    select user_id, sum(market_value * ((condition_engine + condition_body + condition_interior) / 300.0)) as value
    from public.game_inventory
    where status in ('owned', 'listed', 'rented')
    group by user_id
  ) inv on inv.user_id = gps.user_id
  order by net_worth desc
  limit p_limit;
$$;

grant execute on function public.assign_car_to_rental(uuid, text, integer) to authenticated;
grant execute on function public.resolve_due_rentals() to authenticated;
grant execute on function public.cancel_rental(uuid) to authenticated;
grant execute on function public.ensure_customer_requests() to authenticated;
grant execute on function public.accept_customer_request(uuid, uuid) to authenticated;
grant execute on function public.decline_customer_request(uuid) to authenticated;
grant execute on function public.ensure_daily_progress() to authenticated;
grant execute on function public.claim_mission(text) to authenticated;
grant execute on function public.check_and_award_achievements() to authenticated;
grant execute on function public.accept_corporate_contract(text, uuid[]) to authenticated;
grant execute on function public.resolve_due_contracts() to authenticated;
grant execute on function public.cancel_contract_commitment(uuid) to authenticated;
grant execute on function public.fetch_empire_leaderboard(integer) to authenticated;
