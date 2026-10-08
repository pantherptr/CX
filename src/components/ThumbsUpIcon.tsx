import { useEffect } from 'react';
import { motion, useAnimation, useReducedMotion, type Variants } from 'motion/react';

/** The animated thumbs-up (Lucide's ThumbsUp path, animated like AnimateIcons'
 *  version by Avijit Dey, MIT): on `playKey` changing, the whole icon and the
 *  thumb wobble and hop, the cuff (the stem) squashes. `filled` paints the
 *  thumb solid. Under reduced motion it never moves. Meant for the SIGNAL
 *  Respect button — `playKey` goes up every time a Respect is given. */
export function ThumbsUpIcon({
  size = 21,
  filled = false,
  playKey = 0,
  duration = 0.9,
  className = '',
}: {
  size?: number;
  filled?: boolean;
  playKey?: number;
  duration?: number;
  className?: string;
}) {
  const controls = useAnimation();
  const reduced = useReducedMotion();

  useEffect(() => {
    if (playKey > 0 && !reduced) void controls.start('animate');
  }, [playKey, reduced, controls]);

  const svgVariants: Variants = {
    normal: { scale: 1, rotate: 0 },
    animate: {
      scale: [1, 1.08, 0.98, 1.03, 1],
      rotate: [0, -8, 6, -4, 0],
      transition: { duration: 0.95 * duration, ease: 'easeInOut' },
    },
  };
  const stemVariants: Variants = {
    normal: { scaleY: 1, opacity: 1 },
    animate: {
      scaleY: [1, 0.92, 1.04, 1],
      opacity: [1, 0.85, 1],
      transition: { duration: 0.7 * duration, ease: 'easeInOut', delay: 0.08 * duration },
    },
  };
  const thumbVariants: Variants = {
    normal: { rotate: 0, y: 0, scale: 1 },
    animate: {
      rotate: [0, -8, 6, -4, 0],
      y: [0, -4, -8, -4, 0],
      scale: [1, 1.05, 1.1, 1.04, 1],
      transition: { duration: 0.95 * duration, ease: 'easeInOut', delay: 0.05 * duration },
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
        variants={svgVariants}
        initial="normal"
        animate={controls}
      >
        <motion.path d="M7 10v12" variants={stemVariants} initial="normal" style={{ transformOrigin: 'center' }} />
        <motion.path
          d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"
          variants={thumbVariants}
          initial="normal"
          fill={filled ? 'currentColor' : 'none'}
          style={{ transformOrigin: 'center' }}
        />
      </motion.svg>
    </span>
  );
}
