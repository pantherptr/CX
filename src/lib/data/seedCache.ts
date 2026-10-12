/** Things already seen, kept for a few minutes so opening a post or a profile paints at once from what
 *  the feed or the last visit already had, while the fresh copy loads behind it (what X does). In memory
 *  only; never shown as final — the real fetch always replaces it. */
const TTL = 10 * 60_000;

const posts = new Map<string, { v: unknown; at: number }>();
export function rememberPosts(list: Array<{ id: string }>) {
  const now = Date.now();
  for (const p of list) posts.set(p.id, { v: p, at: now });
  if (posts.size > 200) for (const k of [...posts.keys()].slice(0, posts.size - 200)) posts.delete(k);
}
export function recallPost<T>(id: string): T | null {
  const e = posts.get(id);
  return e && Date.now() - e.at < TTL ? (e.v as T) : null;
}

export interface ProfileSeed { profile: unknown; posts: unknown; cars: unknown; at: number }
const profiles = new Map<string, ProfileSeed>();
export function recallProfile(id: string): ProfileSeed | null {
  const e = profiles.get(id);
  return e && Date.now() - e.at < TTL ? e : null;
}
export function rememberProfile(id: string, patch: Partial<Omit<ProfileSeed, 'at'>>) {
  const cur = profiles.get(id) ?? { profile: null, posts: null, cars: null, at: 0 };
  profiles.set(id, { ...cur, ...patch, at: Date.now() });
}
