import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

/**
 * CX Rent — Luxury Car Empire — data-access layer for the business
 * management game that replaced the CX Drive Challenge racing minigame
 * (see supabase/migrations/0030_luxury_car_empire.sql). Same security
 * contract as rewards.ts and cxScore.ts: cash, condition, inventory and
 * business tier are never written directly from the client — every
 * mutation goes through a `security definer` RPC that re-validates and
 * re-prices everything server-side. This file only ever reads tables
 * directly; every write below is an `supabase.rpc(...)` call.
 */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

export const RARITY_META: Record<Rarity, { label: string; color: string; glow: string }> = {
  common: { label: 'Common', color: '#9aa3ad', glow: '0 0 0 rgba(154,163,173,0)' },
  uncommon: { label: 'Uncommon', color: '#3ecf8e', glow: '0 0 16px rgba(62,207,142,0.3)' },
  rare: { label: 'Rare', color: '#4fb2ff', glow: '0 0 18px rgba(79,178,255,0.35)' },
  epic: { label: 'Epic', color: '#b06bff', glow: '0 0 22px rgba(176,107,255,0.4)' },
  legendary: { label: 'Legendary', color: '#ff9f40', glow: '0 0 26px rgba(255,159,64,0.45)' },
  mythic: { label: 'Mythic', color: '#ff5fd1', glow: '0 0 32px rgba(255,95,209,0.55)' },
};

export interface PlayerState {
  cash: number;
  reputation: number;
  businessTier: number;
  totalRevenue: number;
  totalExpenses: number;
}

interface PlayerStateRow {
  cash: number;
  reputation: number;
  business_tier: number;
  total_revenue: number;
  total_expenses: number;
}

function mapPlayerState(row: PlayerStateRow): PlayerState {
  return {
    cash: row.cash,
    reputation: row.reputation,
    businessTier: row.business_tier,
    totalRevenue: row.total_revenue,
    totalExpenses: row.total_expenses,
  };
}

export async function ensureMyPlayerState(): Promise<PlayerState> {
  const { data, error } = await supabase.rpc('ensure_my_player_state');
  if (error) throw error;
  return mapPlayerState(data as PlayerStateRow);
}

export function usePlayerState() {
  const [state, setState] = useState<PlayerState | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    ensureMyPlayerState()
      .then((s) => !cancelled && setState(s))
      .catch(() => !cancelled && setState(null));
    return () => {
      cancelled = true;
    };
  }, [reload]);
  return { state, refresh: () => setReload((n) => n + 1) };
}

export interface BusinessTier {
  tier: number;
  name: string;
  cashRequired: number;
  cxScoreRequired: number;
  displaySlots: number;
  milestoneCxBonus: number;
  description: string;
}

interface BusinessTierRow {
  tier: number;
  name: string;
  cash_required: number;
  cx_score_required: number;
  display_slots: number;
  milestone_cx_bonus: number;
  description: string;
}

function mapBusinessTier(row: BusinessTierRow): BusinessTier {
  return {
    tier: row.tier,
    name: row.name,
    cashRequired: row.cash_required,
    cxScoreRequired: row.cx_score_required,
    displaySlots: row.display_slots,
    milestoneCxBonus: row.milestone_cx_bonus,
    description: row.description,
  };
}

export async function fetchBusinessTiers(): Promise<BusinessTier[]> {
  const { data, error } = await supabase.from('game_business_tiers').select('*').order('tier', { ascending: true });
  if (error) throw error;
  return (data as BusinessTierRow[]).map(mapBusinessTier);
}

export function useBusinessTiers() {
  const [tiers, setTiers] = useState<BusinessTier[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchBusinessTiers()
      .then((t) => !cancelled && setTiers(t))
      .catch(() => !cancelled && setTiers([]));
    return () => {
      cancelled = true;
    };
  }, []);
  return tiers;
}

export async function upgradeBusiness(): Promise<{ state: PlayerState | null; error: string | null }> {
  const { data, error } = await supabase.rpc('upgrade_business');
  if (error) return { state: null, error: error.message };
  return { state: mapPlayerState(data as PlayerStateRow), error: null };
}

export interface VehicleStats {
  topSpeed: number;
  acceleration: number;
  handling: number;
  braking: number;
}

export interface MarketListing extends VehicleStats {
  listingId: string;
  templateId: string;
  name: string;
  brand: string;
  category: string;
  rarity: Rarity;
  price: number;
  marketValue: number;
  conditionPct: number;
  mileageKm: number;
  silhouette: string;
  expiresAt: string;
}

interface MarketListingRow {
  id: string;
  template_id: string;
  name: string;
  brand: string;
  category: string;
  rarity: Rarity;
  price: number;
  market_value: number;
  condition_pct: number;
  mileage_km: number;
  top_speed: number;
  acceleration: number;
  handling: number;
  braking: number;
  silhouette: string;
  expires_at: string;
}

function mapListing(row: MarketListingRow): MarketListing {
  return {
    listingId: row.id,
    templateId: row.template_id,
    name: row.name,
    brand: row.brand,
    category: row.category,
    rarity: row.rarity,
    price: row.price,
    marketValue: row.market_value,
    conditionPct: row.condition_pct,
    mileageKm: row.mileage_km,
    topSpeed: row.top_speed,
    acceleration: row.acceleration,
    handling: row.handling,
    braking: row.braking,
    silhouette: row.silhouette,
    expiresAt: row.expires_at,
  };
}

/** Refreshes AND lists in one round trip — expired listings are retired
 *  and the pool topped back up server-side before this returns, so the
 *  market never looks static/empty (see refresh_and_list_market()). */
export async function fetchMarket(): Promise<MarketListing[]> {
  const { data, error } = await supabase.rpc('refresh_and_list_market');
  if (error) throw error;
  return (data as MarketListingRow[]).map(mapListing);
}

export function useMarket() {
  const [listings, setListings] = useState<MarketListing[] | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchMarket()
      .then((l) => !cancelled && setListings(l))
      .catch(() => !cancelled && setListings([]));
    return () => {
      cancelled = true;
    };
  }, [reload]);
  return { listings, refresh: () => setReload((n) => n + 1) };
}

export async function buyMarketCar(listingId: string): Promise<{ inventoryId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('buy_market_car', { p_listing_id: listingId });
  if (error) return { inventoryId: null, error: error.message };
  return { inventoryId: data as string, error: null };
}

export interface InventoryCar extends VehicleStats {
  id: string;
  templateId: string;
  name: string;
  brand: string;
  category: string;
  rarity: Rarity;
  silhouette: string;
  purchasePrice: number;
  marketValue: number;
  conditionEngine: number;
  conditionBody: number;
  conditionInterior: number;
  mileageKm: number;
  customization: Record<string, string>;
  status: 'owned' | 'sold';
  acquiredAt: string;
  soldAt: string | null;
  salePrice: number | null;
}

interface InventoryRow {
  id: string;
  template_id: string;
  purchase_price: number;
  market_value: number;
  condition_engine: number;
  condition_body: number;
  condition_interior: number;
  mileage_km: number;
  customization: Record<string, string>;
  status: 'owned' | 'sold';
  acquired_at: string;
  sold_at: string | null;
  sale_price: number | null;
  template: {
    name: string;
    brand: string;
    category: string;
    rarity: Rarity;
    silhouette: string;
    top_speed: number;
    acceleration: number;
    handling: number;
    braking: number;
  } | null;
}

function mapInventory(row: InventoryRow): InventoryCar {
  return {
    id: row.id,
    templateId: row.template_id,
    name: row.template?.name ?? 'Unknown vehicle',
    brand: row.template?.brand ?? '',
    category: row.template?.category ?? '',
    rarity: row.template?.rarity ?? 'common',
    silhouette: row.template?.silhouette ?? 'sedan',
    topSpeed: row.template?.top_speed ?? 0,
    acceleration: row.template?.acceleration ?? 0,
    handling: row.template?.handling ?? 0,
    braking: row.template?.braking ?? 0,
    purchasePrice: row.purchase_price,
    marketValue: row.market_value,
    conditionEngine: row.condition_engine,
    conditionBody: row.condition_body,
    conditionInterior: row.condition_interior,
    mileageKm: row.mileage_km,
    customization: row.customization ?? {},
    status: row.status,
    acquiredAt: row.acquired_at,
    soldAt: row.sold_at,
    salePrice: row.sale_price,
  };
}

export async function fetchMyInventory(userId: string): Promise<InventoryCar[]> {
  const { data, error } = await supabase
    .from('game_inventory')
    .select('*, template:game_vehicle_templates(name, brand, category, rarity, silhouette, top_speed, acceleration, handling, braking)')
    .eq('user_id', userId)
    .order('acquired_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as InventoryRow[]).map(mapInventory);
}

export function useMyInventory(userId: string | undefined) {
  const [inventory, setInventory] = useState<InventoryCar[] | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!userId) {
      setInventory([]);
      return;
    }
    let cancelled = false;
    fetchMyInventory(userId)
      .then((i) => !cancelled && setInventory(i))
      .catch(() => !cancelled && setInventory([]));
    return () => {
      cancelled = true;
    };
  }, [userId, reload]);
  return { inventory, refresh: () => setReload((n) => n + 1) };
}

export async function repairCar(inventoryId: string, component: 'engine' | 'body' | 'interior') {
  const { error } = await supabase.rpc('repair_car', { p_inventory_id: inventoryId, p_component: component });
  return { error: error?.message ?? null };
}

export interface RepairCost {
  component: 'engine' | 'body' | 'interior';
  label: string;
  cost: number;
}

export async function fetchRepairCosts(): Promise<RepairCost[]> {
  const { data, error } = await supabase.from('game_repair_costs').select('*');
  if (error) throw error;
  return data as RepairCost[];
}

export function useRepairCosts() {
  const [costs, setCosts] = useState<RepairCost[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchRepairCosts()
      .then((c) => !cancelled && setCosts(c))
      .catch(() => !cancelled && setCosts([]));
    return () => {
      cancelled = true;
    };
  }, []);
  return costs;
}

export interface CustomizationOption {
  id: string;
  category: string;
  key: string;
  label: string;
  cost: number;
}

interface CustomizationOptionRow {
  id: string;
  category: string;
  key: string;
  label: string;
  cost: number;
}

export async function fetchCustomizationOptions(): Promise<CustomizationOption[]> {
  const { data, error } = await supabase.from('game_customization_options').select('*').order('category');
  if (error) throw error;
  return data as CustomizationOptionRow[];
}

export function useCustomizationOptions() {
  const [options, setOptions] = useState<CustomizationOption[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchCustomizationOptions()
      .then((o) => !cancelled && setOptions(o))
      .catch(() => !cancelled && setOptions([]));
    return () => {
      cancelled = true;
    };
  }, []);
  return options;
}

export async function customizeCar(inventoryId: string, optionId: string) {
  const { error } = await supabase.rpc('customize_car', { p_inventory_id: inventoryId, p_option_id: optionId });
  return { error: error?.message ?? null };
}

export async function estimateCarValue(inventoryId: string): Promise<number> {
  const { data, error } = await supabase.rpc('estimate_car_value', { p_inventory_id: inventoryId });
  if (error) throw error;
  return data as number;
}

export async function sellCar(inventoryId: string): Promise<{ price: number | null; error: string | null }> {
  const { data, error } = await supabase.rpc('sell_car', { p_inventory_id: inventoryId });
  if (error) return { price: null, error: error.message };
  return { price: data as number, error: null };
}

/** Display-only net worth estimate — cash plus a rough valuation of the
 *  owned collection, computed the same way `estimate_car_value()` does
 *  server-side (condition-weighted market value) but without a
 *  round-trip per car. Never used to move money; purely a dashboard
 *  number. */
export function estimateNetWorth(state: PlayerState | null, inventory: InventoryCar[] | null): number {
  if (!state) return 0;
  const ownedValue = (inventory ?? [])
    .filter((c) => c.status === 'owned')
    .reduce((sum, c) => sum + c.marketValue * ((c.conditionEngine + c.conditionBody + c.conditionInterior) / 300), 0);
  return Math.round(state.cash + ownedValue);
}
