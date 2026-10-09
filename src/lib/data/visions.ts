import { supabase } from '../supabase';

/**
 * CX Visions — an optional visual portfolio on a profile. A Vision is an
 * ordinary post (same media, Respect, comments) flagged through a side table
 * (0085_signal_visions.sql); nothing about posts themselves changes.
 *
 * Every function here fails soft: until the migration has been run (or if
 * a call errors) Visions simply looks switched off and no post is hidden.
 */

export async function fetchVisionsEnabled(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('fetch_visions_enabled', { p_user_id: userId });
  if (error) return false;
  return Boolean(data);
}

export async function setMyVisionsEnabled(enabled: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_my_visions_enabled', { p_enabled: enabled });
  return { error: error ? error.message : null };
}

/** Flag (or unflag) one of my own posts. `visionOnly` hides it from the feed. */
export async function setPostVision(postId: string, isVision: boolean, visionOnly = false): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_post_vision', { p_post_id: postId, p_is_vision: isVision, p_vision_only: visionOnly });
  return { error: error ? error.message : null };
}

export interface PostVisionFlag {
  isVision: boolean;
  visionOnly: boolean;
}

/** Which of these posts are Visions (and Visions-only). Absent id = a normal post. */
export async function fetchPostVisionFlags(postIds: string[]): Promise<Map<string, PostVisionFlag>> {
  const out = new Map<string, PostVisionFlag>();
  if (postIds.length === 0) return out;
  const { data, error } = await supabase.rpc('fetch_post_vision_flags', { p_post_ids: postIds });
  if (error || !data) return out;
  for (const r of data as { post_id: string; vision_only: boolean }[]) out.set(r.post_id, { isVision: true, visionOnly: r.vision_only });
  return out;
}

/** Drops the posts that live only in Visions — used by every list that
 *  shows a normal feed (Signal feed, a profile's Posts tab, search). */
export async function withoutVisionOnly<T extends { id: string }>(posts: T[]): Promise<T[]> {
  if (posts.length === 0) return posts;
  const flags = await fetchPostVisionFlags(posts.map((p) => p.id));
  if (flags.size === 0) return posts;
  return posts.filter((p) => !flags.get(p.id)?.visionOnly);
}

export async function fetchVisionPostIds(authorId: string, limit = 60): Promise<string[]> {
  const { data, error } = await supabase.rpc('fetch_vision_post_ids', { p_author_id: authorId, p_limit: limit });
  if (error || !data) return [];
  return (data as { post_id: string }[]).map((r) => r.post_id);
}
