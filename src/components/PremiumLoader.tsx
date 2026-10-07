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
 *  first boots. The off-white page colour (so there is no colour jump from
 *  the native launch screen or the pre-paint background in `index.html`),
 *  the CX mark centred with a light sweeping through its own silhouette,
 *  and a short green bar gliding under it. Nothing else: no card, no
 *  numbers. `hiding` fades and eases it out into the real app.
 */
export function PremiumInitialLoader({ hiding }: { hiding: boolean }) {
  return (
    <div
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center bg-bg transition-[opacity,transform] duration-500 ease-out ${
        hiding ? 'pointer-events-none scale-[1.015] opacity-0' : 'opacity-100'
      }`}
      role="status"
      aria-label="Loading"
    >
      <div className="cx-load-in relative" style={{ width: 'clamp(160px, 52vw, 240px)', aspectRatio: '1633 / 318' }}>
        <img src="/cx-logo-main.png" alt="" draggable={false} className="absolute inset-0 h-full w-full select-none object-contain" />
        <span
          aria-hidden="true"
          className="signal-sweep-mask pointer-events-none absolute inset-0"
          style={{ WebkitMaskImage: 'url(/cx-logo-main.png)', maskImage: 'url(/cx-logo-main.png)' }}
        >
          <span className="signal-sweep-bar absolute" />
        </span>
      </div>
      <div className="cx-load-in mt-9 h-[3px] w-24 overflow-hidden rounded-full bg-ink/10" style={{ animationDelay: '0.12s' }}>
        <span className="cx-load-bar block h-full w-1/2 rounded-full bg-accent-bright" />
      </div>
    </div>
  );
}
