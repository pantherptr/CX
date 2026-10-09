import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { apiUrl } from '../api';
import { fetchEmpirePostById, type EmpirePost } from './empireFeed';

/**
 * Sponsored posts (0100). A sponsored post is a normal post that its author pays to show
 * in the Community feed now and then, marked "Sponsored". Pay first, an Owner/Admin
 * approves afterwards; a rejected one is refunded in full.
 */

export const MIN_DAILY_CENTS = 199;
export const MAX_DAILY_CENTS = 9999;
export const AD_DAY_OPTIONS = [1, 3, 7, 14, 30];

/** Euro amount from cents, always with cents (1.99 must not turn into 2). */
export const money = (cents: number) => `€${(cents / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type AdStatus = 'pending_review' | 'active' | 'ended' | 'rejected' | 'canceled';

// ---- starting a payment ----

export interface AdCheckout { clientSecret: string; adId: string; amount: number; currency: string }

export async function createAdPayment(input: { postId: string; dailyCents: number; days: number }, accessToken: string): Promise<AdCheckout> {
  const res = await fetch(apiUrl('/api/create-ad-payment'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? 'Could not start the payment. Please try again.');
  return body as AdCheckout;
}

/** approve / reject (Owner, Admin) or cancel (the advertiser, before review). */
export async function reviewAd(adId: string, action: 'approve' | 'reject' | 'cancel', accessToken: string, reason?: string): Promise<{ error: string | null }> {
  const res = await fetch(apiUrl('/api/review-ad'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ adId, action, reason }),
  });
  const body = await res.json().catch(() => null);
  return { error: res.ok ? null : (body?.error ?? 'Something went wrong.') };
}

// ---- the advertiser's list ----

export interface MyAd {
  adId: string; postId: string; postText: string; status: AdStatus;
  dailyCents: number; days: number; totalCents: number; impressions: number;
  createdAt: string; startsAt: string | null; endsAt: string | null; rejectReason: string | null;
}

interface MyAdRow {
  ad_id: string; post_id: string; post_text: string | null; status: AdStatus; daily_cents: number; days: number; total_cents: number;
  impressions: number; created_at: string; starts_at: string | null; ends_at: string | null; reject_reason: string | null;
}

export async function fetchMyAds(): Promise<MyAd[]> {
  const { data, error } = await supabase.rpc('fetch_my_ads');
  if (error || !data) return [];
  return (data as MyAdRow[]).map((r) => ({
    adId: r.ad_id, postId: r.post_id, postText: r.post_text ?? '', status: r.status, dailyCents: r.daily_cents, days: r.days,
    totalCents: r.total_cents, impressions: r.impressions, createdAt: r.created_at, startsAt: r.starts_at, endsAt: r.ends_at, rejectReason: r.reject_reason,
  }));
}

// ---- Owner / Admin queue ----

export interface QueuedAd extends MyAd {
  mediaUrl: string | null; advertiserId: string; advertiserName: string; advertiserUsername: string | null; paidAt: string | null;
}

interface QueueRow extends MyAdRow {
  media_path: string | null; advertiser_id: string; advertiser_name: string | null; advertiser_username: string | null; paid_at: string | null;
}

export async function fetchAdsQueue(): Promise<{ items: QueuedAd[]; error: string | null }> {
  const { data, error } = await supabase.rpc('fetch_ads_queue');
  if (error) return { items: [], error: error.message };
  return {
    error: null,
    items: (data as QueueRow[]).map((r) => ({
      adId: r.ad_id, postId: r.post_id, postText: r.post_text ?? '', status: r.status, dailyCents: r.daily_cents, days: r.days,
      totalCents: r.total_cents, impressions: r.impressions, createdAt: r.created_at, startsAt: r.starts_at, endsAt: r.ends_at, rejectReason: r.reject_reason,
      mediaUrl: r.media_path ? supabase.storage.from('empire-post-media').getPublicUrl(r.media_path).data.publicUrl : null,
      advertiserId: r.advertiser_id, advertiserName: r.advertiser_name ?? 'CX user', advertiserUsername: r.advertiser_username, paidAt: r.paid_at,
    })),
  };
}

// ---- the feed ----

export interface ActiveAd { adId: string; dailyCents: number; post: EmpirePost }

/** A few live ads for the Community feed, each with its post. Loaded once per visit. */
export function useActiveAds(enabled: boolean) {
  const [ads, setAds] = useState<ActiveAd[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('fetch_active_ads', { p_limit: 3 });
      if (error || !Array.isArray(data)) return;
      const rows = data as { ad_id: string; post_id: string; daily_cents: number }[];
      const posts = await Promise.all(rows.map((r) => fetchEmpirePostById(r.post_id).catch(() => null)));
      if (cancelled) return;
      setAds(rows.flatMap((r, i) => (posts[i] ? [{ adId: r.ad_id, dailyCents: r.daily_cents, post: posts[i]! }] : [])));
    })();
    return () => { cancelled = true; };
  }, [enabled]);
  const patch = (adId: string, post: EmpirePost) => setAds((prev) => prev.map((a) => (a.adId === adId ? { ...a, post } : a)));
  const remove = (adId: string) => setAds((prev) => prev.filter((a) => a.adId !== adId));
  return { ads, patch, remove };
}

export function recordAdImpression(adId: string): void {
  void supabase.rpc('record_ad_impression', { p_ad_id: adId });
}

// One random seed per page load, like Spotlight: ads land in different places each visit and never move while scrolling.
const SEED = Math.floor(Math.random() * 0x7fffffff);
function hash(id: string, salt: number): number {
  let h = (SEED ^ salt) >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** Slips sponsored posts into an already-built feed list, rarely: the first after 8–13 items,
 *  then 12–19 between each. Items keep their own order. */
export function scatterAds<I>(items: I[], ads: ActiveAd[], hasMore: boolean): (I | { kind: 'ad'; ad: ActiveAd })[] {
  let at = 8 + (hash('first', 3) % 6);
  const slots = ads.map((ad) => { const s = { at, ad }; at += 12 + (hash(ad.adId, 5) % 8); return s; });
  const out: (I | { kind: 'ad'; ad: ActiveAd })[] = [];
  let next = 0;
  items.forEach((item, i) => {
    while (next < slots.length && slots[next].at <= i) out.push({ kind: 'ad', ad: slots[next++].ad });
    out.push(item);
  });
  if (!hasMore) while (next < slots.length && slots[next].at <= items.length + 4) out.push({ kind: 'ad', ad: slots[next++].ad });
  return out;
}
