import { useEffect, useId, useState } from 'react';
import { CxWordmark } from './CxWordmark';

const BAT = '374,383 535,483 568,376 626,465 685,376 718,483 880,383 1100,688 972,626 894,703 794,628 625,850 457,628 355,703 278,626 148,688';

/**
 * The CX bat in polished green metal — the same treatment as the team's chrome-gold bat in SIGNAL, in the
 * site's green: a horizon band across the middle, bevelled wing planes, a bright edge, and a sheen that sweeps
 * over it every few seconds. With a registered-mark circle under it.
 */
function ChromeBat({ className = '' }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (n: string) => `${n}-${uid}`;
  return (
    <svg viewBox="140 360 970 640" aria-hidden="true" className={className} fill="none">
      <defs>
        <linearGradient id={id('chr')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2fff6" />
          <stop offset="0.10" stopColor="#b9ffd3" />
          <stop offset="0.24" stopColor="#19d160" />
          <stop offset="0.36" stopColor="#07632a" />
          <stop offset="0.44" stopColor="#02150a" />
          <stop offset="0.49" stopColor="#0b3a1a" />
          <stop offset="0.55" stopColor="#b9ffd3" />
          <stop offset="0.68" stopColor="#5dffa6" />
          <stop offset="0.80" stopColor="#0fa84a" />
          <stop offset="0.90" stopColor="#eafff1" />
          <stop offset="1" stopColor="#1fbf5c" />
        </linearGradient>
        <linearGradient id={id('wing')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#eafff1" />
          <stop offset="0.4" stopColor="#19d160" />
          <stop offset="0.7" stopColor="#0a5a28" />
          <stop offset="1" stopColor="#9bf7bb" />
        </linearGradient>
        <linearGradient id={id('sheen')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={id('clip')}><polygon points={BAT} /></clipPath>
      </defs>
      <polygon points={BAT} fill={`url(#${id('chr')})`} />
      <g clipPath={`url(#${id('clip')})`}>
        <polygon points="148,688 374,383 535,483 556,600 278,626" fill={`url(#${id('wing')})`} opacity="0.32" />
        <polygon points="1100,688 880,383 718,483 696,600 972,626" fill={`url(#${id('wing')})`} opacity="0.32" />
        <polyline points="626,465 625,850" stroke="#eafff1" strokeWidth="5" opacity="0.55" />
        <polyline points="374,383 457,628 625,850 794,628 880,383" stroke="#eafff1" strokeWidth="4" opacity="0.4" />
        {/* the sheen: a slanted band of light that crosses the bat */}
        <g className="cx-chrome-sheen">
          <rect x="-260" y="330" width="170" height="560" fill={`url(#${id('sheen')})`} transform="skewX(-22)" />
        </g>
      </g>
      <polygon points={BAT} stroke="#d8ffe6" strokeWidth="6" strokeLinejoin="miter" opacity="0.9" />
      <circle cx="625" cy="940" r="46" stroke="currentColor" strokeWidth="14" />
      <text x="625" y="961" textAnchor="middle" fontSize="62" fontWeight="800" fontFamily="Arial, Helvetica, sans-serif" fill="currentColor">R</text>
    </svg>
  );
}

const BAT_MS = 3000;
const WORD_MS = 4500;

/**
 * The logo, in a loop: the green-chrome bat (with the ® circle under it) for a few seconds, then the CX wordmark,
 * then the bat again, and so on. With "reduce motion" it stays on the wordmark.
 */
export function CxBatIntro({ className = '' }: { className?: string }) {
  const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [phase, setPhase] = useState<'bat' | 'word'>(still ? 'word' : 'bat');

  useEffect(() => {
    if (still) return;
    const id = window.setTimeout(() => setPhase((p) => (p === 'bat' ? 'word' : 'bat')), phase === 'bat' ? BAT_MS : WORD_MS);
    return () => window.clearTimeout(id);
  }, [phase, still]);

  return (
    <span className={`relative inline-grid place-items-center ${className}`}>
      {/* the wordmark always takes its place (so nothing moves); it is simply invisible while the bat shows */}
      <CxWordmark
        title="CX"
        className={`col-start-1 row-start-1 h-full w-auto text-ink transition-opacity duration-500 ${phase === 'word' ? 'opacity-100' : 'opacity-0'}`}
      />
      <ChromeBat
        className={`col-start-1 row-start-1 h-full w-auto text-ink transition-[opacity,transform] duration-500 ${phase === 'bat' ? 'scale-100 opacity-100' : 'pointer-events-none scale-90 opacity-0'}`}
      />
    </span>
  );
}
