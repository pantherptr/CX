import * as React from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';

/** Phone Scroll Hero (21st.dev, @ruixen.ui), adapted: `motion/react` instead of framer-motion, local `cn`, the
 *  site's own colours instead of shadcn tokens. The phone starts tilted back, straightens and climbs over the title. */
const cn = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

export interface PhoneScrollHeroProps {
  titleComponent: React.ReactNode;
  children?: React.ReactNode;
  /** How far the phone climbs into the title, as a share of its own height. */
  overlap?: number;
  /** Backward tilt at the start, in degrees. */
  tilt?: number;
  className?: string;
}

const useIsoLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

function PhoneFrame({ children }: { children?: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-[15.5rem] sm:w-[16rem] md:w-[17rem]">
      <span aria-hidden className="absolute -left-[2px] top-[16%] h-7 w-[3px] rounded-l-sm bg-ink/25" />
      <span aria-hidden className="absolute -left-[2px] top-[24%] h-11 w-[3px] rounded-l-sm bg-ink/25" />
      <span aria-hidden className="absolute -right-[2px] top-[22%] h-14 w-[3px] rounded-r-sm bg-ink/25" />
      <div className="aspect-[9/19.5] rounded-[2.5rem] border border-line-strong bg-[#16181a] p-[0.35rem] shadow-[0_10px_20px_rgba(0,0,0,0.18),0_40px_60px_-20px_rgba(0,0,0,0.35)]">
        <div className="relative h-full w-full overflow-hidden rounded-[2.2rem] bg-black ring-1 ring-inset ring-white/10">
          <div aria-hidden className="absolute left-1/2 top-2 z-20 h-[1.1rem] w-[4.25rem] -translate-x-1/2 rounded-full bg-black" />
          {children}
        </div>
      </div>
    </div>
  );
}

export function PhoneScrollHero({ titleComponent, children, overlap = 20, tilt = 22, className }: PhoneScrollHeroProps) {
  const prefersReducedMotion = useReducedMotion();
  const sectionRef = React.useRef<HTMLElement>(null);
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const set = () => setNarrow(mq.matches);
    set();
    mq.addEventListener('change', set);
    return () => mq.removeEventListener('change', set);
  }, []);
  const raw = useMotionValue(0);
  // a soft spring after the raw scroll value: iOS delivers scroll events in bursts, the spring turns them into one slow glide
  const progress = useSpring(raw, { stiffness: 38, damping: 22, mass: 1.1, restDelta: 0.0005 });

  useIsoLayoutEffect(() => {
    if (prefersReducedMotion) return;
    const el = sectionRef.current;
    if (!el) return;
    const win = el.ownerDocument.defaultView ?? window;
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      // 0 when the section's top enters at the bottom of the screen, 1 when it is centred: the whole motion happens
      // while the section is on screen (a short section used to snap from 0 to 1 at once)
      const start = win.innerHeight * 1.0;
      const end = win.innerHeight * 0.5 - rect.height * 0.35;
      raw.set(Math.min(1, Math.max(0, (start - rect.top) / Math.max(1, start - end))));
    };
    const onScroll = () => { if (!raf) raf = win.requestAnimationFrame(update); };
    update();
    win.addEventListener('scroll', onScroll, { passive: true });
    win.addEventListener('resize', onScroll);
    return () => {
      win.removeEventListener('scroll', onScroll);
      win.removeEventListener('resize', onScroll);
      if (raf) win.cancelAnimationFrame(raf);
    };
  }, [prefersReducedMotion, raw]);

  const rotateX = useTransform(progress, [0, 1], [tilt, 0]);
  const scale = useTransform(progress, [0, 1], [0.94, 1]);
  const titleY = useTransform(progress, [0, 1], [0, narrow ? 0 : -24]);
  // on a phone the phone only closes the gap under the title: it never covers the words
  const phoneY = useTransform(progress, [0, 1], ['0%', `-${narrow ? 4 : overlap}%`]);
  const still = Boolean(prefersReducedMotion);

  return (
    <section
      ref={sectionRef}
      aria-label="Coming soon"
      className={cn('relative flex h-[46rem] w-full items-center justify-center overflow-hidden p-2 md:h-[62rem] md:p-8', className)}
    >
      <div className="w-full" style={{ perspective: '1200px' }}>
        <motion.div style={{ y: still ? 0 : titleY }} className="relative z-0 mx-auto max-w-5xl px-4 text-center">
          {titleComponent}
        </motion.div>
        <motion.div style={{ y: still ? 0 : phoneY, rotateX: still ? 0 : rotateX, scale: still ? 1 : scale }} className="relative z-10 mt-10 will-change-transform md:-mt-12">
          <PhoneFrame>{children}</PhoneFrame>
        </motion.div>
      </div>
    </section>
  );
}

export default PhoneScrollHero;
