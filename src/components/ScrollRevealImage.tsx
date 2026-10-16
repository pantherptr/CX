import { useRef, type ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { Img } from './motion';

/**
 * A photo that opens up as it scrolls into view: it starts as a narrower, zoomed-in window and widens to
 * the full column while the zoom eases out and the corners round (the 21st "scroll reveal image").
 * The widening is a clip, so the photo itself never reflows. With "reduce motion" it is simply shown.
 */
export function ScrollRevealImage({
  src,
  srcSet,
  position,
  alt = '',
  className = '',
  fromWidth = 64,
  fromScale = 1.45,
  toRadius = 28,
  children,
}: {
  src: string;
  srcSet?: string;
  /** CSS object-position of the photo inside its window (where the cut keeps the subject) */
  position?: string;
  alt?: string;
  /** Sets the height (the width is the column's). */
  className?: string;
  /** Percent of the column the window starts at. */
  fromWidth?: number;
  fromScale?: number;
  /** Corner radius (px) it settles at. */
  toRadius?: number;
  /** Overlays that reveal together with the photo. */
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'start 22%'] });
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 34, mass: 0.6 });

  const side = (100 - fromWidth) / 2;
  const clipPath = useTransform(p, (v) => {
    const k = Math.min(1, Math.max(0, v));
    const s = side * (1 - k);
    const r = toRadius * Math.min(1, Math.max(0, (k - 0.35) / 0.65));
    return `inset(0% ${s.toFixed(2)}% 0% ${s.toFixed(2)}% round ${r.toFixed(1)}px)`;
  });
  const scale = useTransform(p, [0, 1], [fromScale, 1]);

  return (
    <div ref={ref} className={`relative w-full ${className}`}>
      <motion.div
        className="absolute inset-0 overflow-hidden bg-panel"
        style={reduced ? { borderRadius: toRadius } : { clipPath, WebkitClipPath: clipPath }}
      >
        <motion.div className="absolute inset-0" style={reduced ? undefined : { scale }}>
          <Img
            src={src}
            srcSet={srcSet}
            sizes="(min-width: 1024px) 1100px, 100vw"
            alt={alt}
            loading="lazy"
            className="h-full w-full object-cover" style={position ? { objectPosition: position } : undefined}
            fallback={null}
          />
        </motion.div>
        {children}
      </motion.div>
    </div>
  );
}

/**
 * The same reveal for a whole card: it opens from a narrower window to the full column and settles
 * a touch larger, as it scrolls into view. Only a clip and a tiny scale — the content never reflows.
 */
export function ScrollRevealPanel({ children, fromWidth = 86, fromScale = 0.97, radius = 28 }: {
  children: ReactNode;
  fromWidth?: number;
  fromScale?: number;
  radius?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'start 40%'] });
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 34, mass: 0.6 });
  const side = (100 - fromWidth) / 2;
  const clipPath = useTransform(p, (v) => {
    const k = Math.min(1, Math.max(0, v));
    if (k >= 0.995) return 'none'; // settled: no clip, so the card's shadow is not cut
    const s = side * (1 - k);
    return `inset(-60px ${s.toFixed(2)}% -60px ${s.toFixed(2)}% round ${radius}px)`;
  });
  const scale = useTransform(p, [0, 1], [fromScale, 1]);
  if (reduced) return <div>{children}</div>;
  return (
    <motion.div ref={ref} style={{ clipPath, WebkitClipPath: clipPath, scale }}>
      {children}
    </motion.div>
  );
}
