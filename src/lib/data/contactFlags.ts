import { supabase } from '../supabase';

/** What the contact guard (migration 0070) caught: text where someone tried
 *  to share a phone number, email, link, messaging app or an off-app
 *  payment. Readable by the Owner and admins only (RLS). */
export interface ContactFlag {
  id: string;
  createdAt: string;
  /** e.g. "messages.body", "cars.description" */
  source: string;
  userId: string | null;
  userName: string;
  /** The conversation id for chat messages, the row id otherwise. */
  refId: string | null;
  original: string;
}

export const FLAG_SOURCE_LABEL: Record<string, string> = {
  'messages.body': 'Chat message',
  'cars.description': 'Car description',
  'profiles.bio': 'Profile bio',
  'reviews.body': 'Review',
  'empire_posts.title': 'SIGNAL post title',
  'empire_posts.body': 'SIGNAL post',
  'empire_post_comments.body': 'SIGNAL comment',
  'empire_story_slides.caption': 'Story caption',
};

export async function fetchContactFlags(limit = 100): Promise<ContactFlag[]> {
  const { data, error } = await supabase
    .from('contact_guard_flags')
    .select('id, created_at, source, user_id, ref_id, original')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.user_id).filter((v): v is string => Boolean(v)))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ids);
    (profiles ?? []).forEach((p) => names.set(p.id as string, (p.full_name as string | null) || 'Unnamed user'));
  }
  return rows.map((r) => ({
    id: r.id as string,
    createdAt: r.created_at as string,
    source: r.source as string,
    userId: (r.user_id as string | null) ?? null,
    userName: r.user_id ? names.get(r.user_id as string) ?? 'Unknown user' : 'Unknown user',
    refId: (r.ref_id as string | null) ?? null,
    original: r.original as string,
  }));
}
