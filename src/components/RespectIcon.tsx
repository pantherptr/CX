import { useEffect } from 'react';
import { motion, useAnimation, useReducedMotion } from 'motion/react';
import respectOn from '../assets/respect/respect-on.png';
import respectOff from '../assets/respect/respect-off.png';

/** The Respect reaction: CX's pointing hand — thumb up, two fingers out, a
 *  chequered racing cuff. Idle it is the graphite outline; once Respected it
 *  is the green hand with its chrome edge. When `playKey` changes it gives a
 *  200ms press (0.92 → 1.06 → 1) and one faint green ring that fades. Under
 *  reduced motion nothing moves. The artwork is raster (cut from the CX
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
      void controls.start({ scale: [0.92, 1.06, 1], transition: { duration: 0.2, ease: 'easeOut' } });
      void ring.start({ opacity: [0.35, 0], scale: [0.7, 1.7], transition: { duration: 0.45, ease: 'easeOut' } });
    }
  }, [playKey, reduced, controls, ring]);

  const h = Math.round(size * 1.2);
  return (
    <span className={`relative inline-flex items-center justify-center ${className}`} aria-hidden="true">
      <motion.span
        initial={{ opacity: 0 }}
        animate={ring}
        className="pointer-events-none absolute rounded-full border border-accent-bright"
        style={{ width: h * 1.3, height: h * 1.3 }}
      />
      <motion.img
        src={filled ? respectOn : respectOff}
        alt=""
        draggable={false}
        animate={controls}
        initial={false}
        style={{ height: h, width: 'auto', maxWidth: 'none' }}
      />
    </span>
  );
}
