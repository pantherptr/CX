import { useEffect } from 'react';
import { motion, useAnimation, useReducedMotion, type Variants } from 'motion/react';

/** The Respect hand: a closed fist with the index finger out and the thumb up,
 *  like a finger gun. When `playKey` changes it "fires": the hand kicks back
 *  and up, the finger flicks, and a small muzzle flash pops at its tip. Under
 *  reduced motion it never moves. `filled` paints the hand solid. */
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
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="overflow-visible"
        initial="rest"
        animate={controls}
      >
        <motion.g variants={handVariants} style={{ originX: 0.15, originY: 0.95 }}>
          <path
            d="M6.5 11.4V5.4a1.65 1.65 0 0 1 3.3 0v3.2h10.1a1.8 1.8 0 0 1 0 3.6h-5c1.5 0 1.5 2.7 0 2.7 1.5 0 1.5 2.7 0 2.7 1.3 0 1.3 2.4 0 2.4H9.2a3.7 3.7 0 0 1-3.7-3.7v-2.9c0-1 .4-1.6 1-2Z"
            fill={filled ? 'currentColor' : 'none'}
          />
        </motion.g>
        <motion.g
          variants={flashVariants}
          style={{ originX: 0.5, originY: 0.5, color: 'var(--color-accent-bright)' }}
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M23 10.4h1.3" />
          <path d="M22.6 8.4l1.1-1.3" />
          <path d="M22.6 12.4l1.1 1.3" />
        </motion.g>
      </motion.svg>
    </span>
  );
}
