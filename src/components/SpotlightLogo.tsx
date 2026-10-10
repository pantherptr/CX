/** The Signal Spotlight mark: the CX bat on a stage, in a green spotlight (public/brand/spotlight-logo.webp).
 *  It is a picture on black, so it always sits in a softly rounded square — like an app icon — and
 *  reads the same on light and dark surfaces.
 *
 *  `mark`   — the symbol alone (header icons, chips, badges)
 *  `lockup` — the symbol with the SPOTLIGHT wordmark and "BY CX" beside it */
export function SpotlightLogo({
  size = 28,
  variant = 'mark',
  className = '',
}: {
  size?: number;
  variant?: 'mark' | 'lockup';
  className?: string;
}) {
  const mark = (
    <img
      src="/brand/spotlight-logo.webp"
      alt=""
      aria-hidden="true"
      draggable={false}
      width={size}
      height={size}
      className="shrink-0 select-none object-cover shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
      style={{ width: size, height: size, borderRadius: '22%' }}
    />
  );

  if (variant === 'mark') return <span className={`inline-flex shrink-0 ${className}`}>{mark}</span>;

  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      {mark}
      <span className="flex flex-col leading-none">
        <span className="font-display font-semibold uppercase tracking-[0.34em]" style={{ fontSize: size * 0.5 }}>Spotlight</span>
        <span className="mt-1.5 font-semibold uppercase tracking-[0.5em] text-[#00a838]" style={{ fontSize: size * 0.27 }}>by CX</span>
      </span>
    </span>
  );
}
