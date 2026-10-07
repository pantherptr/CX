import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { SignalLogo } from '../components/SignalLogo';
import { SearchBar } from '../components/SearchBar';
import { SectionHead, VerifiedBadge } from '../components/primitives';
import { Reveal, Img } from '../components/motion';
import { ConciergeLauncher, ConciergeMark } from '../components/Concierge';
import { useScramble } from '../lib/useScramble';
import { useCars } from '../lib/data/cars';
import { unsplash, unsplashSrcSet, avatar } from '../lib/img';
import { FleetLiveBoard, type LiveItem } from '../components/FleetLiveBoard';
import { eur } from '../lib/format';
import { catalogue } from '../lib/catalogue';
import type { Car } from '../data/types';
import { CITY_COORDS } from '../data/cityCoords';
import { FaqItem } from '../components/FaqItem';
import { faqs } from '../data/faqs';
import { useLocale } from '../lib/i18n';

const globePlaces = catalogue.cityNames.filter((c) => CITY_COORDS[c]).map((c) => ({ name: c, coords: CITY_COORDS[c] }));
const CityGlobe = lazy(() => import('../components/home/CityGlobe').then((m) => ({ default: m.CityGlobe })));

/** Original CX editorial hero art: created specifically with generous
 * left-side copy space and a sunlit, optimistic automotive setting. */
const HERO_IMAGE = '/cx-hero-mediterranean-v2.png';
const HERO_IMAGE_MOBILE = '/cx-hero-mediterranean-mobile-v2.png';

/** The hero photo, fading in once decoded (same `.imgfade`/`.loaded`
 *  technique `Img` uses) — kept as its own small `<picture>` here rather
 *  than extending the shared `Img` component for the one place on the
 *  site that needs a breakpoint-swapped source. */
function HeroPhoto() {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const retriedRef = useRef(false);

  useEffect(() => {
    if (ref.current?.complete) setLoaded(true);
  }, []);

  // Same one-retry-then-fallback contract as the shared `Img` primitive
  // (see motion.tsx) — duplicated here rather than reworking `Img` to
  // support `<picture>`'s two-child, breakpoint-swapped structure for
  // this one hero image.
  const handleError = () => {
    if (!retriedRef.current) {
      retriedRef.current = true;
      window.setTimeout(() => setAttempt((a) => a + 1), 500);
      return;
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error(`[HeroPhoto] failed to load (after one retry): ${HERO_IMAGE}`);
    }
    setFailed(true);
  };

  if (failed) {
    return <div className="absolute inset-0 bg-gradient-to-br from-noir via-noir to-accent-bright/10" />;
  }

  return (
    <picture>
      <source media="(max-width: 767px)" srcSet={HERO_IMAGE_MOBILE} />
      <img
        key={attempt}
        ref={ref}
        src={HERO_IMAGE}
        alt="A premium CX car overlooking the Mediterranean coast"
        onLoad={() => setLoaded(true)}
        onError={handleError}
        fetchPriority="high"
        className={`imgfade ${loaded ? 'loaded' : ''} absolute inset-0 h-full w-full object-cover object-center`}
      />
    </picture>
  );
}

/** The SIGNAL preview: a Story and two posts, fanned side by side, built
 *  from SIGNAL's own pieces (verified badges, vehicle link, Respect / Save /
 *  Share row, CX team comment). Decorative sample content. Laid out at a
 *  fixed design size and scaled down to fit. */
function SignalFan({ cars }: { cars: Car[] | null }) {
  const { t } = useLocale();
  const amg = cars?.find((c) => /AMG/i.test(c.make) && /GT/i.test(c.model));
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
            <span className="rounded-full bg-gradient-to-tr from-accent-bright to-accent p-[2px]"><Avatar src="/signal/av-marco.webp" size={34} /></span>
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-detail font-semibold">marco.b <VerifiedBadge role="host" size={13} /></span>
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
              <span className="flex items-center gap-1 text-detail font-semibold text-ink">luca.m <VerifiedBadge role="client" size={13} /></span>
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
              <span className="flex items-center gap-1 text-detail font-semibold text-ink">giulia.r <VerifiedBadge role="client" size={14} /></span>
              <span className="block text-caption text-faint">Milano · 2h</span>
            </span>
            <Icon name="moreHorizontal" size={18} className="text-ink-soft" />
          </div>
          <p className="px-3 pb-2 text-detail leading-relaxed text-ink">{t('First time with this car — what an experience. Power, comfort and design, perfect for a weekend in Tuscany. Thanks @cx for making it so simple! 🔥')}</p>
          {amg && (
            <span className="mx-3 mb-2 flex items-center gap-3 rounded-xl border border-line bg-panel p-2">
              <img src={unsplash(amg.images[0], 120)} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-caption font-semibold text-ink">{amg.year} {amg.make} {amg.model}</span>
                <span className="block truncate text-label text-muted">{amg.city} · {eur(amg.pricePerDay)}{t('/day')}</span>
              </span>
              <span className="flex shrink-0 items-center text-label font-semibold text-accent-700">{t('View Vehicle')} <Icon name="chevronRight" size={12} /></span>
            </span>
          )}
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
/** The four pillars of the "Why CX" section — each maps to a real,
 *  shippable capability: car listings are reviewed before publish,
 *  profiles carry identity-verified host status, Booking.tsx offers a
 *  free-cancellation fare tier, and the /help + messaging channel backs
 *  the support claim. No aspirational copy. */
const whyCx: { icon: IconName; title: string; description: string }[] = [
  { icon: 'verified', title: 'Verified Cars', description: 'Every vehicle is carefully reviewed and verified before being listed.' },
  { icon: 'shield', title: 'Trusted Hosts', description: 'Connect with verified hosts and transparent rental information.' },
  { icon: 'calendar', title: 'Flexible Rentals', description: 'Every car shows its cancellation policy before you pay — and hosts who cancel always refund you in full.' },
  { icon: 'headset', title: '24/7 Support', description: "We're here whenever you need us — before, during and after your journey." },
];

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
  const [globeCity, setGlobeCity] = useState<string>(catalogue.cityNames[0] ?? '');

  // A real car photo for the delivery story (second-best rated so it
  // differs from the first fleet card).
  const deliveryImage = allCars?.[1]?.images[0] ?? allCars?.[0]?.images[0];

  // Top-rated cars, real data — the fleet rail right after the hero.
  const fleetCars = useMemo(() => {
    if (!allCars) return null;
    return [...allCars].sort((a, b) => b.rating - a.rating).slice(0, 8);
  }, [allCars]);

  // The live board on the home page is an illustration built on real cars.
  const liveBoard = useMemo(() => {
    if (!allCars || allCars.length < 2) return null;
    const people = [
      { name: 'Marco Rossi', img: 11, a: 'Via Roma 21', b: 'Aeroporto' },
      { name: 'Elena Popescu', img: 32, a: 'Calea Victoriei 8', b: 'Piața Unirii' },
      { name: 'Lucía Gómez', img: 45, a: 'Gran Vía 14', b: 'Estación Sur' },
    ];
    const items: LiveItem[] = [...allCars].sort((a, b) => b.rating - a.rating).slice(0, 3).map((c, i) => ({
      id: c.id,
      title: `${c.make} ${c.model}`,
      image: unsplash(c.images[0], 320),
      plate: `${c.year} · ${c.city}`,
      person: people[i].name,
      avatar: avatar(people[i].img),
      city: c.city,
      status: 'On trip',
    }));
    return { items };
  }, [allCars]);

  return (
    <div>
      {/* ================= HERO — real photography, edge to edge =================
          `-mt-[calc(4rem+safe-area-inset-top)]`: the header is always
          `sticky` now (see Navbar's own comment), which means it always
          reserves its own ~64px *plus* its `pt-safe` notch padding in
          document flow, right above this section. Pulling the hero up by
          that same total amount puts its background back at true y=0 —
          visible right through the header's transparent background
          exactly as before — without the header ever changing
          *positioning* scheme, which is what used to cause the
          scroll-jump. Matching only the 64px (not the safe-area inset too)
          left a flat strip of the plain page background showing above the
          hero on any phone with a notch/Dynamic Island — the hero's own
          photo and gradient never reached that far up. The inner content
          keeps its own pt-24/pt-28 unchanged, so it lands in the exact
          same visual spot it always did. */}
      <section className="relative isolate -mt-[calc(4rem+env(safe-area-inset-top,0px))] overflow-hidden bg-bg sm:min-h-[92svh] sm:bg-[#eaf2ef]">
        {/* Media layer. On phones it's exactly one screen tall: the
            mobile photo is a 9:16 portrait, and stretching it over the old
            1200px hero blew it up ~1.8x and cropped the car out of frame —
            at one screen it shows its whole composition, car included,
            and fades into the page where the search card overlaps it.
            Wider screens keep the full-bleed photo behind everything. */}
        <div className="absolute inset-x-0 top-0 h-[100svh] sm:inset-0 sm:h-auto">
          <div className="animate-ken-burns absolute inset-0 origin-[70%_60%]">
            <HeroPhoto />
          </div>

          {/* A light editorial wash gives the copy a calm, premium reading
              surface while keeping the blue sky, architecture and car vivid. */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/35 via-transparent to-[#0b2618]/30" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#f8faf4]/[0.97] via-[#f8faf4]/75 to-transparent sm:via-[#f8faf4]/45" />
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{ background: 'radial-gradient(42% 42% at 16% 10%, rgba(0,212,71,0.10), transparent 70%)' }}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-bg sm:hidden" />
        </div>

        {/* Phones: tall enough that the search card starts just above the
            photo's bottom edge (one screen, minus a ~70px overlap) rather
            than a screen and a half further down. */}
        <div className="relative z-10 flex min-h-[calc(100svh+19rem)] flex-col justify-between px-5 pb-8 pt-24 sm:min-h-[92svh] sm:px-8 sm:pt-28 lg:px-10 xl:px-16">
          {/* -------- Featured car — a floating glass card over the photo
              (desktop only; real top-rated listing) -------- */}
          {fleetCars?.[0] && (
            <Reveal delay={420} className="absolute right-10 top-32 hidden w-64 xl:right-16 lg:block">
              <Link
                to={`/cars/${fleetCars[0].slug}`}
                className="group block overflow-hidden rounded-2xl border border-white/40 bg-white/55 p-2 shadow-[0_20px_50px_-20px_rgba(11,38,24,0.45)] backdrop-blur-xl transition-transform duration-300 hover:-translate-y-1"
              >
                <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-panel">
                  <Img
                    src={unsplash(fleetCars[0].images[0], 500)}
                    alt={`${fleetCars[0].make} ${fleetCars[0].model}`}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <span className="absolute left-2 top-2 rounded-full bg-white/85 px-2.5 py-1 text-label font-semibold uppercase tracking-[0.1em] text-ink-soft backdrop-blur">
                    {t('Top rated')}
                  </span>
                </div>
                <div className="flex items-end justify-between gap-2 px-2 pb-1.5 pt-3">
                  <div className="min-w-0">
                    <p className="truncate font-display text-copy font-semibold text-ink">
                      {fleetCars[0].make} {fleetCars[0].model}
                    </p>
                    <p className="mt-0.5 text-detail text-ink-soft">
                      ★ {fleetCars[0].rating.toFixed(1)} · {fleetCars[0].city}
                    </p>
                  </div>
                  <p className="shrink-0 text-right text-detail text-ink-soft">
                    <span className="font-display text-lead font-semibold text-ink">{eur(fleetCars[0].pricePerDay)}</span>{t('/day')}
                  </p>
                </div>
              </Link>
            </Reveal>
          )}

          {/* -------- Headline column -------- */}
          <div className="max-w-xl">
            <Reveal className="reveal-blur">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-ink/10 bg-white/65 px-3 py-1.5 text-label font-semibold uppercase tracking-[0.12em] text-ink-soft shadow-hair backdrop-blur-md">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute h-1.5 w-1.5 animate-ping rounded-full bg-accent-bright/50" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-accent-bright" />
                </span>
                {t('Now live in {n} European cities', { n: catalogue.cities })}
              </span>
            </Reveal>

            <Reveal delay={80} className="reveal-blur">
              <h1 className="mt-6 font-display text-[2.75rem] font-semibold leading-[0.98] tracking-[-0.02em] text-balance sm:text-6xl xl:text-[4.75rem]">
                <span className="text-ink">
                  {t('I own the keys')}
                </span>
                <br />
                <span className="text-accent">
                  {t('to your heart.')}
                </span>
              </h1>
            </Reveal>

            <Reveal delay={140} className="reveal-blur">
              <p className="mt-5 max-w-md text-lead leading-relaxed text-ink-soft text-pretty sm:text-feature">
                {t('Premium cars. Verified hosts. Ready for the road.')}
              </p>
            </Reveal>

            <Reveal delay={200} className="reveal-blur">
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/browse" className="btn btn-accent-bright btn-lg">
                  {t('Explore Cars')} <Icon name="arrowRight" size={17} />
                </Link>
                <Link
                  to="/list-your-car"
                  className="btn btn-lg border border-ink/15 bg-white/55 text-ink shadow-hair backdrop-blur-md hover:border-ink/30 hover:bg-white/75"
                >
                  {t('List Your Car')}
                </Link>
              </div>
            </Reveal>

            <Reveal delay={260} className="reveal-blur">
              <div className="mt-6 inline-flex max-w-full flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-ink/10 bg-white/70 px-4 py-2.5 shadow-hair backdrop-blur-md">
                {trustRow.map((tr) => (
                  <span key={tr.label} className="inline-flex items-center gap-2 text-detail font-medium text-ink-soft">
                    <Icon name={tr.icon} size={15} className="text-accent" />
                    {t(tr.label)}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>

          {/* -------- Search — the hero's own dark-glass bar, not a
              separate light-page section -------- */}
          <Reveal delay={340}>
            <div className="mx-auto w-full max-w-4xl">
              <SearchBar />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= LIVE BOARD — every trip at a glance ================= */}
      {liveBoard && (
        <section className="container-page section">
          <SectionHead eyebrow={t('Live board')} title={t('Every trip, in view.')} />
          <Reveal className="mt-8">
            <FleetLiveBoard items={liveBoard.items} title={t('Live tracking')} />
          </Reveal>
        </section>
      )}

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

      {/* ================= WHY CX — premium automotive storytelling ================= */}
      <section className="container-page section">
        <div className="relative overflow-hidden rounded-[2rem] bg-noir">
          {/* Subtle CX-green glow, upper-right */}
          <div
            className="pointer-events-none absolute inset-0 opacity-80"
            style={{ background: 'radial-gradient(45% 45% at 88% 12%, rgba(0,212,71,0.16), transparent 62%)' }}
          />

          <div className="relative grid lg:grid-cols-2 lg:items-stretch">
            {/* -------- Automotive image (reuses the optimized hero photo) -------- */}
            <div className="relative order-1 min-h-[200px] overflow-hidden sm:min-h-[340px] lg:order-none lg:min-h-full">
              <Img
                src={HERO_IMAGE}
                alt=""
                className="absolute inset-0 h-full w-full object-cover object-[40%_55%]"
              />
              {/* Blend the image into the dark panel on the seam side */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-noir/70 via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-noir" />
            </div>

            {/* -------- Benefits + trust -------- */}
            <div className="order-2 px-5 py-8 sm:px-10 sm:py-14 lg:order-none lg:px-12">
              <Reveal>
                <p className="eyebrow text-accent-bright">{t('Why CX')}</p>
                <h2 className="mt-3 font-display text-3xl font-semibold text-on-noir text-balance sm:text-[2.75rem] sm:leading-[1.05]">
                  {t('Drive with confidence.')}
                </h2>
                <p className="mt-3 max-w-md text-copy leading-relaxed text-on-noir-muted sm:text-lead">
                  {t('Premium cars. Trusted hosts. A better way to rent.')}
                </p>
              </Reveal>

              <div className="mt-7 grid grid-cols-2 gap-x-4 gap-y-6 sm:gap-x-6 sm:gap-y-7">
                {whyCx.map((b, i) => (
                  <Reveal key={b.title} delay={120 + i * 80}>
                    <div className="group flex flex-col gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-xl border border-accent-bright/25 bg-accent-bright/10 text-accent-bright transition-transform duration-300 ease-out group-hover:scale-110">
                        <Icon name={b.icon} size={20} />
                      </span>
                      <div>
                        <p className="text-label font-semibold uppercase tracking-[0.1em] text-on-noir">{t(b.title)}</p>
                        <p className="mt-1.5 text-caption leading-relaxed text-on-noir-muted sm:text-detail">{t(b.description)}</p>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>

              {/* Trust row */}
              <Reveal delay={460}>
                <div className="mt-9 flex flex-wrap gap-x-5 gap-y-2.5 border-t border-white/10 pt-6">
                  {['Verified vehicles', 'Secure booking', 'Transparent pricing', 'Dedicated support'].map((line) => (
                    <span key={line} className="inline-flex items-center gap-1.5 text-caption font-medium text-on-noir-muted">
                      <Icon name="check" size={14} className="text-accent-bright" /> {t(line)}
                    </span>
                  ))}
                </div>
              </Reveal>
            </div>
          </div>

        </div>
      </section>

      {/* ================= SIGNAL — the community advantage ================= */}
      <section className="container-page section">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] border border-line bg-gradient-to-br from-[#f3faf5] via-panel to-[#eaf7ef] px-6 py-10 shadow-card sm:px-12 sm:py-14">
            <div
              className="pointer-events-none absolute inset-0 opacity-80"
              style={{ background: 'radial-gradient(45% 70% at 92% 8%, rgba(0,212,71,0.16), transparent 62%), radial-gradient(40% 50% at 0% 100%, rgba(0,212,71,0.07), transparent 65%)' }}
            />
            <div className="relative grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
              <div>
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-accent-700 shadow-hair ring-1 ring-accent/15">
                    <SignalLogo size={26} />
                  </span>
                  <p className="eyebrow">{t('CX SIGNAL')}</p>
                </div>
                <h2 className="mt-5 max-w-xl font-display text-3xl font-semibold leading-[1.05] text-ink text-balance sm:text-5xl">
                  {t('Great drives deserve to be shared.')}
                </h2>
                <p className="mt-4 max-w-lg text-copy leading-relaxed text-muted sm:text-lead">
                  {t('SIGNAL is where the CX world lives — official news, new cars, and the people who make every trip worth remembering.')}
                </p>

                <ul className="mt-7 space-y-3">
                  {[
                    { icon: 'sparkles' as IconName, title: 'Straight from CX', desc: 'News, announcements and new cars from the CX Rent team. One feed, no noise.' },
                    { icon: 'heart' as IconName, title: 'Real stories', desc: 'Verified hosts and drivers share their cars and their drives — Stories, Respect and more.' },
                    { icon: 'trending' as IconName, title: 'A stage for your car', desc: 'Hosts can show their car to the community and put it in front of renters who care.' },
                  ].map((f) => (
                    <li key={f.title} className="flex items-start gap-4 rounded-2xl border border-white/70 bg-white/70 p-4 shadow-hair backdrop-blur-sm">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-050 text-accent-700">
                        <Icon name={f.icon} size={19} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-display text-copy font-semibold text-ink">{t(f.title)}</h3>
                        <p className="mt-0.5 text-detail leading-relaxed text-muted">{t(f.desc)}</p>
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
              <SignalFan cars={allCars} />
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

      {/* ================= WHERE CX IS LIVE — the globe ================= */}
      <section className="container-page section">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <p className="eyebrow">{t('Where CX is live')}</p>
            <h2 className="mt-3 font-display text-3xl font-semibold text-ink text-balance sm:text-4xl">
              {t('{n} European cities, one key.', { n: catalogue.cities })}
            </h2>
            <p className="mt-3 max-w-md text-copy leading-relaxed text-muted">
              {t('Pick up in {city}, drive on to the next. Drag the globe to look around.', { city: globeCity || t('your city') })}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {catalogue.cityNames.map((c) => (
                <Link
                  key={c}
                  to={`/browse?city=${encodeURIComponent(c)}`}
                  data-active={c === globeCity}
                  className="chip"
                >
                  {c}
                </Link>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link to="/browse" className="btn btn-accent-bright btn-lg">
                {t('Find a car')} <Icon name="arrowRight" size={17} />
              </Link>
              <Link to="/help" className="inline-flex items-center gap-1.5 text-body font-medium text-accent transition-colors hover:text-accent-600">
                {t('Help & support')} <Icon name="arrowRight" size={15} />
              </Link>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <Suspense fallback={<div className="mx-auto aspect-square w-full max-w-[26rem] rounded-full skeleton" />}>
              <CityGlobe places={globePlaces} onCityChange={setGlobeCity} />
            </Suspense>
          </Reveal>
        </div>
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
      <section className="container-page mt-20 mb-24 sm:mt-24">
        <Reveal>
          <div className="flex flex-col items-center gap-6 text-center">
            <h2 className="font-display text-3xl font-semibold text-ink text-balance sm:text-5xl">
              {t('Ready for your next journey?')}
            </h2>
            <p className="max-w-md text-copy leading-relaxed text-muted">
              {t('Premium cars from verified hosts, in {n} European cities.', { n: catalogue.cities })}
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
