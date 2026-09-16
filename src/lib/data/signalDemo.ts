import { supabase } from '../supabase';
import { unsplash } from '../img';
import type { EmpirePost } from './empireFeed';

/**
 * SIGNAL Community's demo content engine — a fully separate layer (see
 * 0062_signal_demo_content_engine.sql for the full rationale) so
 * Community never looks empty in dev/testing/early launch without ever
 * touching the real identity or feed system. Demo profiles have no
 * `auth.users` row at all; demo posts live in their own table, never
 * `empire_posts`. Mapped into the exact same `EmpirePost` shape the real
 * feed uses (with `isDemo: true`) so `SignalPostCard` renders both
 * identically — the one place that shape diverges is routing
 * Respect/Save to the demo-specific RPCs below instead of the real ones.
 */

const DEMO_PAGE_SIZE = 20;

interface DemoPostRow {
  id: string;
  demo_author_id: string;
  author_name: string;
  author_avatar_url: string;
  author_username: string;
  author_role: 'host' | 'verified_client';
  theme: string;
  title: string | null;
  body: string;
  media_photo_id: string | null;
  created_at: string;
  like_count: number;
  save_count: number;
  liked_by_me: boolean;
  saved_by_me: boolean;
}

function mapDemoPost(row: DemoPostRow): EmpirePost {
  return {
    id: row.id,
    authorId: row.demo_author_id,
    authorName: row.author_name,
    authorAvatarUrl: row.author_avatar_url,
    authorUsername: row.author_username,
    authorRole: row.author_role === 'host' ? 'host' : 'client',
    authorIsOwner: false,
    authorIsAdmin: false,
    authorIsHost: row.author_role === 'host',
    authorIsVerifiedClient: row.author_role === 'verified_client',
    category: 'community',
    title: row.title,
    body: row.body,
    mediaPaths: [],
    mediaUrls: row.media_photo_id ? [unsplash(row.media_photo_id, 1200)] : [],
    isPinned: false,
    isFeatured: false,
    pinnedToProfile: false,
    isArchived: false,
    commentsDisabled: true,
    createdAt: row.created_at,
    updatedAt: row.created_at,
    editedAt: null,
    likeCount: row.like_count,
    commentCount: 0,
    saveCount: row.save_count,
    viewCount: 0,
    shareCount: 0,
    likedByMe: row.liked_by_me,
    savedByMe: row.saved_by_me,
    publisherType: 'self',
    vehicle: null,
    isDemo: true,
  };
}

export async function fetchSignalDemoPosts(limit = DEMO_PAGE_SIZE, before?: string, beforeId?: string): Promise<EmpirePost[]> {
  const { data, error } = await supabase.rpc('fetch_signal_demo_posts', {
    p_limit: limit, p_before: before ?? null, p_before_id: beforeId ?? null,
  });
  if (error) throw error;
  return (data as DemoPostRow[]).map(mapDemoPost);
}

export async function fetchSignalDemoPostById(postId: string): Promise<EmpirePost | null> {
  const { data, error } = await supabase.rpc('fetch_signal_demo_post_by_id', { p_post_id: postId });
  if (error) throw error;
  const rows = data as DemoPostRow[];
  return rows.length > 0 ? mapDemoPost(rows[0]) : null;
}

export interface SignalDemoProfile {
  id: string;
  fullName: string;
  username: string;
  avatarUrl: string;
  bio: string | null;
  role: 'host' | 'verified_client';
  postCount: number;
}

export async function fetchSignalDemoProfile(demoId: string): Promise<SignalDemoProfile | null> {
  const { data, error } = await supabase.rpc('fetch_signal_demo_profile', { p_demo_id: demoId });
  if (error) throw error;
  const rows = data as { id: string; full_name: string; username: string; avatar_url: string; bio: string | null; role: 'host' | 'verified_client'; post_count: number }[];
  if (rows.length === 0) return null;
  const r = rows[0];
  return { id: r.id, fullName: r.full_name, username: r.username, avatarUrl: r.avatar_url, bio: r.bio, role: r.role, postCount: r.post_count };
}

export async function fetchSignalDemoPostsByAuthor(demoAuthorId: string, limit = DEMO_PAGE_SIZE): Promise<EmpirePost[]> {
  const { data, error } = await supabase.rpc('fetch_signal_demo_posts_by_author', { p_demo_author_id: demoAuthorId, p_limit: limit });
  if (error) throw error;
  return (data as DemoPostRow[]).map(mapDemoPost);
}

export async function toggleSignalDemoPostLike(postId: string): Promise<{ liked: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('toggle_signal_demo_post_like', { p_post_id: postId });
  if (error) return { liked: false, error: error.message };
  return { liked: Boolean(data), error: null };
}

export async function toggleSignalDemoPostSave(postId: string): Promise<{ saved: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('toggle_signal_demo_post_save', { p_post_id: postId });
  if (error) return { saved: false, error: error.message };
  return { saved: Boolean(data), error: null };
}

/** Lazy generation trigger — cheap, self-throttling, safe to call on
 *  every Community visit and safe to call twice (see the migration's own
 *  header comment). Fire-and-forget, same convention as
 *  markEmpireFeedSeen. */
export async function maybeSignalDemoGenerate(): Promise<void> {
  await supabase.rpc('signal_demo_maybe_generate');
}

// ---- Admin controls — every RPC below re-checks is_admin() server-side
// regardless of what the client sends; these are a convenience surface,
// not the real security boundary. ----

export interface SignalDemoSettings {
  enabled: boolean;
  demoProfilesPerDay: number;
  demoPostsPerDay: number;
  demoPhotosPerDay: number;
  demoVideosPerDay: number;
  retentionDays: number;
  updatedAt: string;
}

interface SignalDemoSettingsRow {
  enabled: boolean;
  demo_profiles_per_day: number;
  demo_posts_per_day: number;
  demo_photos_per_day: number;
  demo_videos_per_day: number;
  retention_days: number;
  updated_at: string;
}

function mapDemoSettings(row: SignalDemoSettingsRow): SignalDemoSettings {
  return {
    enabled: row.enabled,
    demoProfilesPerDay: row.demo_profiles_per_day,
    demoPostsPerDay: row.demo_posts_per_day,
    demoPhotosPerDay: row.demo_photos_per_day,
    demoVideosPerDay: row.demo_videos_per_day,
    retentionDays: row.retention_days,
    updatedAt: row.updated_at,
  };
}

export async function fetchSignalDemoSettings(): Promise<SignalDemoSettings> {
  const { data, error } = await supabase.rpc('fetch_signal_demo_settings');
  if (error) throw error;
  return mapDemoSettings(data as SignalDemoSettingsRow);
}

export async function setSignalDemoSettings(input: Omit<SignalDemoSettings, 'updatedAt'>): Promise<{ settings: SignalDemoSettings | null; error: string | null }> {
  const { data, error } = await supabase.rpc('set_signal_demo_settings', {
    p_enabled: input.enabled,
    p_demo_profiles_per_day: input.demoProfilesPerDay,
    p_demo_posts_per_day: input.demoPostsPerDay,
    p_demo_photos_per_day: input.demoPhotosPerDay,
    p_demo_videos_per_day: input.demoVideosPerDay,
    p_retention_days: input.retentionDays,
  });
  if (error) return { settings: null, error: error.message };
  return { settings: mapDemoSettings(data as SignalDemoSettingsRow), error: null };
}

export interface SignalDemoGenerationResult {
  batchId: string;
  profilesInserted: number;
  postsInserted: number;
}

function mapGenerationResult(data: { batch_id: string; profiles_inserted: number; posts_inserted: number }): SignalDemoGenerationResult {
  return { batchId: data.batch_id, profilesInserted: data.profiles_inserted, postsInserted: data.posts_inserted };
}

export async function generateSignalDemoContentNow(profileCount?: number, postCount?: number): Promise<{ result: SignalDemoGenerationResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('signal_demo_admin_generate_now', {
    p_profile_count: profileCount ?? null, p_post_count: postCount ?? null,
  });
  if (error) return { result: null, error: error.message };
  return { result: mapGenerationResult(data), error: null };
}

export async function clearSignalDemoContent(): Promise<{ postsDeleted: number; profilesDeleted: number; error: string | null }> {
  const { data, error } = await supabase.rpc('signal_demo_admin_clear');
  if (error) return { postsDeleted: 0, profilesDeleted: 0, error: error.message };
  const d = data as { posts_deleted: number; profiles_deleted: number };
  return { postsDeleted: d.posts_deleted, profilesDeleted: d.profiles_deleted, error: null };
}

export async function regenerateSignalDemoContent(profileCount?: number, postCount?: number): Promise<{ result: SignalDemoGenerationResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('signal_demo_admin_regenerate', {
    p_profile_count: profileCount ?? null, p_post_count: postCount ?? null,
  });
  if (error) return { result: null, error: error.message };
  return { result: mapGenerationResult(data), error: null };
}

/** A plain count against each table's own RLS-protected SELECT policy —
 *  no dedicated RPC needed for a number the admin panel just displays. */
export async function fetchSignalDemoStats(): Promise<{ profileCount: number; postCount: number }> {
  const [profiles, posts] = await Promise.all([
    supabase.from('signal_demo_profiles').select('id', { count: 'exact', head: true }),
    supabase.from('signal_demo_posts').select('id', { count: 'exact', head: true }),
  ]);
  return { profileCount: profiles.count ?? 0, postCount: posts.count ?? 0 };
}
