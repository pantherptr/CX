import { useEffect } from 'react';
import { motion, useAnimation, useReducedMotion, type Variants } from 'motion/react';

/** The Respect hand: the supplied hand with two fingers out,
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
        strokeLinecap="round"
        strokeLinejoin="round"
        className="overflow-visible"
        initial="rest"
        animate={controls}
      >
        <motion.g variants={handVariants} style={{ originX: 0.3, originY: 0.9 }}>
          {/* the supplied hand emoji, traced to a single outline */}
          <path
            fillRule="evenodd"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth={filled ? 0.85 : 0.4}
            d="M9.56 19.15L8.98 19.59L8.84 19.93L8.88 20.48L9.29 20.99L9.56 21.12L10.11 21.12L10.45 20.95L10.72 20.65L10.86 20.27L10.82 19.86L10.41 19.28L10.00 19.11ZM9.66 19.62L10.04 19.62L10.35 19.93L10.35 20.34L10.00 20.65L9.66 20.65L9.36 20.37L9.36 19.90ZM20.48 2.13L19.96 1.92L19.25 1.92L18.74 2.13L18.09 2.60L17.68 1.65L16.93 1.10L16.04 1.03L15.29 1.38L9.87 6.76L8.67 7.14L7.82 7.89L7.38 8.74L6.83 12.12L6.36 13.21L6.12 13.31L5.64 13.01L4.96 13.11L2.84 15.22L2.71 15.84L2.91 16.31L9.49 22.86L9.97 23.00L10.62 22.73L12.60 20.68L12.67 20.00L12.39 19.59L12.49 19.35L12.77 19.21L13.79 19.08L14.30 18.80L15.91 17.24L16.76 16.25L17.51 15.94L19.56 13.82L19.76 13.28L19.76 12.70L19.59 12.22L19.01 11.61L18.09 11.27L18.19 10.52L17.92 9.73L17.47 9.29L16.79 9.05L16.69 8.91L21.06 4.48L21.29 3.80L21.26 3.18L21.02 2.64ZM5.23 13.52L5.64 13.52L12.15 20.03L12.22 20.27L12.09 20.58L10.18 22.45L9.94 22.52L9.66 22.39L3.29 16.01L3.18 15.80L3.29 15.43ZM18.80 12.05L19.08 12.32L19.28 12.77L19.25 13.38L19.08 13.69L17.03 15.67L16.45 15.80L15.84 15.56L15.50 15.19L15.36 14.75L15.39 14.30L15.60 13.93L17.54 12.02L18.29 11.85ZM17.34 9.80L17.71 10.45L17.71 10.86L17.44 11.40L15.16 13.65L14.47 13.82L13.89 13.62L13.59 13.31L13.38 12.77L13.45 12.29L13.62 11.98L15.91 9.70L16.25 9.53L16.66 9.49ZM20.03 2.43L20.54 2.81L20.78 3.25L20.82 3.76L20.61 4.27L13.35 11.54L12.97 12.22L12.94 12.94L13.24 13.65L13.89 14.17L14.81 14.30L14.92 14.98L15.12 15.50L15.53 15.94L16.11 16.31L14.00 18.43L13.52 18.67L12.73 18.74L11.95 19.11L6.63 13.82L6.63 13.62L7.07 12.90L7.31 12.19L7.75 9.22L7.92 8.64L8.33 8.03L8.98 7.51L9.83 7.24L10.38 7.24L11.16 7.48L14.54 9.12L14.30 9.73L13.62 10.21L12.67 10.31L11.54 10.14L11.37 10.31L11.88 11.54L11.98 12.22L11.95 13.11L12.09 13.24L12.32 13.21L12.43 12.94L12.43 11.95L12.15 10.82L13.38 10.76L14.20 10.45L14.71 10.00L15.09 9.08L14.98 8.74L13.69 8.16L13.52 7.96L18.87 2.60L19.49 2.36ZM17.34 1.99L17.58 2.57L17.58 2.88L17.34 3.42L13.01 7.75L12.80 7.75L10.65 6.80L10.65 6.66L15.63 1.72L16.08 1.51L16.45 1.48L16.96 1.65Z"
          />
        </motion.g>
        <motion.g
          variants={flashVariants}
          style={{ originX: 0.5, originY: 0.5, color: 'var(--color-accent-bright)' }}
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        >
          <path d="M21.6 .6l1.2-1.1" />
          <path d="M23.2 3.4h1.5" />
          <path d="M21.6 6.2l1.2 1.1" />
        </motion.g>
      </motion.svg>
    </span>
  );
}
