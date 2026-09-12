/** The SIGNAL wordmark lockup (`/SIGNALBAR.PNG`) — used only in the top
 *  SIGNAL header, where it stands in for the "SIGNAL" text entirely (see
 *  `alt` below). Distinct from `SignalLogo` (the compact icon-only crop
 *  used in the bottom nav and empty states) — this is the full wide
 *  banner lockup, a different asset with a very different aspect ratio,
 *  so it gets its own component rather than a variant prop.
 *
 *  Carries its own "live" effect — deliberately NOT the bottom nav's
 *  green sweep (see `.signal-sweep-bar` in index.css), which is a fast,
 *  obvious, 3.4s-looping brand moment meant to be seen. This one is the
 *  opposite: two hairline reflective glints (`.signalbar-glint-a/b` in
 *  index.css) on independent ~8-11s cycles that spend the vast majority
 *  of their time fully invisible and still, and only travel across the
 *  mark once, briefly and at low opacity, before going quiet again —
 *  meant to read as "this is alive" only on close attention, not as a
 *  running animation.
 *
 *  `size` is the PREFERRED (desktop/wide-header) width in px — actual
 *  rendered width is `min(size * ASPECT_RATIO, 100% of the flex/grid
 *  slot)`. The header this lives in mirrors the icon group on the
 *  opposite side so the wordmark sits at the true visual center (see
 *  SignalFeedHeader.tsx); at the narrowest supported phone widths that
 *  mirror plus real icons leaves very little horizontal room, so rather
 *  than overflow the header this shrinks gracefully — `aspectRatio`
 *  ties height to width so it scales down as one proportional unit
 *  (never distorts, never letterboxes inside its own box) instead of
 *  clipping or forcing a horizontal scrollbar. */
const ASPECT_RATIO = 1536 / 245; // SIGNALBAR.PNG's real width/height

export function SignalBarLogo({ size = 22, className = '' }: { size?: number; className?: string }) {
  const width = size * ASPECT_RATIO;
  return (
    <span
      className={`relative inline-block min-w-0 shrink ${className}`}
      style={{ width, maxWidth: '100%', aspectRatio: `${ASPECT_RATIO}` }}
    >
      <img
        src="/SIGNALBAR.PNG"
        alt="SIGNAL"
        className="absolute inset-0 h-full w-full object-contain"
        style={{ maxWidth: 'none' }}
      />
      <span
        aria-hidden="true"
        className="signalbar-glint-mask pointer-events-none absolute inset-0"
        style={{ WebkitMaskImage: 'url(/SIGNALBAR.PNG)', maskImage: 'url(/SIGNALBAR.PNG)' }}
      >
        <span className="signalbar-glint signalbar-glint-a absolute inset-0" />
        <span className="signalbar-glint signalbar-glint-b absolute inset-0" />
      </span>
    </span>
  );
}
