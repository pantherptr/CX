import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

/**
 * City Empire — a light, non-mandatory daily-visit streak. See
 * supabase/migrations/0038_city_action_center.sql. `ensure_login_streak()`
 * increments/resets/awards milestone bonuses server-side; this file only
 * ever calls that RPC.
 */
export interface LoginStreak {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
}

interface LoginStreakRow {
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
}

function mapLoginStreak(row: LoginStreakRow): LoginStreak {
  return {
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    lastActiveDate: row.last_active_date,
  };
}

export async function ensureLoginStreak(): Promise<LoginStreak> {
  const { data, error } = await supabase.rpc('ensure_login_streak');
  if (error) throw error;
  return mapLoginStreak(data as LoginStreakRow);
}

/** Called once per mount, not gated on the City tab — a streak is about
 *  visiting the app at all. */
export function useLoginStreak(userId: string | undefined) {
  const [streak, setStreak] = useState<LoginStreak | null>(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    ensureLoginStreak()
      .then((s) => !cancelled && setStreak(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return { streak };
}
