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
  /** When it was marked handled; null while it still needs a look. */
  handledAt: string | null;
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

/** `canHandle` is false until migration 0071 (the handled_at column) is applied. */
export async function fetchContactFlags(limit = 150): Promise<{ flags: ContactFlag[]; canHandle: boolean }> {
  let canHandle = true;
  let res = await supabase
    .from('contact_guard_flags')
    .select('id, created_at, source, user_id, ref_id, original, handled_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (res.error) {
    // Older schema: no handled_at yet. Still show everything, read-only.
    canHandle = false;
    res = (await supabase
      .from('contact_guard_flags')
      .select('id, created_at, source, user_id, ref_id, original')
      .order('created_at', { ascending: false })
      .limit(limit)) as unknown as typeof res;
  }
  if (res.error) throw res.error;
  const rows = (res.data ?? []) as unknown as Record<string, unknown>[];
  const ids = [...new Set(rows.map((r) => r.user_id).filter((v): v is string => typeof v === 'string'))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ids);
    (profiles ?? []).forEach((p) => names.set(p.id as string, (p.full_name as string | null) || 'Unnamed user'));
  }
  const flags = rows.map((r) => ({
    id: r.id as string,
    createdAt: r.created_at as string,
    source: r.source as string,
    userId: (r.user_id as string | null) ?? null,
    userName: typeof r.user_id === 'string' ? names.get(r.user_id) ?? 'Unknown user' : 'Unknown user',
    refId: (r.ref_id as string | null) ?? null,
    original: r.original as string,
    handledAt: (r.handled_at as string | null | undefined) ?? null,
  }));
  return { flags, canHandle };
}

/** How many flags still need a look — the number on the tab. 0 when the table or column isn't there yet. */
export async function fetchOpenContactFlagCount(): Promise<number> {
  const { count, error } = await supabase
    .from('contact_guard_flags')
    .select('id', { count: 'exact', head: true })
    .is('handled_at', null);
  return error ? 0 : count ?? 0;
}

/** Marks flags handled (or puts them back with `handled: false`). */
export async function setContactFlagsHandled(ids: string[], handled: boolean): Promise<{ error: string | null }> {
  if (ids.length === 0) return { error: null };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('contact_guard_flags')
    .update(handled ? { handled_at: new Date().toISOString(), handled_by: user?.id ?? null } : { handled_at: null, handled_by: null })
    .in('id', ids);
  return { error: error?.message ?? null };
}
