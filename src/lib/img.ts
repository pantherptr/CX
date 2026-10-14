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
/**
 * Supabase Storage can resize on the fly (Image Transformations — a Pro-plan feature). It is OFF until the
 * site is built with VITE_IMG_TRANSFORM=1, because on the free plan the render URL fails and the photo would
 * not show. When on, every host-uploaded photo (a public-bucket URL ending in a still-image extension) is
 * requested at the width it is actually shown at instead of the full 1920 px file: roughly a tenth of the
 * bytes for a card in a grid, and no visible change. Anything else is passed through untouched.
 */
const TRANSFORM = import.meta.env.VITE_IMG_TRANSFORM === '1';
const SUPA_PUBLIC = /^(https?:\/\/[^/]+)\/storage\/v1\/object\/public\/([^?#]+\.(?:jpe?g|png|webp|avif))(\?.*)?$/i;
const supaSized = (url: string, w: number): string | null => {
  if (!TRANSFORM) return null;
  const m = SUPA_PUBLIC.exec(url);
  if (!m) return null;
  return `${m[1]}/storage/v1/render/image/public/${m[2]}?width=${Math.round(w)}&quality=80`;
};

export const unsplash = (id: string, w = 1200, h?: number) => {
  if (!id) return '';
  if (/^https?:\/\//i.test(id)) return supaSized(id, w) ?? id;
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
  if (!id) return undefined;
  if (/^https?:\/\//i.test(id)) {
    // host-uploaded photo: a real srcset only when Storage transformations are on, else the plain `src`
    if (!TRANSFORM || !SUPA_PUBLIC.test(id)) return undefined;
    return widths.map((w) => `${supaSized(id, w)} ${w}w`).join(', ');
  }
  return widths.map((w) => `${unsplash(id, w)} ${w}w`).join(', ');
};

/** Deterministic avatar for demo people. */
export const avatar = (n: number) => `https://i.pravatar.cc/160?img=${n}`;
