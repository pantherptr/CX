-- CX City Empire — slice 2: an activity/notification feed (the
-- centerpiece "the city feels alive" feature), real customer ratings on
-- rental completion, dynamic pricing when assigning a car to a
-- district, actionable event context, a small rotating corporate-
-- contract board, and business-tier district gating. Additive to
-- 0036_city_empire.sql — no existing table is dropped, the car-flipping
-- system (0035) is untouched.
--
-- Same trust model and lazy-resolution pattern as everything else in
-- Empire: no client insert/update/delete policy on any new table, every
-- mutation goes through a security definer RPC, anything time-gated
-- resolves lazily on the next client read.

-- ============================================================
-- 1. game_districts — business-tier gate. Airport/City Center/Business
--    District stay open at Tier 1. Tourist unlocks at Tier 2 (same tier
--    the existing corporate contract already gates on). Luxury — the
--    highest base_rate_multiplier (1.35) — unlocks latest, at Tier 3.
-- ============================================================
alter table public.game_districts add column min_business_tier integer not null default 1;

update public.game_districts set min_business_tier = 2 where district_key = 'tourist_district';
update public.game_districts set min_business_tier = 3 where district_key = 'luxury_district';

-- ============================================================
-- 2. game_activity_feed — the persistent per-player feed / notification
--    center. Real events pass an explicit deterministic_ref() key so
--    the same underlying event can only ever post once (same
--    anti-duplicate idiom as cx_score_events); flavor rows default to a
--    fresh random ref_id and never collide.
-- ============================================================
create table public.game_activity_feed (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('booking', 'contract', 'event', 'finance', 'competition', 'mission')),
  icon text not null,
  title text not null,
  body text,
  amount numeric,
  cx_points integer,
  is_flavor boolean not null default false,
  ref_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  unique (user_id, ref_id)
);
create index game_activity_feed_user_created_idx on public.game_activity_feed (user_id, created_at desc);
alter table public.game_activity_feed enable row level security;
create policy "Users view their own activity feed"
  on public.game_activity_feed for select
  using (auth.uid() = user_id);

-- Internal — not granted. Called only from other security-definer RPCs
-- at the exact moment something real happens (or, for flavor content,
-- from ensure_activity_flavor()).
create or replace function public._push_activity(
  p_user_id uuid, p_category text, p_icon text, p_title text, p_body text,
  p_amount numeric, p_cx_points integer, p_ref_id uuid default null, p_is_flavor boolean default false
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.game_activity_feed (user_id, category, icon, title, body, amount, cx_points, is_flavor, ref_id)
  values (p_user_id, p_category, p_icon, p_title, p_body, p_amount, p_cx_points, p_is_flavor, coalesce(p_ref_id, gen_random_uuid()))
  on conflict (user_id, ref_id) do nothing;
end;
$$;

-- Personalized, per-player: a one-time announcement for any real active
-- city event this player hasn't been told about yet, plus flavor-only
-- competitor news paced to roughly once per 8 minutes. Mirrors
-- ensure_city_events()'s cooldown shape, but the cooldown is read from
-- the player's own recent flavor rows rather than a shared mutex table,
-- since this content is per-player, not shared city state.
create or replace function public.ensure_activity_flavor()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_last timestamptz;
  v_district public.game_districts;
  v_companies text[] := array['Nova Mobility', 'Prestige Fleet Co.', 'UrbanDrive', 'Apex Rentals', 'Skyline Motors'];
  v_templates text[] := array[
    '%s opened a new branch in %s.', '%s expanded their fleet in %s.',
    '%s launched a promotion in %s.', '%s signed a new partnership serving %s.'
  ];
  v_event record;
begin
  if auth.uid() is null then
    return;
  end if;

  for v_event in
    select e.* from public.game_city_events e
    where e.ends_at > now()
      and not exists (
        select 1 from public.game_activity_feed f
        where f.user_id = auth.uid() and f.ref_id = public.deterministic_ref('activity:event_announce:' || e.id)
      )
  loop
    perform public._push_activity(
      auth.uid(), 'event', 'bolt', v_event.title,
      (select name from public.game_districts where district_key = v_event.district_key)
        || ' · +' || v_event.effect_pct || '% demand' || (case when v_event.category is not null then ' for ' || v_event.category else '' end),
      null, null, public.deterministic_ref('activity:event_announce:' || v_event.id)
    );
  end loop;

  select max(created_at) into v_last from public.game_activity_feed where user_id = auth.uid() and is_flavor;
  if v_last is not null and v_last > now() - interval '8 minutes' then
    return;
  end if;
  if random() >= 0.5 then
    return;
  end if;

  select * into v_district from public.game_districts order by random() limit 1;
  perform public._push_activity(
    auth.uid(), 'competition', 'building',
    format(
      v_templates[1 + floor(random() * array_length(v_templates, 1))::int],
      v_companies[1 + floor(random() * array_length(v_companies, 1))::int],
      v_district.name
    ),
    'Keep an eye on ' || v_district.name || ' — competitor activity is picking up.',
    null, null, null, true
  );

  delete from public.game_activity_feed where id in (
    select id from public.game_activity_feed where user_id = auth.uid() order by created_at desc offset 300
  );
end;
$$;

grant execute on function public.ensure_activity_flavor() to authenticated;

-- ============================================================
-- 3. Customer ratings — internal helper, called only from
--    resolve_due_rentals() below.
-- ============================================================
create or replace function public._rate_rental(p_condition_avg numeric, p_demand_tier text, p_price_tier text)
returns table (stars integer, review text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_score numeric;
  v_stars integer;
begin
  v_score := 3.0
    + case when p_condition_avg >= 80 then 1 when p_condition_avg < 40 then -1 else 0 end
    + case when p_demand_tier in ('hot', 'iconic') then 0.5 else 0 end
    + case when p_price_tier = 'below_market' then 0.5 when p_price_tier = 'premium' then -0.5 else 0 end
    + (random() - 0.5);
  v_stars := greatest(1, least(5, round(v_score)::int));

  stars := v_stars;
  review := case
    when v_stars >= 4 then (array[
      'Perfect condition, would rent again!', 'Smooth pickup, car looked brand new.',
      'Exceeded expectations for the price.', 'Exactly as advertised — great experience.'
    ])[1 + floor(random() * 4)::int]
    when v_stars = 3 then (array[
      'Decent car, did the job.', 'No complaints, nothing special either.', 'Fair deal for a short trip.'
    ])[1 + floor(random() * 3)::int]
    else (array[
      'Car needed some work, a bit rough.', 'Overpriced for the condition it was in.', 'Pickup was fine but the car felt tired.'
    ])[1 + floor(random() * 3)::int]
  end;
  return next;
end;
$$;

-- ============================================================
-- 4. Dynamic pricing — a price tier the player chooses when assigning a
--    car to a district, scaling the payout (and, via _rate_rental
--    above, the customer's satisfaction outcome).
-- ============================================================
alter table public.game_rentals
  add column price_tier text not null default 'market' check (price_tier in ('below_market', 'market', 'premium'));

-- ============================================================
-- 5. assign_car_to_rental() — replaced with a 4th p_price_tier
--    parameter (default 'market' so any stale caller still works) and a
--    business-tier gate on the district. The 3-arg overload is dropped
--    so exactly one version exists.
-- ============================================================
drop function if exists public.assign_car_to_rental(uuid, text, integer);

create or replace function public.assign_car_to_rental(
  p_inventory_id uuid, p_district_key text, p_duration_days integer, p_price_tier text default 'market'
)
returns public.game_rentals
language plpgsql
security definer set search_path = public
as $$
declare
  v_car public.game_inventory;
  v_template public.game_vehicle_templates;
  v_district public.game_districts;
  v_state public.game_player_state;
  v_demand public.game_district_demand;
  v_base_rate numeric;
  v_daily_rate numeric;
  v_tier_multiplier numeric;
  v_multiplier numeric;
  v_rental public.game_rentals;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_duration_days not in (1, 3, 7) then
    raise exception 'Invalid rental duration';
  end if;
  if p_price_tier not in ('below_market', 'market', 'premium') then
    raise exception 'Invalid price tier';
  end if;

  select * into v_district from public.game_districts where district_key = p_district_key;
  if v_district is null then
    raise exception 'District not found';
  end if;

  perform public.ensure_my_player_state();
  select * into v_state from public.game_player_state where user_id = auth.uid();
  if v_state.business_tier < v_district.min_business_tier then
    raise exception 'This district requires business tier %', v_district.min_business_tier;
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

  v_base_rate := public._rental_daily_rate(p_inventory_id, p_district_key);
  v_tier_multiplier := case p_price_tier when 'below_market' then 0.85 when 'premium' then 1.20 else 1.0 end;
  v_daily_rate := round(v_base_rate * v_tier_multiplier);
  v_multiplier := case when p_duration_days >= 7 then 1.10 when p_duration_days >= 3 then 1.05 else 1.0 end;

  update public.game_inventory set status = 'rented' where id = p_inventory_id;

  insert into public.game_rentals (
    user_id, inventory_id, district_key, category, duration_days,
    daily_rate, demand_tier, payout, price_tier, resolves_at
  ) values (
    auth.uid(), p_inventory_id, p_district_key, v_template.category, p_duration_days,
    v_daily_rate, coalesce(v_demand.demand_tier, 'normal'),
    round(v_daily_rate * p_duration_days * v_multiplier), p_price_tier,
    now() + (p_duration_days || ' days')::interval
  )
  returning * into v_rental;

  return v_rental;
end;
$$;

grant execute on function public.assign_car_to_rental(uuid, text, integer, text) to authenticated;

-- ============================================================
-- 6. resolve_due_rentals() — replaced to also rate the completed
--    rental, nudge reputation from it, and push a real activity-feed
--    row. Mirrors resolve_due_listings()'s shape exactly, as before.
-- ============================================================
create or replace function public.resolve_due_rentals()
returns setof public.game_rentals
language plpgsql
security definer set search_path = public
as $$
declare
  v_rental record;
  v_cx_points integer;
  v_car public.game_inventory;
  v_condition_avg numeric;
  v_stars integer;
  v_review text;
  v_rep_delta integer;
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
    select * into v_car from public.game_inventory where id = v_rental.inventory_id;
    v_condition_avg := (v_car.condition_engine + v_car.condition_body + v_car.condition_interior) / 3.0;
    select stars, review into v_stars, v_review from public._rate_rental(v_condition_avg, v_rental.demand_tier, v_rental.price_tier);
    v_rep_delta := case when v_stars >= 4 then 1 when v_stars <= 2 then -1 else 0 end;

    update public.game_player_state
    set cash = cash + v_rental.payout,
        total_revenue = total_revenue + v_rental.payout,
        rentals_completed = rentals_completed + 1,
        requests_fulfilled = requests_fulfilled + (case when v_rental.source = 'customer_request' then 1 else 0 end),
        reputation = least(100, greatest(0, reputation + v_rep_delta))
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

    perform public._push_activity(
      auth.uid(), 'booking', case when v_rental.source = 'customer_request' then 'target' else 'pin' end,
      (select name from public.game_districts where district_key = v_rental.district_key) || ' rental completed — ' || v_stars || '★',
      v_review, v_rental.payout, v_cx_points, public.deterministic_ref('activity:rental:' || v_rental.id)
    );
  end loop;

  return query
  select * from public.game_rentals
  where user_id = auth.uid()
  order by
    case status when 'active' then 0 else 1 end,
    coalesce(resolved_at, started_at) desc;
end;
$$;

-- ============================================================
-- 7. ensure_customer_requests() / accept_customer_request() — district
--    generation restricted to unlocked districts, plus a server-side
--    tier gate (defense in depth) and an activity-feed row on accept.
-- ============================================================
create or replace function public.ensure_customer_requests()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_pending_count integer;
  v_district text;
  v_category text;
  v_tier integer;
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

  perform public.ensure_my_player_state();
  select business_tier into v_tier from public.game_player_state where user_id = auth.uid();

  select district_key into v_district from public.game_districts
  where min_business_tier <= v_tier
  order by random() limit 1;
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
  v_state public.game_player_state;
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

  select * into v_state from public.game_player_state where user_id = auth.uid();
  if v_state.business_tier < (select min_business_tier from public.game_districts where district_key = v_request.district_key) then
    raise exception 'This district requires a higher business tier';
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

  perform public._push_activity(
    auth.uid(), 'booking', 'target',
    'Accepted request from ' || v_request.customer_name,
    v_request.category || ' · ' || (select name from public.game_districts where district_key = v_request.district_key) || ' · +' || v_request.bonus_pct || '% bonus',
    null, null, public.deterministic_ref('activity:request_accept:' || p_request_id)
  );

  return v_rental;
end;
$$;

-- ============================================================
-- 8. claim_mission() / check_and_award_achievements() — activity-feed
--    rows, both under the 'mission' category.
-- ============================================================
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

  perform public._push_activity(
    auth.uid(), 'mission', v_mission.icon, v_mission.title, v_mission.description,
    v_mission.reward_cash, v_mission.reward_cx_points,
    public.deterministic_ref('activity:mission:' || p_mission_id || ':' || (case when v_mission.scope = 'daily' then current_date::text else 'lifetime' end))
  );

  cash_awarded := v_mission.reward_cash;
  cx_awarded := v_mission.reward_cx_points;
  return next;
end;
$$;

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
        perform public._push_activity(
          auth.uid(), 'mission', v_template.icon, v_template.title, v_template.description,
          null, v_template.reward_cx_points, public.deterministic_ref('activity:achievement:' || v_template.id)
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

-- ============================================================
-- 9. Corporate contracts — a small rotating board (3-4 concurrent)
--    instead of one hardcoded row, using the same mutex+cooldown lazy-
--    roll idiom as ensure_city_events(). Existing contracts/commitments
--    are never deleted, only soft-deactivated, so commitments keep a
--    valid FK regardless of rotation.
-- ============================================================
alter table public.game_corporate_contracts
  add column is_active boolean not null default true,
  add column rotated_at timestamptz not null default now();

create table public.game_corporate_contracts_state (
  id boolean primary key default true check (id),
  last_rolled_at timestamptz
);
insert into public.game_corporate_contracts_state (id) values (true);
alter table public.game_corporate_contracts_state enable row level security;

create or replace function public.ensure_corporate_contracts()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_state public.game_corporate_contracts_state;
  v_active_count integer;
  v_companies text[] := array['Apex Logistics', 'Skyline Corporate Travel', 'Meridian Events Group', 'Union Airport Services', 'Vantage Executive Rentals'];
  v_rarity text;
  v_duration integer;
  v_count integer;
  v_new_id text;
begin
  select * into v_state from public.game_corporate_contracts_state where id = true for update;

  if v_state.last_rolled_at is not null and v_state.last_rolled_at > now() - interval '20 minutes' then
    return;
  end if;
  update public.game_corporate_contracts_state set last_rolled_at = now() where id = true;

  update public.game_corporate_contracts c
  set is_active = false
  where c.is_active and c.rotated_at < now() - interval '3 hours'
    and not exists (
      select 1 from public.game_contract_commitments cc where cc.contract_id = c.id and cc.status = 'active'
    );

  select count(*) into v_active_count from public.game_corporate_contracts where is_active;
  if v_active_count >= 4 or random() >= 0.5 then
    return;
  end if;

  v_count := 2 + floor(random() * 3)::int;
  v_rarity := (array['common', 'uncommon', 'rare', 'epic'])[1 + floor(random() * 4)::int];
  v_duration := (array[3, 5, 7])[1 + floor(random() * 3)::int];
  v_new_id := 'contract_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);

  insert into public.game_corporate_contracts
    (id, title, description, required_vehicle_count, required_min_rarity, duration_days, lump_sum_payout, cx_score_bonus, min_business_tier, is_active, rotated_at)
  values (
    v_new_id,
    v_companies[1 + floor(random() * array_length(v_companies, 1))::int] || ' Fleet Deal',
    format('Needs %s %s-or-better vehicles on standby for %s days.', v_count, v_rarity, v_duration),
    v_count, v_rarity, v_duration,
    round((5000 + random() * 4000) * v_count * case v_rarity when 'epic' then 3 when 'rare' then 2 when 'uncommon' then 1.5 else 1 end),
    500 * v_count,
    case v_rarity when 'epic' then 3 when 'rare' then 2 else 1 end,
    true, now()
  );
end;
$$;

grant execute on function public.ensure_corporate_contracts() to authenticated;

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
  if not v_contract.is_active then
    raise exception 'This contract is no longer available';
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

    perform public._push_activity(
      auth.uid(), 'contract', 'handshake',
      (select title from public.game_corporate_contracts where id = v_commitment.contract_id),
      'Contract completed.', v_commitment.payout,
      (select cx_score_bonus from public.game_corporate_contracts where id = v_commitment.contract_id),
      public.deterministic_ref('activity:contract:' || v_commitment.id)
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

-- ============================================================
-- 10. upgrade_business() (0030) — a 'finance' activity row on success.
-- ============================================================
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

  perform public._push_activity(
    auth.uid(), 'finance', 'euro',
    'Business upgraded to ' || v_next.name, v_next.description,
    -v_next.cash_required, nullif(v_next.milestone_cx_bonus, 0),
    public.deterministic_ref('activity:tier_upgrade:' || v_next.tier::text)
  );

  select * into v_state from public.game_player_state where user_id = auth.uid();
  return v_state;
end;
$$;
