import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { IconName } from '../../components/Icon';
import { DEMAND_META, type Demand } from './carMarket';

/**
 * City Empire — districts, per-district vehicle-category demand, and
 * live city events. See supabase/migrations/0036_city_empire.sql. Same
 * security contract as the rest of Empire: this file only ever reads
 * tables directly (or calls a lazy `ensure_*` RPC before reading); every
 * write lives in rentals.ts/contracts.ts as an RPC call.
 */

export type { Demand };
export { DEMAND_META };

export type DistrictKey = 'airport' | 'city_center' | 'luxury_district' | 'business_district' | 'tourist_district';

export interface District {
  districtKey: DistrictKey;
  name: string;
  description: string;
  icon: IconName;
  baseRateMultiplier: number;
  minBusinessTier: number;
}

interface DistrictRow {
  district_key: DistrictKey;
  name: string;
  description: string;
  icon: IconName;
  base_rate_multiplier: number;
  min_business_tier: number;
}

function mapDistrict(row: DistrictRow): District {
  return {
    districtKey: row.district_key,
    name: row.name,
    description: row.description,
    icon: row.icon,
    baseRateMultiplier: row.base_rate_multiplier,
    minBusinessTier: row.min_business_tier,
  };
}

export async function fetchDistricts(): Promise<District[]> {
  const { data, error } = await supabase.from('game_districts').select('*');
  if (error) throw error;
  return (data as DistrictRow[]).map(mapDistrict);
}

export function useDistricts() {
  const [districts, setDistricts] = useState<District[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchDistricts()
      .then((d) => !cancelled && setDistricts(d))
      .catch(() => !cancelled && setDistricts([]));
    return () => {
      cancelled = true;
    };
  }, []);
  return districts;
}

export interface DistrictDemand {
  districtKey: DistrictKey;
  category: string;
  demandTier: Demand;
  demandPct: number;
}

interface DistrictDemandRow {
  district_key: DistrictKey;
  category: string;
  demand_tier: Demand;
  demand_pct: number;
}

function mapDistrictDemand(row: DistrictDemandRow): DistrictDemand {
  return {
    districtKey: row.district_key,
    category: row.category,
    demandTier: row.demand_tier,
    demandPct: row.demand_pct,
  };
}

/** Ensures today's demand rows exist/are fresh, then reads them all — same
 *  two-step shape as carMarket.ts's fetchTodaysHotCars(). */
export async function fetchDistrictDemand(): Promise<DistrictDemand[]> {
  await supabase.rpc('ensure_district_demand');
  const { data, error } = await supabase.from('game_district_demand').select('*');
  if (error) throw error;
  return (data as DistrictDemandRow[]).map(mapDistrictDemand);
}

export function useDistrictDemand() {
  const [demand, setDemand] = useState<DistrictDemand[] | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchDistrictDemand()
      .then((d) => !cancelled && setDemand(d))
      .catch(() => !cancelled && setDemand([]));
    return () => {
      cancelled = true;
    };
  }, [reload]);
  return { demand, refresh: () => setReload((n) => n + 1) };
}

export interface CityEvent {
  id: string;
  districtKey: DistrictKey;
  category: string | null;
  title: string;
  description: string;
  effectPct: number;
  startsAt: string;
  endsAt: string;
}

interface CityEventRow {
  id: string;
  district_key: DistrictKey;
  category: string | null;
  title: string;
  description: string;
  effect_pct: number;
  starts_at: string;
  ends_at: string;
}

function mapCityEvent(row: CityEventRow): CityEvent {
  return {
    id: row.id,
    districtKey: row.district_key,
    category: row.category,
    title: row.title,
    description: row.description,
    effectPct: row.effect_pct,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}

export async function fetchCityEvents(): Promise<CityEvent[]> {
  await supabase.rpc('ensure_city_events');
  const { data, error } = await supabase
    .from('game_city_events')
    .select('*')
    .gt('ends_at', new Date().toISOString())
    .order('ends_at', { ascending: true });
  if (error) throw error;
  return (data as CityEventRow[]).map(mapCityEvent);
}

export function useCityEvents() {
  const [events, setEvents] = useState<CityEvent[] | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchCityEvents()
      .then((e) => !cancelled && setEvents(e))
      .catch(() => !cancelled && setEvents([]));
    return () => {
      cancelled = true;
    };
  }, [reload]);
  return { events, refresh: () => setReload((n) => n + 1) };
}

export const DISTRICT_MILESTONES = [25, 50, 75, 90] as const;
export type DistrictMilestone = (typeof DISTRICT_MILESTONES)[number];

export interface DistrictInfluence {
  districtKey: DistrictKey;
  completedRentals: number;
  influencePct: number;
}

interface DistrictInfluenceRow {
  district_key: DistrictKey;
  completed_rentals: number;
  influence_pct: number;
}

function mapDistrictInfluence(row: DistrictInfluenceRow): DistrictInfluence {
  return {
    districtKey: row.district_key,
    completedRentals: row.completed_rentals,
    influencePct: row.influence_pct,
  };
}

export async function fetchDistrictInfluence(): Promise<DistrictInfluence[]> {
  const { data, error } = await supabase.rpc('fetch_district_influence');
  if (error) throw error;
  return (data as DistrictInfluenceRow[]).map(mapDistrictInfluence);
}

export function useDistrictInfluence(userId: string | undefined) {
  const [influence, setInfluence] = useState<DistrictInfluence[] | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!userId) {
      setInfluence([]);
      return;
    }
    let cancelled = false;
    fetchDistrictInfluence()
      .then((i) => !cancelled && setInfluence(i))
      .catch(() => !cancelled && setInfluence([]));
    return () => {
      cancelled = true;
    };
  }, [userId, reload]);
  return { influence, refresh: () => setReload((n) => n + 1) };
}

export interface DistrictMilestoneClaim {
  districtKey: DistrictKey;
  milestone: DistrictMilestone;
}

interface DistrictMilestoneClaimRow {
  district_key: DistrictKey;
  milestone: DistrictMilestone;
}

export async function fetchMyDistrictMilestoneClaims(userId: string): Promise<DistrictMilestoneClaim[]> {
  const { data, error } = await supabase
    .from('game_district_milestone_claims')
    .select('district_key, milestone')
    .eq('user_id', userId);
  if (error) throw error;
  return (data as DistrictMilestoneClaimRow[]).map((r) => ({ districtKey: r.district_key, milestone: r.milestone }));
}

export function useMyDistrictMilestoneClaims(userId: string | undefined) {
  const [claims, setClaims] = useState<DistrictMilestoneClaim[] | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!userId) {
      setClaims([]);
      return;
    }
    let cancelled = false;
    fetchMyDistrictMilestoneClaims(userId)
      .then((c) => !cancelled && setClaims(c))
      .catch(() => !cancelled && setClaims([]));
    return () => {
      cancelled = true;
    };
  }, [userId, reload]);
  return { claims, refresh: () => setReload((n) => n + 1) };
}

export async function claimDistrictMilestone(
  districtKey: DistrictKey,
  milestone: DistrictMilestone
): Promise<{ cashAwarded: number; cxAwarded: number; error: string | null }> {
  const { data, error } = await supabase.rpc('claim_district_milestone', { p_district_key: districtKey, p_milestone: milestone });
  if (error) return { cashAwarded: 0, cxAwarded: 0, error: error.message };
  const row = (data as { cash_awarded: number; cx_awarded: number }[])[0];
  return { cashAwarded: row?.cash_awarded ?? 0, cxAwarded: row?.cx_awarded ?? 0, error: null };
}

export function isDistrictMilestoneClaimed(claims: DistrictMilestoneClaim[], districtKey: DistrictKey, milestone: DistrictMilestone): boolean {
  return claims.some((c) => c.districtKey === districtKey && c.milestone === milestone);
}

/** The next milestone this district has reached but not yet claimed, or
 *  null if none is currently reachable. */
export function nextUnclaimedMilestone(
  influencePct: number,
  claims: DistrictMilestoneClaim[],
  districtKey: DistrictKey
): DistrictMilestone | null {
  for (const milestone of DISTRICT_MILESTONES) {
    if (influencePct >= milestone && !isDistrictMilestoneClaimed(claims, districtKey, milestone)) {
      return milestone;
    }
  }
  return null;
}

const COMPETITOR_NAMES: [string, string] = ['Nova Mobility', 'UrbanDrive'];

/** Deterministic, purely cosmetic split of the remainder after CX
 *  influence — not a simulated rival, just flavor for the progress bar. */
export function competitorShareFor(influencePct: number): { nameA: string; pctA: number; nameB: string; pctB: number } {
  const remainder = 100 - influencePct;
  const pctA = Math.round(remainder * 0.6);
  const pctB = remainder - pctA;
  return { nameA: COMPETITOR_NAMES[0], pctA, nameB: COMPETITOR_NAMES[1], pctB };
}

/** Display-only mirror of _rental_daily_rate()'s server-side formula —
 *  used to preview a rental's daily rate before the player commits (the
 *  RPC always re-derives the real number itself). */
export function estimateDailyRentalRate(
  car: { marketValue: number; conditionEngine: number; conditionBody: number; conditionInterior: number; category: string },
  district: District,
  demand: DistrictDemand[],
  events: CityEvent[]
): number {
  const matchedDemand = demand.find((d) => d.districtKey === district.districtKey && d.category === car.category);
  const eventBonus = events
    .filter((e) => e.districtKey === district.districtKey && (e.category === null || e.category === car.category))
    .reduce((sum, e) => sum + e.effectPct, 0);
  const conditionFactor = (car.conditionEngine + car.conditionBody + car.conditionInterior) / 300;
  return Math.round(
    car.marketValue * 0.012 * district.baseRateMultiplier * (1 + ((matchedDemand?.demandPct ?? 0) + eventBonus) / 100) * Math.max(0.4, conditionFactor)
  );
}
