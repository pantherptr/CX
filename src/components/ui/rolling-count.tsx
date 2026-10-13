import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;

/* Adapted from 21st.dev "Like Burst" (ddoemonn): the number slides out upwards while the new one slides in
 * from above, and the box is always as wide as the widest of value-1 / value / value+1, so the row never
 * shifts when a count changes. Reduced motion swaps the number with no movement. */
export function RollingCount({
  value,
  format = (n: number) => String(n),
  className = '',
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const shown = format(value);
  const widest = [format(Math.max(0, value - 1)), shown, format(value + 1)].reduce((a, b) => (b.length > a.length ? b : a));
  return (
    <span aria-hidden="true" className={`inline-grid overflow-hidden tabular-nums ${className}`}>
      <span className="invisible col-start-1 row-start-1">{widest}</span>
      <AnimatePresence initial={false}>
        <motion.span
          key={shown}
          className="col-start-1 row-start-1 justify-self-end"
          initial={{ opacity: 0, y: reduced ? 0 : -7 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : 7 }}
          transition={reduced ? { duration: 0 } : CROSSFADE}
        >
          {shown}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
