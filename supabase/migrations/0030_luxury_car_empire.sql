-- CX RENT — LUXURY CAR EMPIRE.
--
-- Replaces the CX Drive Challenge racing minigame with a business-
-- management game built on the same authenticated account, the same
-- `profiles` row, and the same CX Score ledger (0029_cx_score_system.sql)
-- as the rest of CX Rent — there is no separate fake player account
-- system here, and no game state lives on `profiles` itself (that table's
-- `update using (auth.uid() = id)` policy has no column-level lock, so a
-- client could otherwise edit its own cash/reputation directly). Every
-- table below either has no client write policy at all (mutated only by
-- the `security definer` functions in this file, the same pattern as
-- `claim_game_reward`) or is pure public reference data.
--
-- Scope of this pass: the full BUY → RESTORE → CUSTOMIZE → SELL → PROFIT
-- loop, a rotating market, a collection with real rarity, and business-
-- tier progression that gates on both cash and CX Score. The Auction
-- House (spec §6) is intentionally NOT included here — a live, time-
-- boxed bidding system needs background resolution this schema doesn't
-- yet have scaffolding for, and shipping a half-real version of it would
-- be worse than shipping none. Showroom presentation (§7) and Business
-- Expansion (§8) are also merged into one `business_tier` ladder rather
-- than two parallel ones — the spec's two lists are nearly the same
-- shape, and a display tier that can disagree with the business tier
-- would just be confusing.

-- ============================================================
-- 1. game_player_state — cash, reputation, business tier. One row per
--    player, created lazily on first touch by ensure_player_state().
-- ============================================================
create table public.game_player_state (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  cash numeric not null default 25000 check (cash >= 0),
  reputation integer not null default 50 check (reputation between 0 and 100),
  business_tier integer not null default 1,
  total_revenue numeric not null default 0,
  total_expenses numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.game_player_state enable row level security;
create policy "Users view their own Empire state"
  on public.game_player_state for select
  using (auth.uid() = user_id);

create or replace function public.ensure_player_state(p_user_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  insert into public.game_player_state (user_id) values (p_user_id)
  on conflict (user_id) do nothing;
$$;

-- Public wrapper so the client can guarantee its own row exists (e.g. on
-- first visit to the Empire dashboard) without any other capability.
create or replace function public.ensure_my_player_state()
returns public.game_player_state
language plpgsql
security definer set search_path = public
as $$
declare v_state public.game_player_state;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  perform public.ensure_player_state(auth.uid());
  select * into v_state from public.game_player_state where user_id = auth.uid();
  return v_state;
end;
$$;

grant execute on function public.ensure_my_player_state() to authenticated;

-- ============================================================
-- 2. game_business_tiers — the merged Showroom/Business-Expansion
--    ladder. Gated on BOTH cash and CX Score so it can't be rushed by
--    money alone, per the spec's "meaningful and difficult enough".
-- ============================================================
create table public.game_business_tiers (
  tier integer primary key,
  name text not null,
  cash_required numeric not null,
  cx_score_required integer not null default 0,
  display_slots integer not null,
  milestone_cx_bonus integer not null default 0,
  description text not null
);

insert into public.game_business_tiers (tier, name, cash_required, cx_score_required, display_slots, milestone_cx_bonus, description) values
  (1, 'Small Garage',          0,       0,     3,  0,     'A single-car garage — everyone starts here.'),
  (2, 'Local Dealer',          50000,   500,   5,  5000,  'A small local lot with room to grow.'),
  (3, 'Premium Dealer',        150000,  1500,  8,  8000,  'A respected dealer known for quality stock.'),
  (4, 'Luxury Dealership',     400000,  3000,  12, 12000, 'A proper luxury dealership with a real showroom floor.'),
  (5, 'Elite Automotive Group',1000000, 10000, 18, 16000, 'Multiple locations, elite clientele.'),
  (6, 'Global Car Empire',     3000000, 20000, 30, 20000, 'A global operation — the top of the trade.');

alter table public.game_business_tiers enable row level security;
create policy "Business tiers are publicly readable"
  on public.game_business_tiers for select
  using (true);

create or replace function public.upgrade_business()
returns public.game_player_state
language plpgsql
security definer set search_path = public
as $$
declare
  v_state public.game_player_state;
  v_next public.game_business_tiers;
  v_score integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  perform public.ensure_player_state(auth.uid());

  select * into v_state from public.game_player_state where user_id = auth.uid() for update;
  select * into v_next from public.game_business_tiers where tier = v_state.business_tier + 1;

  if v_next is null then
    raise exception 'You have already reached the highest business tier';
  end if;

  select coalesce(score, 0) into v_score from public.cx_scores where user_id = auth.uid();
  if coalesce(v_score, 0) < v_next.cx_score_required then
    raise exception 'Your CX Score is too low for this upgrade';
  end if;

  update public.game_player_state
  set business_tier = v_next.tier,
      cash = cash - v_next.cash_required,
      total_expenses = total_expenses + v_next.cash_required
  where user_id = auth.uid() and cash >= v_next.cash_required;

  if not found then
    raise exception 'Not enough cash for this upgrade';
  end if;

  if v_next.milestone_cx_bonus > 0 then
    perform public.award_cx_score(
      auth.uid(), 'showroom_milestone', v_next.milestone_cx_bonus,
      public.deterministic_ref('business_tier:' || v_next.tier::text)
    );
  end if;

  select * into v_state from public.game_player_state where user_id = auth.uid();
  return v_state;
end;
$$;

grant execute on function public.upgrade_business() to authenticated;

-- ============================================================
-- 3. game_vehicle_templates — the actual vehicle catalog. Genuinely
--    different body categories per rarity tier, not recolors of one
--    shape; `silhouette` is a key the frontend maps to a hand-drawn
--    body outline distinct per category.
-- ============================================================
create table public.game_vehicle_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text not null,
  category text not null,
  rarity text not null check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic')),
  base_price numeric not null,
  top_speed integer not null,
  acceleration integer not null check (acceleration between 1 and 100),
  handling integer not null check (handling between 1 and 100),
  braking integer not null check (braking between 1 and 100),
  silhouette text not null,
  active boolean not null default true
);

insert into public.game_vehicle_templates
  (name, brand, category, rarity, base_price, top_speed, acceleration, handling, braking, silhouette) values
  ('Metro Runabout',   'Vantail',   'Hatchback',        'common',    9500,   175, 40, 55, 50, 'hatchback'),
  ('Highway Cruiser',  'Corsair',   'Sedan',             'common',    14000,  195, 45, 50, 55, 'sedan'),
  ('Trail Blazer',     'Corsair',   'SUV',               'uncommon',  24000,  185, 42, 48, 58, 'suv'),
  ('Retro Coupe',      'Belline',   'Classic Coupe',     'uncommon',  29000,  205, 55, 60, 52, 'coupe'),
  ('Nightfury X',      'Kestrel',   'Sports Car',        'rare',      82000,  270, 78, 75, 72, 'sports'),
  ('Apex GTR',         'Draymond',  'Sports Car',        'rare',      95000,  280, 80, 78, 75, 'sports'),
  ('Vortex Spyder',    'Kestrel',   'Convertible',       'epic',      165000, 305, 86, 80, 78, 'convertible'),
  ('Titan 4x4',        'Ironclad',  'Luxury Off-Roader', 'epic',      145000, 240, 70, 68, 80, 'offroad'),
  ('Phantom Reaper',   'Obsidia',   'Hypercar',          'legendary', 420000, 350, 95, 88, 90, 'hypercar'),
  ('Obsidian Landau',  'Obsidia',   'Ultra-Luxury Sedan','legendary', 380000, 260, 72, 70, 85, 'limousine'),
  ('Eclipse Zero',     'Meridian',  'Prototype Hypercar','mythic',    950000, 390, 99, 92, 94, 'hypercar-wing'),
  ('Celestial One',    'Meridian',  'Concept One-Off',   'mythic',    1250000,405, 100,95, 95, 'concept');

alter table public.game_vehicle_templates enable row level security;
create policy "Vehicle templates are publicly readable"
  on public.game_vehicle_templates for select
  using (active);

-- ============================================================
-- 4. game_market_listings — the rotating market. Refreshed lazily (no
--    cron available): every read call expires stale rows and tops the
--    active pool back up to a minimum size, mirroring the
--    expire_stale_holds()-inside-quote_booking pattern already used for
--    booking holds.
-- ============================================================
create table public.game_market_listings (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.game_vehicle_templates (id),
  price numeric not null,
  market_value numeric not null,
  condition_pct integer not null check (condition_pct between 1 and 100),
  mileage_km integer not null default 0,
  listed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'available' check (status in ('available', 'sold', 'expired'))
);

create index game_market_listings_status_idx on public.game_market_listings (status);

alter table public.game_market_listings enable row level security;
create policy "Market listings are publicly readable"
  on public.game_market_listings for select
  using (true);

create or replace function public.refresh_and_list_market()
returns table (
  id uuid, template_id uuid, name text, brand text, category text, rarity text,
  price numeric, market_value numeric, condition_pct integer, mileage_km integer,
  top_speed integer, acceleration integer, handling integer, braking integer,
  silhouette text, expires_at timestamptz
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_active_count integer;
  v_template public.game_vehicle_templates;
  v_condition integer;
  v_price numeric;
begin
  update public.game_market_listings set status = 'expired'
  where status = 'available' and expires_at < now();

  select count(*) into v_active_count from public.game_market_listings where status = 'available';

  while v_active_count < 8 loop
    select * into v_template from public.game_vehicle_templates
    where active order by random() limit 1;

    v_condition := 55 + floor(random() * 40)::int;
    v_price := round(v_template.base_price * (0.85 + random() * 0.3) * (0.7 + v_condition / 200.0));

    insert into public.game_market_listings (template_id, price, market_value, condition_pct, mileage_km, expires_at)
    values (
      v_template.id, v_price,
      round(v_template.base_price * (0.95 + random() * 0.25)),
      v_condition, floor(random() * 80000)::int,
      now() + interval '6 hours'
    );
    v_active_count := v_active_count + 1;
  end loop;

  return query
    select l.id, l.template_id, t.name, t.brand, t.category, t.rarity,
      l.price, l.market_value, l.condition_pct, l.mileage_km,
      t.top_speed, t.acceleration, t.handling, t.braking, t.silhouette, l.expires_at
    from public.game_market_listings l
    join public.game_vehicle_templates t on t.id = l.template_id
    where l.status = 'available'
    order by l.listed_at desc;
end;
$$;

grant execute on function public.refresh_and_list_market() to authenticated;

-- ============================================================
-- 5. game_inventory — cars the player actually owns.
-- ============================================================
create table public.game_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  template_id uuid not null references public.game_vehicle_templates (id),
  purchase_price numeric not null,
  market_value numeric not null,
  condition_engine integer not null check (condition_engine between 0 and 100),
  condition_body integer not null check (condition_body between 0 and 100),
  condition_interior integer not null check (condition_interior between 0 and 100),
  mileage_km integer not null default 0,
  customization jsonb not null default '{}'::jsonb,
  status text not null default 'owned' check (status in ('owned', 'sold')),
  acquired_at timestamptz not null default now(),
  sold_at timestamptz,
  sale_price numeric
);

create index game_inventory_user_id_idx on public.game_inventory (user_id, status);

alter table public.game_inventory enable row level security;
create policy "Users view their own Empire inventory"
  on public.game_inventory for select
  using (auth.uid() = user_id);

-- ============================================================
-- 6. buy_market_car — locks the listing to prevent two buyers racing
--    for the same car, then debits cash with the same
--    check-in-the-WHERE-clause pattern used everywhere else in this
--    file (atomic, no separate read-then-write window).
-- ============================================================
create or replace function public.buy_market_car(p_listing_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_listing public.game_market_listings;
  v_rarity text;
  v_inventory_id uuid;
  v_achievement_points integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  perform public.ensure_player_state(auth.uid());

  select * into v_listing from public.game_market_listings where id = p_listing_id for update;
  if v_listing is null or v_listing.status <> 'available' or v_listing.expires_at < now() then
    raise exception 'This listing is no longer available';
  end if;

  update public.game_market_listings set status = 'sold' where id = p_listing_id;

  update public.game_player_state
  set cash = cash - v_listing.price,
      total_expenses = total_expenses + v_listing.price
  where user_id = auth.uid() and cash >= v_listing.price;

  if not found then
    -- Roll the listing back so the failed purchase doesn't burn it.
    update public.game_market_listings set status = 'available' where id = p_listing_id;
    raise exception 'Not enough cash for this purchase';
  end if;

  select rarity into v_rarity from public.game_vehicle_templates where id = v_listing.template_id;

  insert into public.game_inventory
    (user_id, template_id, purchase_price, market_value, condition_engine, condition_body, condition_interior, mileage_km)
  values
    (auth.uid(), v_listing.template_id, v_listing.price, v_listing.market_value,
     v_listing.condition_pct, v_listing.condition_pct, v_listing.condition_pct, v_listing.mileage_km)
  returning id into v_inventory_id;

  v_achievement_points := case v_rarity
    when 'mythic' then 10000
    when 'legendary' then 3000
    when 'rare' then 1000
    else 0
  end;
  if v_achievement_points > 0 then
    perform public.award_cx_score(auth.uid(), 'vehicle_acquired_' || v_rarity, v_achievement_points, v_inventory_id);
  end if;

  return v_inventory_id;
end;
$$;

grant execute on function public.buy_market_car(uuid) to authenticated;

-- ============================================================
-- 7. Condition repair — fixed, server-priced costs (spec's example
--    numbers), never trusted from the client.
-- ============================================================
create table public.game_repair_costs (
  component text primary key check (component in ('engine', 'body', 'interior')),
  label text not null,
  cost numeric not null
);

insert into public.game_repair_costs (component, label, cost) values
  ('engine', 'Engine Repair', 8500),
  ('body', 'Body Restoration', 4200),
  ('interior', 'Interior Restoration', 3000);

alter table public.game_repair_costs enable row level security;
create policy "Repair costs are publicly readable"
  on public.game_repair_costs for select
  using (true);

create or replace function public.repair_car(p_inventory_id uuid, p_component text)
returns public.game_inventory
language plpgsql
security definer set search_path = public
as $$
declare
  v_car public.game_inventory;
  v_cost numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_component not in ('engine', 'body', 'interior') then
    raise exception 'Invalid component';
  end if;

  select cost into v_cost from public.game_repair_costs where component = p_component;

  select * into v_car from public.game_inventory
  where id = p_inventory_id and user_id = auth.uid() and status = 'owned' for update;
  if v_car is null then
    raise exception 'Vehicle not found';
  end if;

  if (p_component = 'engine' and v_car.condition_engine >= 100)
    or (p_component = 'body' and v_car.condition_body >= 100)
    or (p_component = 'interior' and v_car.condition_interior >= 100) then
    raise exception 'This component is already in perfect condition';
  end if;

  perform public.ensure_player_state(auth.uid());
  update public.game_player_state
  set cash = cash - v_cost, total_expenses = total_expenses + v_cost
  where user_id = auth.uid() and cash >= v_cost;
  if not found then
    raise exception 'Not enough cash for this repair';
  end if;

  update public.game_inventory set
    condition_engine = case when p_component = 'engine' then 100 else condition_engine end,
    condition_body = case when p_component = 'body' then 100 else condition_body end,
    condition_interior = case when p_component = 'interior' then 100 else condition_interior end
  where id = p_inventory_id
  returning * into v_car;

  return v_car;
end;
$$;

grant execute on function public.repair_car(uuid, text) to authenticated;

-- ============================================================
-- 8. Customization — a real catalog, priced server-side; the client
--    only ever names which option it wants.
-- ============================================================
create table public.game_customization_options (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in
    ('paint', 'wheels', 'interior', 'brakes', 'exhaust', 'engine', 'suspension', 'lights', 'body_kit', 'windows')),
  key text not null,
  label text not null,
  cost numeric not null,
  unique (category, key)
);

insert into public.game_customization_options (category, key, label, cost) values
  ('paint', 'gloss_black', 'Gloss Black', 1800),
  ('paint', 'pearl_white', 'Pearl White', 2200),
  ('paint', 'satin_carbon', 'Satin Carbon Wrap', 3600),
  ('wheels', 'forged_alloy', 'Forged Alloy', 2400),
  ('wheels', 'carbon_fiber', 'Carbon Fiber', 5200),
  ('interior', 'leather', 'Full Leather', 2600),
  ('interior', 'alcantara', 'Alcantara Racing', 4100),
  ('brakes', 'sport', 'Sport Brake Kit', 3200),
  ('brakes', 'carbon_ceramic', 'Carbon-Ceramic', 7800),
  ('exhaust', 'sport', 'Sport Exhaust', 2100),
  ('exhaust', 'titanium', 'Titanium Racing', 5600),
  ('engine', 'ecu_tune', 'ECU Performance Tune', 6200),
  ('engine', 'turbo_upgrade', 'Turbo Upgrade', 12500),
  ('suspension', 'lowered', 'Lowered Sport Suspension', 2800),
  ('suspension', 'adjustable', 'Adjustable Coilovers', 5400),
  ('lights', 'led_matrix', 'LED Matrix Headlights', 1900),
  ('lights', 'laser', 'Laser Headlights', 4400),
  ('body_kit', 'aero', 'Aero Body Kit', 6800),
  ('body_kit', 'widebody', 'Widebody Conversion', 14000),
  ('windows', 'tint', 'Privacy Tint', 600),
  ('windows', 'smart_glass', 'Smart Electrochromic Glass', 3100);

alter table public.game_customization_options enable row level security;
create policy "Customization options are publicly readable"
  on public.game_customization_options for select
  using (true);

create or replace function public.customize_car(p_inventory_id uuid, p_option_id uuid)
returns public.game_inventory
language plpgsql
security definer set search_path = public
as $$
declare
  v_option public.game_customization_options;
  v_car public.game_inventory;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_option from public.game_customization_options where id = p_option_id;
  if v_option is null then
    raise exception 'Invalid customization option';
  end if;

  select * into v_car from public.game_inventory
  where id = p_inventory_id and user_id = auth.uid() and status = 'owned' for update;
  if v_car is null then
    raise exception 'Vehicle not found';
  end if;

  perform public.ensure_player_state(auth.uid());
  update public.game_player_state
  set cash = cash - v_option.cost, total_expenses = total_expenses + v_option.cost
  where user_id = auth.uid() and cash >= v_option.cost;
  if not found then
    raise exception 'Not enough cash for this upgrade';
  end if;

  update public.game_inventory
  set customization = jsonb_set(customization, array[v_option.category], to_jsonb(v_option.key))
  where id = p_inventory_id
  returning * into v_car;

  return v_car;
end;
$$;

grant execute on function public.customize_car(uuid, uuid) to authenticated;

-- ============================================================
-- 9. Selling — the sale price is always server-computed from real
--    condition + customization + a small, bounded market fluctuation.
--    The client can preview it via estimate_car_value() first (a plain
--    read, safe to expose) but can never dictate it.
-- ============================================================
create or replace function public.estimate_car_value(p_inventory_id uuid)
returns numeric
language sql
stable
security definer set search_path = public
as $$
  select round(
    i.market_value
    * ((i.condition_engine + i.condition_body + i.condition_interior) / 300.0)
    * (1 + 0.02 * (select count(*) from jsonb_object_keys(i.customization)))
  )
  from public.game_inventory i
  where i.id = p_inventory_id and i.user_id = auth.uid();
$$;

grant execute on function public.estimate_car_value(uuid) to authenticated;

create or replace function public.sell_car(p_inventory_id uuid)
returns numeric
language plpgsql
security definer set search_path = public
as $$
declare
  v_car public.game_inventory;
  v_price numeric;
  v_profit numeric;
  v_rep_delta integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_car from public.game_inventory
  where id = p_inventory_id and user_id = auth.uid() and status = 'owned' for update;
  if v_car is null then
    raise exception 'Vehicle not found';
  end if;

  v_price := round(public.estimate_car_value(p_inventory_id) * (0.95 + random() * 0.10));

  update public.game_inventory
  set status = 'sold', sold_at = now(), sale_price = v_price
  where id = p_inventory_id;

  perform public.ensure_player_state(auth.uid());
  v_profit := v_price - v_car.purchase_price;
  v_rep_delta := case when v_profit > 0 then 1 when v_profit < -1000 then -1 else 0 end;

  update public.game_player_state
  set cash = cash + v_price,
      total_revenue = total_revenue + v_price,
      reputation = least(100, greatest(0, reputation + v_rep_delta))
  where user_id = auth.uid();

  if v_profit > 0 then
    perform public.award_cx_score(
      auth.uid(), 'profitable_sale',
      least(500, greatest(20, round(v_profit / 50))),
      p_inventory_id
    );
  end if;

  return v_price;
end;
$$;

grant execute on function public.sell_car(uuid) to authenticated;
