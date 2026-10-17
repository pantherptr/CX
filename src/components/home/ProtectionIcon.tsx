import { useEffect, useRef, useState } from 'react';

export type ProtectionKind = 'shield' | 'headset' | 'seal' | 'lock';

/**
 * Four hand-built icons that draw themselves the first time they scroll into view (strokes trace in, then a small detail
 * lands: the check, the sound waves, the sparkle, the lock clicking shut) and replay on a touch or a hover. Still, drawn,
 * for people who have switched animations off.
 */
export function ProtectionIcon({ kind, className = '' }: { kind: ProtectionKind; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [on, setOn] = useState(false);
  const [run, setRun] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const replay = () => setRun((n) => n + 1);
  return (
    <span
      ref={ref}
      onPointerEnter={replay}
      className={`pi relative grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-accent-050 to-[#d9f3e2] text-accent-700 shadow-[inset_0_0_0_1px_rgba(0,133,54,0.12)] ${className}`}
    >
      <span aria-hidden className={`pi-halo absolute inset-0 rounded-2xl ${on ? 'pi-on' : ''}`} key={`h${run}`} />
      <svg key={run} viewBox="0 0 48 48" className={`relative h-8 w-8 ${on ? 'pi-on' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {kind === 'shield' && (
          <>
            <path className="pi-draw" pathLength={1} d="M24 5 L39 10.5 V22 C39 32 32.5 39.5 24 43 C15.5 39.5 9 32 9 22 V10.5 Z" style={{ ['--d' as string]: '0s' }} />
            <path className="pi-draw pi-check" pathLength={1} d="M16.5 23.5 L22 29 L32 18" strokeWidth="3.2" style={{ ['--d' as string]: '0.55s' }} />
          </>
        )}
        {kind === 'headset' && (
          <>
            <path className="pi-draw" pathLength={1} d="M9 27 V23 A15 15 0 0 1 39 23 V27" style={{ ['--d' as string]: '0s' }} />
            <rect className="pi-draw" pathLength={1} x="6" y="25" width="7.5" height="12" rx="3.5" style={{ ['--d' as string]: '0.4s' }} />
            <rect className="pi-draw" pathLength={1} x="34.5" y="25" width="7.5" height="12" rx="3.5" style={{ ['--d' as string]: '0.5s' }} />
            <path className="pi-draw" pathLength={1} d="M38 37 C38 41.5 33 43 27 43" style={{ ['--d' as string]: '0.7s' }} />
            <circle className="pi-pop" cx="25" cy="43" r="2.2" fill="currentColor" stroke="none" style={{ ['--d' as string]: '1.1s' }} />
            <path className="pi-wave pi-wave-1" d="M20 20 a5.5 5.5 0 0 1 0 8" strokeWidth="2.2" />
            <path className="pi-wave pi-wave-2" d="M25 17 a10 10 0 0 1 0 14" strokeWidth="2.2" />
          </>
        )}
        {kind === 'seal' && (
          <>
            <path className="pi-draw" pathLength={1} d="M24 4 l4.2 3.4 5.3-.6 2.1 4.9 4.9 2.1-.6 5.3 L43 24 l-3.4 4.2.6 5.3-4.9 2.1-2.1 4.9-5.3-.6L24 44 l-4.2-3.4-5.3.6-2.1-4.9-4.9-2.1.6-5.3L5 24l3.4-4.2-.6-5.3 4.9-2.1 2.1-4.9 5.3.6Z" style={{ ['--d' as string]: '0s' }} />
            <path className="pi-draw pi-check" pathLength={1} d="M16 24.5 L22 30.5 L32.5 18.5" strokeWidth="3.2" style={{ ['--d' as string]: '0.6s' }} />
            <path className="pi-spark" d="M40 6 v6 M37 9 h6" strokeWidth="2" />
          </>
        )}
        {kind === 'lock' && (
          <>
            <rect className="pi-draw" pathLength={1} x="11" y="21" width="26" height="20" rx="5" style={{ ['--d' as string]: '0s' }} />
            <path className="pi-shackle" d="M16 21 V15.5 a8 8 0 0 1 16 0 V21" />
            <circle className="pi-pop" cx="24" cy="30" r="2.6" fill="currentColor" stroke="none" style={{ ['--d' as string]: '1.05s' }} />
          </>
        )}
      </svg>
    </span>
  );
}
