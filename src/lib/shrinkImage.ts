/**
 * Photos are uploaded at whatever size the phone took them (often 5–25 MB) and then served as-is to
 * every viewer — that is what burns the storage traffic quota. This resizes a photo before it is
 * uploaded: longest side at most `maxDim` px, JPEG at `quality`. A phone screen shows nothing more.
 * Videos, GIFs, SVGs and small images are returned untouched; if anything fails, so is the original.
 */
export async function shrinkImage(file: File, maxDim = 1920, quality = 0.82): Promise<File> {
  try {
    if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
    if (typeof createImageBitmap !== 'function') return file;
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    // Already small enough: keep the original (no needless re-compression).
    if (scale === 1 && file.size <= 450 * 1024) { bmp.close?.(); return file; }
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bmp.close?.(); return file; }
    ctx.fillStyle = '#ffffff'; // a transparent PNG becomes white instead of black
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}
