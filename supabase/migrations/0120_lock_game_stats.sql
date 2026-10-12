-- 0120 — Close the Security Advisor's "Security Definer View" warning on public.game_stats_summary.
-- The view only holds aggregate numbers for the old Drive Challenge game and nothing in the app reads it.
-- Make it run with the caller's rights, and stop handing it out to everyone.

alter view public.game_stats_summary set (security_invoker = true);
revoke select on public.game_stats_summary from anon, authenticated;
