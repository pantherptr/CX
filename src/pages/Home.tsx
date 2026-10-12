import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SignalS } from '../components/SignalLogo';
import { Icon, type IconName } from '../components/Icon';
import { SearchBar } from '../components/SearchBar';
import { SectionHead, VerifiedBadge } from '../components/primitives';
import { Reveal, Img } from '../components/motion';
import { ConciergeLauncher, ConciergeMark } from '../components/Concierge';
import { useScramble } from '../lib/useScramble';
import { useCars } from '../lib/data/cars';
import { unsplash, unsplashSrcSet } from '../lib/img';
import { eur } from '../lib/format';
import { FaqItem } from '../components/FaqItem';
import { faqs } from '../data/faqs';
import { useLocale } from '../lib/i18n';


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
      el.style.fontSize = `${Math.min(max, (avail / w) * 100 * 0.97)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  });
  return <Tag ref={ref as never} aria-hidden={ariaHidden || undefined} className={className} style={style}>{children}</Tag>;
}

/** Faint floating symbols behind the SIGNAL card: reactions, chat, a chequered flag, cars. Decorative only. */
const SIGNAL_SYMBOLS: { s: string; x: number; y: number; size: number; rot: number; o: number; d: number }[] = [
  { s: '💬', x: 4, y: 10, size: 30, rot: -10, o: 0.16, d: 0 },
  { s: '🏁', x: 22, y: 6, size: 34, rot: 8, o: 0.18, d: 1.2 },
  { s: '👍', x: 40, y: 14, size: 28, rot: -6, o: 0.15, d: 2.1 },
  { s: '❤️', x: 58, y: 5, size: 26, rot: 12, o: 0.14, d: 0.6 },
  { s: '🔥', x: 76, y: 12, size: 32, rot: -8, o: 0.17, d: 1.8 },
  { s: '🚗', x: 92, y: 7, size: 34, rot: 6, o: 0.15, d: 2.6 },
  { s: '⭐', x: 8, y: 38, size: 24, rot: 14, o: 0.14, d: 1.5 },
  { s: '🔖', x: 48, y: 36, size: 24, rot: -12, o: 0.12, d: 0.3 },
  { s: '📸', x: 66, y: 33, size: 28, rot: 9, o: 0.14, d: 2.3 },
  { s: '🏆', x: 90, y: 40, size: 30, rot: -7, o: 0.16, d: 1 },
  { s: '👏', x: 5, y: 66, size: 28, rot: -9, o: 0.15, d: 2 },
  { s: '🏎️', x: 26, y: 78, size: 36, rot: 5, o: 0.17, d: 0.8 },
  { s: '💚', x: 44, y: 62, size: 24, rot: 10, o: 0.13, d: 1.7 },
  { s: '🔑', x: 62, y: 80, size: 28, rot: -14, o: 0.16, d: 2.8 },
  { s: '💬', x: 80, y: 68, size: 26, rot: 8, o: 0.14, d: 0.4 },
  { s: '🏁', x: 94, y: 88, size: 30, rot: -6, o: 0.15, d: 1.4 },
  { s: '✨', x: 14, y: 92, size: 22, rot: 0, o: 0.16, d: 2.4 },
  { s: '👍', x: 52, y: 92, size: 26, rot: 7, o: 0.13, d: 0.9 },
];

function SignalBackdrop() {
  return (
    <div aria-hidden className="signal-bg pointer-events-none absolute inset-0 select-none overflow-hidden">
      {SIGNAL_SYMBOLS.map((x, i) => (
        <span
          key={i}
          className="signal-bg__item absolute leading-none"
          style={{
            left: `${x.x}%`, top: `${x.y}%`, fontSize: Math.round(x.size * 1.3), opacity: Math.min(0.42, x.o * 2.4),
            transform: `rotate(${x.rot}deg)`, animationDelay: `${x.d}s`,
          }}
        >
          {x.s}
        </span>
      ))}
    </div>
  );
}

/** The SIGNAL preview: a Story and two posts, fanned side by side, built
 *  from SIGNAL's own pieces (verified badges, vehicle link, Respect / Save /
 *  Share row, CX team comment). Decorative sample content. Laid out at a
 *  fixed design size and scaled down to fit. */
function SignalFan() {
  const { t } = useLocale();
  const shell = 'absolute left-1/2 top-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_30px_55px_-26px_rgba(0,50,20,0.55)]';
  const place = (dx: number, rot: number, dy: number) => ({
    transform: `translate(calc(-50% + ${dx}rem), calc(-50% + ${dy}rem)) rotate(${rot}deg)`,
  });
  const Avatar = ({ src, size = 40 }: { src: string; size?: number }) => (
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover ring-1 ring-accent-bright/30" style={{ height: size, width: size }} />
  );
  const Actions = ({ respected }: { respected?: boolean }) => (
    <div className="grid grid-cols-3 gap-1 px-2 py-1">
      <span className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full py-2 text-detail font-semibold ${respected ? 'bg-accent-050 text-accent-700' : 'text-ink-soft'}`}>
        <Icon name="like" size={18} fill={respected} /> {respected ? t('Respected') : t('Respect')}
      </span>
      <span className="flex items-center justify-center gap-1.5 rounded-full py-2 text-detail font-semibold text-ink-soft">
        <Icon name="bookmark" size={17} /> {t('Save')}
      </span>
      <span className="flex items-center justify-center gap-1.5 rounded-full py-2 text-detail font-semibold text-ink-soft">
        <Icon name="share" size={17} /> {t('Share')}
      </span>
    </div>
  );
  return (
    <div aria-hidden="true" className="relative mx-auto h-[16.5rem] w-full sm:h-[30rem] lg:h-[25.5rem]">
      <div className="absolute left-1/2 top-0 -ml-[18rem] h-[30rem] w-[36rem] origin-top scale-[0.55] sm:scale-100 lg:scale-[0.85]">
        {/* Story */}
        <div className={`${shell} z-10 h-[24rem] w-[12rem] border-white/70 bg-noir`} style={place(-13.6, -7, 1.2)}>
          <img src="/signal/story.webp" alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70" />
          <div className="absolute inset-x-3 top-3 flex gap-1">
            {[1, 0.5, 0].map((f, i) => (
              <span key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                <span className="block h-full bg-white" style={{ width: `${f * 100}%` }} />
              </span>
            ))}
          </div>
          <div className="absolute inset-x-3 top-6 flex items-center gap-2 text-white">
            <span className="rounded-full bg-gradient-to-tr from-accent-bright to-accent p-[2px]"><Avatar src="/signal/av-adam.webp" size={34} /></span>
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-detail font-semibold">Adam <VerifiedBadge role="host" size={13} /></span>
              <span className="block text-caption text-white/75">{t('Amalfi Coast')}</span>
            </span>
          </div>
          <p className="absolute inset-x-3 bottom-4 text-detail font-medium leading-snug text-white">{t('Golden hour on the Amalfi Coast. Good cars, better people.')}</p>
        </div>

        {/* Post — Luca, with a CX team comment */}
        <div className={`${shell} z-10 w-[13.5rem]`} style={place(13.6, 7, 1.4)}>
          <div className="flex items-center gap-2.5 p-3">
            <Avatar src="/signal/av-luca.webp" size={36} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-detail font-semibold text-ink">Luca <VerifiedBadge role="client" size={13} /></span>
              <span className="block text-caption text-faint">Milano</span>
            </span>
            <Icon name="moreHorizontal" size={18} className="text-ink-soft" />
          </div>
          <p className="px-3 pb-2 text-caption leading-relaxed text-ink">{t('What a car! 😍 Rented it through CX for a weekend — easy to book, super host, car in perfect shape.')}</p>
          <img src="/signal/luca.webp" alt="" className="aspect-[16/10] w-full object-cover" loading="lazy" />
          <Actions />
          <div className="flex gap-2 border-t border-line px-3 py-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white ring-1 ring-line"><img src="/cx-logo-symbol.png" alt="" className="h-3.5 w-3.5 object-contain" /></span>
            <span className="min-w-0 text-caption leading-snug text-ink-soft">
              <span className="flex items-center gap-1 font-semibold text-ink">CX <VerifiedBadge role="admin" size={12} /></span>
              {t('Welcome to the CX family, Luca! 🙌 Thanks for sharing your experience.')}
            </span>
          </div>
        </div>

        {/* Post — Giulia, with the vehicle link (centre, on top) */}
        <div className={`${shell} z-20 w-[17rem]`} style={place(0, 0, -0.4)}>
          <div className="flex items-center gap-2.5 p-3">
            <Avatar src="/signal/av-giulia.webp" size={40} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-detail font-semibold text-ink">Giulia <VerifiedBadge role="client" size={14} /></span>
              <span className="block text-caption text-faint">Milano · 2h</span>
            </span>
            <Icon name="moreHorizontal" size={18} className="text-ink-soft" />
          </div>
          <p className="px-3 pb-2 text-detail leading-relaxed text-ink">{t('Night out, no stress. Booked in two minutes, keys in my hand in ten. Thank you CX 🖤')}</p>
          <img src="/signal/giulia.webp" alt="" className="aspect-[16/10] w-full object-cover" loading="lazy" />
          <Actions respected />
        </div>
      </div>
    </div>
  );
}

const trustRow: { icon: IconName; label: string }[] = [
  { icon: 'shield', label: 'Verified hosts' },
  { icon: 'calendar', label: 'Clear cancellation terms' },
  { icon: 'headset', label: '24/7 support' },
];

/** Every claim here maps to a real, shippable feature — not aspirational
 *  copy. Booking.tsx's 5-step flow (easy booking), its editable pickup
 *  location + calendar (flexible pickup), its free-cancellation policy
 *  (also echoed in the hero trust row), the real /help + messaging-backed
 *  support channel (24/7 support), and profiles.verified host identity
 *  checks (verified hosts) are all live in the product today. */
const howSteps: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'search', title: 'Find your car', desc: 'Search by city, dates and car type, and read real reviews from past trips.' },
  { icon: 'calendar', title: 'Book in minutes', desc: 'Reserve instantly on eligible cars and pay securely. See the cancellation policy before you pay.' },
  { icon: 'key', title: 'Hit the road', desc: 'Meet your host, enjoy the drive, then rate your experience.' },
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
  const startScramble = useScramble(t('Start'));
  const { cars: allCars } = useCars();

  // A real car photo for the delivery story (second-best rated so it
  // differs from the first fleet card).
  const deliveryImage = allCars?.[1]?.images[0] ?? allCars?.[0]?.images[0];
  const cheapest = allCars && allCars.length > 0 ? Math.min(...allCars.map((c) => c.pricePerDay)) : null;

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

        <div className="relative z-10 mx-auto max-w-[1400px] px-5 pb-6 pt-24 sm:px-8 sm:pt-28 lg:px-10">
          {/* -------- The stage: word / car / word -------- */}
          <Reveal className="reveal-blur">
            <div className="relative mx-auto aspect-[1/1.04] w-full select-none sm:aspect-[16/8]">
              <FitHeading
                as="h1"
                max={200}
                className="absolute inset-x-0 top-[3%] -skew-x-[9deg] text-center font-display font-black uppercase leading-[0.84] tracking-[-0.045em] text-transparent text-[18.5vw]"
                style={{
                  backgroundImage: 'linear-gradient(180deg, #1fe563 0%, #00a63e 55%, #007a30 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                }}
              >
                <span className="block sm:hidden">{t('I own')}<br />{t('the keys')}</span>
                <span data-fit className="hidden whitespace-nowrap sm:inline-block">{t('I own the keys')}</span>
              </FitHeading>
              <FitHeading
                as="p"
                ariaHidden
                max={170}
                className="absolute inset-x-0 bottom-[0%] -skew-x-[9deg] text-center font-display font-black uppercase leading-[0.84] tracking-[-0.045em] text-transparent text-[19.5vw]"
                style={{
                  backgroundImage: 'linear-gradient(180deg, var(--hero-ghost-a) 0%, var(--hero-ghost-b) 55%, var(--hero-ghost-c) 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                }}
              >
                <span className="block sm:hidden">{t('to your')}<br />{t('heart.')}</span>
                <span data-fit className="hidden whitespace-nowrap sm:inline-block">{t('to your heart.')}</span>
              </FitHeading>

              {/* The car, in front of both: it stands still: lights switch on and the exhaust pops twice
                  as the page opens (CSS only, see .hero-car in index.css). */}
              <div
                className="hero-car absolute left-1/2 top-[50%] w-[96%] max-w-[1180px] -translate-x-1/2 -translate-y-1/2 sm:w-[68%]"
                style={{ aspectRatio: '859 / 386' }}
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

          {/* -------- Headline row (the same words as before) -------- */}
          <div className="mt-8 grid items-end gap-6 sm:mt-12 lg:grid-cols-[1fr_auto]">
            <div className="max-w-2xl">
              <Reveal delay={160} className="reveal-blur">
                <span className="inline-flex w-fit items-center gap-2 rounded-full border border-ink/10 bg-white/65 px-3 py-1.5 text-label font-semibold uppercase tracking-[0.12em] text-ink-soft shadow-hair backdrop-blur-md">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute h-1.5 w-1.5 animate-ping rounded-full bg-accent-bright/50" />
                    <span className="relative h-1.5 w-1.5 rounded-full bg-accent-bright" />
                  </span>
                  {t('Wherever there’s a road, there’s a CX.')}
                </span>
              </Reveal>
              <Reveal delay={240} className="reveal-blur">
                <p className="mt-3 max-w-md text-lead leading-relaxed text-ink-soft text-pretty">
                  {t('Premium cars. Verified hosts. Ready for the road.')}
                </p>
              </Reveal>
            </div>
            <Reveal delay={280} className="reveal-blur">
              <div className="flex flex-wrap items-center gap-3">
                <Link to="/browse" className="btn btn-accent-bright btn-lg">
                  {t('Explore Cars')} <Icon name="arrowRight" size={17} />
                </Link>
                <Link to="/list-your-car" className="btn btn-lg border border-ink/15 bg-white/60 text-ink shadow-hair backdrop-blur-md hover:border-ink/30 hover:bg-white/80">
                  {t('List Your Car')}
                </Link>
              </div>
            </Reveal>
          </div>

          <Reveal delay={320}>
            <div className="mt-6 inline-flex max-w-full flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-ink/10 bg-white/70 px-4 py-2.5 shadow-hair backdrop-blur-md">
              {trustRow.map((tr) => (
                <span key={tr.label} className="inline-flex items-center gap-2 text-detail font-medium text-ink-soft">
                  <Icon name={tr.icon} size={15} className="text-accent" />
                  {t(tr.label)}
                </span>
              ))}
            </div>
          </Reveal>

          {/* -------- Search -------- */}
          <Reveal delay={360}>
            <div className="mx-auto mt-8 w-full max-w-4xl">
              <SearchBar />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= HOW IT WORKS — three real steps, one glance ================= */}
      <section className="container-page section-tight">
        <SectionHead
          eyebrow={t('How it works')}
          title={t('From search to road in three steps.')}
          action={
            <Link
              to="/how-it-works"
              className="inline-flex items-center gap-1.5 text-body font-medium text-accent transition-colors hover:text-accent-600"
            >
              {t('Learn more')} <Icon name="arrowRight" size={15} />
            </Link>
          }
        />
        <ol className="mt-8 grid gap-3 sm:grid-cols-3 sm:gap-5">
          {howSteps.map((st, i) => (
            <Reveal key={st.title} delay={i * 80}>
              <li className="relative flex h-full items-start gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-col sm:gap-5 sm:p-6">
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
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ================= DELIVERY — the emotional promise ================= */}
      <section className="container-page section-tight">
        <Reveal>
          <div className="grid overflow-hidden rounded-[1.75rem] border border-line bg-surface lg:grid-cols-2">
            <div className="relative min-h-[220px] bg-panel sm:min-h-[300px]">
              {deliveryImage && (
                <Img
                  src={unsplash(deliveryImage, 1000)}
                  srcSet={unsplashSrcSet(deliveryImage, [600, 1000, 1400])}
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                  fallback={null}
                />
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-noir/45 via-transparent to-transparent" />
              <span className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full bg-white/90 px-3.5 py-2 text-caption font-semibold text-ink shadow-hair backdrop-blur">
                <Icon name="pin" size={14} className="text-accent" /> {t('Delivered to your door')}
              </span>
            </div>
            <div className="px-6 py-9 sm:px-10 sm:py-12">
              <p className="eyebrow">{t('CX Delivery')}</p>
              <h2 className="mt-3 font-display text-3xl font-semibold text-ink text-balance sm:text-4xl">
                {t('Your journey starts at your door.')}
              </h2>
              <p className="mt-3 text-copy leading-relaxed text-muted">
                {t('Land in a new city and your car is already waiting. No queues, no counters, no detours — just the first mile of your trip, without the hassle.')}
              </p>
              <ul className="mt-6 space-y-3">
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
              <Link to="/browse" className="btn btn-accent-bright btn-lg mt-8">
                {t('Find a car near you')} <Icon name="arrowRight" size={17} />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ================= CONCIERGE — find your CX ================= */}
      <section className="container-page section">
        <Reveal>
          <div className="relative overflow-hidden rounded-[1.75rem] border border-accent/10 bg-[#eaf7ef] px-6 py-12 shadow-card sm:px-12 sm:py-16">
            <div
              className="pointer-events-none absolute inset-0 opacity-80"
              style={{ background: 'radial-gradient(45% 75% at 88% 12%, rgba(0,212,71,0.17), transparent 62%)' }}
            />
            <div className="relative grid items-center gap-10 md:grid-cols-[1fr_auto]">
              <div className="max-w-xl">
                <p className="inline-flex items-center gap-3 text-caption font-semibold uppercase tracking-[0.14em] text-accent-700">
                  <ConciergeMark size={44} live /> {t('CX Concierge')}
                </p>
                <h2 className="mt-4 font-display text-3xl font-semibold text-ink text-balance sm:text-4xl">
                  {t('Find your CX')}
                </h2>
                <p className="mt-3 text-copy leading-relaxed text-ink-soft sm:text-lead">
                  {t("Tell us how you want to drive — we'll find the right car. You don't need to find the right car; CX finds it for you.")}
                </p>
                <ConciergeLauncher className="btn btn-glint btn-accent-bright btn-lg mt-7" {...startScramble}>
                  <span className="btn-glint__sweep" aria-hidden="true" />
                  {startScramble.display} <Icon name="arrowRight" size={17} />
                </ConciergeLauncher>
              </div>

              {/* A glimpse of the real conversation — the same bubble,
                  answer cards and selected state the Concierge opens into,
                  so the card shows what it does instead of only saying it.
                  Decorative only; the button above is the way in. */}
              <div aria-hidden="true" className="w-full max-w-[300px] md:rotate-[1.5deg]">
                <div className="rounded-[1.5rem] border border-white/80 bg-white/70 p-4 shadow-[0_24px_50px_-24px_rgba(0,80,30,0.35)] backdrop-blur-md">
                  <div className="flex items-start gap-2.5">
                    <ConciergeMark size={28} />
                    <span className="rounded-2xl rounded-tl-md border border-line bg-white px-3.5 py-2 text-detail text-ink-soft shadow-hair">
                      {t('What kind of trip is this?')}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      { icon: 'route' as IconName, label: 'Road Trip', sub: 'Long-haul comfort', on: true },
                      { icon: 'gem' as IconName, label: 'Luxury', sub: 'The finest ride', on: false },
                      { icon: 'pin' as IconName, label: 'City', sub: 'Nimble around town', on: false },
                      { icon: 'gauge' as IconName, label: 'Performance', sub: 'Pure thrill', on: false },
                    ].map((o) => (
                      <span
                        key={o.label}
                        className={`flex items-center gap-2 rounded-xl border p-2 ${
                          o.on ? 'border-accent bg-accent-050 text-ink shadow-[0_0_0_1px_var(--color-accent)]' : 'border-line bg-white text-ink'
                        }`}
                      >
                        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${o.on ? 'bg-accent text-white' : 'bg-panel text-ink-soft'}`}>
                          <Icon name={o.icon} size={14} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-caption font-semibold leading-tight">{t(o.label)}</span>
                          <span className="block truncate text-[0.625rem] leading-tight text-muted">{t(o.sub)}</span>
                        </span>
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <span className="rounded-2xl rounded-tr-md bg-ink px-3.5 py-2 text-detail font-medium text-white">{t('Road Trip')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ================= SIGNAL — the community advantage ================= */}
      <section className="container-page section">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] border border-accent-bright/20 bg-noir px-6 py-10 text-on-noir shadow-pop sm:px-12 sm:py-14">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(55% 70% at 85% 45%, rgba(0,212,71,0.20), transparent 68%), radial-gradient(40% 50% at 0% 0%, rgba(0,212,71,0.08), transparent 65%)' }}
            />
            <SignalBackdrop />
            <div className="relative grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
              <div>
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.06] ring-1 ring-accent-bright/30 shadow-[0_0_24px_-6px_rgba(0,212,71,0.6)]">
                    <SignalS size={26} />
                  </span>
                  <p className="text-label font-semibold uppercase tracking-[0.2em] text-accent-bright">{t('CX SIGNAL')}</p>
                </div>
                <h2 className="mt-5 max-w-xl font-display text-3xl font-semibold leading-[1.05] text-on-noir text-balance sm:text-5xl">
                  {t('Great drives deserve to be shared.')}
                </h2>
                <p className="mt-4 max-w-lg text-copy leading-relaxed text-on-noir-muted sm:text-lead">
                  {t('SIGNAL is where the CX world lives — official news, new cars, and the people who make every trip worth remembering.')}
                </p>

                <ul className="mt-7 divide-y divide-white/10 border-y border-white/10">
                  {[
                    { icon: 'sparkles' as IconName, title: 'Straight from CX', desc: 'News, announcements and new cars from the CX Rent team. One feed, no noise.' },
                    { icon: 'heart' as IconName, title: 'Real stories', desc: 'Verified hosts and drivers share their cars and their drives — Stories, Respect and more.' },
                    { icon: 'trending' as IconName, title: 'A stage for your car', desc: 'Hosts can show their car to the community and put it in front of renters who care.' },
                  ].map((f) => (
                    <li key={f.title} className="flex items-start gap-4 py-4">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-accent-bright ring-1 ring-white/10">
                        <Icon name={f.icon} size={19} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-display text-copy font-semibold text-on-noir">{t(f.title)}</h3>
                        <p className="mt-0.5 text-detail leading-relaxed text-on-noir-muted">{t(f.desc)}</p>
                      </div>
                    </li>
                  ))}
                </ul>

                <Link to="/signal" className="btn btn-accent-bright btn-lg mt-8">
                  {t('Open Signal')} <Icon name="arrowRight" size={17} />
                </Link>
              </div>

              {/* A glimpse of SIGNAL — sample Story and posts. Decorative; the
                  button is the way in. */}
              <SignalFan />
            </div>
          </div>
        </Reveal>
      </section>

      {/* ================= HOSTS — turn a parked car into income ================= */}
      <section className="container-page section-tight">
        <Reveal>
          <div className="grid items-center gap-8 rounded-[1.75rem] border border-line bg-surface px-6 py-10 sm:px-12 sm:py-14 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="eyebrow">{t('For car owners')}</p>
              <h2 className="mt-3 font-display text-3xl font-semibold text-ink text-balance sm:text-4xl">
                {t('Your car is parked. It could be earning.')}
              </h2>
              <p className="mt-3 max-w-lg text-copy leading-relaxed text-muted">
                {t('Share the car you love with drivers who will treat it right. Set your own price, decide how it is handed over, and stay in control of every trip.')}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link to="/list-your-car" className="btn btn-primary btn-lg">
                  {t('List your car')} <Icon name="arrowRight" size={17} />
                </Link>
                <Link to="/how-it-works" className="btn btn-secondary btn-lg">
                  {t('How hosting works')}
                </Link>
              </div>
            </div>
            <ul className="space-y-3">
              {[
                { icon: 'euro' as IconName, t: 'You set the daily rate — and receive it in full' },
                { icon: 'car' as IconName, t: 'Offer pickup, delivery, or both' },
                { icon: 'shield' as IconName, t: 'Verified renters, protection on every trip' },
              ].map((r) => (
                <li key={r.t} className="flex items-center gap-4 rounded-2xl border border-line bg-panel/60 p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-050 text-accent-700">
                    <Icon name={r.icon} size={19} />
                  </span>
                  <span className="text-body font-medium text-ink-soft">{t(r.t)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </section>

      {/* ================= FAQ — the real answers from the Help Center ================= */}
      <section className="container-page section-tight">
        <Reveal>
          <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
            <div>
              <p className="eyebrow">{t('Good to know')}</p>
              <h2 className="mt-3 font-display text-3xl font-semibold text-ink text-balance sm:text-4xl">
                {t('Questions, answered.')}
              </h2>
              <p className="mt-4 max-w-sm text-copy leading-relaxed text-muted text-pretty">
                {t('The essentials about booking, protection and cancellations — before you book.')}
              </p>
              <Link to="/help" className="mt-5 inline-flex items-center gap-1.5 text-body font-semibold text-accent-700 transition-colors hover:text-accent-600">
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
            <h2 className="font-display text-3xl font-semibold text-ink text-balance sm:text-5xl">
              {t('Ready for your next journey?')}
            </h2>
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
