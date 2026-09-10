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
}

interface DistrictRow {
  district_key: DistrictKey;
  name: string;
  description: string;
  icon: IconName;
  base_rate_multiplier: number;
}

function mapDistrict(row: DistrictRow): District {
  return {
    districtKey: row.district_key,
    name: row.name,
    description: row.description,
    icon: row.icon,
    baseRateMultiplier: row.base_rate_multiplier,
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
