import { ScrollRevealImage } from '../components/ScrollRevealImage';
import { PostMarquee } from '../components/home/PostMarquee';
import { SignalDeck } from '../components/home/SignalDeck';
import { ProtectionIcon, type ProtectionKind } from '../components/home/ProtectionIcon';
import { ProtectionTeam } from '../components/home/ProtectionTeam';
import { OwnersBento } from '../components/home/OwnersBento';
import { FindPoster } from '../components/home/scenes/FindPoster';
import { BlurText } from '../components/ui/blur-text';
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../lib/theme';
import { SignalS } from '../components/SignalLogo';
import { Icon, type IconName } from '../components/Icon';
import { SearchBar } from '../components/SearchBar';
import { SectionHead } from '../components/primitives';
import { Reveal } from '../components/motion';
import { FindCarDeck } from '../components/FindCarDeck';
import { ConciergeLauncher, ConciergeMark } from '../components/Concierge';
import { useCars } from '../lib/data/cars';
import { eur } from '../lib/format';
import { FaqItem } from '../components/FaqItem';
import { faqs } from '../data/faqs';
import { useLocale } from '../lib/i18n';

// The scroll story for "How it works" carries gsap, so it is only fetched when the section is near.
const StickySteps = lazy(() => import('../components/StickySteps'));


/** The hero words, one letter at a time: each letter rises into place in sequence when the page opens, then
 *  a slow, small wave passes through them now and then. Each letter paints its own copy of the heading's
 *  gradient (a parent's clipped gradient would vanish behind transformed children). Purely visual — the
 *  full phrase is kept for screen readers by the caller. */
/** Step 4 of How it works: a pin dropping on a soft green map, no photo (the photo sits on its own below). */
function DeliveryScene() {
  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden bg-gradient-to-br from-[#eafaf0] via-white to-[#d6f5e1]">
      <span aria-hidden className="absolute h-[70%] w-[70%] rounded-full bg-[radial-gradient(closest-side,rgba(0,222,84,0.28),rgba(0,222,84,0))]" />
      <span aria-hidden className="absolute h-[44%] w-[44%] rounded-full border border-accent-bright/30" />
      <span aria-hidden className="absolute h-[64%] w-[64%] rounded-full border border-accent-bright/15" />
      <svg viewBox="0 0 240 240" className="relative mt-[6%] h-[64%] w-[64%]" fill="none" role="img" aria-label="">
        <ellipse cx="120" cy="206" rx="86" ry="9" fill="#0a3d22" opacity="0.1" />
        {/* house */}
        <path d="M44 112 120 52l76 60v86H44z" fill="#fff" stroke="#0a3d22" strokeWidth="5" strokeLinejoin="round" />
        <path d="M32 116 120 46l88 70" stroke="#0a3d22" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="104" y="146" width="32" height="52" rx="5" fill="#00c853" stroke="#0a3d22" strokeWidth="5" />
        <circle cx="129" cy="173" r="2.6" fill="#0a3d22" />
        <rect x="58" y="128" width="30" height="26" rx="4" fill="#d8f7e3" stroke="#0a3d22" strokeWidth="4" />
        <rect x="152" y="128" width="30" height="26" rx="4" fill="#d8f7e3" stroke="#0a3d22" strokeWidth="4" />
        <path d="M168 78V58h14v34" stroke="#0a3d22" strokeWidth="5" strokeLinejoin="round" />
        {/* pin on the house */}
        <g className="pi-bob">
          <path d="M120 6c-15 0-27 11.5-27 26 0 19 27 40 27 40s27-21 27-40c0-14.500-12-26-27-26z" fill="#00de54" stroke="#0a3d22" strokeWidth="5" strokeLinejoin="round" />
          <circle cx="120" cy="32" r="9" fill="#fff" stroke="#0a3d22" strokeWidth="4" />
        </g>
      </svg>
    </div>
  );
}

function Letters({ text, from = 0, light = false, breathe = false }: { text: string; from?: number; light?: boolean; breathe?: boolean }) {
  return (
    <>
      {Array.from(text).map((ch, i) =>
        ch === ' ' ? ' ' : (
          <span key={i} aria-hidden="true" className="hero-letter" style={{ ['--i' as string]: from + i }}>
            <span className={`hero-glyph${light ? ' hero-lit' : ''}${breathe ? ' hero-breathe' : ''}`} data-ch={ch}>{ch}</span>
          </span>
        ),
      )}
    </>
  );
}

/** A heading that sets its own font size so the single-line text fills its box exactly, whatever the
 *  language (English is longer than Italian). Below `sm` the phone layout (two lines, vw sizes) is kept. */
function FitHeading({ as: Tag, className, style, max, ariaHidden, children }: {
  as: 'h1' | 'p'; ariaHidden?: boolean; className: string; style?: CSSProperties; max: number; children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      if (window.innerWidth < 640) { el.style.fontSize = ''; return; }
      const avail = el.clientWidth;
      el.style.fontSize = '100px';
      const line = el.querySelector<HTMLElement>('[data-fit]');
      const w = line?.scrollWidth ?? 0;
      if (!avail || !w) { el.style.fontSize = ''; return; }
      el.style.fontSize = `${Math.min(max, (avail / w) * 100 * 0.94)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  });
  return <Tag ref={ref as never} aria-hidden={ariaHidden || undefined} className={className} style={style}>{children}</Tag>;
}


/** The SIGNAL preview: a Story and two posts, fanned side by side, built
 *  from SIGNAL's own pieces (verified badges, vehicle link, Respect / Save /
 *  Share row, CX team comment). Decorative sample content. Laid out at a
 *  fixed design size and scaled down to fit. */
/** Every claim here maps to a real, shippable feature — not aspirational
 *  copy. Booking.tsx's 5-step flow (easy booking), its editable pickup
 *  location + calendar (flexible pickup), its free-cancellation policy
 *  (also echoed in the hero trust row), the real /help + messaging-backed
 *  support channel (24/7 support), and profiles.verified host identity
 *  checks (verified hosts) are all live in the product today. */
const howSteps: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'search', title: 'Find your car', desc: 'Search by city, dates and car type. Every host is verified.' },
  { icon: 'calendar', title: 'Book in minutes', desc: 'Reserve instantly on eligible cars and pay securely. See the cancellation policy before you pay.' },
  { icon: 'key', title: 'Hit the road', desc: 'Meet your host, enjoy the drive, then hand the keys back.' },
  { icon: 'pin', title: 'Or have it brought to you', desc: 'Prefer not to collect? Choose delivery and the car arrives right at your door.' },
];

const HOME_FAQ_QUESTIONS = [
  'How does booking a car work?',
  'Is my trip insured?',
  'What are the cancellation policies?',
  'Can I change my trip dates after booking?',
  'How do I coordinate pickup with my host?',
  'How do I become a host?',
];
const HOME_FAQS = HOME_FAQ_QUESTIONS.map((q) => faqs.find((f) => f.q === q)).filter((f): f is (typeof faqs)[number] => !!f);

export default function Home() {
  const { t } = useLocale();
  // The Home is pure white in the light theme (no cream tint, no grey band between sections); the dark theme keeps its own look.
  const theme = useTheme();
  useEffect(() => {
    if (theme === 'dark') return;
    const root = document.documentElement;
    root.classList.add('home-white');
    return () => root.classList.remove('home-white');
  }, [theme]);
  const { cars: allCars } = useCars();

  // The hero has a little depth: headline, car and ghost line drift by different amounts as you scroll.
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const h = el.offsetHeight || 1;
      el.style.setProperty('--hero-p', String(Math.min(1, Math.max(0, window.scrollY / h)).toFixed(3)));
    };
    const onScroll = () => { if (!raf) raf = window.requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (raf) window.cancelAnimationFrame(raf); };
  }, []);
  const cheapest = allCars && allCars.length > 0 ? Math.min(...allCars.map((c) => c.pricePerDay)) : null;

  // "How it works": the scroll story mounts (and gsap downloads) only when the section is near the screen.
  const howRef = useRef<HTMLDivElement>(null);
  const [howNear, setHowNear] = useState(false);
  useEffect(() => {
    const el = howRef.current;
    if (!el || howNear) return;
    if (typeof IntersectionObserver === 'undefined') { setHowNear(true); return; }
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) { setHowNear(true); io.disconnect(); } },
      { rootMargin: '900px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [howNear]);
  // The three step photos and the delivery photo are CX's own pictures, served from /home (not photos of random fleet cars).
  // Step 2 keeps CX's photo; steps 1 and 3 and the delivery are animated illustrations (components/home/scenes).
  const howImages = ['', '/home/book-1100.webp', '/home/road-1100.webp', ''];
  const howPositions = [undefined, '50% 50%', '50% 50%', undefined];
  const howStatic = (
        <div role="list" className="mt-8 grid gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
          {howSteps.map((st, i) => (
            <Reveal key={st.title} delay={i * 80}>
              <div role="listitem" className="relative flex h-full items-start gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-col sm:gap-5 sm:p-6">
                {/* A thread from this step's icon to the next card — the
                    three really are one sequence, so they shouldn't read
                    as three unrelated boxes. Down the gap on phones,
                    across it on wider screens. */}
                {i < howSteps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-[2.625rem] top-full h-3 w-px bg-accent/35 sm:left-full sm:top-[2.875rem] sm:h-px sm:w-5"
                  />
                )}
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-050 text-accent-700">
                  <Icon name={st.icon} size={20} />
                </span>
                <div>
                  <p className="text-label font-semibold uppercase tracking-[0.14em] text-faint">{t('Step {n}', { n: i + 1 })}</p>
                  <h3 className="mt-1 font-display text-lg font-semibold text-ink">{t(st.title)}</h3>
                  <p className="mt-1.5 text-detail leading-relaxed text-muted">{t(st.desc)}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
  );

  return (
    <div>
      {/* ================= HERO — big type behind a cut-out car =================
          The photo style: huge italic words sit behind the car and the car breaks out in front of
          them (the cut-out is public/hero-car.webp). The section still pulls itself up under the
          sticky header by the same amount as before (see Navbar), so nothing else shifts. */}
      <section className="relative isolate -mt-[calc(4rem+env(safe-area-inset-top,0px))] overflow-hidden">
        <div
          aria-hidden
          className="hero-bg pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(180deg, var(--hero-top) 0%, var(--color-bg) 100%)' }}
        />

        <div className="relative z-10 mx-auto max-w-[1400px] px-5 pb-16 pt-24 sm:px-8 sm:pt-28 lg:px-10">
          {/* -------- The stage: word / car / word -------- */}
          <Reveal className="reveal-blur">
            <div ref={stageRef} className="relative mx-auto aspect-[1/1.04] w-full select-none sm:aspect-[16/8]">
              <FitHeading
                as="h1"
                max={200}
                className="hero-par-up absolute inset-x-0 top-[3%] -skew-x-[9deg] text-center font-display font-black uppercase leading-[0.84] tracking-[-0.045em] text-transparent text-[18.5vw]"
                style={{
                  ['--hero-grad' as string]: 'linear-gradient(180deg, #5cf58c 0%, #1fe563 28%, #00a63e 62%, #006a28 100%)',
                }}
              >
                <span className="sr-only">{t('I own the keys')}</span>
                <span className="block sm:hidden"><Letters text={t('I own')} light /><br /><Letters text={t('the keys')} from={t('I own').length} light /></span>
                <span data-fit className="hidden whitespace-nowrap sm:inline-block"><Letters text={t('I own the keys')} light /></span>
              </FitHeading>
              <FitHeading
                as="p"
                ariaHidden
                max={170}
                className="hero-par-down absolute inset-x-0 bottom-[0%] -skew-x-[9deg] text-center font-display font-black uppercase leading-[0.84] tracking-[-0.045em] text-transparent text-[19.5vw]"
                style={{
                  ['--hero-grad' as string]: 'linear-gradient(180deg, var(--hero-ghost-a) 0%, var(--hero-ghost-b) 55%, var(--hero-ghost-c) 100%)',
                }}
              >
                <span className="block sm:hidden"><Letters text={t('to your')} from={14} breathe /><br /><Letters text={t('heart.')} from={14 + t('to your').length} breathe /></span>
                <span data-fit className="hidden whitespace-nowrap sm:inline-block"><Letters text={t('to your heart.')} from={14} breathe /></span>
              </FitHeading>

              {/* A soft pool of green light behind the car (no rings), so it stands in a place */}
              <span
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-[52%] h-[72%] w-[94%] -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
                style={{ background: 'radial-gradient(closest-side, rgba(0,222,84,0.30), rgba(0,222,84,0.10) 55%, rgba(0,222,84,0) 78%)', filter: 'blur(14px)' }}
              />

              {/* The car, in front of both: it stands still: lights switch on and the exhaust pops twice
                  as the page opens (CSS only, see .hero-car in index.css). */}
              <div
                className="hero-car absolute left-1/2 w-[96%] max-w-[1180px] -translate-x-1/2 -translate-y-1/2 sm:w-[68%]"
                style={{ aspectRatio: '859 / 386', top: 'calc(50% + var(--hero-p, 0) * 14px)' }}
              >
                <div className="hero-car-body relative h-full w-full">
                  <span aria-hidden className="hero-shadow" />
                  <span aria-hidden className="hero-flame" style={{ top: '45%', animationDelay: '0.75s' }} />
                  <span aria-hidden className="hero-flame" style={{ top: '55%', animationDelay: '0.95s' }} />
                  <span aria-hidden className="hero-beam" style={{ top: '20%', ['--r' as string]: '7deg' }} />
                  <span aria-hidden className="hero-beam" style={{ top: '81%', ['--r' as string]: '-7deg' }} />
                  <span aria-hidden className="hero-lamp hero-head" style={{ left: '8.8%', top: '20%', ['--r' as string]: '-38deg' }} />
                  <span aria-hidden className="hero-lamp hero-head" style={{ left: '8.7%', top: '81%', ['--r' as string]: '38deg' }} />
                  <span aria-hidden className="hero-lamp hero-tail" style={{ left: '92.4%', top: '20.5%', ['--r' as string]: '42deg' }} />
                  <span aria-hidden className="hero-lamp hero-tail" style={{ left: '94.4%', top: '76%', ['--r' as string]: '-55deg' }} />
                  <img
                    src="/hero-car.webp?v=3"
                    alt={t('A premium CX car')}
                    width={859}
                    height={386}
                    fetchPriority="high"
                    draggable={false}
                    className="relative block h-full w-full"
                  />
                </div>
              </div>

              {/* Captions, like the reference: a rule + two lines left, an icon + two lines right */}
              <div className="absolute left-0 top-[41%] hidden max-w-[7.5rem] sm:block lg:max-w-[10rem]">
                <span className="mb-2 block h-px w-12 bg-ink/60" />
                <p className="text-label lg:text-detail font-semibold uppercase leading-snug tracking-wide text-ink">
                  {t('Premium cars. Verified hosts.')}
                </p>
              </div>
              <div className="absolute right-0 top-[41%] hidden max-w-[8.5rem] items-center gap-2 sm:flex lg:max-w-none lg:gap-2.5">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-ink/25 text-ink"><Icon name="shield" size={18} /></span>
                <p className="text-label font-semibold uppercase leading-snug tracking-wide text-ink lg:text-detail">
                  {t('Protected trips')}
                </p>
              </div>
            </div>
          </Reveal>

          {/* -------- Two quiet facts, in the place the reference puts its price strip -------- */}
          <Reveal delay={120}>
            <div className="mt-5 grid grid-cols-2 divide-x divide-line overflow-hidden rounded-2xl border border-line bg-white/70 backdrop-blur sm:mt-8">
              <div className="flex flex-col items-start gap-1 px-4 py-3.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-3 sm:gap-y-1 sm:px-6">
                <span className="text-label font-semibold uppercase tracking-[0.12em] text-ink-soft">{t('From')}</span>
                <span className="flex items-baseline gap-2">
                  <span className="font-display text-2xl font-bold text-accent sm:text-4xl">{cheapest != null ? eur(cheapest) : '—'}</span>
                  <span className="text-detail text-muted">{t('/day')}</span>
                </span>
              </div>
              <div className="flex flex-col items-start gap-1 px-4 py-3.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-3 sm:gap-y-1 sm:px-6">
                <span className="text-label font-semibold uppercase tracking-[0.12em] text-ink-soft">{t('Available')}</span>
                <span className="font-display text-xl font-bold leading-tight text-accent sm:text-4xl">{t('Worldwide')}</span>
              </div>
            </div>
          </Reveal>

          {/* -------- The line, then search, then the host button centred under the dates -------- */}
          <Reveal delay={160} className="reveal-blur">
            <div className="mt-8 flex justify-center sm:mt-12">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-ink/10 bg-white/65 px-3 py-1.5 text-label font-semibold uppercase tracking-[0.12em] text-ink-soft shadow-hair backdrop-blur-md">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute h-1.5 w-1.5 animate-ping rounded-full bg-accent-bright/50" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-accent-bright" />
                </span>
                {t('Wherever there’s a road, there’s a CX.')}
              </span>
            </div>
          </Reveal>

          {/* -------- Search -------- */}
          <Reveal delay={260}>
            <div className="mx-auto mt-6 w-full max-w-4xl">
              <SearchBar />
            </div>
          </Reveal>

          <Reveal delay={360} className="reveal-blur">
            <div className="mt-6 flex justify-center">
              <Link to="/list-your-car" className="btn btn-accent-bright btn-lg">
                {t('List Your Car')} <Icon name="arrowRight" size={17} />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= SWIPE — find your car by swiping (+ a small invite to X) ================= */}
      <section className="container-page section-tight">
        <div className="mx-auto max-w-md sm:max-w-lg">
          <p className="eyebrow">{t('Swipe to find')}</p>
          <BlurText as="h2" className="mt-3 font-display text-[2.15rem] font-semibold leading-[1.04] tracking-[-0.028em] text-ink text-balance sm:text-[3rem]" text={t('Find your car by swiping.')} />
          <p className="mt-3 text-copy leading-relaxed text-muted">
            {t('Swipe right to save a car, left to skip it. Tap View to see it.')}
          </p>
          <div className="mt-7 -mx-5">
            <FindCarDeck />
          </div>
          <Link to="/browse" className="btn btn-lg mt-6 border border-line-strong bg-surface text-ink">
            {t('Browse all cars')} <Icon name="arrowRight" size={17} />
          </Link>
          <ConciergeLauncher className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-surface p-3 text-left shadow-hair ring-1 ring-black/[0.05] transition-transform active:scale-[0.99]">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-panel"><ConciergeMark size={32} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-ink">{t('Not sure which one? Ask X')}</span>
              <span className="block truncate text-detail text-muted">{t('Tell it how you want to drive')}</span>
            </span>
            <Icon name="chevronRight" size={16} className="shrink-0 text-faint" />
          </ConciergeLauncher>
        </div>
      </section>

      {/* ================= HOW IT WORKS — four real steps (the last one is the delivery), one glance ================= */}
      <section className="container-page section-tight">
        <SectionHead
          eyebrow={t('How it works')}
          title={t('From search to your door in four steps.')}
          action={
            <Link
              to="/how-it-works"
              className="hit-44 inline-flex items-center gap-1.5 text-body font-medium text-accent transition-colors hover:text-accent-600"
            >
              {t('Learn more')} <Icon name="arrowRight" size={15} />
            </Link>
          }
        />
        <div ref={howRef} className="mt-8">
          {howNear ? (
            <Suspense fallback={howStatic}>
              <StickySteps
                stepWord={t('How it works')}
                cta={{ label: t('Find a car near you'), to: '/browse' }}
                steps={howSteps.map((st, i) => ({
                  icon: st.icon,
                  label: t('Step {n}', { n: i + 1 }),
                  title: t(st.title),
                  desc: t(st.desc),
                  image: howImages[i],
                  position: howPositions[i],
                  scene: i === 0 ? <FindPoster /> : i === 3 ? <DeliveryScene /> : undefined,
                }))}
              />
            </Suspense>
          ) : (
            howStatic
          )}
        </div>
        {/* CX Delivery: the photo on its own, then how it works at checkout */}
        <ScrollRevealImage
          src="/home/delivery-1122.webp"
          srcSet="/home/delivery-800.webp 800w, /home/delivery-1122.webp 1122w"
          position="50% 40%"
          alt={t('Your car, delivered to your door')}
          className="mt-10 h-[30rem] sm:h-[36rem]"
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-noir/45 via-transparent to-transparent" />
          <span className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full bg-white/90 px-3.5 py-2 text-caption font-semibold text-ink shadow-hair backdrop-blur">
            <Icon name="pin" size={14} className="text-accent" /> {t('Delivered to your door')}
          </span>
        </ScrollRevealImage>
        <Reveal>
          <div className="mt-8 rounded-[1.75rem] border border-line bg-surface px-5 py-7 sm:px-10 sm:py-10 lg:grid lg:grid-cols-2 lg:items-center lg:gap-14">
            <div>
              <p className="eyebrow">{t('CX Delivery')}</p>
              <h3 className="mt-2 font-display text-[1.7rem] font-semibold leading-[1.08] tracking-[-0.02em] text-ink text-balance sm:text-[2.2rem]">{t('Your journey starts at your door.')}</h3>
            </div>
            <div className="mt-6 lg:mt-0">
              <ul className="space-y-3">
                {[
                  'Choose delivery at checkout, to the address you pick',
                  'Hosts set their own delivery fee — you see it before you pay',
                  'Prefer to collect? Pick up from your host instead',
                ].map((line) => (
                  <li key={line} className="flex items-start gap-3 text-body text-ink-soft">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-050 text-accent-700">
                      <Icon name="check" size={12} strokeWidth={3} />
                    </span>
                    {t(line)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ================= SIGNAL — the community advantage ================= */}
      <section className="container-page section">
        <Reveal>
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div>
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-noir shadow-[0_8px_20px_-8px_rgba(0,212,71,0.55)]"><SignalS size={26} /></span>
                <p className="text-label font-semibold uppercase tracking-[0.2em] text-accent-700">{t('CX SIGNAL')}</p>
              </div>
              <BlurText as="h2" className="mt-5 max-w-xl font-display text-3xl font-semibold leading-[1.05] text-ink text-balance sm:text-5xl" text={t('Great drives deserve to be shared.')} />
              <p className="mt-3 max-w-md text-copy leading-snug text-muted">
                {t('News, new cars and real stories from the CX world.')}
              </p>
              <ul className="mt-5 grid grid-cols-3 gap-2">
                {([
                  { kind: 'broadcast', title: 'Straight from CX' },
                  { kind: 'heart', title: 'Real stories' },
                  { kind: 'growth', title: 'A stage for your car' },
                ] as { kind: ProtectionKind; title: string }[]).map((f) => (
                  <li key={f.title} className="flex flex-col items-start gap-2 rounded-2xl border border-line bg-surface p-3">
                    <ProtectionIcon kind={f.kind} size="sm" />
                    <span className="text-detail font-semibold leading-tight text-ink">{t(f.title)}</span>
                  </li>
                ))}
              </ul>
              <Link to="/signal" className="btn btn-primary btn-lg mt-6">
                {t('Open Signal')} <Icon name="arrowRight" size={17} />
              </Link>
            </div>
            <SignalDeck />
          </div>
          <div className="mt-12"><PostMarquee /></div>
        </Reveal>
      </section>

      {/* ================= PROTECTION — the team, and four promises ================= */}
      <ProtectionTeam />

      {/* ================= HOSTS — turn a parked car into income ================= */}
      <section className="container-page section-tight">
        <Reveal>
          <p className="eyebrow">{t('For car owners')}</p>
          <BlurText as="h2" className="mt-3 max-w-2xl font-display text-[2.15rem] font-semibold leading-[1.04] tracking-[-0.028em] text-ink text-balance sm:text-[3rem]" text={t('Your car is parked. It could be earning.')} />
          <p className="mt-3 max-w-lg text-copy leading-relaxed text-muted">
            {t('Share the car you love with drivers who will treat it right. Set your own price, decide how it is handed over, and stay in control of every trip.')}
          </p>
        </Reveal>
        <div className="mt-8"><OwnersBento /></div>
      </section>

      {/* ================= FAQ — the real answers from the Help Center ================= */}
      <section className="container-page section-tight">
        <Reveal>
          <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
            <div>
              <p className="eyebrow">{t('Good to know')}</p>
              <BlurText as="h2" className="mt-3 font-display text-[2.15rem] font-semibold leading-[1.04] tracking-[-0.028em] text-ink text-balance sm:text-[3rem]" text={t('Questions, answered.')} />
              <p className="mt-4 max-w-sm text-copy leading-relaxed text-muted text-pretty">
                {t('The essentials about booking, protection and cancellations — before you book.')}
              </p>
              <Link to="/help" className="hit-44 mt-5 inline-flex items-center gap-1.5 text-body font-semibold text-accent-700 transition-colors hover:text-accent-600">
                {t('Visit the Help Center')} <Icon name="arrowRight" size={16} />
              </Link>
            </div>
            <div className="rounded-3xl border border-line bg-white px-5 py-2 shadow-hair sm:px-8">
              {HOME_FAQS.map((f) => (
                <FaqItem key={f.q} q={t(f.q)} a={t(f.a)} />
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ================= FINAL CTA — light, quiet, no glow ================= */}
      <section className="container-page mt-20 mb-6 sm:mt-24">
        <Reveal>
          <div className="flex flex-col items-center gap-6 text-center">
            <BlurText as="h2" className="font-display text-3xl font-semibold text-ink text-balance sm:text-5xl" text={t('Ready for your next journey?')} />
            <p className="max-w-md text-copy leading-relaxed text-muted">
              {t('Premium cars from verified hosts, around the world.')}
            </p>
            <Link to="/browse" className="btn btn-accent-bright btn-lg">
              {t('Explore Cars')} <Icon name="arrowRight" size={17} />
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
