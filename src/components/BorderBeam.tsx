import type { Transition } from 'motion/react';
import { motion, useReducedMotion } from './motionKit';

/** A light beam that travels along a container's border — ported from
 *  Magic UI's `border-beam` (magicui.design) onto the app's own `motion`
 *  package rather than pulling in shadcn's `cn()`/alias setup for one
 *  effect. Reserved for the one thing on a page that should visibly read
 *  as "CX's own", same restraint as the rest of the app's green accent —
 *  see SignalPostCard's `featured` card, the only place this is used. */
export function BorderBeam({
  size = 90,
  duration = 7,
  delay = 0,
  colorFrom = 'var(--color-accent-bright)',
  colorTo = 'var(--color-accent-bright)',
  transition,
  className = '',
  reverse = false,
  initialOffset = 0,
  borderWidth = 1.5,
}: {
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  transition?: Transition;
  className?: string;
  reverse?: boolean;
  initialOffset?: number;
  borderWidth?: number;
}) {
  const reduceMotion = !!useReducedMotion();
  if (reduceMotion) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-[inherit] border-transparent [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000)]"
      style={{ borderWidth }}
    >
      <motion.div
        className={`absolute aspect-square ${className}`}
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
          background: `linear-gradient(to left, ${colorTo}, ${colorFrom}, transparent)`,
        }}
        initial={{ offsetDistance: `${initialOffset}%` }}
        animate={{
          offsetDistance: reverse ? [`${100 - initialOffset}%`, `${-initialOffset}%`] : [`${initialOffset}%`, `${100 + initialOffset}%`],
        }}
        transition={{ repeat: Infinity, ease: 'linear', duration, delay: -delay, ...transition }}
      />
    </div>
  );
}
