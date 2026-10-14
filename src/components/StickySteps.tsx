import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { Img } from './motion';

gsap.registerPlugin(ScrollTrigger);

export interface StickyStep {
  icon: IconName;
  label: string;
  title: string;
  desc: string;
  image: string;
  alt?: string;
}

const STEP_GAP = 2; // timeline seconds between two steps
const CONTENT_TIME = 0.8;
const CONTENT_DELAY = 0.3;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false);

/**
 * "How it works" as a scroll story: the section pins under the header and, as you scroll, the text moves
 * from step to step while the photo wipes away to the next one (and a bar fills). Scroll is the only
 * control — no snapping, so it never fights the phone's own momentum. With "reduce motion" the steps
 * simply cross-fade. Loaded on demand (gsap is not part of the first load).
 */
export default function StickySteps({ steps, stepWord, cta }: { steps: StickyStep[]; stepWord: string; cta?: { label: string; to: string } }) {
  const sectionRef = useRef<HTMLElement>(null);
  const textRefs = useRef<(HTMLDivElement | null)[]>([]);
  const imageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const barRef = useRef<HTMLSpanElement>(null);
  const countRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section || steps.length === 0) return;
    const reduced = prefersReducedMotion();
    const texts = textRefs.current;
    const images = imageRefs.current;
    const n = steps.length;

    const ctx = gsap.context(() => {
      texts.forEach((el, i) => gsap.set(el, { autoAlpha: i === 0 ? 1 : 0, yPercent: i === 0 ? 0 : 6, zIndex: n - i }));
      images.forEach((el, i) =>
        gsap.set(el, {
          autoAlpha: reduced ? (i === 0 ? 1 : 0) : 1,
          zIndex: n - i,
          clipPath: 'inset(0% 0% 0% 0%)',
          scale: reduced ? 1 : i === 0 ? 1.12 : 1.3,
        }),
      );
      gsap.set(barRef.current, { scaleX: 1 / n, transformOrigin: 'left center' });

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: section, start: 'top top+=64', end: 'bottom bottom', scrub: 0.8 },
      });

      for (let i = 0; i < n - 1; i += 1) {
        const at = i * STEP_GAP;
        tl.to(texts[i], { autoAlpha: 0, yPercent: -6, duration: CONTENT_TIME, ease: 'power2.inOut' }, at)
          .fromTo(
            texts[i + 1],
            { autoAlpha: 0, yPercent: 6 },
            { autoAlpha: 1, yPercent: 0, duration: CONTENT_TIME, ease: 'power2.inOut' },
            at + CONTENT_TIME + CONTENT_DELAY,
          )
          .to(
            images[i],
            reduced ? { autoAlpha: 0, duration: STEP_GAP } : { clipPath: 'inset(0% 0% 100% 0%)', scale: 1, duration: STEP_GAP },
            at,
          );
        if (reduced) tl.to(images[i + 1], { autoAlpha: 1, duration: STEP_GAP }, at);
        else tl.to(images[i + 1], { scale: 1.12, duration: STEP_GAP }, at);
        tl.to(barRef.current, { scaleX: (i + 2) / n, duration: STEP_GAP }, at);
        // the step counter follows the text
        tl.set(countRefs.current[i], { autoAlpha: 0 }, at + CONTENT_TIME)
          .set(countRefs.current[i + 1], { autoAlpha: 1 }, at + CONTENT_TIME);
      }
      tl.duration(Math.max(1, (n - 1) * STEP_GAP));
    }, section);

    // images change the page height as they arrive
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('load', refresh);
    return () => {
      window.removeEventListener('load', refresh);
      ctx.revert();
    };
  }, [steps]);

  return (
    <section
      ref={sectionRef}
      aria-label={stepWord}
      className="relative"
      style={{ height: `${steps.length * 90}svh` }}
    >
      <div className="sticky top-[calc(4rem+env(safe-area-inset-top,0px))] flex h-[calc(100svh-4rem-env(safe-area-inset-top,0px))] flex-col gap-4 pb-[5.75rem] sm:flex-row-reverse sm:items-stretch sm:gap-10 sm:pb-8">
        {/* Photos */}
        <div className="relative h-[54%] shrink-0 overflow-hidden rounded-3xl bg-panel shadow-[0_24px_48px_-28px_rgba(0,40,15,0.45)] sm:h-auto sm:w-[52%]">
          {steps.map((s, i) => (
            <div
              key={s.title}
              ref={(el) => {
                imageRefs.current[i] = el;
              }}
              className="absolute inset-0"
            >
              <Img src={s.image} alt={s.alt ?? ''} className="h-full w-full object-cover" />
            </div>
          ))}
        </div>

        {/* Text */}
        <div className="relative min-h-0 flex-1 sm:w-[48%]">
          <div className="flex items-center gap-3">
            <span className="relative block h-5 w-8 overflow-hidden font-mono text-detail tabular-nums text-muted">
              {steps.map((_, i) => (
                <span
                  key={i}
                  ref={(el) => {
                    countRefs.current[i] = el;
                  }}
                  className="absolute inset-0"
                  style={{ opacity: i === 0 ? 1 : 0 }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
              ))}
            </span>
            <span className="relative block h-px flex-1 bg-line">
              <span ref={barRef} className="absolute inset-y-0 left-0 block w-full bg-accent" />
            </span>
            <span className="font-mono text-detail tabular-nums text-muted">{String(steps.length).padStart(2, '0')}</span>
          </div>

          <div className="relative mt-5 h-[calc(100%-2.5rem)] sm:mt-8">
            {steps.map((s, i) => (
              <div
                key={s.title}
                ref={(el) => {
                  textRefs.current[i] = el;
                }}
                className="absolute inset-0"
                style={{ opacity: i === 0 ? 1 : 0 }}
              >
                {/* a big ghost numeral behind the text */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-3 right-0 select-none font-display text-[6.5rem] font-semibold leading-none tracking-[-0.04em] text-accent/[0.09] sm:text-[9rem]"
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-accent-050 text-accent-700 shadow-[inset_0_0_0_1px_rgba(0,120,50,0.12)]">
                  <Icon name={s.icon} size={26} />
                </span>
                <p className="relative mt-6 text-label font-semibold uppercase tracking-[0.16em] text-accent-700">{s.label}</p>
                <h3 className="relative mt-2 font-display text-[2.15rem] font-semibold leading-[1.05] tracking-[-0.025em] text-ink text-balance sm:text-[3rem]">
                  {s.title}
                </h3>
                <p className="relative mt-4 max-w-md text-[1.0625rem] leading-relaxed text-muted sm:text-[1.1875rem]">{s.desc}</p>
                {cta && i === steps.length - 1 && (
                  <Link to={cta.to} className="btn btn-accent-bright btn-lg relative mt-7">
                    {cta.label} <Icon name="arrowRight" size={17} />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
