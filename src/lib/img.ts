/**
 * Build a responsive Unsplash URL from a stored photo id.
 *
 * `car_images.url` historically stored a bare Unsplash photo id (that's
 * what scripts/seed.ts inserts), and every render site wraps it in this
 * helper. Real host-uploaded photos are full Supabase Storage URLs, so
 * anything that already looks like a URL is passed straight through —
 * one guard here keeps seeded and uploaded cars rendering side by side
 * without touching a single call site.
 */
export const unsplash = (id: string, w = 1200, h?: number) => {
  if (!id) return '';
  if (/^https?:\/\//i.test(id)) return id;
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&q=80&w=${w}${
    h ? `&h=${h}` : ''
  }`;
};

/**
 * `srcSet` for an Unsplash-backed photo at several widths — a 3x phone
 * screen gets a genuinely sharp image instead of one fixed width upscaled,
 * and a small thumbnail never downloads a desktop-sized file. `undefined`
 * for a full URL (host-uploaded photos in Supabase Storage have no resize
 * endpoint here), so those simply fall back to `src` as before.
 */
export const unsplashSrcSet = (id: string, widths: readonly number[] = [480, 800, 1200, 1600]) => {
  if (!id || /^https?:\/\//i.test(id)) return undefined;
  return widths.map((w) => `${unsplash(id, w)} ${w}w`).join(', ');
};

/** Deterministic avatar for demo people. */
export const avatar = (n: number) => `https://i.pravatar.cc/160?img=${n}`;
