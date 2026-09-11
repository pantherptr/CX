import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { IconName } from '../../components/Icon';
import type { PlayerState } from './empire';

/**
 * City Empire — missions (one-time and daily objectives). Progress is
 * always computed live from existing player-state counters, never
 * stored/incremented separately — matching this codebase's established
 * "compute, don't duplicate" philosophy. See
 * supabase/migrations/0036_city_empire.sql. Same security contract as
 * the rest of Empire: this file only ever reads tables directly, every
 * write is an RPC call.
 */

export type MissionScope = 'lifetime' | 'daily' | 'weekly';
export type MissionMetric =
  | 'rentals_completed'
  | 'contracts_completed'
  | 'requests_fulfilled'
  | 'daily_rentals_completed'
  | 'daily_requests_fulfilled'
  | 'weekly_rentals_completed'
  | 'weekly_contracts_completed';

export interface MissionTemplate {
  id: string;
  scope: MissionScope;
  title: string;
  description: string;
  metricKey: MissionMetric;
  target: number;
  rewardCash: number;
  rewardCxPoints: number;
  icon: IconName;
  sortOrder: number;
}

interface MissionTemplateRow {
  id: string;
  scope: MissionScope;
  title: string;
  description: string;
  metric_key: MissionMetric;
  target: number;
  reward_cash: number;
  reward_cx_points: number;
  icon: IconName;
  sort_order: number;
}

function mapMissionTemplate(row: MissionTemplateRow): MissionTemplate {
  return {
    id: row.id,
    scope: row.scope,
    title: row.title,
    description: row.description,
    metricKey: row.metric_key,
    target: row.target,
    rewardCash: row.reward_cash,
    rewardCxPoints: row.reward_cx_points,
    icon: row.icon,
    sortOrder: row.sort_order,
  };
}

export async function fetchMissionTemplates(): Promise<MissionTemplate[]> {
  const { data, error } = await supabase.from('game_mission_templates').select('*').order('sort_order');
  if (error) throw error;
  return (data as MissionTemplateRow[]).map(mapMissionTemplate);
}

export function useMissionTemplates() {
  const [missions, setMissions] = useState<MissionTemplate[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchMissionTemplates()
      .then((m) => !cancelled && setMissions(m))
      .catch(() => !cancelled && setMissions([]));
    return () => {
      cancelled = true;
    };
  }, []);
  return missions;
}

export interface DailyProgress {
  day: string;
  dailyRentalsCompleted: number;
  dailyRequestsFulfilled: number;
}

interface DailyProgressRow {
  day: string;
  daily_rentals_completed: number;
  daily_requests_fulfilled: number;
}

function mapDailyProgress(row: DailyProgressRow): DailyProgress {
  return {
    day: row.day,
    dailyRentalsCompleted: row.daily_rentals_completed,
    dailyRequestsFulfilled: row.daily_requests_fulfilled,
  };
}

export async function ensureDailyProgress(): Promise<DailyProgress> {
  const { data, error } = await supabase.rpc('ensure_daily_progress');
  if (error) throw error;
  return mapDailyProgress(data as DailyProgressRow);
}

export function useDailyProgress() {
  const [progress, setProgress] = useState<DailyProgress | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    ensureDailyProgress()
      .then((p) => !cancelled && setProgress(p))
      .catch(() => !cancelled && setProgress(null));
    return () => {
      cancelled = true;
    };
  }, [reload]);
  return { progress, refresh: () => setReload((n) => n + 1) };
}

export interface WeeklyProgress {
  weekStart: string;
  weeklyRentalsCompleted: number;
  weeklyContractsCompleted: number;
}

interface WeeklyProgressRow {
  week_start: string;
  weekly_rentals_completed: number;
  weekly_contracts_completed: number;
}

function mapWeeklyProgress(row: WeeklyProgressRow): WeeklyProgress {
  return {
    weekStart: row.week_start,
    weeklyRentalsCompleted: row.weekly_rentals_completed,
    weeklyContractsCompleted: row.weekly_contracts_completed,
  };
}

export async function ensureWeeklyProgress(): Promise<WeeklyProgress> {
  const { data, error } = await supabase.rpc('ensure_weekly_progress');
  if (error) throw error;
  return mapWeeklyProgress(data as WeeklyProgressRow);
}

export function useWeeklyProgress() {
  const [progress, setProgress] = useState<WeeklyProgress | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    ensureWeeklyProgress()
      .then((p) => !cancelled && setProgress(p))
      .catch(() => !cancelled && setProgress(null));
    return () => {
      cancelled = true;
    };
  }, [reload]);
  return { progress, refresh: () => setReload((n) => n + 1) };
}

export interface MissionClaim {
  missionId: string;
  scope: MissionScope;
  claimDate: string;
  claimWeek: string | null;
}

interface MissionClaimRow {
  mission_id: string;
  scope: MissionScope;
  claim_date: string;
  claim_week: string | null;
}

export async function fetchMyMissionClaims(userId: string): Promise<MissionClaim[]> {
  const { data, error } = await supabase
    .from('game_mission_claims')
    .select('mission_id, scope, claim_date, claim_week')
    .eq('user_id', userId);
  if (error) throw error;
  return (data as MissionClaimRow[]).map((r) => ({ missionId: r.mission_id, scope: r.scope, claimDate: r.claim_date, claimWeek: r.claim_week }));
}

export function useMyMissionClaims(userId: string | undefined) {
  const [claims, setClaims] = useState<MissionClaim[] | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!userId) {
      setClaims([]);
      return;
    }
    let cancelled = false;
    fetchMyMissionClaims(userId)
      .then((c) => !cancelled && setClaims(c))
      .catch(() => !cancelled && setClaims([]));
    return () => {
      cancelled = true;
    };
  }, [userId, reload]);
  return { claims, refresh: () => setReload((n) => n + 1) };
}

export async function claimMission(missionId: string): Promise<{ cashAwarded: number; cxAwarded: number; error: string | null }> {
  const { data, error } = await supabase.rpc('claim_mission', { p_mission_id: missionId });
  if (error) return { cashAwarded: 0, cxAwarded: 0, error: error.message };
  const row = (data as { cash_awarded: number; cx_awarded: number }[])[0];
  return { cashAwarded: row?.cash_awarded ?? 0, cxAwarded: row?.cx_awarded ?? 0, error: null };
}

/** Reads the right counter for a mission's metric off player/daily/
 *  weekly state — the client-side mirror of claim_mission()'s
 *  server-side `case` on metric_key. Display-only; the RPC re-derives
 *  this itself. */
export function missionProgress(
  mission: MissionTemplate,
  playerState: PlayerState | null,
  dailyProgress: DailyProgress | null,
  weeklyProgress: WeeklyProgress | null = null
): number {
  switch (mission.metricKey) {
    case 'rentals_completed': return playerState?.rentalsCompleted ?? 0;
    case 'contracts_completed': return playerState?.contractsCompleted ?? 0;
    case 'requests_fulfilled': return playerState?.requestsFulfilled ?? 0;
    case 'daily_rentals_completed': return dailyProgress?.dailyRentalsCompleted ?? 0;
    case 'daily_requests_fulfilled': return dailyProgress?.dailyRequestsFulfilled ?? 0;
    case 'weekly_rentals_completed': return weeklyProgress?.weeklyRentalsCompleted ?? 0;
    case 'weekly_contracts_completed': return weeklyProgress?.weeklyContractsCompleted ?? 0;
  }
}

export function isMissionClaimed(mission: MissionTemplate, claims: MissionClaim[], today: string, weekStart?: string): boolean {
  if (mission.scope === 'lifetime') {
    return claims.some((c) => c.missionId === mission.id && c.scope === 'lifetime');
  }
  if (mission.scope === 'weekly') {
    return claims.some((c) => c.missionId === mission.id && c.scope === 'weekly' && c.claimWeek === weekStart);
  }
  return claims.some((c) => c.missionId === mission.id && c.scope === 'daily' && c.claimDate === today);
}
