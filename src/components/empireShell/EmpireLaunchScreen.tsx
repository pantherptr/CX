import { useEffect, useRef, useState } from 'react';
import { SupercarOrbit } from '../PremiumLoader';
import { EmpireLogo } from '../EmpireLogo';

const FLAVOR_LINES = [
  'Entering the city…',
  'Preparing your empire…',
  'Loading the market…',
  'Syncing your garage…',
  'Almost there…',
];

/** Holds a `ready` boolean true only once BOTH the real readiness signal
 *  has flipped true AND a minimum visible duration has elapsed — the
 *  same "don't flash, don't fake-idle" floor App.tsx's own useSplash()
 *  uses for the app's first-load splash, applied here to Empire's launch
 *  screen instead of `document.readyState`. */
export function useEmpireLaunchGate(dataReady: boolean, minMs = 900): boolean {
  const [settled, setSettled] = useState(false);
  const startRef = useRef<number | null>(null);
  if (startRef.current === null) startRef.current = performance.now();

  useEffect(() => {
    if (!dataReady || settled) return;
    const elapsed = performance.now() - (startRef.current ?? performance.now());
    const wait = Math.max(0, minMs - elapsed);
    const t = window.setTimeout(() => setSettled(true), wait);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady, minMs]);

  return dataReady && settled;
}

/** Empire's cinematic entry screen — shown while game data is loading,
 *  in place of the site's generic PremiumPageLoader. Same noir vignette
 *  + SupercarOrbit recipe as the app's own boot splash (PremiumInitialLoader
 *  in PremiumLoader.tsx), so it feels like the same premium loading
 *  language, with a REAL progress bar: readyCount/totalCount across the
 *  actual data the game needs, not a fabricated percentage. */
export function EmpireLaunchScreen({ readyCount, totalCount }: { readyCount: number; totalCount: number }) {
  const pct = Math.round((Math.max(0, Math.min(readyCount, totalCount)) / totalCount) * 100);
  const flavor = FLAVOR_LINES[Math.min(readyCount, FLAVOR_LINES.length - 1)];

  return (
    <div className="flex flex-1 flex-col items-center justify-center py-20" role="status" aria-label="Loading CX City Empire">
      <div className="relative animate-scale-in">
        <SupercarOrbit size={200} duration={5.4} />
      </div>

      <EmpireLogo size={40} className="relative mt-2 opacity-95 animate-fade-up" />
      <p className="relative mt-2 font-display text-lead font-semibold tracking-wide text-on-noir animate-fade-up" style={{ animationDelay: '80ms' }}>
        CX CITY EMPIRE
      </p>

      <div className="relative mt-7 flex flex-col items-center gap-2 animate-fade-in" style={{ animationDelay: '240ms' }}>
        <p className="text-nano font-bold uppercase tracking-[0.28em] text-accent-bright/80">{flavor}</p>
        <div className="h-[3px] w-52 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-accent-bright transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
