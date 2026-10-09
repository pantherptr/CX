import { supabase } from '../supabase';

/**
 * Who may see a piece of content (0092_signal_privacy_relations.sql).
 *
 *   public     anyone using Signal
 *   followers  people who follow the author
 *   circle     only a mutual follow (CX Circle)
 *   private    only the author
 *
 * No stored setting means public — existing content is untouched. The rule
 * itself lives in one place on the server (`signal_can_view`; admins see all
 * for moderation). The app asks the server which of the ids in a list are
 * hidden from the viewer and drops them, so every list goes through the same
 * check. It fails open: if the migration has not run, nothing is hidden.
 */

export type Visibility = 'public' | 'followers' | 'circle' | 'private';
export type ContentType = 'post' | 'story' | 'vision';

/** A new post starts public — the feed is the same normal feed for everyone — and its author can narrow it. */
export const DEFAULT_POST_VISIBILITY: Visibility = 'public';
/** A new Vision starts with followers only; public is a choice. */
export const DEFAULT_VISIBILITY: Visibility = 'followers';

export const VISIBILITY_OPTIONS: { value: Visibility; label: string; hint: string }[] = [
  { value: 'public', label: 'Public', hint: 'Anyone on Signal' },
  { value: 'followers', label: 'Followers', hint: 'People who follow you' },
  { value: 'circle', label: 'CX Circle', hint: 'Only people you follow back' },
  { value: 'private', label: 'Only me', hint: 'Just you' },
];

async function hiddenIds(type: ContentType, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase.rpc('signal_hidden_content', { p_type: type, p_ids: ids });
  if (error || !Array.isArray(data)) return new Set();
  return new Set(data as string[]);
}

/** Drops the items the signed-in viewer is not allowed to see. */
export async function withoutHidden<T extends { id: string }>(type: ContentType, items: T[]): Promise<T[]> {
  if (items.length === 0) return items;
  const hidden = await hiddenIds(type, items.map((i) => i.id));
  return hidden.size === 0 ? items : items.filter((i) => !hidden.has(i.id));
}

/** The author sets who may see their own content. */
export async function setContentVisibility(type: ContentType, id: string, visibility: Visibility): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_content_visibility', { p_type: type, p_id: id, p_visibility: visibility });
  return { error: error ? error.message : null };
}

/** The author reads back the setting of their own content (absent = public). */
export async function fetchMyVisibility(type: ContentType, ids: string[]): Promise<Map<string, Visibility>> {
  const out = new Map<string, Visibility>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase.rpc('fetch_my_visibility', { p_type: type, p_ids: ids });
  if (error || !data) return out;
  for (const r of data as { content_id: string; visibility: Visibility }[]) out.set(r.content_id, r.visibility);
  return out;
}

export type Relation = 'mutual' | 'following' | 'follower' | 'none';

/** How the signed-in user stands to this person; `mutual` is CX Circle. */
export async function fetchRelation(userId: string): Promise<Relation> {
  const { data, error } = await supabase.rpc('fetch_relation', { p_user_id: userId });
  if (error || typeof data !== 'string') return 'none';
  return data as Relation;
}

export interface PersonSuggestion {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  username: string | null;
  isHost: boolean;
  isVerifiedClient: boolean;
  /** How many people you follow also follow them. */
  mutualFollows: number;
}

/** People worth following: friends-of-friends first, then well-followed hosts and verified accounts. */
export async function fetchPeopleSuggestions(limit = 12): Promise<PersonSuggestion[]> {
  const { data, error } = await supabase.rpc('fetch_people_suggestions', { p_limit: limit });
  if (error || !data) return [];
  return (data as { id: string; full_name: string | null; avatar_url: string | null; username: string | null; is_host: boolean; is_verified_client: boolean; mutual_follows: number }[]).map((r) => ({
    id: r.id, fullName: r.full_name ?? 'CX user', avatarUrl: r.avatar_url, username: r.username,
    isHost: r.is_host, isVerifiedClient: r.is_verified_client, mutualFollows: r.mutual_follows,
  }));
}
