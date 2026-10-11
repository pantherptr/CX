import { supabase } from '../supabase';
import { apiUrl } from '../api';

export interface ReviewItem {
  carId: string;
  slug: string;
  make: string;
  model: string;
  trim: string | null;
  year: number;
  city: string;
  hostId: string;
  hostName: string;
  hostAvatar: string | null;
  submittedAt: string;
  publishAt: string;
  claimedAt: string | null;
  claimedBy: string | null;
  claimedByName: string | null;
  photos: string[];
}

export const SEND_BACK_REASONS = [
  'The cover photo is not a side profile of the whole car',
  'The cover photo is blurry or too dark',
  'The car is cut off or too far away',
  'Please add clearer photos of the car',
  'The details do not match the photos',
  'The photos are not of the car itself',
] as const;

interface Row {
  car_id: string; slug: string; make: string; model: string; car_trim: string | null; year: number; city: string;
  host_id: string; host_name: string | null; host_avatar: string | null;
  submitted_at: string; publish_at: string; claimed_at: string | null;
  claimed_by: string | null; claimed_by_name: string | null; photos: string[] | null;
}

/** Team only (the function returns nothing to anyone else). Needs migration 0108. */
export async function fetchReviewQueue(): Promise<{ data: ReviewItem[]; error: string | null }> {
  const { data, error } = await supabase.rpc('review_queue');
  if (error) return { data: [], error: error.message };
  return {
    error: null,
    data: ((data ?? []) as Row[]).map((r) => ({
      carId: r.car_id, slug: r.slug, make: r.make, model: r.model, trim: r.car_trim, year: r.year, city: r.city,
      hostId: r.host_id, hostName: r.host_name || 'Host', hostAvatar: r.host_avatar,
      submittedAt: r.submitted_at, publishAt: r.publish_at, claimedAt: r.claimed_at,
      claimedBy: r.claimed_by, claimedByName: r.claimed_by_name, photos: r.photos ?? [],
    })),
  };
}

export async function claimListing(carId: string): Promise<void> {
  await supabase.rpc('claim_listing', { p_car_id: carId });
}

export async function decideListing(carId: string, decision: 'approved' | 'rejected', reason?: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_listing', { p_car_id: carId, p_decision: decision, p_reason: reason ?? null });
  if (!error) void pushListingDecision(carId, decision, reason);
  return { error: error ? error.message : null };
}

/** Push to the host (inbox row + chat message are written by the database function). */
async function pushListingDecision(carId: string, decision: 'approved' | 'rejected', reason?: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(apiUrl('/api/notify-message'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ type: 'listing_decision', carId, decision, reason }),
    });
  } catch {
    /* the inbox row and the chat message already exist */
  }
}

export async function withdrawListing(carId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('withdraw_listing', { p_car_id: carId });
  return { error: error ? error.message : null };
}

/** Tells the team a listing is waiting (push). Fire and forget. */
export async function notifyTeamOfListing(carId: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(apiUrl('/api/notify-message'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ type: 'listing_submitted', carId }),
    });
  } catch {
    /* the 5-minute rule still applies */
  }
}
