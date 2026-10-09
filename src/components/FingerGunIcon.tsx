import { useEffect } from 'react';
import { motion, useAnimation, useReducedMotion, type Variants } from 'motion/react';

/** The Respect hand: a hand in a cuff with two fingers out,
 *  like a finger gun. When `playKey` changes it "fires": the hand kicks back
 *  and up, the finger flicks, and a small muzzle flash pops at its tip. Under
 *  reduced motion it never moves. `filled` draws it a touch bolder. */
export function FingerGunIcon({
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

  useEffect(() => {
    if (playKey > 0 && !reduced) void controls.start('fire');
  }, [playKey, reduced, controls]);

  const handVariants: Variants = {
    rest: { rotate: 0, x: 0, y: 0 },
    fire: {
      rotate: [0, -20, -20, 5, 0],
      x: [0, -2.2, -2.2, 0.5, 0],
      y: [0, 1, 1, 0, 0],
      transition: { duration: 0.55, times: [0, 0.16, 0.34, 0.7, 1], ease: 'easeOut' },
    },
  };
  const flashVariants: Variants = {
    rest: { opacity: 0, scale: 0.3 },
    fire: {
      opacity: [0, 1, 1, 0],
      scale: [0.3, 1.15, 1, 1.35],
      transition: { duration: 0.42, times: [0, 0.22, 0.5, 1], ease: 'easeOut', delay: 0.04 },
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
        strokeWidth={filled ? 2 : 1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="overflow-visible"
        initial="rest"
        animate={controls}
      >
        <g transform="rotate(35 12 12)">
          <motion.g variants={handVariants} style={{ originX: 0.5, originY: 0.9 }}>
            {/* cuff with its button */}
            <rect x="4" y="18.4" width="12" height="4.4" rx="1.2" />
            <circle cx="6.9" cy="20.6" r="0.5" fill="currentColor" stroke="none" />
            {/* wrist and palm, two extended fingers, curled ring and little fingers */}
            <path
              d="M6 18.4C6 16.6 5 15.6 5 13.6c0-1.2.5-2 1.2-2.6V3.8a1.8 1.8 0 0 1 3.6 0V11M9.8 11V2.8a1.8 1.8 0 0 1 3.6 0V11M13.4 11c2.2 0 3.4 1.2 3.4 3v1.2c0 1.2-.8 2.2-2 2.6v.6"
            />
            {/* the thumb folded across the curled fingers */}
            <path d="M8.2 13.4c1.6-.7 3.2-.2 3.6 1.2" />
          </motion.g>
        </g>
        <motion.g
          variants={flashVariants}
          style={{ originX: 0.5, originY: 0.5, color: 'var(--color-accent-bright)' }}
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M20.2 1.2l1.6-1" />
          <path d="M22 4.2h1.6" />
          <path d="M20.4 7l1.4 1" />
        </motion.g>
      </motion.svg>
    </span>
  );
}
