import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

/**
 * Signal Spotlight — CX's editorial selection of a Vision (0087). An entry is
 * only metadata plus a reference to its source Vision; media and creator are
 * always read from that Vision. Reads fail soft until the migration has run.
 */

const VISIONS_BUCKET = 'signal-visions';
const urlFor = (path: string) => supabase.storage.from(VISIONS_BUCKET).getPublicUrl(path).data.publicUrl;

export interface SpotlightCardData {
  entryId: string;
  visionId: string;
  publishedAt: string;
  publisherLabel: string;
  publisherAvatar: string | null;
  curatedBy: string | null;
  city: string | null;
  title: string | null;
  mediaUrl: string;
  mediaKind: 'image' | 'video';
  creatorId: string;
  creatorUsername: string | null;
  carLabel: string | null;
}

interface FeedRow {
  entry_id: string; vision_id: string; published_at: string;
  publisher_label: string | null; publisher_avatar: string | null; curated_by: string | null; city: string | null; editorial_title: string | null;
  media_path: string; media_kind: 'image' | 'video';
  creator_id: string; creator_username: string | null; car_label: string | null;
}

export async function fetchSpotlightFeed(limit = 6): Promise<SpotlightCardData[]> {
  const { data, error } = await supabase.rpc('fetch_spotlight_feed', { p_limit: limit });
  if (error || !data) return [];
  return (data as FeedRow[]).map((r) => ({
    entryId: r.entry_id, visionId: r.vision_id, publishedAt: r.published_at,
    publisherLabel: r.publisher_label ?? 'CX Team', publisherAvatar: r.publisher_avatar,
    curatedBy: r.curated_by, city: r.city, title: r.editorial_title,
    mediaUrl: urlFor(r.media_path), mediaKind: r.media_kind,
    creatorId: r.creator_id, creatorUsername: r.creator_username, carLabel: r.car_label,
  }));
}

// ---- Admin ----

export interface SpotlightCandidate {
  visionId: string;
  mediaUrl: string;
  mediaKind: 'image' | 'video';
  title: string | null;
  caption: string | null;
  createdAt: string;
  creatorId: string;
  creatorName: string;
  creatorUsername: string | null;
  city: string | null;
  carLabel: string | null;
  entryId: string | null;
  /** 'candidate' = nothing decided yet. */
  status: 'candidate' | 'draft' | 'published' | 'archived';
  entryTitle: string | null;
  entryPublisher: string | null;
}

interface QueueRow {
  vision_id: string; media_path: string; media_kind: 'image' | 'video'; title: string | null; caption: string | null; vision_created_at: string;
  creator_id: string; creator_name: string | null; creator_username: string | null;
  city: string | null; car_label: string | null;
  entry_id: string | null; entry_status: string | null; entry_title: string | null; entry_publisher: string | null;
}

export async function fetchSpotlightQueue(): Promise<{ items: SpotlightCandidate[]; error: string | null }> {
  const { data, error } = await supabase.rpc('fetch_spotlight_queue');
  if (error) return { items: [], error: error.message };
  return {
    error: null,
    items: (data as QueueRow[]).map((r) => ({
      visionId: r.vision_id, mediaUrl: urlFor(r.media_path), mediaKind: r.media_kind, title: r.title, caption: r.caption,
      createdAt: r.vision_created_at, creatorId: r.creator_id, creatorName: r.creator_name ?? 'CX user', creatorUsername: r.creator_username,
      city: r.city, carLabel: r.car_label, entryId: r.entry_id,
      status: (r.entry_status ?? 'candidate') as SpotlightCandidate['status'],
      entryTitle: r.entry_title, entryPublisher: r.entry_publisher,
    })),
  };
}

export interface SpotlightPublisher { id: string; label: string }

export async function fetchSpotlightPublishers(): Promise<SpotlightPublisher[]> {
  const { data, error } = await supabase.rpc('fetch_spotlight_publishers');
  if (error || !data) return [];
  return data as SpotlightPublisher[];
}

export async function publishSpotlight(input: {
  visionId: string; publisherId: string; curatedBy: string; city: string; title: string;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('publish_spotlight', {
    p_vision_id: input.visionId, p_publisher_id: input.publisherId,
    p_curated_by: input.curatedBy, p_city: input.city, p_title: input.title,
  });
  return { error: error ? error.message : null };
}

/** `archived` takes it off the feed but keeps it; `removed` drops it (and a
 *  candidate) from the queue. The Vision itself is never touched. */
export async function setSpotlightStatus(visionId: string, status: 'archived' | 'removed'): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_spotlight_status', { p_vision_id: visionId, p_status: status });
  return { error: error ? error.message : null };
}

/** The live Spotlights for the Signal feed — one quiet fetch on mount. */
export function useSpotlightFeed(): SpotlightCardData[] {
  const [items, setItems] = useState<SpotlightCardData[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchSpotlightFeed(6).then((rows) => { if (!cancelled) setItems(rows); });
    return () => { cancelled = true; };
  }, []);
  return items;
}

/** Slots Spotlights into an already-ordered post list by date — each one goes
 *  before the first post older than it, so the posts' own order is never
 *  touched. A Spotlight older than everything loaded so far waits until the
 *  feed has no more pages (otherwise it would jump ahead of posts still to load). */
export function mergeSpotlights<P extends { createdAt: string }>(
  posts: P[], spotlights: SpotlightCardData[], hasMore: boolean,
): ({ kind: 'post'; post: P } | { kind: 'spotlight'; spotlight: SpotlightCardData })[] {
  const out: ({ kind: 'post'; post: P } | { kind: 'spotlight'; spotlight: SpotlightCardData })[] = [];
  const pending = [...spotlights].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  for (const post of posts) {
    while (pending.length > 0 && pending[0].publishedAt >= post.createdAt) {
      out.push({ kind: 'spotlight', spotlight: pending.shift()! });
    }
    out.push({ kind: 'post', post });
  }
  if (!hasMore) for (const s of pending) out.push({ kind: 'spotlight', spotlight: s });
  return out;
}
