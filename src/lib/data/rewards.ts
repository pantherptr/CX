import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

/**
 * CX Drive Challenge — reward data-access layer.
 *
 * The client is never trusted with anything that creates money value:
 * `game_sessions.started_at`/`user_id` are server-set on insert, the
 * score can only be written once and only if it's plausible for the
 * elapsed time (see `supabase/migrations/0010_drive_challenge.sql`'s
 * `validate_game_score` trigger), and a `game_rewards` row can only ever
 * be created by the `claim_game_reward` RPC — there is no client insert
 * policy on that table at all. This layer only ever reads rewards or
 * calls that RPC; it never writes a coupon_code, discount_percentage or
 * status directly.
 */

export interface GameConfig {
  leaderboardEnabled: boolean;
  maxClaimsPerDay: number;
  minSessionSeconds: number;
  maxSessionSeconds: number;
  maxPlausibleScore: number;
  sessionClaimWindowHours: number;
  rewardExpiryDays: number;
}

export interface RewardTier {
  pointsRequired: number;
  discountPercentage: number;
  label: string;
}

export interface GameSession {
  id: string;
  startedAt: string;
  score: number | null;
  submittedAt: string | null;
  claimedAt: string | null;
}

export type RewardDbStatus = 'available' | 'used' | 'expired';
/** `'expired'` is derived, never a DB write — mirrors `classifyBooking()`'s
 *  pattern in `bookings.ts` for the same reason: the true expiry moment
 *  shouldn't depend on a background job ever having run. */
export type RewardStatus = RewardDbStatus;

export interface Reward {
  id: string;
  rewardType: string;
  discountPercentage: number;
  pointsRequired: number;
  couponCode: string;
  status: RewardDbStatus;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export function rewardStatus(reward: Pick<Reward, 'status' | 'expiresAt'>): RewardStatus {
  if (reward.status === 'available' && new Date(reward.expiresAt) < new Date()) return 'expired';
  return reward.status;
}

export interface LeaderboardEntry {
  userId: string | null;
  name: string;
  avatar: string;
  score: number;
}

interface GameConfigRow {
  leaderboard_enabled: boolean;
  max_claims_per_day: number;
  min_session_seconds: number;
  max_session_seconds: number;
  max_plausible_score: number;
  session_claim_window_hours: number;
  reward_expiry_days: number;
}

function mapGameConfig(row: GameConfigRow): GameConfig {
  return {
    leaderboardEnabled: row.leaderboard_enabled,
    maxClaimsPerDay: row.max_claims_per_day,
    minSessionSeconds: row.min_session_seconds,
    maxSessionSeconds: row.max_session_seconds,
    maxPlausibleScore: row.max_plausible_score,
    sessionClaimWindowHours: row.session_claim_window_hours,
    rewardExpiryDays: row.reward_expiry_days,
  };
}

export async function fetchGameConfig(): Promise<GameConfig> {
  const { data, error } = await supabase.from('game_config').select('*').single();
  if (error) throw error;
  return mapGameConfig(data as GameConfigRow);
}

export function useGameConfig() {
  const [config, setConfig] = useState<GameConfig | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchGameConfig()
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch(() => {
        // Non-critical decoration (leaderboard visibility, tier display) —
        // fail quiet rather than blocking the game from being playable.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return config;
}

interface RewardTierRow {
  points_required: number;
  discount_percentage: number;
  label: string;
}

export async function fetchRewardTiers(): Promise<RewardTier[]> {
  const { data, error } = await supabase
    .from('game_reward_tiers')
    .select('points_required, discount_percentage, label')
    .order('points_required', { ascending: true });
  if (error) throw error;
  return (data as RewardTierRow[]).map((r) => ({
    pointsRequired: r.points_required,
    discountPercentage: r.discount_percentage,
    label: r.label,
  }));
}

export function useRewardTiers() {
  const [tiers, setTiers] = useState<RewardTier[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchRewardTiers()
      .then((t) => {
        if (!cancelled) setTiers(t);
      })
      .catch(() => {
        if (!cancelled) setTiers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return tiers;
}

/** Highest tier the given score currently qualifies for — used only for
 *  immediate on-screen feedback right after a run. The real entitlement
 *  is re-derived server-side from the score already stored on the
 *  session when `claimGameReward` runs, never trusted from here. */
export function bestQualifyingTier(score: number, tiers: RewardTier[]): RewardTier | null {
  const qualifying = tiers.filter((t) => t.pointsRequired <= score);
  if (qualifying.length === 0) return null;
  return qualifying.reduce((best, t) => (t.pointsRequired > best.pointsRequired ? t : best));
}

interface GameSessionRow {
  id: string;
  started_at: string;
  score: number | null;
  submitted_at: string | null;
  claimed_at: string | null;
}

function mapSession(row: GameSessionRow): GameSession {
  return {
    id: row.id,
    startedAt: row.started_at,
    score: row.score,
    submittedAt: row.submitted_at,
    claimedAt: row.claimed_at,
  };
}

/** Opens a session server-side — `started_at`/`user_id` are set by the
 *  `prepare_game_session` trigger regardless of what's sent here, so the
 *  elapsed-time check at submit time can't be gamed by claiming the run
 *  started earlier than it did. */
export async function startGameSession(): Promise<{ session: GameSession | null; error: string | null }> {
  const { data, error } = await supabase
    .from('game_sessions')
    .insert({})
    .select('id, started_at, score, submitted_at, claimed_at')
    .single();
  if (error) return { session: null, error: error.message };
  return { session: mapSession(data as GameSessionRow), error: null };
}

/** Writes the run's final score exactly once — the `validate_game_score`
 *  trigger rejects a resubmission or a score implausible for the
 *  session's real elapsed server-side duration (both a hard ceiling and
 *  a per-second rate tied to how long the session actually ran).
 *  `distance`/`maxCombo` ride along in the same update purely for
 *  aggregate analytics (`game_stats_summary`) — informational only,
 *  never read by any reward logic. */
export async function submitGameScore(
  sessionId: string,
  score: number,
  distance?: number,
  maxCombo?: number,
): Promise<{ session: GameSession | null; error: string | null }> {
  const { data, error } = await supabase
    .from('game_sessions')
    .update({
      score: Math.max(0, Math.round(score)),
      distance: distance ?? null,
      max_combo: maxCombo ?? null,
    })
    .eq('id', sessionId)
    .select('id, started_at, score, submitted_at, claimed_at')
    .single();
  if (error) return { session: null, error: error.message };
  return { session: mapSession(data as GameSessionRow), error: null };
}

interface RewardRow {
  id: string;
  reward_type: string;
  discount_percentage: number;
  points_required: number;
  coupon_code: string;
  status: RewardDbStatus;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

function mapReward(row: RewardRow): Reward {
  return {
    id: row.id,
    rewardType: row.reward_type,
    discountPercentage: row.discount_percentage,
    pointsRequired: row.points_required,
    couponCode: row.coupon_code,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
  };
}

/** The only place a `game_rewards` row is ever created — everything that
 *  determines it (which tier, the code, the expiry) is computed inside
 *  the `claim_game_reward` Postgres function from the session's own
 *  server-recorded score, not from anything passed here. */
export async function claimGameReward(
  sessionId: string,
): Promise<{ reward: Reward | null; error: string | null }> {
  const { data, error } = await supabase.rpc('claim_game_reward', { p_session_id: sessionId });
  if (error) return { reward: null, error: error.message };
  return { reward: mapReward(data as RewardRow), error: null };
}

export async function fetchMyRewards(userId: string): Promise<Reward[]> {
  const { data, error } = await supabase
    .from('game_rewards')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as RewardRow[]).map(mapReward);
}

export function useMyRewards(userId: string | undefined) {
  const [rewards, setRewards] = useState<Reward[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setRewards([]);
      return;
    }
    let cancelled = false;
    fetchMyRewards(userId)
      .then((data) => {
        if (!cancelled) setRewards(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load your rewards.');
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { rewards, error, loading: rewards === null && !error };
}

/** The best currently-usable reward for checkout — highest discount
 *  first, since a user only ever applies one reward per booking. */
export function useAvailableReward(userId: string | undefined) {
  const { rewards } = useMyRewards(userId);
  if (!rewards) return null;
  const usable = rewards
    .filter((r) => rewardStatus(r) === 'available')
    .sort((a, b) => b.discountPercentage - a.discountPercentage);
  return usable[0] ?? null;
}

interface LeaderboardRow {
  score: number;
  user_id: string | null;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
}

export type LeaderboardPeriod = 'week' | 'month' | 'all';

/** Start of the current (local) week — Monday 00:00. */
function startOfWeek(): Date {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - day);
  return monday;
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Top scores for the given window. Only ever joins to
 *  `profiles.full_name`/`avatar_url` — both already publicly readable
 *  everywhere else in the app (host cards, reviews) — never email or any
 *  other private field. */
export async function fetchLeaderboard(
  period: LeaderboardPeriod,
  limit = 10,
): Promise<LeaderboardEntry[]> {
  let query = supabase
    .from('game_sessions')
    .select('score, user_id, profiles!game_sessions_user_id_fkey(full_name, avatar_url)')
    .not('score', 'is', null)
    .not('user_id', 'is', null)
    .order('score', { ascending: false })
    .limit(limit);

  if (period === 'week') query = query.gte('started_at', startOfWeek().toISOString());
  else if (period === 'month') query = query.gte('started_at', startOfMonth().toISOString());

  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as LeaderboardRow[]).map((row) => ({
    userId: row.user_id,
    name: row.profiles?.full_name || 'CX Driver',
    avatar: row.profiles?.avatar_url || '',
    score: row.score,
  }));
}

const PENDING_CLAIM_KEY = 'cx-pending-drive-session';

/** Stashes a just-finished, qualifying anonymous run so it can be
 *  claimed once the player signs up — the session itself already has no
 *  `user_id` server-side (see `prepare_game_session`), this only carries
 *  its id across the full-page navigation to /signup and back. */
export function stashPendingClaim(sessionId: string) {
  try {
    localStorage.setItem(PENDING_CLAIM_KEY, sessionId);
  } catch {
    // Storage unavailable (private browsing, etc.) — the claim simply
    // won't survive the navigation; not fatal, just a missed convenience.
  }
}

/** Reads and clears the pending claim in one call, so it's only ever
 *  attempted once regardless of how many authenticated pages mount. */
export function takePendingClaim(): string | null {
  try {
    const id = localStorage.getItem(PENDING_CLAIM_KEY);
    if (id) localStorage.removeItem(PENDING_CLAIM_KEY);
    return id;
  } catch {
    return null;
  }
}

export function useLeaderboard(period: LeaderboardPeriod, enabled: boolean) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setEntries(null);
    fetchLeaderboard(period)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [period, enabled]);
  return entries;
}
