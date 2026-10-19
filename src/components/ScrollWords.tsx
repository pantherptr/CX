import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react';

/** A statement whose words light up one by one as it scrolls through the screen (grey → ink), on a soft spring.
 *  With "reduce motion" it is simply in full ink. */
export function ScrollWords({ text, className = '' }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 85%', 'end 45%'] });
  const p = useSpring(scrollYProgress, { stiffness: 70, damping: 24, mass: 0.6 });
  const words = text.split(' ');
  if (reduced) return <p className={className}>{text}</p>;
  return (
    <p ref={ref} className={className} aria-label={text}>
      {words.map((w, i) => (
        <Word key={`${w}-${i}`} word={w} p={p} from={i / words.length} to={(i + 1) / words.length} />
      ))}
    </p>
  );
}

function Word({ word, p, from, to }: { word: string; p: MotionValue<number>; from: number; to: number }) {
  const o = useTransform(p, [from, to], [0.16, 1]);
  const y = useTransform(p, [from, to], [6, 0]);
  return (
    <motion.span aria-hidden className="mr-[0.28em] inline-block" style={{ opacity: o, y }}>
      {word}
    </motion.span>
  );
}
