import { useEffect, useRef, useState } from 'react';

export type ProtectionKind = 'shield' | 'headset' | 'seal' | 'lock' | 'broadcast' | 'heart' | 'growth' | 'coin' | 'car' | 'pin' | 'check';

/**
 * Four hand-built icons that draw themselves the first time they scroll into view (strokes trace in, then a small detail
 * lands: the check, the sound waves, the sparkle, the lock clicking shut) and replay on a touch or a hover. Still, drawn,
 * for people who have switched animations off.
 */
export function ProtectionIcon({ kind, size = 'md', tone = 'soft', className = '' }: { kind: ProtectionKind; size?: 'md' | 'sm'; tone?: 'soft' | 'glass'; className?: string }) {
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
      className={`pi relative grid shrink-0 place-items-center rounded-2xl ${size === 'sm' ? 'h-11 w-11' : 'h-14 w-14'} ${tone === 'glass' ? 'bg-white/15 text-white backdrop-blur' : 'text-accent-700'} ${className}`}
    >
      {tone === 'glass' && <span aria-hidden className={`pi-halo absolute inset-0 rounded-2xl ${on ? 'pi-on' : ''}`} key={`h${run}`} />}
      <svg key={run} viewBox="0 0 48 48" className={`relative ${size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'} ${on ? 'pi-on' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
        {kind === 'broadcast' && (
          <>
            <circle className="pi-pop" cx="24" cy="26" r="3.4" fill="currentColor" stroke="none" style={{ ['--d' as string]: '0s' }} />
            <path className="pi-draw" pathLength={1} d="M18.5 20.5 a7 7 0 0 0 0 11 M29.5 20.5 a7 7 0 0 1 0 11" style={{ ['--d' as string]: '0.25s' }} />
            <path className="pi-draw pi-wave-1" pathLength={1} d="M12.5 14.5 a15 15 0 0 0 0 23 M35.5 14.5 a15 15 0 0 1 0 23" style={{ ['--d' as string]: '0.55s' }} />
          </>
        )}
        {kind === 'heart' && (
          <g className="pi-beat">
            <path className="pi-draw" pathLength={1} d="M24 41 C10 31 6 22 6 16.5 A9 9 0 0 1 24 14 A9 9 0 0 1 42 16.5 C42 22 38 31 24 41 Z" style={{ ['--d' as string]: '0s' }} />
          </g>
        )}
        {kind === 'growth' && (
          <>
            <path className="pi-draw" pathLength={1} d="M7 36 L18 25 L25 31 L40 14" style={{ ['--d' as string]: '0s' }} />
            <path className="pi-draw" pathLength={1} d="M31 14 H40 V23" style={{ ['--d' as string]: '0.7s' }} />
          </>
        )}
        {kind === 'coin' && (
          <>
            <circle className="pi-draw" pathLength={1} cx="24" cy="24" r="17" style={{ ['--d' as string]: '0s' }} />
            <path className="pi-draw" pathLength={1} d="M31 17.5 a9 9 0 1 0 0 13 M14 21.5 H27 M14 26.5 H27" strokeWidth="3" style={{ ['--d' as string]: '0.55s' }} />
          </>
        )}
        {kind === 'car' && (
          <>
            <path className="pi-draw" pathLength={1} d="M8 32 H40 V26 L36 17 H12 L8 26 Z M8 26 H40" style={{ ['--d' as string]: '0s' }} />
            <circle className="pi-pop" cx="15" cy="33" r="3.8" fill="currentColor" stroke="none" style={{ ['--d' as string]: '0.8s' }} />
            <circle className="pi-pop" cx="33" cy="33" r="3.8" fill="currentColor" stroke="none" style={{ ['--d' as string]: '0.95s' }} />
          </>
        )}
        {kind === 'pin' && (
          <>
            <path className="pi-draw" pathLength={1} d="M24 43 C14 31 11 26 11 20 A13 13 0 0 1 37 20 C37 26 34 31 24 43 Z" style={{ ['--d' as string]: '0s' }} />
            <circle className="pi-pop" cx="24" cy="20" r="4.6" fill="currentColor" stroke="none" style={{ ['--d' as string]: '0.8s' }} />
          </>
        )}
        {kind === 'check' && (
          <>
            <circle className="pi-draw" pathLength={1} cx="24" cy="24" r="17" style={{ ['--d' as string]: '0s' }} />
            <path className="pi-draw pi-check" pathLength={1} d="M16 24.5 L22 30.5 L32.5 18" strokeWidth="3.2" style={{ ['--d' as string]: '0.6s' }} />
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
