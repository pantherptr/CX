-- CX City Empire — slice 3: a computed "district influence" meter with
-- milestone payouts, and five cheap additive systems (VIP requests,
-- flash contracts, weekly missions, a perfect-rental bonus, a login
-- streak) that make the City tab feel continuously alive. Additive to
-- 0036/0037 — no existing table is dropped, the car-flipping system
-- (0035) is untouched. Same lazy-resolution + security-definer +
-- deterministic_ref idioms as everything else in Empire.

-- ============================================================
-- 1. VIP customer requests.
-- ============================================================
alter table public.game_customer_requests add column is_vip boolean not null default false;

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
  v_is_vip boolean;
  v_bonus_pct integer;
  v_expires_minutes numeric;
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

  v_is_vip := random() < 0.2;
  v_bonus_pct := case when v_is_vip then 60 + floor(random() * 41)::int else 10 + floor(random() * 61)::int end;
  v_expires_minutes := case when v_is_vip then 5 + random() * 10 else 10 + random() * 20 end;

  insert into public.game_customer_requests (user_id, district_key, category, customer_name, bonus_pct, duration_days, is_vip, expires_at)
  values (
    auth.uid(), v_district, v_category,
    v_names[1 + floor(random() * array_length(v_names, 1))::int],
    v_bonus_pct,
    (array[1, 3])[1 + floor(random() * 2)::int],
    v_is_vip,
    now() + (v_expires_minutes || ' minutes')::interval
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

  if v_request.is_vip then
    perform public.award_cx_score(auth.uid(), 'vip_customer_request_bonus', 150, p_request_id);
    update public.game_player_state
    set reputation = least(100, greatest(0, reputation + 2))
    where user_id = auth.uid();
  end if;

  perform public._push_activity(
    auth.uid(), 'booking', case when v_request.is_vip then 'star' else 'target' end,
    (case when v_request.is_vip then 'VIP request accepted — ' else 'Accepted request from ' end) || v_request.customer_name,
    v_request.category || ' · ' || (select name from public.game_districts where district_key = v_request.district_key) || ' · +' || v_request.bonus_pct || '% bonus',
    null, null, public.deterministic_ref('activity:request_accept:' || p_request_id)
  );

  return v_rental;
end;
$$;

-- ============================================================
-- 2. Flash contracts — a short accept window on top of the existing
--    rotating board, distinct from duration_days (fulfillment time
--    after acceptance).
-- ============================================================
alter table public.game_corporate_contracts
  add column is_flash boolean not null default false,
  add column expires_at timestamptz;

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
  v_is_flash boolean;
  v_payout_multiplier numeric;
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

  -- Flash contracts close their accept window on schedule regardless of
  -- whether anyone has already committed — expiry gates new
  -- commitments, not the fate of one already made (that resolves off
  -- its own commitment.resolves_at, untouched here).
  update public.game_corporate_contracts c
  set is_active = false
  where c.is_active and c.is_flash and c.expires_at is not null and c.expires_at < now();

  select count(*) into v_active_count from public.game_corporate_contracts where is_active;
  if v_active_count >= 4 or random() >= 0.5 then
    return;
  end if;

  v_count := 2 + floor(random() * 3)::int;
  v_rarity := (array['common', 'uncommon', 'rare', 'epic'])[1 + floor(random() * 4)::int];
  v_duration := (array[3, 5, 7])[1 + floor(random() * 3)::int];
  v_new_id := 'contract_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  v_is_flash := random() < 0.25;
  v_payout_multiplier := case v_rarity when 'epic' then 3 when 'rare' then 2 when 'uncommon' then 1.5 else 1 end
    * case when v_is_flash then 1.5 else 1 end;

  insert into public.game_corporate_contracts
    (id, title, description, required_vehicle_count, required_min_rarity, duration_days, lump_sum_payout, cx_score_bonus, min_business_tier, is_active, rotated_at, is_flash, expires_at)
  values (
    v_new_id,
    (case when v_is_flash then 'FLASH — ' else '' end) || v_companies[1 + floor(random() * array_length(v_companies, 1))::int] || ' Fleet Deal',
    format('Needs %s %s-or-better vehicles on standby for %s days.', v_count, v_rarity, v_duration)
      || (case when v_is_flash then ' Flash deal — accept within 15 minutes.' else '' end),
    v_count, v_rarity, v_duration,
    round((5000 + random() * 4000) * v_count * v_payout_multiplier),
    500 * v_count,
    case v_rarity when 'epic' then 3 when 'rare' then 2 else 1 end,
    true, now(), v_is_flash,
    case when v_is_flash then now() + interval '15 minutes' else null end
  );
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
  if not v_contract.is_active then
    raise exception 'This contract is no longer available';
  end if;
  if v_contract.is_flash and v_contract.expires_at is not null and v_contract.expires_at < now() then
    raise exception 'This flash contract has expired';
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

-- ============================================================
-- 3. Weekly missions.
-- ============================================================
create table public.game_weekly_progress (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  week_start date not null default date_trunc('week', current_date)::date,
  weekly_rentals_completed integer not null default 0,
  weekly_contracts_completed integer not null default 0
);
alter table public.game_weekly_progress enable row level security;
create policy "Users view their own weekly progress"
  on public.game_weekly_progress for select
  using (auth.uid() = user_id);

create or replace function public.ensure_weekly_progress()
returns public.game_weekly_progress
language plpgsql
security definer set search_path = public
as $$
declare
  v_progress public.game_weekly_progress;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.game_weekly_progress (user_id) values (auth.uid())
  on conflict (user_id) do nothing;

  update public.game_weekly_progress
  set week_start = date_trunc('week', current_date)::date, weekly_rentals_completed = 0, weekly_contracts_completed = 0
  where user_id = auth.uid() and week_start < date_trunc('week', current_date)::date;

  select * into v_progress from public.game_weekly_progress where user_id = auth.uid();
  return v_progress;
end;
$$;

grant execute on function public.ensure_weekly_progress() to authenticated;

alter table public.game_mission_templates drop constraint game_mission_templates_scope_check;
alter table public.game_mission_templates
  add constraint game_mission_templates_scope_check check (scope in ('lifetime', 'daily', 'weekly'));

alter table public.game_mission_templates drop constraint game_mission_templates_metric_key_check;
alter table public.game_mission_templates
  add constraint game_mission_templates_metric_key_check check (metric_key in (
    'rentals_completed', 'contracts_completed', 'requests_fulfilled',
    'daily_rentals_completed', 'daily_requests_fulfilled',
    'weekly_rentals_completed', 'weekly_contracts_completed'
  ));

insert into public.game_mission_templates
  (id, scope, title, description, metric_key, target, reward_cash, reward_cx_points, icon, sort_order)
values
  ('weekly_ten_rentals', 'weekly', 'Weekly Fleet Push', 'Complete 10 rentals this week.', 'weekly_rentals_completed', 10, 8000, 500, 'trending', 8),
  ('weekly_one_contract', 'weekly', 'Weekly Contract', 'Complete 1 corporate contract this week.', 'weekly_contracts_completed', 1, 6000, 400, 'handshake', 9);

alter table public.game_mission_claims add column claim_week date;
create unique index game_mission_claims_weekly_idx
  on public.game_mission_claims (user_id, mission_id, claim_week) where scope = 'weekly';

create or replace function public.claim_mission(p_mission_id text)
returns table (cash_awarded numeric, cx_awarded integer)
language plpgsql
security definer set search_path = public
as $$
declare
  v_mission public.game_mission_templates;
  v_state public.game_player_state;
  v_progress public.game_daily_progress;
  v_weekly public.game_weekly_progress;
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
  v_weekly := public.ensure_weekly_progress();
  select * into v_state from public.game_player_state where user_id = auth.uid() for update;

  v_value := case v_mission.metric_key
    when 'rentals_completed' then v_state.rentals_completed
    when 'contracts_completed' then v_state.contracts_completed
    when 'requests_fulfilled' then v_state.requests_fulfilled
    when 'daily_rentals_completed' then v_progress.daily_rentals_completed
    when 'daily_requests_fulfilled' then v_progress.daily_requests_fulfilled
    when 'weekly_rentals_completed' then v_weekly.weekly_rentals_completed
    when 'weekly_contracts_completed' then v_weekly.weekly_contracts_completed
  end;

  if v_value < v_mission.target then
    raise exception 'Mission not complete yet';
  end if;

  v_ref := case
    when v_mission.scope = 'daily' then public.deterministic_ref('mission:' || p_mission_id || ':' || current_date::text)
    when v_mission.scope = 'weekly' then public.deterministic_ref('mission:' || p_mission_id || ':' || v_weekly.week_start::text)
    else public.deterministic_ref('mission:' || p_mission_id)
  end;

  insert into public.game_mission_claims (user_id, mission_id, scope, claim_date, claim_week)
  values (auth.uid(), p_mission_id, v_mission.scope, current_date, case when v_mission.scope = 'weekly' then v_weekly.week_start else null end)
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
    public.deterministic_ref('activity:mission:' || p_mission_id || ':' || (
      case v_mission.scope
        when 'daily' then current_date::text
        when 'weekly' then v_weekly.week_start::text
        else 'lifetime'
      end
    ))
  );

  cash_awarded := v_mission.reward_cash;
  cx_awarded := v_mission.reward_cx_points;
  return next;
end;
$$;

-- ============================================================
-- 4. Perfect Rental bonus + weekly-progress increments.
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
  v_is_perfect boolean;
  v_perfect_bonus_cash numeric;
begin
  if auth.uid() is null then
    return;
  end if;

  perform public.ensure_daily_progress();
  perform public.ensure_weekly_progress();

  for v_rental in
    select * from public.game_rentals
    where user_id = auth.uid() and status = 'active' and resolves_at <= now()
    for update
  loop
    select * into v_car from public.game_inventory where id = v_rental.inventory_id;
    v_condition_avg := (v_car.condition_engine + v_car.condition_body + v_car.condition_interior) / 3.0;
    select stars, review into v_stars, v_review from public._rate_rental(v_condition_avg, v_rental.demand_tier, v_rental.price_tier);
    v_rep_delta := case when v_stars >= 4 then 1 when v_stars <= 2 then -1 else 0 end;

    v_is_perfect := (v_stars = 5 and v_condition_avg >= 90 and v_rental.price_tier <> 'premium');
    v_perfect_bonus_cash := case when v_is_perfect then round(v_rental.payout * 0.05) else 0 end;

    update public.game_player_state
    set cash = cash + v_rental.payout + v_perfect_bonus_cash,
        total_revenue = total_revenue + v_rental.payout + v_perfect_bonus_cash,
        rentals_completed = rentals_completed + 1,
        requests_fulfilled = requests_fulfilled + (case when v_rental.source = 'customer_request' then 1 else 0 end),
        reputation = least(100, greatest(0, reputation + v_rep_delta))
    where user_id = auth.uid();

    update public.game_daily_progress
    set daily_rentals_completed = daily_rentals_completed + 1,
        daily_requests_fulfilled = daily_requests_fulfilled + (case when v_rental.source = 'customer_request' then 1 else 0 end)
    where user_id = auth.uid();

    update public.game_weekly_progress
    set weekly_rentals_completed = weekly_rentals_completed + 1
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

    if v_is_perfect then
      perform public.award_cx_score(auth.uid(), 'perfect_rental_bonus', 50, v_rental.id);
      perform public._push_activity(
        auth.uid(), 'booking', 'sparkles',
        'Perfect Rental! — ' || (select name from public.game_districts where district_key = v_rental.district_key),
        'Flawless condition, top rating, no premium markup. Bonus payout awarded.',
        v_perfect_bonus_cash, 50, public.deterministic_ref('activity:perfect_rental:' || v_rental.id)
      );
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

  perform public.ensure_weekly_progress();

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

    update public.game_weekly_progress
    set weekly_contracts_completed = weekly_contracts_completed + 1
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
-- 5. District influence — a per-district ownership % computed purely
--    from the player's own completed-rental history (target: 20
--    completed rentals per district for 100%), with a deterministic
--    cosmetic "competitor share" split computed client-side — no real
--    competitor simulation.
-- ============================================================
create or replace function public.fetch_district_influence()
returns table (district_key text, completed_rentals integer, influence_pct integer)
language sql
stable
security definer set search_path = public
as $$
  select
    d.district_key,
    coalesce(count(r.id), 0)::integer as completed_rentals,
    least(100, round(coalesce(count(r.id), 0)::numeric / 20 * 100))::int as influence_pct
  from public.game_districts d
  left join public.game_rentals r
    on r.district_key = d.district_key and r.user_id = auth.uid() and r.status = 'completed'
  group by d.district_key;
$$;

grant execute on function public.fetch_district_influence() to authenticated;

create table public.game_district_milestone_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  district_key text not null references public.game_districts(district_key),
  milestone integer not null check (milestone in (25, 50, 75, 90)),
  claimed_at timestamptz not null default now(),
  unique (user_id, district_key, milestone)
);
alter table public.game_district_milestone_claims enable row level security;
create policy "Users view their own district milestone claims"
  on public.game_district_milestone_claims for select
  using (auth.uid() = user_id);

create or replace function public.claim_district_milestone(p_district_key text, p_milestone integer)
returns table (cash_awarded numeric, cx_awarded integer)
language plpgsql
security definer set search_path = public
as $$
declare
  v_pct integer;
  v_cash numeric;
  v_cx integer;
  v_rep integer;
  v_title text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_milestone not in (25, 50, 75, 90) then
    raise exception 'Invalid milestone';
  end if;

  select influence_pct into v_pct from public.fetch_district_influence() where district_key = p_district_key;
  if v_pct is null or v_pct < p_milestone then
    raise exception 'District influence has not reached this milestone yet';
  end if;

  insert into public.game_district_milestone_claims (user_id, district_key, milestone)
  values (auth.uid(), p_district_key, p_milestone)
  on conflict do nothing;
  if not found then
    raise exception 'Already claimed';
  end if;

  v_cash := case p_milestone when 25 then 2000 when 50 then 5000 when 75 then 10000 when 90 then 25000 end;
  v_cx := case p_milestone when 25 then 100 when 50 then 250 when 75 then 500 when 90 then 1000 end;
  v_rep := case p_milestone when 75 then 1 when 90 then 3 else 0 end;
  v_title := case when p_milestone = 90 then 'District Dominated' else 'District Influence Milestone' end;

  perform public.ensure_my_player_state();
  update public.game_player_state
  set cash = cash + v_cash,
      total_revenue = total_revenue + v_cash,
      reputation = least(100, greatest(0, reputation + v_rep))
  where user_id = auth.uid();

  perform public.award_cx_score(
    auth.uid(), 'district_milestone_claimed', v_cx,
    public.deterministic_ref('district_milestone:' || p_district_key || ':' || p_milestone::text)
  );

  perform public._push_activity(
    auth.uid(), 'competition', case when p_milestone = 90 then 'trophy' else 'gauge' end,
    v_title || ' — ' || (select name from public.game_districts where district_key = p_district_key),
    'Reached ' || p_milestone || '% influence.', v_cash, v_cx,
    public.deterministic_ref('activity:district_milestone:' || p_district_key || ':' || p_milestone::text)
  );

  cash_awarded := v_cash;
  cx_awarded := v_cx;
  return next;
end;
$$;

grant execute on function public.claim_district_milestone(text, integer) to authenticated;

-- ============================================================
-- 6. Login streak — a light, non-mandatory engagement mechanic.
-- ============================================================
create table public.game_login_streak (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_active_date date
);
alter table public.game_login_streak enable row level security;
create policy "Users view their own login streak"
  on public.game_login_streak for select
  using (auth.uid() = user_id);

create or replace function public.ensure_login_streak()
returns public.game_login_streak
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.game_login_streak;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform public.ensure_my_player_state();

  insert into public.game_login_streak (user_id, current_streak, longest_streak, last_active_date)
  values (auth.uid(), 1, 1, current_date)
  on conflict (user_id) do nothing;

  select * into v_row from public.game_login_streak where user_id = auth.uid() for update;

  if v_row.last_active_date = current_date then
    -- Already counted today (including the very first insert above) — no-op.
    null;
  elsif v_row.last_active_date = current_date - 1 then
    update public.game_login_streak
    set current_streak = current_streak + 1,
        longest_streak = greatest(longest_streak, current_streak + 1),
        last_active_date = current_date
    where user_id = auth.uid()
    returning * into v_row;

    if v_row.current_streak = 3 then
      update public.game_player_state set cash = cash + 1000, total_revenue = total_revenue + 1000 where user_id = auth.uid();
      perform public._push_activity(
        auth.uid(), 'mission', 'flame', '3-Day Streak', 'Three days running — keep it going.',
        1000, 0, public.deterministic_ref('activity:streak:3:' || current_date::text)
      );
    elsif v_row.current_streak = 7 then
      update public.game_player_state set cash = cash + 5000, total_revenue = total_revenue + 5000 where user_id = auth.uid();
      perform public.award_cx_score(auth.uid(), 'login_streak_bonus', 300, public.deterministic_ref('streak:7:' || current_date::text));
      perform public._push_activity(
        auth.uid(), 'mission', 'flame', '7-Day Streak', 'A full week of daily visits.',
        5000, 300, public.deterministic_ref('activity:streak:7:' || current_date::text)
      );
    elsif v_row.current_streak = 30 then
      update public.game_player_state set cash = cash + 25000, total_revenue = total_revenue + 25000 where user_id = auth.uid();
      perform public.award_cx_score(auth.uid(), 'login_streak_bonus', 1500, public.deterministic_ref('streak:30:' || current_date::text));
      perform public._push_activity(
        auth.uid(), 'mission', 'flame', '30-Day Streak', 'A month of daily visits — legendary dedication.',
        25000, 1500, public.deterministic_ref('activity:streak:30:' || current_date::text)
      );
    end if;
  else
    update public.game_login_streak
    set current_streak = 1,
        longest_streak = greatest(longest_streak, 1),
        last_active_date = current_date
    where user_id = auth.uid()
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

grant execute on function public.ensure_login_streak() to authenticated;
