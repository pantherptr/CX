-- CX Drive Challenge — reward system hardening + analytics.
--
-- Policy change, not an architecture change: rewards are meant to be
-- rare now. `game_reward_tiers.active` already makes an inactive tier
-- both invisible to the client (RLS: "Reward tiers are publicly
-- readable" ... using (active)) and unclaimable (claim_game_reward's own
-- tier lookup filters `where active`) — built last round for exactly
-- this, so "disable the upper tiers" is a data change, not new code.
--
-- The one real anti-cheat gap being closed: the existing plausibility
-- check bounds elapsed *time* and the final score independently, so a
-- session backdated to just past the minimum window could submit any
-- score up to the ceiling without the game having actually run that
-- long. A per-second rate cap ties the two together.

-- ---------------------------------------------------------------------
-- Reward economics
-- ---------------------------------------------------------------------

-- 5% OFF becomes the sole live tier, and a genuinely hard one — a
-- reasoned starting estimate (no real usage data exists yet), sized
-- against the harder curve in DriveChallengeGame.tsx. Retunable with a
-- single update once game_stats_summary (below) shows real numbers.
update public.game_reward_tiers set points_required = 6000 where points_required = 500;

-- 10/15/20% stay in the table, just inactive — reactivating any of them
-- later is also a single update, no migration.
update public.game_reward_tiers set active = false where points_required in (1000, 2000, 3000);

alter table public.game_config add column max_score_per_second numeric not null default 180;

-- Only one claim/day matters once a second tier is ever reactivated —
-- with a single active tier today, the existing unique(user_id,
-- points_required) constraint already caps a user to one claim of it,
-- ever. Tightened now to match "limit reward claims appropriately".
update public.game_config set max_claims_per_day = 1;

create or replace function public.validate_game_score()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_cfg record;
  v_elapsed numeric;
begin
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

  -- Closes "wait the minimum window, then submit near the ceiling": the
  -- submitted score must also be plausible for how long the session
  -- actually ran, not just under a flat cap.
  if new.score > v_cfg.max_score_per_second * v_elapsed then
    raise exception 'This run is not eligible for scoring';
  end if;

  new.submitted_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Analytics — additive columns, informational only, never read by any
-- reward logic. Set in the same validated update as `score`, so they
-- land atomically with every real submission; not independently
-- protected beyond that, same "informational" status as the rest of the
-- stats screen's client-computed numbers.
-- ---------------------------------------------------------------------

alter table public.game_sessions
  add column distance numeric,
  add column max_combo integer;

-- Aggregate-only — no per-user rows, nothing identifying beyond what
-- the leaderboard already exposes (public.profiles.full_name, joined
-- elsewhere, not here). Answers "what percentage of real sessions reach
-- each score band", which is what the reward threshold should be
-- retuned from once enough real play accumulates.
create view public.game_stats_summary as
select
  count(*) filter (where score is not null) as games_played,
  count(distinct user_id) filter (where user_id is not null) as unique_players,
  max(score) as highest_score,
  round(avg(score)) as average_score,
  round(avg(distance), 1) as average_distance,
  max(max_combo) as highest_combo,
  count(*) filter (where score between 0 and 999) as band_0_999,
  count(*) filter (where score between 1000 and 2999) as band_1000_2999,
  count(*) filter (where score between 3000 and 4999) as band_3000_4999,
  count(*) filter (where score between 5000 and 5999) as band_5000_5999,
  count(*) filter (where score >= 6000) as band_6000_plus,
  (select count(*) from public.game_rewards) as rewards_claimed
from public.game_sessions;

grant select on public.game_stats_summary to anon, authenticated;
