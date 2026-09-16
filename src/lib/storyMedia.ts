/** Every Story photo is baked to this exact resolution — a fixed 9:16
 *  export size, not just a CSS ratio, so the stored file itself is
 *  already correctly composed and every future renderer (the viewer, a
 *  download, a share target) just displays it with no per-consumer
 *  fitting logic required. */
export const STORY_CANVAS_WIDTH = 1080;
export const STORY_CANVAS_HEIGHT = 1920;

/** Center cover-crop: fills the target box from the source, cropping
 *  whichever axis overflows, and never stretches either axis
 *  independently — the one place this math lives, shared by live-camera
 *  capture, gallery image import, and gallery video poster capture. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let cropX = 0;
  let cropY = 0;
  if (sourceRatio > targetRatio) {
    cropWidth = sourceHeight * targetRatio;
    cropX = (sourceWidth - cropWidth) / 2;
  } else {
    cropHeight = sourceWidth / targetRatio;
    cropY = (sourceHeight - cropHeight) / 2;
  }
  ctx.drawImage(source, cropX, cropY, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight);
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not process this image.'))), type, quality);
  });
}

function loadImageElement(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read this image.'));
    };
    img.src = url;
  });
}

/** Bakes any picked image — portrait, landscape, square — into the fixed
 *  9:16 Story canvas via a center cover-crop. */
export async function cropImageFileToStoryCanvas(file: File): Promise<Blob> {
  const img = await loadImageElement(file);
  const canvas = document.createElement('canvas');
  canvas.width = STORY_CANVAS_WIDTH;
  canvas.height = STORY_CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process this image.');
  drawCover(ctx, img, img.naturalWidth, img.naturalHeight, STORY_CANVAS_WIDTH, STORY_CANVAS_HEIGHT);
  return canvasToBlob(canvas);
}

/** Same center cover-crop, from a live `<video>` frame — what the
 *  camera's shutter button captures, and what a just-finished recording
 *  reuses for its poster (the live feed's last frame, cheaper than
 *  re-decoding the recorded file). */
export function capturePhotoFromVideoElement(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = STORY_CANVAS_WIDTH;
  canvas.height = STORY_CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx || !video.videoWidth) return Promise.reject(new Error('Could not capture a photo.'));
  drawCover(ctx, video, video.videoWidth, video.videoHeight, STORY_CANVAS_WIDTH, STORY_CANVAS_HEIGHT);
  return canvasToBlob(canvas);
}

/** A gallery-picked video's poster, cover-cropped the same way so the
 *  Story bar/viewer's placeholder frame matches the 9:16 composition
 *  instead of the raw uncropped first frame. */
export function capturePosterFromVideoFile(file: File, atSeconds = 0.15): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const cleanup = () => URL.revokeObjectURL(url);
    const fail = (err: unknown) => {
      cleanup();
      reject(err instanceof Error ? err : new Error('Could not process this video.'));
    };
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(atSeconds, Math.max(0, video.duration - 0.05));
    };
    video.onseeked = () => {
      capturePhotoFromVideoElement(video)
        .then((blob) => {
          cleanup();
          resolve(blob);
        })
        .catch(fail);
    };
    video.onerror = () => fail(new Error('Could not read this video.'));
    video.src = url;
  });
}
