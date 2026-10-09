import { supabase } from '../supabase';

/**
 * CX Visions — a personal, professional portfolio on a profile, separate
 * from posts (0085 = the opt-in switch, 0086 = the portfolio itself). A
 * Vision is its own item in its own storage bucket; it never appears in the
 * Signal feed.
 *
 * Reads fail soft: until the migration has run, Visions just looks off.
 */

const VISIONS_BUCKET = 'signal-visions';

export async function fetchVisionsEnabled(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('fetch_visions_enabled', { p_user_id: userId });
  if (error) return false;
  return Boolean(data);
}

export async function setMyVisionsEnabled(enabled: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_my_visions_enabled', { p_enabled: enabled });
  return { error: error ? error.message : null };
}

export interface Vision {
  id: string;
  authorId: string;
  mediaUrl: string;
  mediaKind: 'image' | 'video';
  title: string | null;
  caption: string | null;
  createdAt: string;
}

interface VisionRow {
  id: string;
  author_id: string;
  media_path: string;
  media_kind: 'image' | 'video';
  title: string | null;
  caption: string | null;
  created_at: string;
}

const urlFor = (path: string) => supabase.storage.from(VISIONS_BUCKET).getPublicUrl(path).data.publicUrl;

export async function fetchVisions(authorId: string, limit = 60): Promise<Vision[]> {
  const { data, error } = await supabase.rpc('fetch_visions', { p_author_id: authorId, p_limit: limit, p_before: null });
  if (error || !data) return [];
  return (data as VisionRow[]).map((r) => ({
    id: r.id, authorId: r.author_id, mediaUrl: urlFor(r.media_path), mediaKind: r.media_kind,
    title: r.title, caption: r.caption, createdAt: r.created_at,
  }));
}

/** Uploads one file into the signed-in user's own folder and records it. */
export async function addVision(file: File, kind: 'image' | 'video', title: string, caption: string): Promise<{ error: string | null }> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return { error: 'Not signed in' };
  const ext = file.name.split('.').pop()?.toLowerCase() || (kind === 'video' ? 'mp4' : 'jpg');
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(VISIONS_BUCKET).upload(path, file, { cacheControl: '31536000', upsert: false });
  if (up.error) return { error: up.error.message };
  const { error } = await supabase.rpc('add_vision', { p_media_path: path, p_media_kind: kind, p_title: title, p_caption: caption });
  if (error) {
    await supabase.storage.from(VISIONS_BUCKET).remove([path]);
    return { error: error.message };
  }
  return { error: null };
}

export async function updateVision(id: string, title: string, caption: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_vision', { p_id: id, p_title: title, p_caption: caption });
  return { error: error ? error.message : null };
}

export async function deleteVision(id: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('delete_vision', { p_id: id });
  if (error) return { error: error.message };
  if (typeof data === 'string' && data) await supabase.storage.from(VISIONS_BUCKET).remove([data]);
  return { error: null };
}
