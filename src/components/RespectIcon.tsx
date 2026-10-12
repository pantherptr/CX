import { useEffect, useRef } from 'react';
import { motion, useAnimation, useReducedMotion } from 'motion/react';
import { RespectGlyph } from './RespectGlyph';

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
  const sparks = useRef<HTMLSpanElement>(null);

  // `playKey` is the timestamp (ms) of the tap that fired it, 0 = never. The
  // card can remount this icon right as it is tapped, so a mount must still
  // play if the tap was just now — but a mount long after a tap (scrolling,
  // other posts re-rendering) must not. The ref makes each tap play once.
  const lastKey = useRef(0);
  useEffect(() => {
    if (!playKey || playKey === lastKey.current) return;
    lastKey.current = playKey;
    if (Date.now() - playKey > 700) return;
    if (!reduced) {
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
      // a small burst of sparks flying outward from the hand
      sparks.current?.querySelectorAll<HTMLElement>('[data-spark]').forEach((el, i, all) => {
        const a = (i / all.length) * Math.PI * 2 + (i % 2 ? 0.2 : 0);
        const d = 15 + (i % 3) * 5;
        el.animate(
          [
            { transform: 'translate(0,0) scale(0.4)', opacity: 0 },
            { transform: `translate(${Math.cos(a) * d * 0.55}px, ${Math.sin(a) * d * 0.55}px) scale(1)`, opacity: 1, offset: 0.35 },
            { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(0.2)`, opacity: 0 },
          ],
          { duration: 520, delay: 40 + (i % 3) * 20, easing: 'cubic-bezier(0.2,0.8,0.2,1)', fill: 'backwards' },
        );
      });
    }
    // StrictMode (dev) runs effect → cleanup → effect on one instance; forgetting
    // the key here lets that second run replay instead of being swallowed.
    return () => { lastKey.current = 0; };
  }, [playKey, reduced, controls, ring]);

  const h = Math.round(size * 1.2);
  return (
    <span className={`relative inline-flex items-center justify-center ${className}`} aria-hidden="true">
      {/* spark burst — hidden until a Respect is given */}
      <span ref={sparks} aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} data-spark className="absolute h-1 w-1 rounded-full opacity-0" style={{ background: i % 2 ? 'var(--color-accent-bright)' : 'var(--color-accent)' }} />
        ))}
      </span>
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
      <motion.span animate={controls} initial={false} style={{ display: 'inline-flex', originX: 0.15, originY: 0.9 }}>
        <RespectGlyph height={h} on={filled} />
      </motion.span>
    </span>
  );
}
