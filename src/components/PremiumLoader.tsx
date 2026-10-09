import { useEffect, useRef, useState } from 'react';

/**
 * The loading system.
 *
 *   `PremiumPageLoader`    — the compact spinner dropped into any page or
 *                            section that is waiting on data (and the
 *                            Suspense fallback for route chunks): a thin
 *                            ring with a green arc turning around the CX
 *                            mark's own green. Same `size` contract as the
 *                            old orbit it replaces, so call sites didn't move.
 *   `PremiumInitialLoader` — the full-screen overlay shown once per session
 *                            while the app first boots.
 *
 * Both are pure CSS animation (transform only), and both stop under
 * `prefers-reduced-motion`.
 */

/** The in-page spinner. `size` is the box it occupies (so layouts that
 *  reserved room for the old orbit keep it); the ring itself is drawn at
 *  roughly half of that, clamped to a sensible range. */
export function PremiumPageLoader({ size = 90, label = 'Loading' }: { size?: number; label?: string }) {
  const ring = Math.max(26, Math.min(44, Math.round(size * 0.42)));
  return (
    <div role="status" aria-label={label} className="grid place-items-center" style={{ width: size, height: size }}>
      <span className="cx-spinner" style={{ width: ring, height: ring }} />
    </div>
  );
}

/** Full-screen loading overlay — shown once per session while the app
 *  first boots. Off-white (no colour jump from the native launch screen or
 *  the pre-paint background in `index.html`). The CX letters are unveiled
 *  left-to-right out of a blur, then the green key slides out of the X and
 *  a light sweeps through the whole mark. A soft green bloom breathes
 *  behind it, and underneath a little road scene: a white car shoots
 *  across the road once, the dashes streaking past, and the site opens. No card, no
 *  numbers, no text. `hiding` fades and eases it out into the real app.
 *
 *  The mark is two aligned layers cut from `cx-logo-main.png` (same canvas,
 *  so they stack pixel-perfectly): `cx-logo-letters.png` and
 *  `cx-logo-key.png`.
 */
export function PremiumInitialLoader({ hiding, onReady }: { hiding: boolean; onReady?: () => void }) {
  // The animation only starts once the artwork has actually loaded (or after a short
  // fallback), so it never plays on invisible images and then pops in half-way through.
  const [ready, setReady] = useState(false);
  const loaded = useRef(0);
  const markLoaded = () => {
    loaded.current += 1;
    if (loaded.current >= 3) setReady(true);
  };
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 1500);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => { if (ready) onReady?.(); }, [ready, onReady]);
  return (
    <div
      data-ready={ready}
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden bg-bg transition-[opacity,transform] duration-500 ease-out ${
        hiding ? 'pointer-events-none scale-[1.02] opacity-0' : 'opacity-100'
      }`}
      role="status"
      aria-label="Loading"
    >
      <div
        aria-hidden="true"
        className="cx-bloom pointer-events-none absolute left-1/2 top-1/2 h-[120vmin] w-[120vmin] rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgba(0,212,71,0.16), rgba(0,212,71,0.05) 55%, transparent 100%)' }}
      />
      <div className="relative" style={{ width: 'clamp(190px, 62vw, 300px)', aspectRatio: '1633 / 318' }}>
        <img src="/brand/cx-logo-letters.png" alt="" draggable={false} className="cx-reveal absolute inset-0 h-full w-full select-none object-contain" onLoad={markLoaded} onError={markLoaded} />
        <img src="/brand/cx-logo-key.png" alt="" draggable={false} className="cx-key absolute inset-0 h-full w-full select-none object-contain" onLoad={markLoaded} onError={markLoaded} />
        <span
          aria-hidden="true"
          className="signal-sweep-mask pointer-events-none absolute inset-0"
          style={{ WebkitMaskImage: 'url(/cx-logo-main.png)', maskImage: 'url(/cx-logo-main.png)' }}
        >
          <span className="signal-sweep-bar absolute" style={{ animationDelay: '1.1s' }} />
        </span>
      </div>
      {/* The road: a strip of asphalt whose dashes stream past while the car
          holds its place — it fades out at both ends so it never looks like a box. */}
      <div className="cx-road relative mt-9" aria-hidden="true">
        <div className="cx-road-strip absolute inset-x-0 top-1/2 h-[48px] -translate-y-1/2 overflow-hidden rounded-[16px] bg-[#23262b]">
          <span className="absolute inset-x-0 top-[5px] h-px bg-white/25" />
          <span className="absolute inset-x-0 bottom-[5px] h-px bg-white/25" />
          <span className="cx-road-dashes absolute top-1/2 h-[2px] -translate-y-1/2" />
          <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.07] to-transparent" />
        </div>
        <div className="cx-car absolute left-1/2 top-1/2 w-[112px]">
          <span className="cx-trail pointer-events-none absolute right-[86%] top-1/2 h-[7px] w-28 -translate-y-1/2 rounded-full" />
          <span className="cx-beam pointer-events-none absolute left-[88%] top-1/2 h-10 w-24 -translate-y-1/2" />
          <img src="/brand/loader-car.webp" alt="" draggable={false} className="cx-car-body relative block w-full select-none" onLoad={markLoaded} onError={markLoaded} />
        </div>
      </div>
    </div>
  );
}
