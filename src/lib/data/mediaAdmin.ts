import { supabase } from '../supabase';
import { mediaKindFromPath } from './empireFeed';

/** Owner / Admin overview of uploads (migration 0136) and the newest posts that carry media. */
export interface MediaOverview {
  buckets: { bucket: string; files: number; bytes: number }[];
  last24h: { files: number; bytes: number };
  /** since the 1st of the month; null until migration 0137 has run */
  month: { files: number; bytes: number } | null;
  activeUsers30d: number | null;
  members: number | null;
  topUploaders: { userId: string; name: string; files: number; bytes: number }[];
}

export async function fetchMediaOverview(): Promise<{ data: MediaOverview | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_media_overview');
  if (error || !data) return { data: null, error: error?.message ?? 'No data' };
  const d = data as {
    buckets?: { bucket: string; files: number; bytes: number }[];
    last24h?: { files: number; bytes: number };
    month?: { files: number; bytes: number };
    active_30d?: number;
    members?: number;
    top_uploaders?: { user_id: string; name: string; files: number; bytes: number }[];
  };
  return {
    data: {
      buckets: d.buckets ?? [],
      last24h: d.last24h ?? { files: 0, bytes: 0 },
      month: d.month ?? null,
      activeUsers30d: typeof d.active_30d === 'number' ? d.active_30d : null,
      members: typeof d.members === 'number' ? d.members : null,
      topUploaders: (d.top_uploaders ?? []).map((u) => ({ userId: u.user_id, name: u.name, files: u.files, bytes: u.bytes })),
    },
    error: null,
  };
}

export interface MediaPost {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
  items: { url: string; kind: 'image' | 'video' }[];
}

const BUCKET = 'empire-post-media';

/** Newest posts with at least one photo or video — the moderation queue. */
export async function fetchRecentMediaPosts(limit = 30, before?: string): Promise<{ data: MediaPost[]; error: string | null }> {
  let q = supabase
    .from('empire_posts')
    .select('id, author_id, title, body, media_paths, created_at')
    .not('media_paths', 'eq', '{}')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  const rows = data ?? [];
  const ids = Array.from(new Set(rows.map((r) => r.author_id as string)));
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: ps } = await supabase.from('profiles').select('id, full_name').in('id', ids);
    for (const p of ps ?? []) names.set(p.id as string, (p.full_name as string | null) ?? 'Member');
  }
  return {
    data: rows.map((r) => ({
      id: r.id as string,
      authorId: r.author_id as string,
      authorName: names.get(r.author_id as string) ?? 'Member',
      text: ((r.title as string | null) || (r.body as string) || '').slice(0, 160),
      createdAt: r.created_at as string,
      items: ((r.media_paths as string[]) ?? []).map((path) => ({
        url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
        kind: mediaKindFromPath(path) === 'video' ? ('video' as const) : ('image' as const),
      })),
    })),
    error: null,
  };
}
