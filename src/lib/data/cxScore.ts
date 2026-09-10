import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

/**
 * CX Score — data-access layer for the loyalty system that replaced the
 * CX Drive Challenge score/reward pair (see rewards.ts, still used for
 * legacy unclaimed coupons). As with that file: the client never writes
 * a score or a discount directly. Every point comes from
 * `public.award_cx_score`, reachable only from inside other
 * `security definer` functions (`claim_rental_cx_score`, and the Empire
 * game's purchase/sale/upgrade RPCs in empire.ts) that have already
 * verified a real event server-side. This layer only ever reads.
 */

export interface CxScoreLevel {
  levelKey: string;
  sortOrder: number;
  minScore: number;
  maxScore: number | null;
  label: string;
  benefitPercentage: number;
  maxDiscountEur: number;
}

interface CxScoreLevelRow {
  level_key: string;
  sort_order: number;
  min_score: number;
  max_score: number | null;
  label: string;
  benefit_percentage: number;
  max_discount_eur: number;
}

function mapLevel(row: CxScoreLevelRow): CxScoreLevel {
  return {
    levelKey: row.level_key,
    sortOrder: row.sort_order,
    minScore: row.min_score,
    maxScore: row.max_score,
    label: row.label,
    benefitPercentage: row.benefit_percentage,
    maxDiscountEur: row.max_discount_eur,
  };
}

export async function fetchCxScoreLevels(): Promise<CxScoreLevel[]> {
  const { data, error } = await supabase
    .from('cx_score_levels')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as CxScoreLevelRow[]).map(mapLevel);
}

export function useCxScoreLevels() {
  const [levels, setLevels] = useState<CxScoreLevel[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchCxScoreLevels()
      .then((l) => !cancelled && setLevels(l))
      .catch(() => !cancelled && setLevels([]));
    return () => {
      cancelled = true;
    };
  }, []);
  return levels;
}

/** Display-only mirror of the `cx_current_level()` SQL function — the
 *  real level (and the discount it grants) is always re-derived
 *  server-side at booking/quote time, never trusted from here. */
export function levelForScore(score: number, levels: CxScoreLevel[]): CxScoreLevel | null {
  const matching = levels.filter((l) => score >= l.minScore && (l.maxScore === null || score <= l.maxScore));
  if (matching.length === 0) return null;
  return matching.reduce((best, l) => (l.minScore > best.minScore ? l : best));
}

export function nextLevel(current: CxScoreLevel | null, levels: CxScoreLevel[]): CxScoreLevel | null {
  if (!current) return levels[0] ?? null;
  return levels.find((l) => l.sortOrder === current.sortOrder + 1) ?? null;
}

export async function fetchMyCxScore(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('cx_scores')
    .select('score')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as { score: number } | null)?.score ?? 0;
}

export function useCxScore(userId: string | undefined) {
  const [score, setScore] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!userId) {
      setScore(0);
      return;
    }
    let cancelled = false;
    fetchMyCxScore(userId)
      .then((s) => !cancelled && setScore(s))
      .catch(() => !cancelled && setScore(0));
    return () => {
      cancelled = true;
    };
  }, [userId, reload]);
  return { score, refresh: () => setReload((n) => n + 1) };
}

export interface CxScoreEvent {
  id: string;
  eventType: string;
  points: number;
  createdAt: string;
}

interface CxScoreEventRow {
  id: string;
  event_type: string;
  points: number;
  created_at: string;
}

/** Friendly labels for the event types this app actually awards —
 *  falls back to a title-cased version of the raw key for forward
 *  compatibility with any new event type. */
const EVENT_LABELS: Record<string, string> = {
  rental_completed: 'Completed rental',
  rental_length_bonus: 'Extended rental bonus',
  premium_vehicle_rental: 'Premium vehicle rental',
  profitable_sale: 'Profitable car sale',
  showroom_milestone: 'Business milestone reached',
  district_rental_completed: 'District rental completed',
  district_rental_length_bonus: 'Extended rental bonus',
  customer_request_fulfilled: 'Customer request fulfilled',
  mission_reward_claimed: 'Mission reward claimed',
  achievement_unlocked: 'Achievement unlocked',
  corporate_contract_completed: 'Corporate contract completed',
};

export function cxScoreEventLabel(eventType: string): string {
  if (EVENT_LABELS[eventType]) return EVENT_LABELS[eventType];
  if (eventType.startsWith('vehicle_acquired_')) {
    const rarity = eventType.replace('vehicle_acquired_', '');
    return `${rarity.charAt(0).toUpperCase()}${rarity.slice(1)} vehicle acquired`;
  }
  return eventType.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export async function fetchCxScoreHistory(userId: string, limit = 30): Promise<CxScoreEvent[]> {
  const { data, error } = await supabase
    .from('cx_score_events')
    .select('id, event_type, points, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as CxScoreEventRow[]).map((r) => ({
    id: r.id,
    eventType: r.event_type,
    points: r.points,
    createdAt: r.created_at,
  }));
}

export function useCxScoreHistory(userId: string | undefined) {
  const [history, setHistory] = useState<CxScoreEvent[] | null>(null);
  useEffect(() => {
    if (!userId) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    fetchCxScoreHistory(userId)
      .then((h) => !cancelled && setHistory(h))
      .catch(() => !cancelled && setHistory([]));
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return history;
}

/** Booking ids the signed-in renter can claim CX Score for — a trip that
 *  has genuinely ended and hasn't already paid out. The actual award
 *  still happens server-side in `claim_rental_cx_score`; this is only
 *  used to know when to surface the claim. */
export async function fetchUnclaimedRentalBookingIds(): Promise<string[]> {
  const { data, error } = await supabase.rpc('my_unclaimed_rental_bookings');
  if (error) throw error;
  return (data as { booking_id: string }[]).map((r) => r.booking_id);
}

export async function claimRentalCxScore(bookingId: string): Promise<{ pointsAwarded: number; error: string | null }> {
  const { data, error } = await supabase.rpc('claim_rental_cx_score', { p_booking_id: bookingId });
  if (error) return { pointsAwarded: 0, error: error.message };
  return { pointsAwarded: data as number, error: null };
}
