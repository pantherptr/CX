import { useRef, useState, type ReactNode } from 'react';
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { NumberFlow } from '../NumberFlow';
import { ProtectionIcon, type ProtectionKind } from './ProtectionIcon';
import { Icon } from '../Icon';
import { useLocale } from '../../lib/i18n';

export interface RouteStep {
  icon: ProtectionKind;
  title: string;
  desc: string;
  points: string[];
  /** the picture of the step: a photo path, or an illustration */
  image?: string;
  scene?: ReactNode;
  position?: string;
}

/** "How it works" as a route you drive as you scroll: a line draws itself down the page with a glowing dot riding its
 *  tip, the big step number rolls 01 → 04 (odometer) at the step you are on, and each step lifts in with its picture
 *  sliding at its own pace. Static (no motion) with "reduce motion". */
export function HowRoute({ steps }: { steps: RouteStep[] }) {
  const { t } = useLocale();
  const reduced = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const { scrollYProgress } = useScroll({ target: wrap, offset: ['start 65%', 'end 55%'] });
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  useMotionValueEvent(p, 'change', (v) => setIdx(Math.max(0, Math.min(steps.length - 1, Math.floor(v * steps.length * 0.999)))));
  const fillH = useTransform(p, (v) => `${Math.max(0, Math.min(1, v)) * 100}%`);
  const dotTop = useTransform(p, (v) => `${Math.max(0, Math.min(1, v)) * 100}%`);

  return (
    <div ref={wrap} className="relative grid gap-x-12 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      {/* the big number: sticks on wide screens, rides the top on phones */}
      <div className="sticky top-16 z-20 -mx-5 bg-bg/80 px-5 py-3 backdrop-blur-xl lg:top-28 lg:mx-0 lg:self-start lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-0">
        <p className="eyebrow hidden lg:block">{t('Step')}</p>
        <div className="flex items-end gap-3 lg:mt-2 lg:block">
          <NumberFlow
            className="font-display text-[3.2rem] font-semibold leading-none tracking-[-0.04em] text-accent-700 lg:text-[7.5rem]"
            format={{ minimumIntegerDigits: 2, useGrouping: false }}
            value={idx + 1}
          />
          <p className="pb-1.5 font-display text-[1.05rem] font-semibold leading-tight text-ink lg:mt-3 lg:pb-0 lg:text-[1.3rem]">{t(steps[idx].title)}</p>
        </div>
        <div className="mt-3 hidden h-1 w-full overflow-hidden rounded-full bg-line lg:block">
          <motion.div className="h-full rounded-full bg-accent-bright" style={{ width: reduced ? `${((idx + 1) / steps.length) * 100}%` : fillH }} />
        </div>
        <ol className="mt-4 hidden gap-2 lg:flex">
          {steps.map((s, i) => (
            <li key={s.title} aria-label={t(s.title)} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i <= idx ? 'bg-accent-bright' : 'bg-line'}`} />
          ))}
        </ol>
      </div>

      <div className="relative mt-6 pl-9 lg:mt-0 lg:pl-12">
        {/* the route: a line that fills as you go, with a glowing dot at its tip */}
        <span aria-hidden className="absolute bottom-0 left-[0.85rem] top-0 w-px bg-line lg:left-[1.2rem]" />
        <motion.span aria-hidden className="absolute left-[0.85rem] top-0 w-px bg-gradient-to-b from-accent-bright to-accent lg:left-[1.2rem]" style={{ height: reduced ? '100%' : fillH }} />
        {!reduced && (
          <motion.span
            aria-hidden
            className="absolute left-[0.85rem] z-10 -ml-[7px] -mt-[7px] h-[14px] w-[14px] rounded-full bg-accent-bright shadow-[0_0_0_5px_rgba(0,212,71,0.18),0_0_22px_6px_rgba(0,212,71,0.55)] lg:left-[1.2rem]"
            style={{ top: dotTop }}
          />
        )}

        <ol className="space-y-16 lg:space-y-28">
          {steps.map((s, i) => (
            <StepBlock key={s.title} step={s} n={i + 1} active={i === idx} reduced={Boolean(reduced)} />
          ))}
        </ol>
      </div>
    </div>
  );
}

function StepBlock({ step, n, active, reduced }: { step: RouteStep; n: number; active: boolean; reduced: boolean }) {
  const { t } = useLocale();
  const ref = useRef<HTMLLIElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const imgY = useTransform(scrollYProgress, [0, 1], ['-7%', '7%']);
  const imgScale = useTransform(scrollYProgress, [0, 0.5, 1], [1.12, 1.04, 1.12]);
  return (
    <motion.li
      ref={ref}
      initial={reduced ? false : { opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-12% 0px' }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="relative"
    >
      {/* the node on the route */}
      <span aria-hidden className={`absolute -left-[2.45rem] top-1.5 grid h-[1.9rem] w-[1.9rem] place-items-center rounded-full border text-[11px] font-bold transition-colors duration-300 lg:-left-[3.35rem] ${active ? 'border-accent-bright bg-accent-bright text-ink' : 'border-line-strong bg-bg text-muted'}`}>
        {n}
      </span>
      <div className="flex items-center gap-3">
        <ProtectionIcon kind={step.icon} size="sm" />
        <h3 className="font-display text-[1.6rem] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[2rem]">{t(step.title)}</h3>
      </div>
      <p className="mt-3 max-w-xl text-copy leading-relaxed text-ink-soft">{t(step.desc)}</p>
      <ul className="mt-4 space-y-2.5">
        {step.points.map((pt) => (
          <li key={pt} className="flex items-start gap-3 text-body text-ink-soft">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-050 text-accent-700"><Icon name="check" size={12} strokeWidth={3} /></span>
            {t(pt)}
          </li>
        ))}
      </ul>
      <div className="relative mt-6 aspect-[16/10] overflow-hidden rounded-[1.75rem] border border-line bg-panel shadow-[0_30px_60px_-36px_rgba(0,40,15,0.5)]">
        {step.scene ? (
          <div className="absolute inset-0">{step.scene}</div>
        ) : (
          <motion.img
            src={step.image}
            alt=""
            loading="lazy"
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
            style={reduced ? { objectPosition: step.position } : { y: imgY, scale: imgScale, objectPosition: step.position }}
          />
        )}
      </div>
    </motion.li>
  );
}
