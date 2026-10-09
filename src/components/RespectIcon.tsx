import { useEffect } from 'react';
import { motion, useAnimation, useReducedMotion } from 'motion/react';
import respectOn from '../assets/respect/respect-on.png';
import respectOff from '../assets/respect/respect-off.png';

/** The Respect reaction: CX's pointing hand — thumb up, two fingers out, a
 *  chequered racing cuff. Idle it is the graphite outline; once Respected it
 *  is the green hand with its chrome edge. When `playKey` changes it "fires":
 *  the hand kicks back and up, then settles, and a muzzle flash pops at the
 *  fingertips. Under reduced motion nothing moves. The artwork is raster (cut from the CX
 *  design), so `size` is the hand's height in px. */
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
  const controls = useAnimation();
  const ring = useAnimation();
  const reduced = useReducedMotion();

  useEffect(() => {
    if (playKey > 0 && !reduced) {
      void controls.start({
        rotate: [0, -20, -20, 5, 0],
        x: [0, -2.5, -2.5, 0.5, 0],
        y: [0, 1.2, 1.2, 0, 0],
        transition: { duration: 0.55, times: [0, 0.16, 0.34, 0.7, 1], ease: 'easeOut' },
      });
      void ring.start({
        opacity: [0, 1, 1, 0],
        scale: [0.3, 1.15, 1, 1.35],
        transition: { duration: 0.42, times: [0, 0.22, 0.5, 1], ease: 'easeOut', delay: 0.04 },
      });
    }
  }, [playKey, reduced, controls, ring]);

  const h = Math.round(size * 1.2);
  return (
    <span className={`relative inline-flex items-center justify-center ${className}`} aria-hidden="true">
      {/* muzzle flash at the fingertips */}
      <motion.svg
        initial={{ opacity: 0 }}
        animate={ring}
        viewBox="0 0 12 14"
        width={h * 0.4}
        height={h * 0.47}
        className="pointer-events-none absolute overflow-visible"
        style={{ right: -h * 0.3, top: h * 0.1, color: 'var(--color-accent-bright)' }}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <path d="M3 1 7 4" />
        <path d="M5 7h6" />
        <path d="M3 13 7 10" />
      </motion.svg>
      <motion.img
        src={filled ? respectOn : respectOff}
        alt=""
        draggable={false}
        animate={controls}
        initial={false}
        style={{ height: h, width: 'auto', maxWidth: 'none', originX: 0.15, originY: 0.9 }}
      />
    </span>
  );
}
