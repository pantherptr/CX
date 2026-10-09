import { useEffect, useRef } from 'react';
import { motion, useAnimation, useReducedMotion, type Variants } from 'motion/react';

/** The animated companions of ThumbsUpIcon for SIGNAL's other post actions
 *  (Lucide paths). Each plays once whenever `playKey` goes up, and stays
 *  completely still under reduced motion. */
function usePlay(playKey: number) {
  const controls = useAnimation();
  const reduced = useReducedMotion();
  useEffect(() => {
    if (playKey > 0 && !reduced) void controls.start('animate');
  }, [playKey, reduced, controls]);
  return controls;
}

interface IconProps {
  size?: number;
  playKey?: number;
  className?: string;
}

const svgProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** Save: the icon only presses (no jump); the life is in the background — a soft
 *  disc swells behind it, two rings ripple out and a ring of dots flies off, all
 *  in neutral ink. `filled` paints it solid black. */
export function BookmarkIcon({ size = 20, filled = false, playKey = 0, className = '' }: IconProps & { filled?: boolean }) {
  const press = useAnimation();
  const burst = useAnimation();
  const reduced = useReducedMotion();
  // `playKey` is the timestamp of the Save tap: play once per tap, and only if
  // it was just now (a remount long after must stay still).
  const lastKey = useRef(0);
  useEffect(() => {
    if (!playKey || playKey === lastKey.current) return;
    lastKey.current = playKey;
    if (Date.now() - playKey > 700 || reduced) return;
    void press.start({ scale: [1, 0.86, 1.1, 1], transition: { duration: 0.32, ease: 'easeOut' } });
    void burst.start('go');
    return () => { lastKey.current = 0; };
  }, [playKey, reduced, press, burst]);
  return (
    <span className={`relative inline-flex items-center justify-center ${className}`} aria-hidden="true">
      {/* background burst — behind the icon, never moves it */}
      <motion.span variants={{ idle: {}, go: {} }} initial="idle" animate={burst} className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true">
        <motion.span
          variants={{ idle: { opacity: 0, scale: 0.3 }, go: { opacity: [0, 0.16, 0], scale: [0.3, 2.3, 2.9], transition: { duration: 0.65, ease: 'easeOut' } } }}
          className="absolute rounded-full bg-ink"
          style={{ width: size * 1.3, height: size * 1.3 }}
        />
        {[0, 0.08].map((delay) => (
          <motion.span
            key={delay}
            variants={{ idle: { opacity: 0, scale: 0.5 }, go: { opacity: [0.5, 0], scale: [0.5, 2.6], transition: { duration: 0.6, delay, ease: 'easeOut' } } }}
            className="absolute rounded-full border border-ink/50"
            style={{ width: size * 1.1, height: size * 1.1 }}
          />
        ))}
        {Array.from({ length: 10 }).map((_, i) => {
          const a = (i / 10) * Math.PI * 2 + (i % 2 ? 0.15 : 0);
          const d = size * (i % 2 ? 1.35 : 1.0);
          return (
            <motion.span
              key={i}
              variants={{
                idle: { opacity: 0, x: 0, y: 0, scale: 0.4 },
                go: { opacity: [0, 1, 0], x: Math.cos(a) * d, y: Math.sin(a) * d, scale: [0.4, 1, 0.2], transition: { duration: 0.6, ease: 'easeOut', delay: 0.03 } },
              }}
              className="absolute rounded-full bg-ink"
              style={{ width: i % 2 ? 3 : 4, height: i % 2 ? 3 : 4 }}
            />
          );
        })}
      </motion.span>
      <motion.svg {...svgProps} width={size} height={size} initial={false} animate={press} style={{ transformOrigin: 'center' }}>
        {filled ? (
          <>
            {/* saved: plain solid black — no colour */}
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" fill="#0b0b0c" />
          </>
        ) : (
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" fill="currentColor" />
        )}
      </motion.svg>
    </span>
  );
}

/** Share: the three nodes pulse one after another, as if the post were passed along. */
export function ShareIcon({ size = 21, playKey = 0, className = '' }: IconProps) {
  const controls = usePlay(playKey);
  const node = (delay: number): Variants => ({
    normal: { scale: 1 },
    animate: { scale: [1, 1.45, 0.9, 1], transition: { duration: 0.55, delay, ease: 'easeInOut' } },
  });
  const line = (delay: number): Variants => ({
    normal: { opacity: 1 },
    animate: { opacity: [1, 0.25, 1], transition: { duration: 0.55, delay, ease: 'easeInOut' } },
  });
  return (
    <span className={`inline-flex items-center justify-center ${className}`} aria-hidden="true">
      <motion.svg {...svgProps} width={size} height={size} initial="normal" animate={controls}>
        <motion.circle cx="18" cy="5" r="3" variants={node(0.18)} style={{ transformOrigin: '18px 5px' }} />
        <motion.circle cx="6" cy="12" r="3" variants={node(0)} style={{ transformOrigin: '6px 12px' }} />
        <motion.circle cx="18" cy="19" r="3" variants={node(0.18)} style={{ transformOrigin: '18px 19px' }} />
        <motion.line x1="8.59" x2="15.42" y1="13.51" y2="17.49" variants={line(0.08)} />
        <motion.line x1="15.41" x2="8.59" y1="6.51" y2="10.49" variants={line(0.08)} />
      </motion.svg>
    </span>
  );
}

/** Views: the eye blinks. */
export function EyeIcon({ size = 18, playKey = 0, className = '' }: IconProps) {
  const controls = usePlay(playKey);
  const v: Variants = {
    normal: { scaleY: 1 },
    animate: { scaleY: [1, 0.12, 1, 0.12, 1], transition: { duration: 0.55, ease: 'easeInOut' } },
  };
  return (
    <span className={`inline-flex items-center justify-center ${className}`} aria-hidden="true">
      <motion.svg {...svgProps} width={size} height={size} variants={v} initial="normal" animate={controls} style={{ transformOrigin: 'center' }}>
        <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
        <circle cx="12" cy="12" r="3" />
      </motion.svg>
    </span>
  );
}
