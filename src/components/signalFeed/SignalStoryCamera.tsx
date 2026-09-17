import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { vibrateTap } from '../motion';
import { motion, AnimatePresence, Tap } from '../motionKit';
import { capturePhotoFromVideoElement } from '../../lib/storyMedia';
import { StoryCanvas } from './StoryCanvas';

const SHUTTER_HOLD_MS = 350;
const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
const RECORDING_BITRATE = 4_000_000; // ~4 Mbps — good quality at the 9:16 capture size without letting a minute-long clip balloon
const CAMERA_FACING_KEY = 'signal:lastCameraFacing';

type CameraStatus = 'starting' | 'ready' | 'denied' | 'unavailable';

/** `torch`/`zoom` are real, widely-supported constrainable properties on
 *  mobile camera tracks, but TS's own `MediaTrackCapabilities` /
 *  `MediaTrackConstraintSet` lib types don't carry them yet. */
interface ExtendedTrackCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
  zoom?: { min: number; max: number; step: number };
}
interface ExtendedConstraintSet extends MediaTrackConstraintSet {
  torch?: boolean;
  zoom?: number;
}

/** Remembers the last-used camera for the rest of this browser session —
 *  a pure convenience (a fresh session always starts back on the rear
 *  camera), same pattern `lastSignalPublisherType` already uses. */
function lastCameraFacing(): 'user' | 'environment' {
  const stored = typeof window !== 'undefined' ? window.sessionStorage.getItem(CAMERA_FACING_KEY) : null;
  return stored === 'user' ? 'user' : 'environment';
}

function pickRecorderMimeType(): string {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return candidates.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) ?? '';
}

function formatSeconds(sec: number) {
  const s = Math.floor(sec);
  return `0:${String(s).padStart(2, '0')}`;
}

function touchDistance(touches: React.TouchList): number {
  const [a, b] = [touches[0], touches[1]];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/** SIGNAL's live Story camera — the actual entry point for "Add Story",
 *  not a picker screen. A real `getUserMedia` viewfinder cover-cropped to
 *  9:16 inside `StoryCanvas` (so what you see is exactly what gets
 *  captured), a center shutter that's a tap-for-photo / hold-for-video
 *  control (one button, not a confusing mode switch), and Gallery/Text
 *  as the two secondary ways in — both still land in the same 9:16
 *  editor. Camera errors (denied, no device, unsupported browser) fall
 *  back to a calm in-canvas message with Gallery/Text still reachable —
 *  this screen never dead-ends. */
export function SignalStoryCamera({
  onPhotoBlob,
  onVideoFile,
  onGalleryFiles,
  onTextStory,
  onClose,
  topRightSlot,
  maxVideoDurationSec,
  reduceMotion,
}: {
  onPhotoBlob: (blob: Blob) => void;
  onVideoFile: (file: File, posterBlob: Blob | null) => void;
  onGalleryFiles: (files: FileList) => void;
  onTextStory: () => void;
  onClose: () => void;
  topRightSlot?: ReactNode;
  maxVideoDurationSec: number;
  reduceMotion: boolean;
}) {
  const [facing, setFacing] = useState<'user' | 'environment'>(lastCameraFacing);
  const [status, setStatus] = useState<CameraStatus>('starting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [flash, setFlash] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number; step: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pinching, setPinching] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pressTimerRef = useRef<number | null>(null);
  const recordStartRef = useRef(0);
  const recordTickRef = useRef<number | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const pinchEndTimerRef = useRef<number | null>(null);
  const lastZoomApplyRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    async function start() {
      setStatus('starting');
      setErrorMessage(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unavailable');
        return;
      }
      stop();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1080 }, height: { ideal: 1920 } },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          const video = videoRef.current;
          video.srcObject = stream;
          await video.play().catch(() => {});
          // `play()` resolving doesn't guarantee `videoWidth`/`videoHeight`
          // are populated yet on every mobile browser — capturing a frame
          // before they are throws "Could not capture a photo" outright
          // (`capturePhotoFromVideoElement` needs real dimensions to
          // cover-crop against). Wait for the metadata that carries them,
          // with a safety timeout so a stalled stream never hangs the UI.
          if (video.videoWidth === 0) {
            await new Promise<void>((resolve) => {
              const onLoaded = () => {
                video.removeEventListener('loadedmetadata', onLoaded);
                resolve();
              };
              video.addEventListener('loadedmetadata', onLoaded);
              window.setTimeout(() => {
                video.removeEventListener('loadedmetadata', onLoaded);
                resolve();
              }, 2000);
            });
          }
        }
        if (cancelled) return;
        setStatus('ready');

        // Torch and zoom are per-track, real-hardware capabilities — most
        // desktop webcams and plenty of front cameras report neither, so
        // both controls stay hidden unless the *current* stream actually
        // supports them (checked fresh on every camera switch, not just
        // once at mount).
        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as ExtendedTrackCapabilities | undefined;
        setTorchSupported(!!caps?.torch);
        setTorchOn(false);
        if (caps?.zoom) {
          const settings = track.getSettings?.() as MediaTrackSettings | undefined;
          setZoomCaps({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 });
          setZoom(settings?.zoom ?? caps.zoom.min);
        } else {
          setZoomCaps(null);
          setZoom(1);
        }

        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (!cancelled) setCanSwitchCamera(devices.filter((d) => d.kind === 'videoinput').length > 1);
        } catch {
          // Non-fatal — the flip control just stays hidden.
        }
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setStatus('denied');
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
          setStatus('unavailable');
          setErrorMessage('No camera was found on this device.');
        } else {
          setStatus('unavailable');
          setErrorMessage('The camera could not be started.');
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [facing]);

  const openGallery = () => galleryInputRef.current?.click();

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as ExtendedConstraintSet] });
      setTorchOn(next);
    } catch {
      // Some browsers report the capability but reject the constraint —
      // leave the toggle where it was rather than claim a state that
      // didn't actually take.
    }
  };

  const switchCamera = () => {
    setFacing((f) => {
      const next = f === 'environment' ? 'user' : 'environment';
      window.sessionStorage.setItem(CAMERA_FACING_KEY, next);
      return next;
    });
  };

  const applyZoom = (value: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    track?.applyConstraints({ advanced: [{ zoom: value } as ExtendedConstraintSet] }).catch(() => {});
  };

  const handlePinchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !zoomCaps) return;
    if (pinchEndTimerRef.current) window.clearTimeout(pinchEndTimerRef.current);
    pinchRef.current = { startDist: touchDistance(e.touches), startZoom: zoom };
    setPinching(true);
  };
  const handlePinchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !zoomCaps || !pinchRef.current) return;
    // Stop the browser's own native page-pinch-zoom from firing alongside
    // this, and keep a two-finger gesture here from ever being read as a
    // continuation of the shell's one-finger swipe-to-close drag.
    e.preventDefault();
    e.stopPropagation();
    const scale = touchDistance(e.touches) / pinchRef.current.startDist;
    const next = Math.min(zoomCaps.max, Math.max(zoomCaps.min, pinchRef.current.startZoom * scale));
    setZoom(next);
    // Throttled: touchmove can fire far faster than the camera hardware
    // can actually respond to constraint changes, and flooding it with
    // applyConstraints calls is wasted work that can itself introduce lag.
    const now = Date.now();
    if (now - lastZoomApplyRef.current > 50) {
      lastZoomApplyRef.current = now;
      applyZoom(next);
    }
  };
  const handlePinchEnd = () => {
    if (pinchRef.current) applyZoom(zoom); // land on the exact displayed value even if the throttle skipped the final move
    pinchRef.current = null;
    pinchEndTimerRef.current = window.setTimeout(() => setPinching(false), 500);
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || status !== 'ready') return;
    setFlash(true);
    window.setTimeout(() => setFlash(false), 160);
    vibrateTap();
    try {
      const blob = await capturePhotoFromVideoElement(video);
      onPhotoBlob(blob);
    } catch {
      setErrorMessage('Could not capture a photo — try again.');
    }
  };

  const stopRecording = () => {
    if (recordTickRef.current) {
      window.clearInterval(recordTickRef.current);
      recordTickRef.current = null;
    }
    recorderRef.current?.stop();
    setRecording(false);
  };

  const finishRecording = async (mimeType: string) => {
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    if (blob.size === 0) return;
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const file = new File([blob], `signal-story-${Date.now()}.${ext}`, { type: mimeType.split(';')[0] || 'video/webm' });
    let posterBlob: Blob | null = null;
    const video = videoRef.current;
    if (video) {
      try {
        posterBlob = await capturePhotoFromVideoElement(video);
      } catch {
        // Non-fatal — the viewer falls back to the video's own first frame.
      }
    }
    onVideoFile(file, posterBlob);
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || !window.MediaRecorder) return;
    try {
      const mimeType = pickRecorderMimeType();
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: RECORDING_BITRATE,
      });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => void finishRecording(recorder.mimeType || mimeType || 'video/webm');
      recorder.start();
      recorderRef.current = recorder;
      recordStartRef.current = Date.now();
      setRecording(true);
      setRecordSeconds(0);
      vibrateTap([10, 30, 10]);
      recordTickRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - recordStartRef.current) / 1000;
        setRecordSeconds(elapsed);
        if (elapsed >= maxVideoDurationSec) stopRecording();
      }, 200);
    } catch {
      setErrorMessage('Could not start recording — try again.');
    }
  };

  const handleShutterDown = () => {
    if (status !== 'ready') return;
    pressTimerRef.current = window.setTimeout(startRecording, SHUTTER_HOLD_MS);
  };
  const handleShutterUp = () => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
      if (!recording) {
        void capturePhoto();
        return;
      }
    }
    if (recording) stopRecording();
  };
  // Keyboard (Enter/Space) activation dispatches a `click`, not the
  // pointerdown/up pair the press-and-hold gesture above relies on —
  // without this the shutter would be entirely unreachable from a
  // keyboard. `detail === 0` is the standard tell for a keyboard-
  // synthesized click (a real pointer click always has `detail >= 1`),
  // so this only ever fires for keyboard users and never double-fires
  // alongside a real tap. Keyboard activation always takes a photo —
  // there's no keyboard equivalent of "hold" worth inventing.
  const handleShutterClick = (e: React.MouseEvent) => {
    if (e.detail === 0 && status === 'ready' && !recording) void capturePhoto();
  };

  const fallbackCopy: Record<Exclude<CameraStatus, 'ready'>, { title: string; message: string }> = {
    starting: { title: 'Starting camera…', message: 'One moment.' },
    denied: { title: 'Camera access denied', message: 'Allow camera access in your browser settings, or add a Story another way.' },
    unavailable: { title: 'Camera unavailable', message: errorMessage ?? 'This browser or device has no usable camera.' },
  };

  return (
    <div className="h-full w-full bg-noir">
      <StoryCanvas>
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-safe" style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
          <Tap onClick={onClose} aria-label="Close" scale={0.9} className="grid h-9 w-9 place-items-center rounded-full bg-black/30 text-white backdrop-blur-sm transition-colors hover:bg-black/50">
            <Icon name="x" size={20} />
          </Tap>
          <div className="flex items-center gap-2">
            {torchSupported && (
              <Tap
                onClick={() => void toggleTorch()}
                aria-label={torchOn ? 'Turn off flash' : 'Turn on flash'}
                aria-pressed={torchOn}
                scale={0.9}
                className={`grid h-9 w-9 place-items-center rounded-full backdrop-blur-sm transition-colors ${torchOn ? 'bg-accent-bright text-noir' : 'bg-black/30 text-white hover:bg-black/50'}`}
              >
                <Icon name="bolt" size={17} fill={torchOn} />
              </Tap>
            )}
            {topRightSlot}
          </div>
        </div>

        {/* Always mounted — even before/without a live stream — so its ref
            is already attached the instant `getUserMedia` resolves inside
            the effect above. Gating this element's very existence on
            `status === 'ready'` (as an earlier version did) meant the
            stream would resolve while the element still didn't exist yet,
            `videoRef.current` would be `null`, the `srcObject` assignment
            would silently no-op, and the video that mounted a moment
            later — once `status` finally flipped — would carry no stream
            at all: a permanently black frame. The fallback UI now overlays
            on top instead of replacing it. */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          onTouchStart={handlePinchStart}
          onTouchMove={handlePinchMove}
          onTouchEnd={handlePinchEnd}
          onTouchCancel={handlePinchEnd}
          className={`absolute inset-0 h-full w-full touch-none object-cover transition-opacity duration-200 ${facing === 'user' ? 'scale-x-[-1]' : ''} ${status === 'ready' ? '' : 'opacity-0'}`}
        />
        {zoomCaps && pinching && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-1.5 text-caption font-semibold tabular-nums text-white backdrop-blur-sm">
            {zoom.toFixed(1)}×
          </div>
        )}
        {status !== 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-noir p-8 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-white/10 text-on-noir-muted">
              <Icon name="camera" size={24} />
            </span>
            <div>
              <p className="text-body font-semibold text-on-noir">{fallbackCopy[status].title}</p>
              <p className="mt-1 text-caption text-on-noir-muted">{fallbackCopy[status].message}</p>
            </div>
            {status !== 'starting' && (
              <div className="flex gap-2">
                <button onClick={openGallery} className="btn btn-secondary btn-sm">Choose from Gallery</button>
                <button onClick={onTextStory} className="btn btn-secondary btn-sm">Write Text</button>
              </div>
            )}
          </div>
        )}
        {!reduceMotion && (
          <AnimatePresence>
            {flash && (
              <motion.div
                className="absolute inset-0 bg-white"
                initial={{ opacity: 0.9 }}
                animate={{ opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
              />
            )}
          </AnimatePresence>
        )}

        {recording && (
          <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 backdrop-blur-sm">
            <motion.span
              className="h-2 w-2 rounded-full bg-red-500"
              animate={reduceMotion ? undefined : { opacity: [1, 0.35, 1] }}
              transition={reduceMotion ? undefined : { duration: 1, repeat: Infinity, ease: 'easeInOut' }}
            />
            <span className="text-caption font-semibold tabular-nums text-white">{formatSeconds(recordSeconds)}</span>
          </div>
        )}

        {errorMessage && status === 'ready' && (
          <div className="absolute inset-x-4 top-16 z-20 rounded-xl bg-black/60 px-3 py-2 text-center text-caption font-medium text-white backdrop-blur-sm">
            {errorMessage}
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-4 px-8 pb-safe pt-8">
          <Tap onClick={onTextStory} aria-label="Write a text Story" scale={0.95} className="rounded-full bg-black/30 px-3.5 py-1.5 text-caption font-semibold text-white backdrop-blur-sm">
            Aa Text
          </Tap>
          <div className="flex w-full items-center justify-between">
            <Tap onClick={openGallery} scale={0.92} aria-label="Gallery" className="grid h-11 w-11 place-items-center rounded-full bg-black/30 text-white backdrop-blur-sm">
              <Icon name="image" size={19} />
            </Tap>

            <motion.button
              type="button"
              aria-label={recording ? 'Stop recording' : 'Take photo, hold for video'}
              disabled={status !== 'ready'}
              onPointerDown={handleShutterDown}
              onPointerUp={handleShutterUp}
              onPointerLeave={() => { if (recording) stopRecording(); }}
              onClick={handleShutterClick}
              whileTap={reduceMotion ? undefined : { scale: 0.9 }}
              animate={recording ? { scale: [1, 1.06, 1] } : { scale: 1 }}
              transition={recording && !reduceMotion ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.15 }}
              className="grid h-[72px] w-[72px] place-items-center rounded-full border-[3px] border-white disabled:opacity-40"
            >
              <span className={`transition-all ${recording ? 'h-6 w-6 rounded-md bg-red-500' : 'h-[58px] w-[58px] rounded-full bg-white'}`} />
            </motion.button>

            <Tap
              onClick={switchCamera}
              disabled={!canSwitchCamera || status !== 'ready'}
              scale={0.92}
              aria-label="Switch camera"
              className="grid h-11 w-11 place-items-center rounded-full bg-black/30 text-white backdrop-blur-sm disabled:opacity-0"
            >
              <Icon name="cameraFlip" size={19} />
            </Tap>
          </div>
        </div>
      </StoryCanvas>

      <input
        ref={galleryInputRef}
        type="file"
        accept={ACCEPTED_MIME.join(',')}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onGalleryFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
