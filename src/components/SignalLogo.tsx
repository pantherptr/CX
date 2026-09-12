/** The SIGNAL crest — CX Rent's one official brand asset, used everywhere
 *  at whatever size a surface needs. `signal-icon.png` is a tight crop of
 *  just the icon portion (the "CX" glyph merged with radiating signal
 *  arcs) cut from the full lockup at `/SIGNAL.png`, which also carries
 *  the "SIGNAL" wordmark and tagline baked in below the icon — every
 *  surface using this component already sets its own "CX SIGNAL" text
 *  next to it, so that text is cropped out here rather than duplicated.
 *  Same asset at every call site — the bottom nav and the header must
 *  read as the same mark, not two different logos.
 *
 *  Every instance carries the "live signal" effect permanently — a soft
 *  highlight sweeping through the logo's own silhouette (masked to its
 *  alpha channel, so it never spills outside the metal), blended
 *  additively so it brightens the existing chrome/green art instead of
 *  painting over it. It's baked in here rather than left as an opt-in
 *  prop some call sites remember and others forget, so the mark reads
 *  identically alive wherever it appears — header, nav, sign-in gate,
 *  empty states — with no touch or active state required. Pure CSS
 *  `transform` animation (see `.signal-sweep-bar` in index.css): no
 *  per-frame JS, and the keyframe's start/end are identical so the loop
 *  never visibly jumps.
 *
 *  Width is computed explicitly from the source's real aspect ratio, and
 *  `max-width` is explicitly cleared — Tailwind's preflight resets every
 *  `<img>` to `max-width: 100%` (the standard "never overflow your
 *  container" default), and `max-width` always caps the final size no
 *  matter how specific the competing `width` declaration is. Inside a
 *  fixed-width flex/grid slot (the bottom nav's icon column, for one),
 *  that silently caps the logo at the slot's own width regardless of
 *  what `width` says, squashing it into a tall sliver that
 *  `object-contain` then shrinks further to fit. */
const ASPECT_RATIO = 982 / 637; // signal-icon.png's real width/height

export function SignalLogo({ size = 24, className = '' }: { size?: number; className?: string }) {
  const width = size * ASPECT_RATIO;
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ height: size, width }}>
      <img
        src="/signal-icon.png"
        alt=""
        className="absolute inset-0 h-full w-full object-contain"
        style={{ maxWidth: 'none' }}
      />
      <span
        aria-hidden="true"
        className="signal-sweep-mask pointer-events-none absolute inset-0"
        style={{ WebkitMaskImage: 'url(/signal-icon.png)', maskImage: 'url(/signal-icon.png)' }}
      >
        <span className="signal-sweep-bar absolute" />
      </span>
    </span>
  );
}
