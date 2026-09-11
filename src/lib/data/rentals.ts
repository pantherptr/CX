import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { Rarity } from './empire';
import type { DistrictKey, Demand } from './districts';

/**
 * City Empire — the core rental loop: assign an owned car to a district
 * (or to an urgent customer request) for a fixed duration, wait, collect
 * the payout. See supabase/migrations/0036_city_empire.sql. Same
 * security contract as carMarket.ts: every write is a `security definer`
 * RPC call, this file only ever reads tables directly.
 */

export type RentalSource = 'standard' | 'customer_request';
export type RentalStatus = 'active' | 'completed' | 'cancelled';
export type PriceTier = 'below_market' | 'market' | 'premium';

export interface RentalRecord {
  id: string;
  inventoryId: string;
  districtKey: DistrictKey;
  category: string;
  durationDays: number;
  dailyRate: number;
  demandTier: Demand;
  payout: number;
  priceTier: PriceTier;
  source: RentalSource;
  startedAt: string;
  resolvesAt: string;
  status: RentalStatus;
  resolvedAt: string | null;
  // Joined display fields.
  name: string;
  brand: string;
  rarity: Rarity;
  customization: Record<string, string>;
  customName: string | null;
}

interface RentalRow {
  id: string;
  inventory_id: string;
  district_key: DistrictKey;
  category: string;
  duration_days: number;
  daily_rate: number;
  demand_tier: Demand;
  payout: number;
  price_tier: PriceTier;
  source: RentalSource;
  started_at: string;
  resolves_at: string;
  status: RentalStatus;
  resolved_at: string | null;
  inventory: {
    customization: Record<string, string>;
    custom_name: string | null;
    template: { name: string; brand: string; rarity: Rarity } | null;
  } | null;
}

const RENTAL_SELECT = `
  id, inventory_id, district_key, category, duration_days, daily_rate, demand_tier, payout, price_tier,
  source, started_at, resolves_at, status, resolved_at,
  inventory:game_inventory (
    customization, custom_name,
    template:game_vehicle_templates (name, brand, rarity)
  )
`;

function mapRental(row: RentalRow): RentalRecord {
  return {
    id: row.id,
    inventoryId: row.inventory_id,
    districtKey: row.district_key,
    category: row.category,
    durationDays: row.duration_days,
    dailyRate: row.daily_rate,
    demandTier: row.demand_tier,
    payout: row.payout,
    priceTier: row.price_tier,
    source: row.source,
    startedAt: row.started_at,
    resolvesAt: row.resolves_at,
    status: row.status,
    resolvedAt: row.resolved_at,
    name: row.inventory?.template?.name ?? 'Unknown vehicle',
    brand: row.inventory?.template?.brand ?? '',
    rarity: row.inventory?.template?.rarity ?? 'common',
    customization: row.inventory?.customization ?? {},
    customName: row.inventory?.custom_name ?? null,
  };
}

export async function fetchMyRentals(userId: string): Promise<RentalRecord[]> {
  const { data, error } = await supabase
    .from('game_rentals')
    .select(RENTAL_SELECT)
    .eq('user_id', userId)
    .order('started_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as RentalRow[]).map(mapRental);
}

export function useMyRentals(userId: string | undefined) {
  const [rentals, setRentals] = useState<RentalRecord[] | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!userId) {
      setRentals([]);
      return;
    }
    let cancelled = false;
    fetchMyRentals(userId)
      .then((r) => !cancelled && setRentals(r))
      .catch(() => !cancelled && setRentals([]));
    return () => {
      cancelled = true;
    };
  }, [userId, reload]);
  return { rentals, refresh: () => setReload((n) => n + 1) };
}

export async function assignCarToRental(
  inventoryId: string,
  districtKey: DistrictKey,
  durationDays: 1 | 3 | 7,
  priceTier: PriceTier = 'market'
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('assign_car_to_rental', {
    p_inventory_id: inventoryId,
    p_district_key: districtKey,
    p_duration_days: durationDays,
    p_price_tier: priceTier,
  });
  return { error: error?.message ?? null };
}

/** Display-only mirror of assign_car_to_rental()'s tier+duration
 *  multipliers — the RPC always re-derives the real payout server-side;
 *  this just lets the picker preview it before the player commits. */
export function estimateRentalPayout(dailyRate: number, durationDays: 1 | 3 | 7, priceTier: PriceTier): number {
  const tierMultiplier = priceTier === 'below_market' ? 0.85 : priceTier === 'premium' ? 1.2 : 1.0;
  const adjustedDailyRate = Math.round(dailyRate * tierMultiplier);
  const durationMultiplier = durationDays >= 7 ? 1.1 : durationDays >= 3 ? 1.05 : 1.0;
  return Math.round(adjustedDailyRate * durationDays * durationMultiplier);
}

/** The lazy-resolution entry point — resolves anything past its due time
 *  server-side and returns every rental this player has, active first.
 *  Call on City-tab mount and on a light poll while it's open. */
export async function syncRentals(): Promise<RentalRecord[]> {
  const { data, error } = await supabase.rpc('resolve_due_rentals');
  if (error) throw error;
  return (data as unknown as RentalRow[]).map(mapRental);
}

export async function cancelRental(rentalId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('cancel_rental', { p_rental_id: rentalId });
  return { error: error?.message ?? null };
}

export interface CustomerRequest {
  id: string;
  districtKey: DistrictKey;
  category: string;
  customerName: string;
  bonusPct: number;
  durationDays: number;
  isVip: boolean;
  status: 'pending' | 'accepted' | 'expired';
  createdAt: string;
  expiresAt: string;
}

interface CustomerRequestRow {
  id: string;
  district_key: DistrictKey;
  category: string;
  customer_name: string;
  bonus_pct: number;
  duration_days: number;
  is_vip: boolean;
  status: 'pending' | 'accepted' | 'expired';
  created_at: string;
  expires_at: string;
}

function mapCustomerRequest(row: CustomerRequestRow): CustomerRequest {
  return {
    id: row.id,
    districtKey: row.district_key,
    category: row.category,
    customerName: row.customer_name,
    bonusPct: row.bonus_pct,
    durationDays: row.duration_days,
    isVip: row.is_vip,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

/** Expires stale requests and rolls a chance at a new one, then reads
 *  every pending request this player has — same two-step shape as
 *  districts.ts's fetchDistrictDemand(). */
export async function fetchMyCustomerRequests(userId: string): Promise<CustomerRequest[]> {
  await supabase.rpc('ensure_customer_requests');
  const { data, error } = await supabase
    .from('game_customer_requests')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('expires_at', { ascending: true });
  if (error) throw error;
  return (data as CustomerRequestRow[]).map(mapCustomerRequest);
}

export function useMyCustomerRequests(userId: string | undefined) {
  const [requests, setRequests] = useState<CustomerRequest[] | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!userId) {
      setRequests([]);
      return;
    }
    let cancelled = false;
    fetchMyCustomerRequests(userId)
      .then((r) => !cancelled && setRequests(r))
      .catch(() => !cancelled && setRequests([]));
    return () => {
      cancelled = true;
    };
  }, [userId, reload]);
  return { requests, refresh: () => setReload((n) => n + 1) };
}

export async function acceptCustomerRequest(requestId: string, inventoryId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('accept_customer_request', {
    p_request_id: requestId,
    p_inventory_id: inventoryId,
  });
  return { error: error?.message ?? null };
}

export async function declineCustomerRequest(requestId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('decline_customer_request', { p_request_id: requestId });
  return { error: error?.message ?? null };
}

/** Display-only mirror of resolve_due_rentals()'s CX-award formula —
 *  the RPC computes and awards the real amount server-side; this just
 *  lets the celebration moment show a matching number. */
export function estimateRentalCxPoints(payout: number, durationDays: number): number {
  const base = Math.min(300, Math.max(15, Math.round(payout / 150)));
  return durationDays >= 7 ? base + 150 : base;
}
