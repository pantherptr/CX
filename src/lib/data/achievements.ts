import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { IconName } from '../../components/Icon';
import type { PlayerState, Rarity } from './empire';

/**
 * City Empire — one-time achievement unlocks. Detected by a pull-based
 * RPC the client calls opportunistically (see the City-tab poll in
 * Empire.tsx), not hooked into any other mutation. See
 * supabase/migrations/0036_city_empire.sql.
 */

export type AchievementMetric = 'rentals_completed' | 'contracts_completed' | 'requests_fulfilled' | 'total_profit' | 'reputation';

export interface AchievementTemplate {
  id: string;
  title: string;
  description: string;
  metricKey: AchievementMetric;
  target: number;
  rewardCxPoints: number;
  icon: IconName;
  rarity: Rarity;
  sortOrder: number;
}

interface AchievementTemplateRow {
  id: string;
  title: string;
  description: string;
  metric_key: AchievementMetric;
  target: number;
  reward_cx_points: number;
  icon: IconName;
  rarity: Rarity;
  sort_order: number;
}

function mapAchievementTemplate(row: AchievementTemplateRow): AchievementTemplate {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    metricKey: row.metric_key,
    target: row.target,
    rewardCxPoints: row.reward_cx_points,
    icon: row.icon,
    rarity: row.rarity,
    sortOrder: row.sort_order,
  };
}

export async function fetchAchievementTemplates(): Promise<AchievementTemplate[]> {
  const { data, error } = await supabase.from('game_achievement_templates').select('*').order('sort_order');
  if (error) throw error;
  return (data as AchievementTemplateRow[]).map(mapAchievementTemplate);
}

export function useAchievementTemplates() {
  const [achievements, setAchievements] = useState<AchievementTemplate[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchAchievementTemplates()
      .then((a) => !cancelled && setAchievements(a))
      .catch(() => !cancelled && setAchievements([]));
    return () => {
      cancelled = true;
    };
  }, []);
  return achievements;
}

export interface AchievementUnlock {
  achievementId: string;
  unlockedAt: string;
}

interface AchievementUnlockRow {
  achievement_id: string;
  unlocked_at: string;
}

export async function fetchMyAchievementUnlocks(userId: string): Promise<AchievementUnlock[]> {
  const { data, error } = await supabase
    .from('game_achievement_unlocks')
    .select('achievement_id, unlocked_at')
    .eq('user_id', userId);
  if (error) throw error;
  return (data as AchievementUnlockRow[]).map((r) => ({ achievementId: r.achievement_id, unlockedAt: r.unlocked_at }));
}

export function useMyAchievementUnlocks(userId: string | undefined) {
  const [unlocks, setUnlocks] = useState<AchievementUnlock[] | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!userId) {
      setUnlocks([]);
      return;
    }
    let cancelled = false;
    fetchMyAchievementUnlocks(userId)
      .then((u) => !cancelled && setUnlocks(u))
      .catch(() => !cancelled && setUnlocks([]));
    return () => {
      cancelled = true;
    };
  }, [userId, reload]);
  return { unlocks, refresh: () => setReload((n) => n + 1) };
}

export interface NewlyUnlockedAchievement {
  achievementId: string;
  title: string;
  description: string;
  icon: IconName;
  rarity: Rarity;
  rewardCxPoints: number;
}

interface NewlyUnlockedRow {
  achievement_id: string;
  title: string;
  description: string;
  icon: IconName;
  rarity: Rarity;
  reward_cx_points: number;
}

/** Checks every not-yet-unlocked achievement against current player
 *  state and unlocks any that now qualify, returning only what changed
 *  this call (usually nothing) — feeds straight into a celebration
 *  queue with no separate "seen" bookkeeping needed. */
export async function checkAndAwardAchievements(): Promise<NewlyUnlockedAchievement[]> {
  const { data, error } = await supabase.rpc('check_and_award_achievements');
  if (error) throw error;
  return (data as NewlyUnlockedRow[]).map((r) => ({
    achievementId: r.achievement_id,
    title: r.title,
    description: r.description,
    icon: r.icon,
    rarity: r.rarity,
    rewardCxPoints: r.reward_cx_points,
  }));
}

/** Display-only mirror of check_and_award_achievements()'s metric
 *  lookup — the RPC re-derives this itself. */
export function achievementProgress(achievement: AchievementTemplate, playerState: PlayerState | null): number {
  if (!playerState) return 0;
  switch (achievement.metricKey) {
    case 'rentals_completed': return playerState.rentalsCompleted;
    case 'contracts_completed': return playerState.contractsCompleted;
    case 'requests_fulfilled': return playerState.requestsFulfilled;
    case 'total_profit': return playerState.totalRevenue - playerState.totalExpenses;
    case 'reputation': return playerState.reputation;
  }
}
