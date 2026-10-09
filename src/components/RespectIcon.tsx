import { useEffect, useId } from 'react';
import { motion, useAnimation, useReducedMotion } from 'motion/react';

/** The Respect reaction: a hand pointing right — index and middle fingers out,
 *  thumb up, ring and little fingers curled — with a small racing cuff at the
 *  wrist. Idle it is a graphite outline; active it is CX green with a thin
 *  chrome edge and one small metallic highlight. When `playKey` changes it
 *  gives a 200ms press (0.92 → 1.06 → 1) and one faint green ring that fades.
 *  Original drawing for CX. Under reduced motion nothing moves. */
export function RespectIcon({
  size = 21,
  filled = false,
  playKey = 0,
  className = '',
}: {
  size?: number;
  filled?: boolean;
  playKey?: number;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const controls = useAnimation();
  const ring = useAnimation();
  const reduced = useReducedMotion();

  useEffect(() => {
    if (playKey > 0 && !reduced) {
      void controls.start({ scale: [0.92, 1.06, 1], transition: { duration: 0.2, ease: 'easeOut' } });
      void ring.start({ opacity: [0.35, 0], scale: [0.7, 1.7], transition: { duration: 0.45, ease: 'easeOut' } });
    }
  }, [playKey, reduced, controls, ring]);

  const graphite = '#3d4349';
  const HAND =
    'M5.5 10H7V5.7a1.5 1.5 0 0 1 3 0V8.7h10.6a1.35 1.35 0 0 1 0 2.7H20a1.35 1.35 0 0 1 0 2.7h-4.6a1.4 1.4 0 0 1 0 2.8h-.9a1.3 1.3 0 0 1 0 2.5H8.5a3 3 0 0 1-3-3Z';

  return (
    <span className={`inline-flex items-center justify-center ${className}`} aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 -1 24 24" className="overflow-visible">
        <defs>
          <linearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#12e254" />
            <stop offset="1" stopColor="#00a63a" />
          </linearGradient>
          <linearGradient id={`${uid}c`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f2f5f7" />
            <stop offset="0.5" stopColor="#aab2b9" />
            <stop offset="1" stopColor="#e6eaed" />
          </linearGradient>
        </defs>
        <motion.circle
          cx="12" cy="11" r="9" fill="none" stroke="var(--color-accent-bright)" strokeWidth="1.2"
          initial={{ opacity: 0 }} animate={ring} style={{ originX: 0.5, originY: 0.5 }}
        />
        <motion.g animate={controls} initial={false} style={{ originX: 0.5, originY: 0.5 }} strokeLinecap="round" strokeLinejoin="round">
          {filled ? (
            <>
              <rect x="1.5" y="9.2" width="4" height="9.8" rx="1" fill="#00762c" stroke={`url(#${uid}c)`} strokeWidth="0.7" />
              <path d={HAND} fill={`url(#${uid}g)`} stroke={`url(#${uid}c)`} strokeWidth="0.7" />
              <path d="M11 11.4h9M11.5 14.1h8M11.5 16.9h2.5M7 10v1" stroke="#00762c" strokeWidth="0.6" opacity="0.55" fill="none" />
              <path d="M11.5 9.5h7.5" stroke="#fff" strokeWidth="0.7" opacity="0.6" fill="none" />
              <path d="M2.9 10.4v7.2M4.1 10.4v7.2" stroke={`url(#${uid}c)`} strokeWidth="0.6" fill="none" />
            </>
          ) : (
            <>
              <rect x="1.5" y="9.2" width="4" height="9.8" rx="1" fill="none" stroke={graphite} strokeWidth="1.4" />
              <path d={HAND} fill="none" stroke={graphite} strokeWidth="1.4" />
              <path d="M11 11.4h9M11.5 14.1h8M11.5 16.9h2.5" stroke={graphite} strokeWidth="1.1" fill="none" />
              <path d="M2.9 11v6M4.1 11v6" stroke={graphite} strokeWidth="0.8" fill="none" />
            </>
          )}
        </motion.g>
      </svg>
    </span>
  );
}
