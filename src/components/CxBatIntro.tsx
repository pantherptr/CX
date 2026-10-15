import { useEffect, useState } from 'react';
import { CxWordmark } from './CxWordmark';

const SEEN = 'cx-logo-intro';
const HOLD_MS = 2600;

/** The bat of the CX mark on its own (the artwork's corner points), with a registered-mark circle under it. */
function BatRegistered({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="140 360 970 640" aria-hidden="true" className={className} fill="none">
      <polygon
        className="fill-[#00d447]"
        points="374,383 535,483 568,376 626,465 685,376 718,483 880,383 1100,688 972,626 894,703 794,628 625,850 457,628 355,703 278,626 148,688"
      />
      <circle cx="625" cy="940" r="46" stroke="currentColor" strokeWidth="14" />
      <text x="625" y="961" textAnchor="middle" fontSize="62" fontWeight="800" fontFamily="Arial, Helvetica, sans-serif" fill="currentColor">R</text>
    </svg>
  );
}

/**
 * The header logo: when the site opens, the green bat appears alone (with the ® circle under it) for a couple of
 * seconds, then it gives way to the CX wordmark — which stays. Once per browser session (and not at all with
 * "reduce motion"), after the start screen has gone.
 */
export function CxBatIntro({ className = '' }: { className?: string }) {
  const [phase, setPhase] = useState<'bat' | 'word'>(() => {
    try {
      if (sessionStorage.getItem(SEEN)) return 'word';
    } catch { /* storage is optional */ }
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 'word';
    return 'bat';
  });

  useEffect(() => {
    if (phase !== 'bat') return;
    let hold = 0;
    let waited = 0;
    // the start screen is "role=status, Loading": count the seconds only once it has gone (never wait more than 7 s)
    const poll = window.setInterval(() => {
      waited += 150;
      const splash = document.querySelector('[role="status"][aria-label="Loading"]');
      if (!splash || waited > 7000) {
        window.clearInterval(poll);
        hold = window.setTimeout(() => {
          try { sessionStorage.setItem(SEEN, '1'); } catch { /* ignore */ }
          setPhase('word');
        }, HOLD_MS);
      }
    }, 150);
    return () => { window.clearInterval(poll); window.clearTimeout(hold); };
  }, [phase]);

  return (
    <span className={`relative inline-grid place-items-center ${className}`}>
      {/* the wordmark always takes its place (so nothing moves); it is simply invisible while the bat shows */}
      <CxWordmark
        title="CX"
        className={`col-start-1 row-start-1 h-full w-auto text-ink transition-opacity duration-500 ${phase === 'word' ? 'opacity-100' : 'opacity-0'}`}
      />
      <BatRegistered
        className={`col-start-1 row-start-1 h-full w-auto text-ink transition-[opacity,transform] duration-500 ${phase === 'bat' ? 'scale-100 opacity-100' : 'pointer-events-none scale-90 opacity-0'}`}
      />
    </span>
  );
}
