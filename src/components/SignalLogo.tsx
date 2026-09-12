/** The SIGNAL crest — CX Rent's official brand asset, in two renditions
 *  picked automatically by size:
 *
 *  - `size >= SMALL_ICON_THRESHOLD`: the real official artwork, cropped
 *    from the full lockup at `/SIGNAL.png` down to just its icon portion
 *    (`/signal-icon.png` — the "CX" glyph merged with radiating signal
 *    arcs, chrome-bevelled with a green glow). Every surface using this
 *    component already sets its own "CX SIGNAL" text next to it, so the
 *    wordmark/tagline baked into the full lockup is deliberately cropped
 *    out rather than duplicated.
 *  - below that: a bold, simplified inline-SVG version of the same
 *    broadcasting-mast-and-arcs motif, in the same black-to-green
 *    gradient. The official art's fine chrome bevels and thin radiating
 *    arcs turn into an illegible smudge once scaled down to a ~24px nav
 *    icon — this is the same "simplified mark for small sizes, detailed
 *    mark for large ones" split any real brand system uses (a favicon
 *    vs. a hero logo), not a mismatched fallback. */
const SMALL_ICON_THRESHOLD = 40;

function SignalMarkSimplified({ size, className }: { size: number; className: string }) {
  return (
    <svg viewBox="0 0 100 100" className={`shrink-0 ${className}`} style={{ height: size, width: size }} aria-hidden="true">
      <defs>
        <linearGradient id="signal-mark-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00e850" />
          <stop offset="55%" stopColor="#00d447" />
          <stop offset="100%" stopColor="#005e23" />
        </linearGradient>
      </defs>
      {/* Broadcasting mast */}
      <rect x="46.5" y="43" width="7" height="34" rx="3.5" fill="url(#signal-mark-gradient)" />
      <rect x="35" y="76" width="30" height="7" rx="3.5" fill="url(#signal-mark-gradient)" />
      <circle cx="50" cy="38" r="7.5" fill="url(#signal-mark-gradient)" />
      {/* Signal arcs, radiating outward — three nested, thinning with distance */}
      <path d="M 41.0,27.3 A 14,14 0 0 1 59.0,27.3" fill="none" stroke="url(#signal-mark-gradient)" strokeWidth="5.5" strokeLinecap="round" />
      <path d="M 34.6,19.6 A 24,24 0 0 1 65.4,19.6" fill="none" stroke="url(#signal-mark-gradient)" strokeWidth="5" strokeLinecap="round" opacity="0.82" />
      <path d="M 28.1,12.0 A 34,34 0 0 1 71.9,12.0" fill="none" stroke="url(#signal-mark-gradient)" strokeWidth="4.5" strokeLinecap="round" opacity="0.62" />
    </svg>
  );
}

export function SignalLogo({ size = 24, className = '' }: { size?: number; className?: string }) {
  if (size < SMALL_ICON_THRESHOLD) {
    return <SignalMarkSimplified size={size} className={className} />;
  }
  return (
    <img
      src="/signal-icon.png"
      alt=""
      className={`shrink-0 object-contain ${className}`}
      style={{ height: size, width: 'auto' }}
    />
  );
}
