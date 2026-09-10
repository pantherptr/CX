-- CX Rent Empire — car-flipping market: real delayed player-to-market
-- selling (list at your own asking price, wait for a buyer, get a
-- SOLD moment), custom vehicle naming, and per-template demand — on
-- top of the existing buy/customize/repair loop from
-- 0030_luxury_car_empire.sql, which this does NOT touch.
--
-- Same trust model as every other Empire table: no client
-- insert/update/delete policy on any new table, every mutation goes
-- through a security definer RPC below.
--
-- Delayed resolution follows the exact pattern already established for
-- the house market (refresh_and_list_market, 0030) and booking holds
-- (expire_stale_holds, 0026) — no pg_cron, no Edge Functions exist in
-- this project (verified), so resolution happens lazily: whenever the
-- client calls resolve_due_listings(), anything past its due time gets
-- resolved right then, inside one atomic, server-validated transaction.
-- The lazy trigger point only affects when the player *sees* the
-- result — the money/eligibility logic itself is fully authoritative
-- regardless of when that call happens.

-- ============================================================
-- 0. Rename the flagship template to match its new realistic-
--    photography identity (see src/vehicleArt/vehicleArt.ts).
-- ============================================================
update public.game_vehicle_templates set name = 'CX Vortex' where name = 'Vortex Spyder';

-- ============================================================
-- 1. game_inventory: custom naming + a 'listed' status between
--    'owned' and 'sold' so a listed car naturally leaves "My
--    Collection" (which already filters status = 'owned') with zero
--    extra frontend logic.
-- ============================================================
alter table public.game_inventory
  add column custom_name text,
  add column rename_count integer not null default 0;

alter table public.game_inventory drop constraint game_inventory_status_check;
alter table public.game_inventory
  add constraint game_inventory_status_check check (status in ('owned', 'listed', 'sold'));

-- ============================================================
-- 2. game_vehicle_demand — per-template daily-rotating demand tier.
-- ============================================================
create table public.game_vehicle_demand (
  template_id uuid primary key references public.game_vehicle_templates(id) on delete cascade,
  demand_tier text not null default 'normal' check (demand_tier in ('low', 'normal', 'high', 'hot', 'iconic')),
  demand_pct integer not null default 0,
  rotated_at date not null default current_date
);
alter table public.game_vehicle_demand enable row level security;
create policy "Vehicle demand is publicly readable"
  on public.game_vehicle_demand for select
  using (true);

-- Inserts any missing rows and re-rolls anything stale (rotated before
-- today) — same lazy-ensure-or-refresh idiom as ensure_player_state.
-- Rarer templates skew toward hot/iconic.
create or replace function public.ensure_vehicle_demand()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.game_vehicle_demand (template_id, demand_tier, demand_pct, rotated_at)
  select
    t.id,
    (case
      when t.rarity in ('legendary', 'mythic') and random() < 0.5 then 'iconic'
      when t.rarity in ('epic', 'legendary', 'mythic') and random() < 0.5 then 'hot'
      when random() < 0.3 then 'high'
      when random() < 0.6 then 'normal'
      else 'low'
    end),
    round(random() * 30)::int,
    current_date
  from public.game_vehicle_templates t
  where t.active
  on conflict (template_id) do nothing;

  update public.game_vehicle_demand d
  set
    demand_tier = (case
      when random() < 0.15 then 'iconic'
      when random() < 0.35 then 'hot'
      when random() < 0.55 then 'high'
      when random() < 0.8 then 'normal'
      else 'low'
    end),
    demand_pct = round(random() * 30)::int,
    rotated_at = current_date
  where d.rotated_at < current_date;
end;
$$;

grant execute on function public.ensure_vehicle_demand() to authenticated;

-- ============================================================
-- 3. game_car_listings — a player's active/resolved sale of one of
--    their own owned cars.
-- ============================================================
create table public.game_car_listings (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.game_inventory(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  asking_price numeric not null check (asking_price > 0),
  suggested_price numeric not null,
  demand_tier text not null check (demand_tier in ('low', 'normal', 'high', 'hot', 'iconic')),
  listed_at timestamptz not null default now(),
  resolves_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'sold', 'cancelled', 'expired')),
  buyer_name text,
  buyer_type text check (buyer_type in ('collector', 'enthusiast', 'luxury_buyer', 'deal_hunter', 'investor')),
  sale_price numeric,
  resolved_at timestamptz,
  pending_offer_price numeric,
  pending_offer_expires_at timestamptz
);
create index game_car_listings_user_status_idx on public.game_car_listings (user_id, status);
alter table public.game_car_listings enable row level security;
create policy "Users view their own listings"
  on public.game_car_listings for select
  using (auth.uid() = user_id);

-- ============================================================
-- 4. game_player_state: running counters for the new stats (matching
--    the existing total_revenue/total_expenses convention — a
--    per-transaction counter, not computed on read, for the numbers
--    that need to survive past their source rows).
-- ============================================================
alter table public.game_player_state
  add column cars_sold integer not null default 0,
  add column successful_deals integer not null default 0,
  add column failed_deals integer not null default 0,
  add column best_sale numeric not null default 0,
  add column fastest_sale_seconds integer,
  add column longest_sale_seconds integer;

-- ============================================================
-- 5. RPCs
-- ============================================================

-- Buyer identity generation — plain arrays, no external calls.
create or replace function public._pick_buyer_name()
returns text
language sql
security definer set search_path = public
as $$
  select (array['Alex Morgan','Daniel Rossi','Noah Bennett','Marco Romano','Lucas Martin',
                'Sofia Kane','Emma Laurent','Liam Foster','Olivia Chen','Ethan Brooks',
                'Isabella Cruz','Mason Reid','Ava Sullivan','James Whitfield','Mia Delgado',
                'Benjamin Hale','Charlotte Voss','Lucas Ferreira','Amelia Stone','Henry Caldwell'
               ])[1 + floor(random() * 20)::int];
$$;

create or replace function public._pick_buyer_type(p_demand_tier text, p_ratio numeric)
returns text
language plpgsql
security definer set search_path = public
as $$
begin
  if p_demand_tier in ('hot', 'iconic') or p_ratio > 1.05 then
    return (array['investor', 'luxury_buyer', 'collector'])[1 + floor(random() * 3)::int];
  end if;
  return (array['enthusiast', 'collector', 'deal_hunter'])[1 + floor(random() * 3)::int];
end;
$$;

-- Internal only — not granted to authenticated. Finalizes a sale at a
-- given agreed price, whether reached via normal resolution or an
-- accepted offer. `ref_id` for CX score is the inventory_id, matching
-- exactly how sell_car() already keys award_cx_score's
-- (user_id, event_type, ref_id) uniqueness constraint.
create or replace function public._finalize_sale(p_listing_id uuid, p_sale_price numeric)
returns public.game_car_listings
language plpgsql
security definer set search_path = public
as $$
declare
  v_listing public.game_car_listings;
  v_inventory public.game_inventory;
  v_profit numeric;
  v_rep_delta integer;
  v_seconds integer;
begin
  select * into v_listing from public.game_car_listings where id = p_listing_id for update;
  select * into v_inventory from public.game_inventory where id = v_listing.inventory_id for update;

  v_profit := p_sale_price - v_inventory.purchase_price;
  v_seconds := extract(epoch from (now() - v_listing.listed_at))::integer;
  v_rep_delta := case when v_profit > 0 then 1 when v_profit < -1000 then -1 else 0 end;

  update public.game_car_listings
  set status = 'sold', sale_price = p_sale_price, resolved_at = now(),
      buyer_name = public._pick_buyer_name(),
      buyer_type = public._pick_buyer_type(v_listing.demand_tier, p_sale_price / nullif(v_listing.suggested_price, 0))
  where id = p_listing_id
  returning * into v_listing;

  update public.game_inventory
  set status = 'sold', sold_at = now(), sale_price = p_sale_price
  where id = v_inventory.id;

  update public.game_player_state
  set cash = cash + p_sale_price,
      total_revenue = total_revenue + p_sale_price,
      cars_sold = cars_sold + 1,
      successful_deals = successful_deals + 1,
      best_sale = greatest(best_sale, v_profit),
      fastest_sale_seconds = least(coalesce(fastest_sale_seconds, v_seconds), v_seconds),
      longest_sale_seconds = greatest(coalesce(longest_sale_seconds, v_seconds), v_seconds),
      reputation = least(100, greatest(0, reputation + v_rep_delta))
  where user_id = v_listing.user_id;

  if v_profit > 0 then
    perform public.award_cx_score(
      v_listing.user_id, 'profitable_sale',
      least(500, greatest(20, round(v_profit / 50))),
      v_inventory.id
    );
  end if;

  return v_listing;
end;
$$;

-- List an owned car for sale at the player's own asking price.
create or replace function public.list_car_for_sale(p_inventory_id uuid, p_asking_price numeric)
returns public.game_car_listings
language plpgsql
security definer set search_path = public
as $$
declare
  v_car public.game_inventory;
  v_template public.game_vehicle_templates;
  v_suggested numeric;
  v_demand public.game_vehicle_demand;
  v_avg_condition numeric;
  v_minutes numeric;
  v_ratio numeric;
  v_listing public.game_car_listings;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_asking_price <= 0 then
    raise exception 'Asking price must be positive';
  end if;

  select * into v_car from public.game_inventory
  where id = p_inventory_id and user_id = auth.uid() and status = 'owned' for update;
  if v_car is null then
    raise exception 'Vehicle not found';
  end if;

  select * into v_template from public.game_vehicle_templates where id = v_car.template_id;

  v_suggested := public.estimate_car_value(p_inventory_id);

  perform public.ensure_vehicle_demand();
  select * into v_demand from public.game_vehicle_demand where template_id = v_car.template_id;

  v_avg_condition := (v_car.condition_engine + v_car.condition_body + v_car.condition_interior) / 3.0;
  v_ratio := p_asking_price / nullif(v_suggested, 0);

  v_minutes := case v_demand.demand_tier
    when 'low' then 25 + random() * 15
    when 'high' then 10 + random() * 12
    when 'hot' then 6 + random() * 9
    when 'iconic' then 4 + random() * 6
    else 15 + random() * 15
  end;
  if v_ratio > 1.15 then v_minutes := v_minutes * 1.4;
  elsif v_ratio < 0.9 then v_minutes := v_minutes * 0.7;
  end if;
  if v_avg_condition < 50 then v_minutes := v_minutes * 1.2; end if;

  update public.game_inventory set status = 'listed' where id = p_inventory_id;

  insert into public.game_car_listings (
    inventory_id, user_id, asking_price, suggested_price, demand_tier, resolves_at
  ) values (
    p_inventory_id, auth.uid(), p_asking_price, v_suggested, v_demand.demand_tier,
    now() + (v_minutes || ' minutes')::interval
  )
  returning * into v_listing;

  return v_listing;
end;
$$;

-- The lazy-resolution entry point — called on Sales-tab mount and on a
-- light client poll while it's open. Scoped explicitly to
-- `user_id = auth.uid()` — since this is security definer (bypasses
-- RLS), that filter is the actual trust boundary, not a nicety.
create or replace function public.resolve_due_listings()
returns setof public.game_car_listings
language plpgsql
security definer set search_path = public
as $$
declare
  v_listing record;
  v_ratio numeric;
  v_base_prob numeric;
  v_prob numeric;
  v_car public.game_inventory;
  v_avg_condition numeric;
  v_customization_count integer;
begin
  if auth.uid() is null then
    return;
  end if;

  perform public.ensure_vehicle_demand();

  for v_listing in
    select * from public.game_car_listings
    where user_id = auth.uid() and status = 'active' and resolves_at <= now()
    for update
  loop
    v_ratio := v_listing.asking_price / nullif(v_listing.suggested_price, 0);
    v_base_prob := case v_listing.demand_tier
      when 'low' then 0.55 when 'high' then 0.82 when 'hot' then 0.90 when 'iconic' then 0.95
      else 0.70
    end;

    select * into v_car from public.game_inventory where id = v_listing.inventory_id;
    v_avg_condition := (v_car.condition_engine + v_car.condition_body + v_car.condition_interior) / 3.0;
    v_customization_count := (select count(*) from jsonb_object_keys(v_car.customization));

    v_prob := v_base_prob * least(1.0, greatest(0.15, 1 - greatest(0, v_ratio - 1) * 1.2));
    v_prob := v_prob + least(0.05, v_customization_count * 0.01) + case when v_avg_condition > 80 then 0.05 else 0 end;
    v_prob := least(0.97, greatest(0.05, v_prob));

    if random() < v_prob then
      perform public._finalize_sale(v_listing.id, v_listing.asking_price);
    else
      update public.game_car_listings
      set status = 'expired', resolved_at = now()
      where id = v_listing.id;
      update public.game_inventory set status = 'owned' where id = v_listing.inventory_id;
      update public.game_player_state set failed_deals = failed_deals + 1 where user_id = auth.uid();
    end if;
  end loop;

  -- Attach an NPC offer to active listings past ~40% of their wait
  -- window that don't already have one.
  for v_listing in
    select * from public.game_car_listings
    where user_id = auth.uid() and status = 'active'
      and pending_offer_price is null
      and now() >= listed_at + (resolves_at - listed_at) * 0.4
    for update
  loop
    if random() < 0.25 then
      update public.game_car_listings
      set pending_offer_price = round(asking_price * (0.75 + random() * 0.15)),
          pending_offer_expires_at = now() + interval '5 minutes'
      where id = v_listing.id;
    end if;
  end loop;

  return query
  select * from public.game_car_listings
  where user_id = auth.uid()
  order by
    case status when 'active' then 0 else 1 end,
    coalesce(resolved_at, listed_at) desc;
end;
$$;

create or replace function public.cancel_listing(p_listing_id uuid)
returns public.game_inventory
language plpgsql
security definer set search_path = public
as $$
declare
  v_listing public.game_car_listings;
  v_car public.game_inventory;
begin
  select * into v_listing from public.game_car_listings
  where id = p_listing_id and user_id = auth.uid() and status = 'active' for update;
  if v_listing is null then
    raise exception 'Listing not found';
  end if;

  update public.game_car_listings set status = 'cancelled', resolved_at = now() where id = p_listing_id;
  update public.game_inventory set status = 'owned' where id = v_listing.inventory_id
  returning * into v_car;

  return v_car;
end;
$$;

create or replace function public.accept_offer(p_listing_id uuid)
returns public.game_car_listings
language plpgsql
security definer set search_path = public
as $$
declare
  v_listing public.game_car_listings;
begin
  select * into v_listing from public.game_car_listings
  where id = p_listing_id and user_id = auth.uid() and status = 'active'
    and pending_offer_price is not null and pending_offer_expires_at > now()
  for update;
  if v_listing is null then
    raise exception 'No active offer on this listing';
  end if;

  return public._finalize_sale(p_listing_id, v_listing.pending_offer_price);
end;
$$;

create or replace function public.reject_offer(p_listing_id uuid)
returns public.game_car_listings
language plpgsql
security definer set search_path = public
as $$
declare
  v_listing public.game_car_listings;
begin
  update public.game_car_listings
  set pending_offer_price = null, pending_offer_expires_at = null
  where id = p_listing_id and user_id = auth.uid() and status = 'active'
  returning * into v_listing;
  if v_listing is null then
    raise exception 'Listing not found';
  end if;
  return v_listing;
end;
$$;

create or replace function public.rename_car(p_inventory_id uuid, p_new_name text)
returns public.game_inventory
language plpgsql
security definer set search_path = public
as $$
declare
  v_car public.game_inventory;
  v_template public.game_vehicle_templates;
  v_base numeric;
  v_multiplier numeric;
  v_fee numeric;
  v_trimmed text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_trimmed := trim(p_new_name);
  if char_length(v_trimmed) < 1 or char_length(v_trimmed) > 40 then
    raise exception 'Name must be 1-40 characters';
  end if;

  select * into v_car from public.game_inventory
  where id = p_inventory_id and user_id = auth.uid() and status = 'owned' for update;
  if v_car is null then
    raise exception 'Vehicle not found';
  end if;

  select * into v_template from public.game_vehicle_templates where id = v_car.template_id;

  v_base := case when v_car.rename_count = 0 then 1000 else 2500 end;
  v_multiplier := case v_template.rarity
    when 'legendary' then 2.0 when 'mythic' then 2.0
    when 'rare' then 1.5 when 'epic' then 1.5
    else 1.0
  end;
  v_fee := round(v_base * v_multiplier);

  update public.game_player_state
  set cash = cash - v_fee, total_expenses = total_expenses + v_fee
  where user_id = auth.uid() and cash >= v_fee;
  if not found then
    raise exception 'Not enough cash for this rename';
  end if;

  update public.game_inventory
  set custom_name = v_trimmed, rename_count = rename_count + 1
  where id = p_inventory_id
  returning * into v_car;

  return v_car;
end;
$$;

grant execute on function public.list_car_for_sale(uuid, numeric) to authenticated;
grant execute on function public.resolve_due_listings() to authenticated;
grant execute on function public.cancel_listing(uuid) to authenticated;
grant execute on function public.accept_offer(uuid) to authenticated;
grant execute on function public.reject_offer(uuid) to authenticated;
grant execute on function public.rename_car(uuid, text) to authenticated;
