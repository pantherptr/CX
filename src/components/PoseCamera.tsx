import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

/** The outline hosts line their car up with: a side profile, nose to the LEFT, wheels on the ground line. */
export function CarPoseGuide({ className = '', stroke = 'currentColor', dashed = true }: { className?: string; stroke?: string; dashed?: boolean }) {
  return (
    <svg viewBox="0 0 600 220" className={className} fill="none" stroke={stroke} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g strokeDasharray={dashed ? '10 9' : undefined}>
        <path d="M20 150 C18 132 30 124 60 120 L150 104 C185 100 205 78 240 66 C270 56 330 52 380 56 C430 60 480 90 540 112 C565 120 582 128 582 150 Z" />
        <path d="M250 70 L372 62 C418 68 452 88 492 106 L246 106 Z" strokeWidth="2.5" opacity="0.7" />
        <circle cx="120" cy="150" r="34" />
        <circle cx="480" cy="150" r="34" />
      </g>
      <path d="M0 184 H600" strokeWidth="2" opacity="0.45" />
    </svg>
  );
}

/**
 * A camera with the pose outline on top, so every listing's cover photo is the same shot:
 * whole car, side profile, nose to the left, phone held sideways. Falls back (onUnavailable)
 * when the camera cannot be opened — the caller then offers the gallery picker instead.
 */
export function PoseCamera({ onCapture, onClose, onUnavailable }: { onCapture: (file: File) => void; onClose: () => void; onUnavailable: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth);

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (off) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => undefined);
          setReady(true);
        }
      } catch {
        if (!off) onUnavailable();
      }
    })();
    const onResize = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      off = true;
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shoot = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    c.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], `cover-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  }, [onCapture]);

  return (
    <div className="fixed inset-0 z-[400] bg-black" role="dialog" aria-modal="true" aria-label="Take the cover photo">
      <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
      {ready && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <CarPoseGuide className="w-[82%] max-w-[44rem] text-white drop-shadow-[0_0_6px_rgba(0,0,0,0.6)]" stroke="rgba(255,255,255,0.92)" />
        </div>
      )}

      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4 pt-[calc(1rem+env(safe-area-inset-top,0px))]">
        <button onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full bg-black/45 text-white backdrop-blur active:scale-90">
          <Icon name="x" size={20} />
        </button>
        <p className="max-w-[16rem] rounded-2xl bg-black/45 px-3.5 py-2 text-center text-caption font-semibold text-white backdrop-blur">
          Whole car in the outline · nose to the left · side profile
        </p>
        <span className="w-11" />
      </div>

      {portrait && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 p-8 text-center backdrop-blur-sm">
          <div>
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/10 text-white"><Icon name="phone" size={28} className="rotate-90" /></span>
            <p className="mt-4 font-display text-xl font-semibold text-white">Turn your phone sideways</p>
            <p className="mt-1 text-detail text-white/70">The cover photo is always landscape.</p>
          </div>
        </div>
      )}

      {!portrait && (
        <div className="absolute inset-y-0 right-0 flex items-center p-5 pr-[calc(1.25rem+env(safe-area-inset-right,0px))]">
          <button
            onClick={shoot}
            disabled={!ready}
            aria-label="Take photo"
            className="grid h-[72px] w-[72px] place-items-center rounded-full bg-white/25 ring-4 ring-white backdrop-blur transition-transform active:scale-90 disabled:opacity-40"
          >
            <span className="h-14 w-14 rounded-full bg-[#fff]" />
          </button>
        </div>
      )}
    </div>
  );
}
