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
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="overflow-visible"
        initial="rest"
        animate={controls}
      >
        <motion.g variants={handVariants} style={{ originX: 0.15, originY: 0.9 }}>
          {filled && <rect x="9" y="8" width="7" height="10" fill="currentColor" stroke="none" />}
          {/* the two extended fingers and the curled one beneath */}
          <path
            d="M12 8h8.5a1.5 1.5 0 0 1 0 3H13m.5 0h6.5a1.5 1.5 0 0 1 0 3H13m1.5 0a1.5 1.5 0 0 1 0 3H13"
            fill={filled ? 'currentColor' : 'none'}
          />
          {/* the palm and the thumb, lying on top and a little drawn back */}
          <path
            d="M13.5 17a1.5 1.5 0 1 1 0 3H9a6 6 0 0 1-6-6v-2v.208a6 6 0 0 1 2.7-5.012L5.9 7.1q.7-.45 4.6-3.2a1.5 1.5 0 0 1 2.02.54c.44.734.325 1.674-.28 2.28L12 8"
            fill={filled ? 'currentColor' : 'none'}
          />
        </motion.g>
        <motion.g
          variants={flashVariants}
          style={{ originX: 0.5, originY: 0.5, color: 'var(--color-accent-bright)' }}
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M22.9 9.5h1.3" />
          <path d="M22.5 7.5l1.1-1.3" />
          <path d="M22.5 11.5l1.1 1.3" />
        </motion.g>
      </motion.svg>
    </span>
  );
}
