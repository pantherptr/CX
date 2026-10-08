import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { fetchBookedRangesBulk, rangesOverlap } from './bookings';

/** CX Keychain + Roadbook (migration 0083): a verified trip turned into a card. */
export interface TripMemory {
  id: string;
  postId: string | null;
  visibility: 'public' | 'private';
  city: string;
  startDate: string;
  endDate: string;
  body: string;
  createdAt: string;
  car: { id: string; slug: string; make: string; model: string; year: number; image: string | null; pricePerDay: number };
}

interface KeychainRow {
  id: string; post_id: string | null; visibility: 'public' | 'private'; city: string; start_date: string; end_date: string;
  body: string; created_at: string; car_id: string; car_slug: string; car_make: string; car_model: string; car_year: number;
  car_image: string | null; car_price: number;
}

export async function fetchUserKeychain(userId: string): Promise<TripMemory[]> {
  const { data, error } = await supabase.rpc('fetch_user_keychain', { p_user_id: userId });
  if (error) return [];
  return ((data ?? []) as KeychainRow[]).map((r) => ({
    id: r.id, postId: r.post_id, visibility: r.visibility, city: r.city, startDate: r.start_date, endDate: r.end_date,
    body: r.body, createdAt: r.created_at,
    car: { id: r.car_id, slug: r.car_slug, make: r.car_make, model: r.car_model, year: r.car_year, image: r.car_image, pricePerDay: r.car_price },
  }));
}

export interface RoadbookEntry {
  id: string;
  postId: string | null;
  city: string;
  startDate: string;
  endDate: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  authorUsername: string | null;
}

interface RoadbookRow {
  id: string; post_id: string | null; city: string; start_date: string; end_date: string; body: string; created_at: string;
  author_id: string; author_name: string | null; author_avatar: string | null; author_username: string | null;
}

export async function fetchCarRoadbook(carId: string): Promise<RoadbookEntry[]> {
  const { data, error } = await supabase.rpc('fetch_car_roadbook', { p_car_id: carId });
  if (error) return [];
  return ((data ?? []) as RoadbookRow[]).map((r) => ({
    id: r.id, postId: r.post_id, city: r.city, startDate: r.start_date, endDate: r.end_date, body: r.body, createdAt: r.created_at,
    authorId: r.author_id, authorName: r.author_name ?? 'CX Rent user', authorAvatar: r.author_avatar, authorUsername: r.author_username,
  }));
}

export async function publishTripMemory(bookingId: string, body: string, visibility: 'public' | 'private'): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('publish_trip_memory', { p_booking_id: bookingId, p_body: body, p_visibility: visibility });
  return { error: error?.message ?? null };
}

export async function fetchMyTripMemoryFor(bookingId: string): Promise<{ id: string; visibility: 'public' | 'private' } | null> {
  const { data, error } = await supabase.rpc('my_trip_memory_for_booking', { p_booking_id: bookingId });
  if (error) return null;
  const row = (data as { id: string; visibility: 'public' | 'private' }[] | null)?.[0];
  return row ?? null;
}

// ---- verified-trip badge on posts: one shared request per feed render ----
export interface TripBadge { city: string; startDate: string; endDate: string }
let badgeQueue: { id: string; resolve: (b: TripBadge | null) => void }[] = [];
let badgeTimer: number | undefined;
const badgeCache = new Map<string, TripBadge | null>();

export function fetchTripBadge(postId: string): Promise<TripBadge | null> {
  if (badgeCache.has(postId)) return Promise.resolve(badgeCache.get(postId) ?? null);
  return new Promise((resolve) => {
    badgeQueue.push({ id: postId, resolve });
    window.clearTimeout(badgeTimer);
    badgeTimer = window.setTimeout(async () => {
      const batch = badgeQueue;
      badgeQueue = [];
      const ids = [...new Set(batch.map((b) => b.id))];
      const { data, error } = await supabase.rpc('fetch_trip_badges', { p_post_ids: ids });
      const found = new Map<string, TripBadge>();
      if (!error) {
        for (const r of (data ?? []) as { post_id: string; city: string; start_date: string; end_date: string }[]) {
          found.set(r.post_id, { city: r.city, startDate: r.start_date, endDate: r.end_date });
        }
      }
      for (const id of ids) badgeCache.set(id, found.get(id) ?? null);
      for (const b of batch) b.resolve(found.get(b.id) ?? null);
    }, 40);
  });
}

// ---- "On the Road" stories ----
export async function fetchMyActiveTrip(): Promise<{ bookingId: string; city: string } | null> {
  const { data, error } = await supabase.rpc('my_active_trip');
  if (error) return null;
  const row = (data as { booking_id: string; city: string }[] | null)?.[0];
  return row ? { bookingId: row.booking_id, city: row.city } : null;
}

export async function tagStoryOnTheRoad(storyId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('tag_story_on_the_road', { p_story_id: storyId });
  return { error: error?.message ?? null };
}

export async function fetchStoryTripLabels(storyIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (storyIds.length === 0) return map;
  const { data, error } = await supabase.rpc('fetch_story_trip_labels', { p_story_ids: storyIds });
  if (error) return map;
  for (const r of (data ?? []) as { story_id: string; city: string }[]) map.set(r.story_id, r.city);
  return map;
}

/** Whether a car can be booked in the next few days (no booking overlapping
 *  today..+3). `null` while checking. Only real, published cars count. */
export function useCarAvailableSoon(carId: string): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    const start = new Date();
    const end = new Date(start.getTime() + 3 * 86_400_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    fetchBookedRangesBulk([carId])
      .then((m) => { if (!cancelled) setAvailable(!rangesOverlap(iso(start), iso(end), m.get(carId) ?? [])); })
      .catch(() => { if (!cancelled) setAvailable(true); });
    return () => { cancelled = true; };
  }, [carId]);
  return available;
}

export function formatTripPeriod(startDate: string, endDate: string, locale?: string): string {
  const s = new Date(`${startDate}T00:00:00`);
  const e = new Date(`${endDate}T00:00:00`);
  const loc = locale === 'en' || !locale ? 'en-GB' : locale;
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const dm = (d: Date) => d.toLocaleDateString(loc, { day: 'numeric', month: 'short' });
  return sameMonth
    ? `${s.getDate()}–${e.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : `${dm(s)} – ${e.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
