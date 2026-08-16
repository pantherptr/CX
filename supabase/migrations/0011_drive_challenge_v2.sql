-- CX Drive Challenge 2.0 — harder gameplay (combo multiplier, power-ups,
-- steeper difficulty ramp) can legitimately produce higher final scores
-- than v1's tuning assumed. Every other anti-cheat bound
-- (min/max_session_seconds, max_claims_per_day, session_claim_window_hours)
-- is about *time* and *rate*, not the scoring formula, so only the score
-- ceiling needs to move. Reward tier thresholds/percentages are
-- deliberately left untouched — the ask was to make them *harder to
-- reach*, not to renumber them.
update public.game_config set max_plausible_score = 15000;
