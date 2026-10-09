import { useEffect, useRef } from 'react';
import { motion, useAnimation, useReducedMotion, type Variants } from 'motion/react';

/** The Respect handshake: two hands, one held a little back. Before you Respect
 *  they are apart; the moment you do, they come together, clasp, and give a
 *  small, firm shake. Once Respected the hands stay joined.
 *  Drawn from Lucide's handshake (ISC), split into its two hands so each can
 *  move on its own. Under reduced motion nothing moves — it just switches. */
export function HandshakeIcon({
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
  const controls = useAnimation();
  const reduced = useReducedMotion();
  const lastKey = useRef(playKey);

  useEffect(() => {
    const fired = playKey !== lastKey.current;
    lastKey.current = playKey;
    if (!filled) {
      void controls.start('apart');
    } else if (fired && !reduced) {
      void controls.start('clasp');
    } else {
      void controls.start('joined');
    }
  }, [filled, playKey, reduced, controls]);

  // Apart: the left hand sits pulled back and tilted, the right a touch out.
  // Clasp: both close in, overshoot a hair, then settle.
  const leftHand: Variants = {
    apart: { x: -3.4, rotate: -7, transition: { duration: 0.25, ease: 'easeOut' } },
    joined: { x: 0, rotate: 0, transition: { duration: 0 } },
    clasp: {
      x: [null, 0.7, -0.2, 0] as unknown as number,
      rotate: [null, 1.5, 0, 0] as unknown as number,
      transition: { duration: 0.34, times: [0, 0.55, 0.8, 1], ease: 'easeOut' },
    },
  };
  const rightHand: Variants = {
    apart: { x: 1.2, rotate: 2, transition: { duration: 0.25, ease: 'easeOut' } },
    joined: { x: 0, rotate: 0, transition: { duration: 0 } },
    clasp: {
      x: [null, -0.5, 0.15, 0] as unknown as number,
      rotate: [null, 0, 0, 0] as unknown as number,
      transition: { duration: 0.34, times: [0, 0.55, 0.8, 1], ease: 'easeOut' },
    },
  };
  // After the hands meet, the whole clasp gives two short pumps.
  const wholeHands: Variants = {
    apart: { y: 0, rotate: 0 },
    joined: { y: 0, rotate: 0 },
    clasp: {
      y: [0, 0, -1.3, 1, -0.8, 0.4, 0],
      rotate: [0, 0, -4, 3, -2, 1, 0],
      transition: { duration: 0.8, times: [0, 0.3, 0.45, 0.6, 0.75, 0.9, 1], ease: 'easeInOut' },
    },
  };

  return (
    <span className={`inline-flex items-center justify-center ${className}`} aria-hidden="true">
      <motion.svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="overflow-visible"
        initial={filled ? 'joined' : 'apart'}
        animate={controls}
      >
        <motion.g variants={wholeHands} style={{ originX: 0.5, originY: 0.5 }}>
          <motion.g variants={leftHand} initial={false} style={{ originX: 0.25, originY: 0.95 }}>
            <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
            <path d="M3 4h8" />
            <path d="m11 17 2 2a1 1 0 1 0 3-3" />
          </motion.g>
          <motion.g variants={rightHand} initial={false} style={{ originX: 0.8, originY: 0.9 }}>
            <path
              d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"
            />
            <path d="m21 3 1 11h-2" />
          </motion.g>
        </motion.g>
      </motion.svg>
    </span>
  );
}
