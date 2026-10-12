import { Fragment, useEffect, useMemo, useRef, useState, type ElementType } from 'react';
import { motion, useReducedMotion, type Easing, type Transition } from 'motion/react';

/* Adapted from React Bits "BlurText" (DavidHDev/react-bits): each word starts blurred and a little above its
 * place, then resolves sharp, one after the other, once the text is on screen. Changes from the original:
 * renders as any heading tag, keeps the full sentence for screen readers, shows the final text at once under
 * reduced motion, and wraps words normally so it centres/balances like plain text. */

type Step = Record<string, string | number>;

export function BlurText({
  text,
  as: Tag = 'span',
  className = '',
  delay = 90,
  stepDuration = 0.32,
  direction = 'top',
  easing = (t: number) => t,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  /** ms between one word and the next */
  delay?: number;
  stepDuration?: number;
  direction?: 'top' | 'bottom';
  easing?: Easing | Easing[];
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const words = text.split(' ');

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); io.disconnect(); }
    }, { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  const from: Step = useMemo(() => ({ filter: 'blur(10px)', opacity: 0, y: direction === 'top' ? -30 : 30 }), [direction]);
  const steps: Step[] = useMemo(
    () => [
      { filter: 'blur(5px)', opacity: 0.5, y: direction === 'top' ? 4 : -4 },
      { filter: 'blur(0px)', opacity: 1, y: 0 },
    ],
    [direction],
  );
  const keyframes = useMemo(() => {
    const out: Record<string, Array<string | number>> = {};
    for (const k of Object.keys(from)) out[k] = [from[k], ...steps.map((s) => s[k])];
    return out;
  }, [from, steps]);
  const times = [0, 0.5, 1];

  if (reduced) return <Tag className={className}>{text}</Tag>;

  return (
    <Tag ref={ref} aria-label={text} className={className}>
      {words.map((w, i) => {
        const tr: Transition = { duration: stepDuration * 2, times, delay: (i * delay) / 1000, ease: easing };
        return (
          <Fragment key={i}>
            <motion.span
              aria-hidden="true"
              initial={from}
              animate={inView ? keyframes : from}
              transition={tr}
              style={{ display: 'inline-block', willChange: 'transform, filter, opacity' }}
            >
              {w}
            </motion.span>
            {i < words.length - 1 && ' '}
          </Fragment>
        );
      })}
    </Tag>
  );
}
