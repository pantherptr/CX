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
 *  the pre-paint background in `index.html`), a soft green bloom breathing
 *  behind the CX mark, the mark unveiled left-to-right out of a blur with a
 *  light then sweeping through its silhouette, and a hairline of green light
 *  drawing out from the centre underneath. No card, no numbers, no text.
 *  `hiding` fades and eases it out into the real app.
 */
export function PremiumInitialLoader({ hiding }: { hiding: boolean }) {
  return (
    <div
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
      <div className="cx-reveal relative" style={{ width: 'clamp(190px, 62vw, 300px)', aspectRatio: '1633 / 318' }}>
        <img src="/cx-logo-main.png" alt="" draggable={false} className="absolute inset-0 h-full w-full select-none object-contain" />
        <span
          aria-hidden="true"
          className="signal-sweep-mask pointer-events-none absolute inset-0"
          style={{ WebkitMaskImage: 'url(/cx-logo-main.png)', maskImage: 'url(/cx-logo-main.png)' }}
        >
          <span className="signal-sweep-bar absolute" style={{ animationDelay: '0.9s' }} />
        </span>
      </div>
      <div className="relative mt-10 h-px w-[min(46vw,180px)]">
        <span className="cx-line absolute inset-0" style={{ background: 'linear-gradient(90deg, transparent, #00d447 50%, transparent)' }} />
        <span className="cx-line-glow absolute left-0 top-1/2 h-[5px] w-[5px] -translate-y-1/2 rounded-full bg-accent-bright" />
      </div>
    </div>
  );
}
