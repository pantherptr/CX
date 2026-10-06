import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { Img } from '../motion';
import { eur } from '../../lib/format';
import { unsplash, unsplashSrcSet } from '../../lib/img';
import { useLocale } from '../../lib/i18n';
import type { Car } from '../../data/types';

/** How long each car stays in front before the next one takes over. */
const SLIDE_MS = 6500;

/**
 * The Home page's fleet showcase: the best-rated car, huge, over its own
 * photo — with the rest of the top fleet as a strip of thumbnails below.
 * It advances by itself (pausing on hover, focus, when scrolled out of
 * view and in a background tab) and a tap or swipe takes you straight to
 * any car. Real listings only: every car links to its own page.
 *
 * The countdown is a plain CSS animation on the active thumbnail's bar,
 * so "paused" holds its exact position and there is no JS timer to drift.
 * With reduced motion it never advances on its own.
 */
export function FleetShowcase({ cars }: { cars: Car[] | null }) {
  const { t } = useLocale();
  const list = (cars ?? []).filter((c) => c.images?.[0]);
  const n = list.length;

  const [active, setActive] = useState(0);
  // Only the photos near the active one are mounted — eight full-size
  // photos at once would be a lot of weight for a single section.
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set([0, 1]));
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const [reduceMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  const panelRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  const go = (i: number) => setActive(((i % n) + n) % n);
  const next = () => go(active + 1);
  const prev = () => go(active - 1);

  // Keep the active photo and the one after it mounted.
  useEffect(() => {
    if (n === 0) return;
    setLoaded((s) => {
      const out = new Set(s);
      out.add(active % n);
      out.add((active + 1) % n);
      return out.size === s.size ? s : out;
    });
  }, [active, n]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const ob = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    ob.observe(el);
    return () => ob.disconnect();
  }, [n]);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Scroll the thumbnail strip (and only the strip, never the page) so the
  // active car is centred in it.
  useEffect(() => {
    const box = railRef.current;
    const el = thumbRefs.current[active];
    if (!box || !el) return;
    box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.clientWidth) / 2, behavior: 'smooth' });
  }, [active]);

  if (cars === null) {
    return <div className="skeleton min-h-[40rem] rounded-[2rem] lg:min-h-[46rem]" aria-hidden="true" />;
  }
  if (n === 0) return null;

  const car = list[active % n];
  const paused = hovered || focused || !visible || hidden;
  const autoplay = n > 1 && !reduceMotion;

  return (
    <div
      ref={panelRef}
      data-surface="noir"
      role="region"
      aria-roledescription="carousel"
      aria-label={t('Explore the CX Fleet')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') next();
        else if (e.key === 'ArrowLeft') prev();
      }}
      onTouchStart={(e) => {
        touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        const s = touchRef.current;
        touchRef.current = null;
        if (!s || n < 2) return;
        const dx = e.changedTouches[0].clientX - s.x;
        const dy = e.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) (dx < 0 ? next : prev)();
      }}
      className="relative isolate overflow-hidden rounded-[2rem] bg-noir shadow-card"
    >
      <div className="relative flex flex-col justify-between gap-5 px-5 py-6 sm:min-h-[42rem] sm:gap-10 sm:px-10 sm:py-10 lg:min-h-[46rem] lg:px-14 lg:py-12">
        {/* -------- Header -------- */}
        <div className="flex items-start justify-between gap-6">
          <div className="max-w-xl">
            <p className="eyebrow text-accent-bright">{t('Explore the CX Fleet')}</p>
            <h2 className="mt-3 font-display text-3xl font-semibold leading-[1.05] text-on-noir text-balance sm:text-5xl">
              {t('Choose the car that fits your journey.')}
            </h2>
          </div>
          <div className="hidden shrink-0 items-center gap-3 sm:flex">
            <Link
              to="/browse"
              className="inline-flex items-center gap-1.5 text-body font-medium text-on-noir transition-colors hover:text-accent-bright"
            >
              {t('View all cars')} <Icon name="arrowRight" size={15} />
            </Link>
            {n > 1 && (
              <span className="flex items-center gap-2">
                {([-1, 1] as const).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => go(active + dir)}
                    aria-label={dir === -1 ? 'Previous' : 'Next'}
                    className="grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-white/10 text-on-noir backdrop-blur-md transition hover:border-white/40 hover:bg-white/20 active:scale-95"
                  >
                    <Icon name={dir === -1 ? 'chevronLeft' : 'chevronRight'} size={18} />
                  </button>
                ))}
              </span>
            )}
          </div>
        </div>

        {/* -------- Photos — cross-fade, each one settling in slowly. On a
            phone this is a band of its own between the title and the car
            (text over a bright photo is unreadable at that width); from
            `sm` up it is the whole panel's background. -------- */}
        <div className="relative -mx-5 h-64 sm:absolute sm:inset-0 sm:mx-0 sm:-z-10 sm:h-auto">
          {list.map((c, i) =>
            loaded.has(i) ? (
              <div
                key={c.id}
                aria-hidden="true"
                className={`absolute inset-0 ${i === active ? 'opacity-100' : 'opacity-0'}`}
                style={{
                  transform: i === active ? 'scale(1)' : 'scale(1.06)',
                  transition: reduceMotion ? 'none' : 'opacity 900ms ease, transform 7000ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              >
                <Img
                  src={unsplash(c.images[0], 1600)}
                  srcSet={unsplashSrcSet(c.images[0], [800, 1200, 1800, 2400])}
                  sizes="(min-width: 1280px) 1200px, 100vw"
                  alt=""
                  loading={i === 0 ? 'eager' : 'lazy'}
                  className="absolute inset-0 h-full w-full object-cover"
                  fallback={null}
                />
              </div>
            ) : null,
          )}
          {/* Phone: the band melts into the panel above and below it */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-noir via-noir/70 to-transparent sm:hidden" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-noir to-transparent sm:hidden" />
          {/* sm and up: dark on the left for the copy, top for the title, bottom for the strip */}
          <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-noir/70 via-noir/10 to-transparent sm:block" />
          <div className="pointer-events-none absolute inset-x-0 top-0 hidden h-2/5 bg-gradient-to-b from-noir/60 to-transparent sm:block" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-[68%] bg-gradient-to-t from-noir/95 via-noir/70 to-transparent sm:block" />
        </div>

        {/* -------- The car in front -------- */}
        <div>
          {/* Re-keyed so its copy rises in again on every change */}
          <div key={car.id} className="animate-page [text-shadow:0_1px_14px_rgba(0,0,0,0.55)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-caption font-semibold text-on-noir backdrop-blur-md">
                <Icon name="star" size={13} className="text-star" /> {car.rating.toFixed(2)}
                <span className="font-medium text-on-noir-muted">· {t('{n} trips', { n: car.trips })}</span>
              </span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-caption font-semibold text-on-noir backdrop-blur-md">
                {t(car.category)}
              </span>
              {car.instantBook && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-bright px-3 py-1.5 text-caption font-semibold text-noir">
                  <Icon name="instant" size={13} /> {t('Instant book')}
                </span>
              )}
            </div>

            <h3 className="mt-4 font-display text-4xl font-semibold leading-[1] tracking-[-0.02em] text-on-noir text-balance sm:text-6xl lg:text-7xl">
              {car.make} {car.model}
            </h3>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 text-lead text-on-noir-muted">
              {car.trim && <span>{car.trim} ·</span>}
              <span>{car.year}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Icon name="pin" size={15} /> {car.city}
              </span>
            </p>

            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-body text-on-noir">
              <span className="inline-flex items-center gap-2">
                <Icon name="seat" size={17} className="text-accent-bright" /> {t('{n} seats', { n: car.seats })}
              </span>
              <span className="inline-flex items-center gap-2">
                <Icon name="gear" size={17} className="text-accent-bright" /> {t(car.transmission)}
              </span>
              <span className="inline-flex items-center gap-2">
                <Icon name="gas" size={17} className="text-accent-bright" /> {t(car.fuel)}
              </span>
            </div>

            <div className="mt-7 flex flex-wrap items-end gap-x-8 gap-y-5">
              <p className="text-on-noir">
                <span className="font-display text-5xl font-semibold sm:text-6xl">{eur(car.pricePerDay)}</span>
                <span className="ml-1.5 text-lead text-on-noir-muted">{t('/day')}</span>
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link to={`/cars/${car.slug}`} className="btn btn-accent-bright btn-lg">
                  View details <Icon name="arrowRight" size={17} />
                </Link>
                <Link
                  to="/browse"
                  className="btn btn-lg border border-white/25 bg-white/10 text-on-noir backdrop-blur-md hover:border-white/45 hover:bg-white/20 sm:hidden"
                >
                  {t('View all cars')}
                </Link>
              </div>
            </div>
          </div>

          {/* -------- The rest of the fleet -------- */}
          {n > 1 && (
            <div
              ref={railRef}
              className="scrollbar-none relative mt-8 flex gap-3 overflow-x-auto overscroll-x-contain pb-1 sm:mt-10"
              role="tablist"
              aria-label={t('Explore the CX Fleet')}
            >
              {list.map((c, i) => {
                const on = i === active;
                return (
                  <button
                    key={c.id}
                    ref={(el) => {
                      thumbRefs.current[i] = el;
                    }}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    aria-label={`${c.make} ${c.model}`}
                    onClick={() => go(i)}
                    className={`group relative h-[4.5rem] w-28 shrink-0 overflow-hidden rounded-xl border text-left transition-[opacity,border-color,transform] duration-300 sm:h-24 sm:w-40 ${
                      on ? 'border-white/80 opacity-100' : 'border-white/15 opacity-70 hover:border-white/50 hover:opacity-100'
                    }`}
                  >
                    <Img
                      src={unsplash(c.images[0], 320)}
                      srcSet={unsplashSrcSet(c.images[0], [320, 480])}
                      sizes="160px"
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      fallback={null}
                    />
                    <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                    <span className="absolute inset-x-2 bottom-2 truncate text-caption font-semibold text-white">
                      {c.make} {c.model}
                    </span>
                    {on && autoplay && (
                      <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
                        <span
                          key={`${c.id}-${active}`}
                          className="block h-full bg-accent-bright"
                          style={{
                            width: '0%',
                            animationName: 'signal-story-progress',
                            animationDuration: `${SLIDE_MS}ms`,
                            animationTimingFunction: 'linear',
                            animationFillMode: 'forwards',
                            animationPlayState: paused ? 'paused' : 'running',
                          }}
                          onAnimationEnd={next}
                        />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
