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
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="overflow-visible"
        initial="rest"
        animate={controls}
      >
        <motion.g variants={handVariants} style={{ originX: 0.15, originY: 0.95 }}>
          <path
            d="M7.2 8.4V4.2a1.6 1.6 0 0 1 3.2 0v4H20.6a1.7 1.7 0 0 1 0 3.4H14.6a1.5 1.5 0 0 1 0 3 1.5 1.5 0 0 1 0 3 1.5 1.5 0 0 1 0 3H8.2a3 3 0 0 1-3-3v-6.2a3 3 0 0 1 2-3Z"
            fill={filled ? 'currentColor' : 'none'}
          />
          <path d="M10.4 14.6h4.2M10.4 17.6h4.2" stroke={filled ? 'var(--color-surface)' : 'currentColor'} strokeWidth="1.3" />
        </motion.g>
        <motion.g
          variants={flashVariants}
          style={{ originX: 0.5, originY: 0.5, color: 'var(--color-accent-bright)' }}
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M22.9 9.9h1.4" />
          <path d="M22.5 7.9l1.1-1.3" />
          <path d="M22.5 11.9l1.1 1.3" />
        </motion.g>
      </motion.svg>
    </span>
  );
}
