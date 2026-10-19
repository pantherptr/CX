import { useRef, type ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';

export interface StackCard { key: string; icon: ReactNode; title: string; desc: string; n: string }

/** Cards that pile up as you scroll: each one sticks under the header and the one before it recedes (smaller, a little
 *  darker) while the next slides over it. Plain stacked list with "reduce motion". */
export function StackCards({ cards }: { cards: StackCard[] }) {
  return (
    <ol className="relative">
      {cards.map((c, i) => (
        <Card key={c.key} card={c} i={i} last={i === cards.length - 1} />
      ))}
    </ol>
  );
}

function Card({ card, i, last }: { card: StackCard; i: number; last: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, last ? 1 : 0.9]);
  const dim = useTransform(scrollYProgress, [0, 1], [0, last ? 0 : 0.14]);
  return (
    <li ref={ref} className="sticky mb-6 last:mb-0" style={{ top: `calc(5.2rem + ${i * 0.9}rem)` }}>
      <motion.div
        style={reduced ? undefined : { scale }}
        className="relative origin-top overflow-hidden rounded-[1.75rem] border border-line bg-surface p-6 shadow-[0_30px_60px_-36px_rgba(0,40,15,0.5)] sm:p-9"
      >
        <span aria-hidden className="pointer-events-none absolute -right-2 -top-6 font-display text-[8rem] font-semibold leading-none tracking-[-0.05em] text-accent-050 sm:text-[11rem]">{card.n}</span>
        <div className="relative">
          {card.icon}
          <h3 className="mt-5 font-display text-[1.7rem] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[2.2rem]">{card.title}</h3>
          <p className="mt-2 max-w-md text-copy leading-relaxed text-ink-soft">{card.desc}</p>
        </div>
        {!reduced && <motion.span aria-hidden className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: dim }} />}
      </motion.div>
    </li>
  );
}
