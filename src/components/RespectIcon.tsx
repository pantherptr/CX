import { useEffect, useId } from 'react';
import { motion, useAnimation, useReducedMotion } from 'motion/react';

/** The Respect reaction: a hand pointing right — index and middle fingers out,
 *  thumb up, ring and little fingers curled — with a small chequered racing cuff at the
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
  // Open palm, thumb up, index + middle out, ring + little curled below.
  const HAND =
    'M6.4 12.4C6.2 9.6 7.6 7 8.6 5C9.2 3.6 10.4 2.9 11.5 3.3c1.1.4.9 1.8.5 2.8l-.9 2.5 1.5.5h7.8a1.35 1.35 0 0 1 0 2.7h.7a1.35 1.35 0 0 1 0 2.7H14.8a1.5 1.5 0 0 1 0 3h-.3a1.4 1.4 0 0 1 0 2.8H11C9.4 20.6 7.8 19.8 6.4 19Z';
  const SEP = 'M12.6 11.7h7.9M12.4 14.4h2.4M12.4 17.4h2';
  // racing cuff: 2 × 4 chequer
  const squares: Array<[number, number]> = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) if ((r + c) % 2 === 0) squares.push([2.6 + c * 1.6, 12.9 + r * 1.65]);

  return (
    <span className={`inline-flex items-center justify-center ${className}`} aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" className="overflow-visible">
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
              <g transform="rotate(-8 4.2 16)">
                <rect x="2" y="12.2" width="4.4" height="7.4" rx="0.9" fill="#0d1210" stroke={`url(#${uid}c)`} strokeWidth="0.6" />
                {squares.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="1.4" height="1.4" fill="#d9dee2" />)}
                <path d="M2.3 12.5v6.8" stroke="#12e254" strokeWidth="0.5" />
              </g>
              <path d={HAND} fill={`url(#${uid}g)`} stroke={`url(#${uid}c)`} strokeWidth="0.7" />
              <path d={SEP} stroke="#00762c" strokeWidth="0.6" opacity="0.6" fill="none" />
              <path d="M13.5 9.9h6.3M10.6 4.4l-.9 2" stroke="#fff" strokeWidth="0.7" opacity="0.55" fill="none" />
            </>
          ) : (
            <>
              <g transform="rotate(-8 4.2 16)">
                <rect x="2" y="12.2" width="4.4" height="7.4" rx="0.9" fill="none" stroke={graphite} strokeWidth="1.2" />
                {squares.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="1.4" height="1.4" fill={graphite} />)}
              </g>
              <path d={HAND} fill="none" stroke={graphite} strokeWidth="1.3" />
              <path d={SEP} stroke={graphite} strokeWidth="1" fill="none" />
            </>
          )}
        </motion.g>
      </svg>
    </span>
  );
}
