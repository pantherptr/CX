/**
 * Client-side video validation/thumbnailing shared by SignalStoryComposer
 * and SignalPostComposer — no server-side transcoding pipeline exists
 * (Supabase Storage is plain object storage), so this is the one real
 * enforcement point before an upload ever starts: type, size, and
 * duration are all checked up front so a failed check never leaves a
 * half-created Story slide or post behind.
 */

export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'];

export interface VideoValidation {
  ok: boolean;
  error?: string;
  durationSec?: number;
}

/** Loads just enough of the file to read its real duration — a hidden,
 *  unattached `<video>` element never inserted into the DOM, discarded
 *  once metadata resolves (or after a generous timeout for a corrupt/
 *  unsupported file, so a bad upload can't hang the composer forever). */
export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    const cleanup = () => URL.revokeObjectURL(url);
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Could not read this video file.'));
    }, 10000);
    video.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      cleanup();
      resolve(video.duration);
    };
    video.onerror = () => {
      window.clearTimeout(timeout);
      cleanup();
      reject(new Error('Could not read this video file.'));
    };
    video.src = url;
  });
}

/** Type + size + duration in one call, so a composer only needs one
 *  await before deciding whether to stage the file at all. */
export async function validateVideoFile(
  file: File,
  opts: { maxBytes: number; maxDurationSec: number },
): Promise<VideoValidation> {
  if (!VIDEO_MIME_TYPES.includes(file.type)) {
    return { ok: false, error: `"${file.name}" must be an MP4 or WebM video.` };
  }
  if (file.size > opts.maxBytes) {
    return { ok: false, error: `"${file.name}" is larger than ${Math.round(opts.maxBytes / (1024 * 1024))}MB.` };
  }
  let durationSec: number;
  try {
    durationSec = await getVideoDuration(file);
  } catch {
    return { ok: false, error: `"${file.name}" could not be read — it may be corrupt or in an unsupported format.` };
  }
  if (durationSec > opts.maxDurationSec) {
    return { ok: false, error: `"${file.name}" is longer than ${opts.maxDurationSec}s.` };
  }
  return { ok: true, durationSec };
}

/** Captures a still frame from the video as a poster thumbnail — Story-
 *  slide circles/the viewer's `<video poster>` need an instant image
 *  rather than waiting on the video itself to decode a first frame. Not
 *  used for post videos, where `<video preload="metadata">` already
 *  shows the first frame natively at the size it actually renders. */
export function captureVideoPosterBlob(file: File, atSeconds = 0.15): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const cleanup = () => URL.revokeObjectURL(url);
    const fail = (err: unknown) => {
      cleanup();
      reject(err instanceof Error ? err : new Error('Could not generate a poster for this video.'));
    };
    video.onloadedmetadata = () => {
      // Clamp into the clip's own duration — a sub-second clip can't
      // seek to a fixed 0.15s.
      video.currentTime = Math.min(atSeconds, Math.max(0, video.duration - 0.05));
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas not supported.');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          cleanup();
          if (blob) resolve(blob);
          else reject(new Error('Could not generate a poster for this video.'));
        }, 'image/jpeg', 0.85);
      } catch (err) {
        fail(err);
      }
    };
    video.onerror = () => fail(new Error('Could not read this video file.'));
    video.src = url;
  });
}
