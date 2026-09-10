import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

/**
 * City Empire leaderboard — ranks every player by net worth via
 * `fetch_empire_leaderboard()`, the one RPC that legitimately bypasses
 * another player's row-level select restriction on game_player_state,
 * scoped to only the columns needed for display. Deliberately NOT
 * reusing rewards.ts's fetchLeaderboard()/useLeaderboard() — that's dead
 * code pointed at the old, retired Drive Challenge game_sessions table.
 */

export interface LeaderboardEntry {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  businessTier: number;
  netWorth: number;
}

interface LeaderboardRow {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  business_tier: number;
  net_worth: number;
}

function mapEntry(row: LeaderboardRow): LeaderboardEntry {
  return {
    userId: row.user_id,
    fullName: row.full_name ?? 'CX Player',
    avatarUrl: row.avatar_url,
    businessTier: row.business_tier,
    netWorth: row.net_worth,
  };
}

export async function fetchEmpireLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc('fetch_empire_leaderboard', { p_limit: limit });
  if (error) throw error;
  return (data as LeaderboardRow[]).map(mapEntry);
}

export function useEmpireLeaderboard(limit = 20) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchEmpireLeaderboard(limit)
      .then((e) => !cancelled && setEntries(e))
      .catch(() => !cancelled && setEntries([]));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);
  return entries;
}
