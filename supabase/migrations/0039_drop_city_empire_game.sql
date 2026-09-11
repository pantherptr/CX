-- Removes the "CX City Empire" game entirely (districts, market, garage,
-- contracts, missions, achievements, leaderboard, activity feed, login
-- streak) so EMPIRE can be rebuilt as an owner-only social/news feed under
-- the same name/branding. Every table and function here is confirmed
-- City-Empire-specific by two independent codebase audits — nothing here
-- is shared with the real CX Score loyalty/booking-discount system
-- (0029/0031, untouched) or the unrelated "CX Drive Challenge" minigame
-- (game_config/game_sessions/game_reward_tiers/game_rewards from
-- 0010_drive_challenge.sql, still live in Booking/Garage/CustomerDashboard,
-- untouched despite the shared `game_` table prefix).

-- ---- Functions first (some `returns` a game_* row type; dropping the
-- table with CASCADE would also cascade-drop those, but being explicit
-- here makes the teardown's scope reviewable on its own, independent of
-- table drop order). `assign_car_to_rental` has two overloads (0036 added
-- a 3-arg version, 0037 added a distinct 4-arg version with a new default
-- param) — both must be dropped explicitly since `create or replace`
-- never unified them into one signature. ----

drop function if exists public.admin_grant_cash(uuid, numeric);
drop function if exists public.admin_set_cash(uuid, numeric);
drop function if exists public.ensure_vehicle_demand();
drop function if exists public._pick_buyer_name();
drop function if exists public._pick_buyer_type(text, numeric);
drop function if exists public._finalize_sale(uuid, numeric);
drop function if exists public.list_car_for_sale(uuid, numeric);
drop function if exists public.resolve_due_listings();
drop function if exists public.cancel_listing(uuid);
drop function if exists public.accept_offer(uuid);
drop function if exists public.reject_offer(uuid);
drop function if exists public.rename_car(uuid, text);
drop function if exists public.refresh_and_list_market();
drop function if exists public.ensure_customer_requests();
drop function if exists public.accept_customer_request(uuid, uuid);
drop function if exists public.ensure_corporate_contracts();
drop function if exists public.accept_corporate_contract(text, uuid[]);
drop function if exists public.ensure_weekly_progress();
drop function if exists public.claim_mission(text);
drop function if exists public.resolve_due_rentals();
drop function if exists public.resolve_due_contracts();
drop function if exists public.fetch_district_influence();
drop function if exists public.claim_district_milestone(text, integer);
drop function if exists public.ensure_login_streak();
drop function if exists public.ensure_player_state(uuid);
drop function if exists public.ensure_my_player_state();
drop function if exists public.upgrade_business();
drop function if exists public.buy_market_car(uuid);
drop function if exists public.repair_car(uuid, text);
drop function if exists public.customize_car(uuid, uuid);
drop function if exists public.estimate_car_value(uuid);
drop function if exists public.sell_car(uuid);
drop function if exists public._push_activity(uuid, text, text, text, text, numeric, integer, uuid, boolean);
drop function if exists public.ensure_activity_flavor();
drop function if exists public._rate_rental(numeric, text, text);
drop function if exists public.assign_car_to_rental(uuid, text, integer);
drop function if exists public.assign_car_to_rental(uuid, text, integer, text);
drop function if exists public.check_and_award_achievements();
drop function if exists public.fetch_empire_leaderboard(integer);
drop function if exists public.decline_customer_request(uuid);
drop function if exists public.cancel_rental(uuid);
drop function if exists public.cancel_contract_commitment(uuid);
drop function if exists public.ensure_daily_progress();
drop function if exists public._rarity_rank(text);
drop function if exists public._rental_daily_rate(uuid, text);

-- ---- Tables (cascade — several FK each other within this set) ----

drop table if exists public.game_district_milestone_claims cascade;
drop table if exists public.game_weekly_progress cascade;
drop table if exists public.game_login_streak cascade;
drop table if exists public.game_corporate_contracts_state cascade;
drop table if exists public.game_activity_feed cascade;
drop table if exists public.game_achievement_unlocks cascade;
drop table if exists public.game_mission_claims cascade;
drop table if exists public.game_daily_progress cascade;
drop table if exists public.game_contract_commitments cascade;
drop table if exists public.game_rentals cascade;
drop table if exists public.game_customer_requests cascade;
drop table if exists public.game_achievement_templates cascade;
drop table if exists public.game_mission_templates cascade;
drop table if exists public.game_corporate_contracts cascade;
drop table if exists public.game_city_events_state cascade;
drop table if exists public.game_city_events cascade;
drop table if exists public.game_district_demand cascade;
drop table if exists public.game_districts cascade;
drop table if exists public.game_car_listings cascade;
drop table if exists public.game_vehicle_demand cascade;
drop table if exists public.game_customization_options cascade;
drop table if exists public.game_repair_costs cascade;
drop table if exists public.game_inventory cascade;
drop table if exists public.game_market_listings cascade;
drop table if exists public.game_vehicle_templates cascade;
drop table if exists public.game_business_tiers cascade;
drop table if exists public.game_player_state cascade;
