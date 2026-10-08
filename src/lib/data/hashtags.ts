import { fetchEmpireFeed } from './empireFeed';

const TAG = /#[\p{L}\p{N}_]{2,40}/gu;
let pool: Promise<string[]> | null = null;

/** The hashtags people have used lately in SIGNAL posts, most used first —
 *  read once from the latest posts and kept for the session. */
export function loadHashtags(): Promise<string[]> {
  if (!pool) {
    pool = fetchEmpireFeed(60)
      .then((posts) => {
        const counts = new Map<string, number>();
        for (const p of posts) {
          for (const m of p.body.matchAll(TAG)) {
            const tag = m[0].toLowerCase();
            counts.set(tag, (counts.get(tag) ?? 0) + 1);
          }
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag).slice(0, 40);
      })
      .catch(() => []);
  }
  return pool;
}
