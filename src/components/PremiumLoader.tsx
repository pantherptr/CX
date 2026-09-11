/**
 * The premium loading system — one reusable "orbit" animation
 * (`SupercarOrbit`) driving every loading state in the app:
 *
 *   `PremiumPageLoader`    — compact, dropped into any page/section
 *                            that's waiting on data.
 *   `PremiumInitialLoader` — the full-screen loading overlay shown once
 *                            per session while the app first boots, and
 *                            the shared Suspense fallback for route
 *                            chunks. Bare: a pure white screen with the
 *                            animation at its center, nothing else drawn
 *                            around it — no card, no box, no image asset.
 *
 * Everything here is original, built in code: a thin circular track (two
 * stacked masked-ring divs — a static light-gray base plus a rotating
 * `conic-gradient` arc, giving the "mostly gray with a travelling green
 * section" progress read the brief asks for, with a true angular fade
 * built into the gradient itself rather than faked) and a small top-down
 * car (`TopDownCar`, pure SVG) riding it. The car isn't just rotated
 * around the circle — it sits at a fixed radius from the ring's own
 * center and is carried by the SAME `rotate()` transform the arc uses,
 * so its position is exactly on the circumference at every angle and its
 * own rotation IS the path's tangent at that point (a circle's tangent
 * at angle θ is θ+90°, which is exactly what "no counter-rotation" on a
 * sprite drawn nose-first along the rotation's own axis produces for
 * free — see `.orbit-car-sprite`). Sizing is entirely CSS (container
 * query units), so the same markup scales from a 60px inline spinner to
 * a full-viewport splash with no JS resize listener, no per-frame React
 * state, and full `prefers-reduced-motion` support.
 */

/** A small top-down car — an original CX Rent silhouette, not any real
 *  manufacturer's shape: a low, wide-cabin body in a cool silver/
 *  graphite gradient, dark tinted glass front and rear, a roof reflection
 *  streak, a soft blurred contact shadow, and a red tail light / green
 *  nose marker for orientation at a glance. Drawn facing +x (nose to the
 *  right) so that, parked at the top of the ring with no extra rotation,
 *  it already points the correct tangential direction for clockwise
 *  travel — see `.orbit-car-sprite`. Each wheel gets a spinning spoke
 *  mark (`.loader-wheel`) so the wheels visibly turn while driving. */
function TopDownCar() {
  const wheels: [number, number][] = [
    [23, 3],
    [77, 3],
    [23, 51],
    [77, 51],
  ];
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 54" fill="none" role="img" aria-label="">
      <defs>
        <linearGradient id="topCarBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f2f4f6" />
          <stop offset="26%" stopColor="#b3b9c0" />
          <stop offset="52%" stopColor="#565d67" />
          <stop offset="100%" stopColor="#1c1f24" />
        </linearGradient>
        <linearGradient id="topCarRoof" x1="0" y1="0" x2="1" y2="0.2">
          <stop offset="0%" stopColor="#666e79" />
          <stop offset="55%" stopColor="#2c3138" />
          <stop offset="100%" stopColor="#15171b" />
        </linearGradient>
        <linearGradient id="topCarSheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="topCarShadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Soft contact shadow, slightly offset — reads as the car sitting
          just above the page rather than pasted flat onto it. */}
      <ellipse cx="51" cy="30" rx="46" ry="22" fill="url(#topCarShadow)" />

      {/* Wheels — drawn first so the body overlaps their inner edge */}
      {wheels.map(([cx, cy], i) => (
        <g key={`${cx}-${cy}`}>
          <rect x={cx - 5.2} y={cy - 3.2} width="10.4" height="6.4" rx="1.8" fill="#131417" />
          <rect x={cx - 5.2} y={cy - 3.2} width="10.4" height="6.4" rx="1.8" fill="none" stroke="#3a3d43" strokeWidth="0.5" />
          <g className="loader-wheel" style={{ transformOrigin: `${cx}px ${cy}px`, animationDelay: `${i * -0.09}s` }}>
            <line x1={cx - 3.4} y1={cy} x2={cx + 3.4} y2={cy} stroke="#8a9099" strokeWidth="1.1" opacity="0.9" />
            <line x1={cx} y1={cy - 2.4} x2={cx} y2={cy + 2.4} stroke="#8a9099" strokeWidth="0.7" opacity="0.55" />
          </g>
        </g>
      ))}

      {/* Body */}
      <rect x="5.5" y="8" width="89" height="38" rx="16" fill="url(#topCarBody)" />
      <rect x="6" y="8.5" width="88" height="37" rx="15.5" fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="0.6" />

      {/* Cabin / roof, with a diagonal reflection streak for "realistic
          reflections" without needing a real environment map. */}
      <rect x="32" y="13" width="37" height="28" rx="10" fill="url(#topCarRoof)" />
      <path d="M36 15 L46 15 L38 39 L32 39 Z" fill="url(#topCarSheen)" opacity="0.5" />
      <line x1="50.5" y1="14" x2="50.5" y2="40" stroke="#8b9099" strokeWidth="0.5" opacity="0.4" />

      {/* Rear window (left, tail end) */}
      <path d="M11 15 Q11 11 17 11 L29 13 L29 41 L17 43 Q11 43 11 39 Z" fill="#0e1013" opacity="0.68" />
      {/* Windshield (right, nose end) */}
      <path d="M89 15 Q89 11 83 11 L71 13 L71 41 L83 43 Q89 43 89 39 Z" fill="#0e1013" opacity="0.78" />
      <path d="M83 14 L86 14.6 L83.5 21 L80.5 20.4 Z" fill="url(#topCarSheen)" opacity="0.4" />

      {/* Tail light — rear, brand red */}
      <rect x="5.8" y="19" width="2.6" height="16" rx="1.3" fill="#ef4444" />
      <rect x="5.8" y="19" width="2.6" height="16" rx="1.3" fill="none" stroke="#fca5a5" strokeOpacity="0.5" strokeWidth="0.4" />
      {/* Front marker light — nose, brand green */}
      <rect x="91.6" y="19" width="2.6" height="16" rx="1.3" fill="#00d447" />
      <rect x="91.6" y="19" width="2.6" height="16" rx="1.3" fill="none" stroke="#baffd4" strokeOpacity="0.5" strokeWidth="0.4" />
    </svg>
  );
}

/** The reusable orbit: a static light-gray base ring plus a rotating
 *  `conic-gradient` arc (masked into a thin ring via a radial-gradient
 *  mask — cheaper and crisper than an SVG stroke at these sizes), with
 *  `TopDownCar` riding it at the ring's own radius via the SAME shared
 *  `rotate()` keyframe (see `.orbit-arc`/`.orbit-car-pivot` in
 *  index.css) — the car and the arc's bright leading edge never drift
 *  apart because they're driven by one animation, not two coordinated
 *  ones. Sizing is entirely CSS: this div is a container-query context
 *  (`.orbit-stage`), and the ring/car's own thickness, radius and size
 *  are expressed in `cqw` (percent of its OWN rendered width) so the
 *  identical markup scales correctly whether given a fixed pixel `size`
 *  (the small inline call sites) or a fluid `min(Nvmin, Npx)` wrapper
 *  class (the full-screen one) — no JS resize handling either way.
 *  `duration` alone is enough to make one instance feel like an
 *  unhurried loop and another feel like a brisk in-page spinner.
 *  `completing` cross-fades the travelling arc into one fully-lit ring
 *  and holds it there — the "lap complete" moment right before the
 *  loader itself fades away. */
export function SupercarOrbit({
  size,
  duration = 4.2,
  className = '',
  completing = false,
}: {
  /** Fixed width in px. Omit to let the element fill its parent's width
   *  (e.g. a responsive wrapper class) instead. */
  size?: number;
  duration?: number;
  className?: string;
  /** Freezes the travel and lights the ring fully — play this for a
   *  couple hundred ms right before unmounting/hiding the loader. */
  completing?: boolean;
}) {
  return (
    <div
      className={`orbit-stage relative ${completing ? 'orbit-stage--complete' : ''} ${className}`}
      style={{ width: size, aspectRatio: '1 / 1', ['--orbit-duration' as string]: `${duration}s` }}
    >
      <div className="orbit-track" />
      <div className="orbit-glow" />
      <div className="orbit-arc" />
      <div className="orbit-complete-ring" />
      <div className="orbit-car-pivot">
        <div className="orbit-car-sprite">
          <TopDownCar />
        </div>
      </div>
    </div>
  );
}

/** Drop-in replacement for the old bare `CarLoader` spinner — the
 *  compact half of the premium loading system, used both as the
 *  Suspense fallback for lazy-loaded routes and inside any page/panel
 *  that's waiting on its own data. Same `size` contract as before, so
 *  every existing call site only needed its import/tag renamed, not
 *  restructured. No visible caption — `label` only reaches screen
 *  readers now; the animation itself is the entire signal. */
export function PremiumPageLoader({ size = 90, label = 'Loading' }: { size?: number; label?: string }) {
  return (
    <div role="status" aria-label={label}>
      <SupercarOrbit size={size} duration={3.1} />
    </div>
  );
}

/** Full-screen loading overlay — shown once per session while the app
 *  boots, and reused as the shared Suspense fallback while a route
 *  chunk loads. A pure white field covering the entire viewport above
 *  everything else (navbar, footer, page content, the Empire game shell,
 *  any background) with the ring animation large and centered — no card
 *  around it, no text, no progress readout, no controls. Responsive by
 *  pure CSS: `min(40vmin, 320px)` keeps it compact and centered on
 *  desktop, comfortably margined on phones, and proportionate on
 *  tablets, with no resize listener. `hiding` plays the ring's own
 *  "lap complete" flourish alongside the wrapper's fade, so the loader
 *  never just vanishes mid-travel. */
export function PremiumInitialLoader({ hiding }: { hiding: boolean }) {
  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center bg-white transition-opacity duration-500 ${
        hiding ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
      role="status"
      aria-label="Loading"
    >
      <div className="animate-scale-in" style={{ width: 'min(40vmin, 320px)' }}>
        <SupercarOrbit duration={5.2} completing={hiding} />
      </div>
    </div>
  );
}
