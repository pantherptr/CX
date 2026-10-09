import { supabase } from '../supabase';
import type { ContentType } from './privacy';

/**
 * CX Collab (0098) — one post or Vision shared by two people. The content is never
 * copied: a side table says who the second person is and where the invitation stands.
 * Reads fail soft until the migration has run (nothing looks collaborative).
 */

export type CollabContentType = Extract<ContentType, 'post' | 'vision'>;

export interface CollabPerson { id: string; name: string; username: string | null; avatarUrl: string | null }

export interface CollabInfo {
  /** `pending` is only ever sent to the author; everyone else sees accepted ones only. */
  status: 'pending' | 'accepted';
  primary: { id: string; name: string; username: string | null };
  collaborator: CollabPerson;
}

interface CollabRow {
  content_id: string; status: 'pending' | 'accepted';
  primary_id: string; primary_name: string | null; primary_username: string | null;
  collaborator_id: string; collaborator_name: string | null; collaborator_username: string | null; collaborator_avatar_url: string | null;
}

export async function fetchCollabs(type: CollabContentType, ids: string[]): Promise<Map<string, CollabInfo>> {
  const out = new Map<string, CollabInfo>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase.rpc('fetch_collabs', { p_type: type, p_ids: ids });
  if (error || !Array.isArray(data)) return out;
  for (const r of data as CollabRow[]) {
    out.set(r.content_id, {
      status: r.status,
      primary: { id: r.primary_id, name: r.primary_name ?? 'CX user', username: r.primary_username },
      collaborator: { id: r.collaborator_id, name: r.collaborator_name ?? 'CX user', username: r.collaborator_username, avatarUrl: r.collaborator_avatar_url },
    });
  }
  return out;
}

/** Attaches `collab` to every item that has one. Fails open: with no migration, items come back untouched. */
export async function withCollabs<T extends { id: string; collab?: CollabInfo | null }>(type: CollabContentType, items: T[]): Promise<T[]> {
  if (items.length === 0) return items;
  const map = await fetchCollabs(type, items.map((i) => i.id));
  return map.size === 0 ? items : items.map((i) => (map.has(i.id) ? { ...i, collab: map.get(i.id)! } : i));
}

/** The "@marco × @luca" line (usernames when they exist). */
export const collabHandle = (p: { username: string | null; name: string }) => (p.username ? `@${p.username}` : p.name);

/** Your CX Circle — the only people who can be invited. */
export async function fetchMyCircle(query = ''): Promise<CollabPerson[]> {
  const { data, error } = await supabase.rpc('fetch_my_circle', { p_query: query || null, p_limit: 30 });
  if (error || !Array.isArray(data)) return [];
  return (data as { id: string; full_name: string | null; username: string | null; avatar_url: string | null }[]).map((r) => ({
    id: r.id, name: r.full_name ?? 'CX user', username: r.username, avatarUrl: r.avatar_url,
  }));
}

const wrap = async (p: PromiseLike<{ error: { message: string } | null }>): Promise<{ error: string | null }> => {
  const { error } = await p;
  return { error: error ? error.message : null };
};

export const inviteCollaborator = (type: CollabContentType, id: string, userId: string) =>
  wrap(supabase.rpc('invite_collaborator', { p_type: type, p_id: id, p_user_id: userId }));

export const respondToCollabInvite = (type: CollabContentType, id: string, accept: boolean) =>
  wrap(supabase.rpc('respond_collab_invite', { p_type: type, p_id: id, p_accept: accept }));

/** The collaborator steps out; the content stays with the author. */
export const leaveCollab = (type: CollabContentType, id: string) =>
  wrap(supabase.rpc('leave_collab', { p_type: type, p_id: id }));

/** The author takes the collaborator (or a pending invitation) off. */
export const removeCollab = (type: CollabContentType, id: string) =>
  wrap(supabase.rpc('remove_collab', { p_type: type, p_id: id }));
