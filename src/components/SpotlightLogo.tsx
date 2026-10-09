import { useId } from 'react';

/** The Signal Spotlight mark: a lens ringed like a stage light, with a four-point
 *  star caught in the beam and one small spark escaping up and to the right.
 *  Drawn as SVG so it stays sharp at any size and takes the surrounding text
 *  colour (`currentColor`) — only the spark and the beam keep CX green.
 *
 *  `mark`  — the symbol alone (header icons, chips)
 *  `lockup` — the symbol with the SPOTLIGHT wordmark and "BY CX" beneath it */
export function SpotlightLogo({
  size = 28,
  variant = 'mark',
  className = '',
}: {
  size?: number;
  variant?: 'mark' | 'lockup';
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const mark = (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id={`${uid}beam`} x1="6" y1="58" x2="58" y2="6" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00d447" stopOpacity="0" />
          <stop offset="0.55" stopColor="#00d447" stopOpacity="0.9" />
          <stop offset="1" stopColor="#7dffa5" />
        </linearGradient>
        <radialGradient id={`${uid}glow`} cx="32" cy="32" r="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00d447" stopOpacity="0.28" />
          <stop offset="1" stopColor="#00d447" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* soft pool of light behind the star */}
      <circle cx="32" cy="32" r="30" fill={`url(#${uid}glow)`} />
      {/* the lens: a ring broken twice, like an aperture */}
      <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="60 12 60 31" transform="rotate(-62 32 32)" />
      {/* the beam crossing the lens, bottom-left to top-right */}
      <path d="M8 56 L28 36" stroke={`url(#${uid}beam)`} strokeWidth="2.6" strokeLinecap="round" />
      {/* the star in the light */}
      <path
        d="M32 13 C33.4 24.6 39.4 30.6 51 32 C39.4 33.4 33.4 39.4 32 51 C30.6 39.4 24.6 33.4 13 32 C24.6 30.6 30.6 24.6 32 13Z"
        fill="currentColor"
      />
      {/* the spark that got away */}
      <path d="M50 11 C50.5 14.5 52.5 16.5 56 17 C52.5 17.5 50.5 19.5 50 23 C49.5 19.5 47.5 17.5 44 17 C47.5 16.5 49.5 14.5 50 11Z" fill="#00d447" />
    </svg>
  );

  if (variant === 'mark') return <span className={`inline-flex ${className}`}>{mark}</span>;

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
