import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { Rarity } from './empire';

/**
 * Car-flipping market data layer — see
 * supabase/migrations/0035_car_flipping_market.sql. Same security
 * contract as empire.ts: every write is a `security definer` RPC call,
 * this file only ever reads tables directly.
 */

export type Demand = 'low' | 'normal' | 'high' | 'hot' | 'iconic';

export const DEMAND_META: Record<Demand, { label: string; color: string }> = {
  low: { label: 'Low Demand', color: '#9aa3ad' },
  normal: { label: 'Normal Demand', color: '#4fb2ff' },
  high: { label: 'High Demand', color: '#3ecf8e' },
  hot: { label: 'Hot', color: '#ff9f40' },
  iconic: { label: 'Iconic', color: '#ff5fd1' },
};

export type BuyerType = 'collector' | 'enthusiast' | 'luxury_buyer' | 'deal_hunter' | 'investor';

export const BUYER_TYPE_LABELS: Record<BuyerType, string> = {
  collector: 'Collector',
  enthusiast: 'Enthusiast',
  luxury_buyer: 'Luxury Buyer',
  deal_hunter: 'Deal Hunter',
  investor: 'Investor',
};

export interface CarListing {
  id: string;
  inventoryId: string;
  askingPrice: number;
  suggestedPrice: number;
  demandTier: Demand;
  listedAt: string;
  resolvesAt: string;
  status: 'active' | 'sold' | 'cancelled' | 'expired';
  buyerName: string | null;
  buyerType: BuyerType | null;
  salePrice: number | null;
  resolvedAt: string | null;
  pendingOfferPrice: number | null;
  pendingOfferExpiresAt: string | null;
  // Joined display fields.
  name: string;
  brand: string;
  rarity: Rarity;
  customization: Record<string, string>;
  customName: string | null;
  purchasePrice: number;
}

interface CarListingRow {
  id: string;
  inventory_id: string;
  asking_price: number;
  suggested_price: number;
  demand_tier: Demand;
  listed_at: string;
  resolves_at: string;
  status: CarListing['status'];
  buyer_name: string | null;
  buyer_type: BuyerType | null;
  sale_price: number | null;
  resolved_at: string | null;
  pending_offer_price: number | null;
  pending_offer_expires_at: string | null;
  inventory: {
    purchase_price: number;
    customization: Record<string, string>;
    custom_name: string | null;
    template: { name: string; brand: string; rarity: Rarity } | null;
  } | null;
}

const LISTING_SELECT = `
  id, inventory_id, asking_price, suggested_price, demand_tier, listed_at, resolves_at, status,
  buyer_name, buyer_type, sale_price, resolved_at, pending_offer_price, pending_offer_expires_at,
  inventory:game_inventory (
    purchase_price, customization, custom_name,
    template:game_vehicle_templates (name, brand, rarity)
  )
`;

function mapListing(row: CarListingRow): CarListing {
  return {
    id: row.id,
    inventoryId: row.inventory_id,
    askingPrice: row.asking_price,
    suggestedPrice: row.suggested_price,
    demandTier: row.demand_tier,
    listedAt: row.listed_at,
    resolvesAt: row.resolves_at,
    status: row.status,
    buyerName: row.buyer_name,
    buyerType: row.buyer_type,
    salePrice: row.sale_price,
    resolvedAt: row.resolved_at,
    pendingOfferPrice: row.pending_offer_price,
    pendingOfferExpiresAt: row.pending_offer_expires_at,
    name: row.inventory?.template?.name ?? 'Unknown vehicle',
    brand: row.inventory?.template?.brand ?? '',
    rarity: row.inventory?.template?.rarity ?? 'common',
    customization: row.inventory?.customization ?? {},
    customName: row.inventory?.custom_name ?? null,
    purchasePrice: row.inventory?.purchase_price ?? 0,
  };
}

export async function fetchMyListings(userId: string): Promise<CarListing[]> {
  const { data, error } = await supabase
    .from('game_car_listings')
    .select(LISTING_SELECT)
    .eq('user_id', userId)
    .order('listed_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as CarListingRow[]).map(mapListing);
}

export function useMyListings(userId: string | undefined) {
  const [listings, setListings] = useState<CarListing[] | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!userId) {
      setListings([]);
      return;
    }
    let cancelled = false;
    fetchMyListings(userId)
      .then((l) => !cancelled && setListings(l))
      .catch(() => !cancelled && setListings([]));
    return () => {
      cancelled = true;
    };
  }, [userId, reload]);
  return { listings, refresh: () => setReload((n) => n + 1) };
}

export async function listCarForSale(inventoryId: string, askingPrice: number): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('list_car_for_sale', { p_inventory_id: inventoryId, p_asking_price: askingPrice });
  return { error: error?.message ?? null };
}

/** The lazy-resolution entry point — resolves anything past its due
 *  time server-side and returns every listing this player has, newest
 *  first within each status. Call on Sales-tab mount and on a light
 *  poll while it's open; diff the result against the previous call to
 *  detect a listing that just flipped to 'sold' for the SOLD moment. */
export async function syncListings(): Promise<CarListing[]> {
  const { data, error } = await supabase.rpc('resolve_due_listings');
  if (error) throw error;
  return (data as unknown as CarListingRow[]).map(mapListing);
}

export async function cancelListing(listingId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('cancel_listing', { p_listing_id: listingId });
  return { error: error?.message ?? null };
}

export async function acceptOffer(listingId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('accept_offer', { p_listing_id: listingId });
  return { error: error?.message ?? null };
}

export async function rejectOffer(listingId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('reject_offer', { p_listing_id: listingId });
  return { error: error?.message ?? null };
}

export async function renameCar(inventoryId: string, newName: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('rename_car', { p_inventory_id: inventoryId, p_new_name: newName });
  return { error: error?.message ?? null };
}

/** Display-only mirror of rename_car()'s server-side fee formula — used
 *  to show the fee before the player confirms. The RPC recomputes and
 *  charges the real amount; this never moves money itself. */
export function estimateRenameFee(rarity: Rarity, renameCount: number): number {
  const base = renameCount === 0 ? 1000 : 2500;
  const multiplier = rarity === 'legendary' || rarity === 'mythic' ? 2.0 : rarity === 'rare' || rarity === 'epic' ? 1.5 : 1.0;
  return Math.round(base * multiplier);
}

export interface SaleOutlook {
  label: 'Below Market' | 'Competitive' | 'Premium' | 'Overpriced';
  hint: string;
}

/** Display-only mirror of the server's price-sensitivity logic — a
 *  rough guide for the asking-price input, not a guarantee. */
export function estimateSaleOutlook(askingPrice: number, suggestedPrice: number): SaleOutlook {
  const ratio = suggestedPrice > 0 ? askingPrice / suggestedPrice : 1;
  if (ratio > 1.15) return { label: 'Overpriced', hint: 'Fewer buyers will bite — expect a longer wait, or no sale at all.' };
  if (ratio > 1.02) return { label: 'Premium', hint: 'Above market — still sellable, but it will take patience.' };
  if (ratio < 0.9) return { label: 'Below Market', hint: 'A quick, easy sale — but you are leaving money on the table.' };
  return { label: 'Competitive', hint: 'Priced to sell at a fair value.' };
}

export interface HotCar {
  templateId: string;
  name: string;
  demandTier: Demand;
  demandPct: number;
}

interface DemandRow {
  template_id: string;
  demand_tier: Demand;
  demand_pct: number;
  template: { name: string } | null;
}

export async function fetchTodaysHotCars(): Promise<HotCar[]> {
  // Ensures rows exist for a brand-new player who opens the Sales tab
  // before any listing/resolution RPC has ever run.
  await supabase.rpc('ensure_vehicle_demand');
  const { data, error } = await supabase
    .from('game_vehicle_demand')
    .select('template_id, demand_tier, demand_pct, template:game_vehicle_templates(name)')
    .order('demand_pct', { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data as unknown as DemandRow[]).map((r) => ({
    templateId: r.template_id,
    name: r.template?.name ?? 'Unknown vehicle',
    demandTier: r.demand_tier,
    demandPct: r.demand_pct,
  }));
}
