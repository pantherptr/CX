/**
 * Photos in several sizes, made on the phone before they go up.
 *
 * A photo is uploaded once at full quality (the original, `NAME.v.jpg`) plus two smaller copies
 * (`NAME.v480.jpg`, `NAME.v960.jpg`). Every card, grid and avatar then downloads the copy that fits its
 * width instead of the full file — roughly a tenth of the bytes for a card — and the full quality is still
 * there for the photo viewer. No server work and no paid plan feature: the file name is the whole contract.
 *
 * The `.v.` marker is only written when both copies were uploaded, so a name with the marker always has its
 * copies; older photos have no marker and are served as they were.
 */
export const VARIANT_WIDTHS = [480, 960] as const;

const MARKED = /^(.*)\.v\.(jpe?g|png|webp)$/i;

/** True when this stored path/URL has its smaller copies next to it. */
export const hasVariants = (pathOrUrl: string) => MARKED.test(pathOrUrl.split(/[?#]/)[0]);

/** The URL of the copy that fits `width` (CSS px × density), or the original when it is wider than any copy. */
export function variantUrl(url: string, width: number): string {
  const [clean, query = ''] = url.split('?');
  const m = MARKED.exec(clean);
  if (!m) return url;
  const w = VARIANT_WIDTHS.find((v) => v >= width);
  if (!w) return url;
  return `${m[1]}.v${w}.jpg${query ? `?${query}` : ''}`;
}

/** `srcset` of the copies (the full original is only for the photo viewer), or undefined. */
export function variantSrcSet(url: string): string | undefined {
  if (!hasVariants(url)) return undefined;
  return VARIANT_WIDTHS.map((w) => `${variantUrl(url, w)} ${w}w`).join(', ');
}

async function resizeToBlob(bmp: ImageBitmap, width: number, quality: number): Promise<Blob | null> {
  const scale = Math.min(1, width / bmp.width);
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  return new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
}

/** The smaller copies of an image file, keyed by width; empty if the file cannot be decoded or is not worth it. */
export async function makeVariants(file: File): Promise<Map<number, Blob>> {
  const out = new Map<number, Blob>();
  try {
    if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return out;
    if (typeof createImageBitmap !== 'function') return out;
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    // a photo already narrower than the smaller copy does not need copies
    if (bmp.width > VARIANT_WIDTHS[0] * 1.15) {
      for (const w of VARIANT_WIDTHS) {
        const b = await resizeToBlob(bmp, w, w <= 480 ? 0.78 : 0.8);
        if (b) out.set(w, b);
      }
    }
    bmp.close?.();
  } catch {
    out.clear();
  }
  return out;
}

/**
 * Path + file to upload for an image `base` (a path without extension, e.g. `uid/uuid`), together with the
 * copies to upload *first*. The caller uploads each `variants` entry, and only if all of them succeeded
 * uploads the original under `markedPath`; otherwise it uploads under `plainPath` and nothing is marked.
 */
export async function planImageUpload(base: string, file: File) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const copies = await makeVariants(file);
  const variants = [...copies.entries()].map(([w, blob]) => ({
    path: `${base}.v${w}.jpg`,
    blob,
  }));
  return {
    plainPath: `${base}.${ext}`,
    markedPath: variants.length === VARIANT_WIDTHS.length && /^(jpe?g|png|webp)$/.test(ext) ? `${base}.v.${ext}` : null,
    variants,
  };
}

/** Paths to delete together with `paths`: a marked photo's smaller copies go with it. */
export function withVariantPaths(paths: string[]): string[] {
  const out = [...paths];
  for (const p of paths) {
    const m = MARKED.exec(p);
    if (m) for (const w of VARIANT_WIDTHS) out.push(`${m[1]}.v${w}.jpg`);
  }
  return out;
}
