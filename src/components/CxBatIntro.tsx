import { useEffect, useId, useState } from 'react';
import { CxWordmark } from './CxWordmark';

const BAT = '374,383 535,483 568,376 626,465 685,376 718,483 880,383 1100,688 972,626 894,703 794,628 625,850 457,628 355,703 278,626 148,688';

/**
 * The CX bat in polished green metal — the same treatment as the team's chrome-gold bat in SIGNAL, in the
 * site's green: bevelled wing planes with three light ridge lines, a bright green edge (no white, no black), and a sheen that sweeps
 * over it every few seconds. With a registered-mark circle under it.
 */
function ChromeBat({ className = '' }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (n: string) => `${n}-${uid}`;
  return (
    <svg viewBox="140 360 1110 500" aria-hidden="true" className={className} fill="none">
      <defs>
        <linearGradient id={id('chr')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5af59a" />
          <stop offset="0.3" stopColor="#12d85a" />
          <stop offset="0.5" stopColor="#0fb84a" />
          <stop offset="0.7" stopColor="#2fe673" />
          <stop offset="1" stopColor="#0fc050" />
        </linearGradient>
        <linearGradient id={id('wing')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7dfab0" />
          <stop offset="0.5" stopColor="#12d85a" />
          <stop offset="1" stopColor="#0fb84a" />
        </linearGradient>
        <linearGradient id={id('sheen')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8dffbb" stopOpacity="0" />
          <stop offset="0.5" stopColor="#8dffbb" stopOpacity="0.7" />
          <stop offset="1" stopColor="#8dffbb" stopOpacity="0" />
        </linearGradient>
        <clipPath id={id('clip')}><polygon points={BAT} /></clipPath>
      </defs>
      <polygon points={BAT} fill={`url(#${id('chr')})`} />
      <g clipPath={`url(#${id('clip')})`}>
        <polygon points="148,688 374,383 535,483 556,600 278,626" fill={`url(#${id('wing')})`} opacity="0.5" />
        <polygon points="1100,688 880,383 718,483 696,600 972,626" fill={`url(#${id('wing')})`} opacity="0.5" />
        <polyline points="626,465 625,850" stroke="#7dfab0" strokeWidth="6" opacity="0.9" />
        <polyline points="374,383 457,628 625,850 794,628 880,383" stroke="#7dfab0" strokeWidth="5" opacity="0.8" />
        {/* the sheen: a slanted band of light that crosses the bat */}
        <g className="cx-chrome-sheen">
          <rect x="-260" y="330" width="170" height="560" fill={`url(#${id('sheen')})`} transform="skewX(-22)" />
        </g>
      </g>
      <polygon points={BAT} stroke="#5af59a" strokeWidth="6" strokeLinejoin="miter" />
      <circle cx="1180" cy="700" r="46" stroke="currentColor" strokeWidth="14" />
      <text x="1180" y="721" textAnchor="middle" fontSize="62" fontWeight="800" fontFamily="Arial, Helvetica, sans-serif" fill="currentColor">R</text>
    </svg>
  );
}

const BAT_MS = 3000;
const WORD_MS = 4500;

/**
 * The logo, in a loop: the green-chrome bat (with the ® circle beside it) for a few seconds, then the CX wordmark,
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
