import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { SignalLogo } from '../components/SignalLogo';
import { SearchBar } from '../components/SearchBar';
import { SectionHead } from '../components/primitives';
import { Reveal, Img, useCountUp } from '../components/motion';
import { CarCard } from '../components/CarCard';
import { ConciergeLauncher } from '../components/Concierge';
import { useCars } from '../lib/data/cars';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import { catalogue } from '../lib/catalogue';
import type { CarCategory } from '../data/types';


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

const trustRow: { icon: IconName; label: string }[] = [
  { icon: 'shield', label: 'Verified hosts' },
  { icon: 'calendar', label: 'Free cancellation' },
  { icon: 'headset', label: '24/7 support' },
];

/** Real, measured facts from the catalogue — no invented numbers. */
const trustStats: { value: number; decimals?: number; label: string }[] = [
  { value: catalogue.cities, label: 'European cities' },
  { value: catalogue.vehicles, label: 'Cars listed' },
  { value: catalogue.meanRating, decimals: 2, label: 'Average rating' },
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
  { icon: 'calendar', title: 'Flexible Rentals', description: 'Flexible booking options and free cancellation where available.' },
  { icon: 'headset', title: '24/7 Support', description: "We're here whenever you need us — before, during and after your journey." },
];

const howSteps: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'search', title: 'Find your car', desc: 'Search by city, dates and car type, and read real reviews from past trips.' },
  { icon: 'calendar', title: 'Book in minutes', desc: 'Reserve instantly on eligible cars and pay securely. Free cancellation where available.' },
  { icon: 'key', title: 'Hit the road', desc: 'Meet your host, enjoy the drive, then rate your experience.' },
];

/** The five categories the homepage spotlights, in display order. `key`
 *  matches the real `car_category` enum (and Browse's `?type=` filter);
 *  `label` is only the plural, marketing-friendly copy shown on the tile. */
const SPOTLIGHT_CATEGORIES: { key: CarCategory; label: string }[] = [
  { key: 'Economy', label: 'Economy' },
  { key: 'Luxury', label: 'Luxury' },
  { key: 'SUV', label: 'SUV' },
  { key: 'Sport', label: 'Sports' },
  { key: 'Convertible', label: 'Convertibles' },
];

function StatCounter({ value, decimals, label }: { value: number; decimals?: number; label: string }) {
  const { ref, value: animated } = useCountUp<HTMLParagraphElement>(value, { decimals, duration: 1200 });
  return (
    <div className="text-center sm:text-left">
      <p ref={ref} className="font-display text-3xl font-semibold tabular-nums text-ink sm:text-5xl">
        {decimals ? animated.toFixed(decimals) : animated}
      </p>
      <p className="mt-1 text-caption text-muted sm:mt-1.5 sm:text-detail">{label}</p>
    </div>
  );
}

export default function Home() {
  const { cars: allCars } = useCars();

  // Real per-category stats (count, starting price, a real photo) computed
  // from the actual catalogue — no hand-authored counts or stock photos.
  const categoryTiles = useMemo(() => {
    if (!allCars) return null;
    return SPOTLIGHT_CATEGORIES.map(({ key, label }) => {
      const inCategory = [...allCars]
        .filter((c) => c.category === key)
        .sort((a, b) => a.pricePerDay - b.pricePerDay);
      return {
        key,
        label,
        count: inCategory.length,
        fromPrice: inCategory[0]?.pricePerDay,
        image: inCategory[0]?.images[0],
      };
    }).filter((t) => t.count > 0);
  }, [allCars]);

  // A real car photo for the delivery story (second-best rated so it
  // differs from the first fleet card).
  const deliveryImage = allCars?.[1]?.images[0] ?? allCars?.[0]?.images[0];

  // Top-rated cars, real data — the fleet rail right after the hero.
  const fleetCars = useMemo(() => {
    if (!allCars) return null;
    return [...allCars].sort((a, b) => b.rating - a.rating).slice(0, 8);
  }, [allCars]);

  return (
    <div>
      {/* ================= HERO — real photography, edge to edge =================
          `-mt-16`: the header is always `sticky` now (see Navbar's own
          comment), which means it always reserves its own ~64px in
          document flow, right above this section. Pulling the hero up by
          that same amount puts its background back at true y=0 — visible
          right through the header's transparent background exactly as
          before — without the header ever changing *positioning* scheme,
          which is what used to cause the scroll-jump. The inner content
          keeps its own pt-24/pt-28 unchanged, so it lands in the exact
          same visual spot it always did. */}
      <section className="relative isolate -mt-16 min-h-[75rem] overflow-hidden bg-[#eaf2ef] sm:min-h-[92svh]">
        <HeroPhoto />

        {/* A light editorial wash gives the copy a calm, premium reading
            surface while keeping the blue sky, architecture and car vivid. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/35 via-transparent to-[#0b2618]/30" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#f8faf4]/[0.97] via-[#f8faf4]/75 to-transparent sm:via-[#f8faf4]/45" />
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{ background: 'radial-gradient(42% 42% at 16% 10%, rgba(0,212,71,0.10), transparent 70%)' }}
        />

        <div className="relative z-10 flex min-h-[75rem] flex-col justify-between px-5 pb-8 pt-24 sm:min-h-[92svh] sm:px-8 sm:pt-28 lg:px-10 xl:px-16">
          {/* -------- Headline column -------- */}
          <div className="max-w-xl">
            <Reveal>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-ink/10 bg-white/65 px-3 py-1.5 text-label font-semibold uppercase tracking-[0.12em] text-ink-soft shadow-hair backdrop-blur-md">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute h-1.5 w-1.5 animate-ping rounded-full bg-accent-bright/50" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-accent-bright" />
                </span>
                Now live in {catalogue.cities} European cities
              </span>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="mt-6 font-display text-[2.75rem] font-semibold leading-[0.98] tracking-[-0.02em] text-balance sm:text-6xl xl:text-[4.75rem]">
                <span className="text-ink">
                  Your next car
                </span>
                <br />
                <span className="text-accent">
                  is waiting.
                </span>
              </h1>
            </Reveal>

            <Reveal delay={140}>
              <p className="mt-5 max-w-md text-lead leading-relaxed text-ink-soft text-pretty sm:text-feature">
                Premium cars. Verified hosts. Ready for the road.
              </p>
            </Reveal>

            <Reveal delay={200}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/browse" className="btn btn-accent-bright btn-lg">
                  Explore Cars <Icon name="arrowRight" size={17} />
                </Link>
                <Link
                  to="/list-your-car"
                  className="btn btn-lg border border-ink/15 bg-white/55 text-ink shadow-hair backdrop-blur-md hover:border-ink/30 hover:bg-white/75"
                >
                  List Your Car
                </Link>
              </div>
            </Reveal>

            <Reveal delay={260}>
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2.5">
                {trustRow.map((t) => (
                  <span key={t.label} className="inline-flex items-center gap-2 text-detail font-medium text-ink-soft">
                    <Icon name={t.icon} size={15} className="text-accent" />
                    {t.label}
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

      {/* ================= FLEET — the rental experience starts right here ================= */}
      <section className="section">
        <div className="container-page">
          <SectionHead
            eyebrow="Explore the CX Fleet"
            title="Choose the car that fits your journey."
            action={
              <Link
                to="/browse"
                className="inline-flex items-center gap-1.5 text-body font-medium text-accent transition-colors hover:text-accent-600"
              >
                View all cars <Icon name="arrowRight" size={15} />
              </Link>
            }
          />
        </div>
        <div className="scrollbar-none mt-8 flex gap-4 overflow-x-auto px-5 pb-2 sm:px-8 xl:container-page xl:px-0">
          {(fleetCars ?? Array.from({ length: 4 })).map((car, i) =>
            car ? (
              <Reveal key={car.id} delay={i * 60} className="w-[78vw] shrink-0 sm:w-[320px]">
                <CarCard car={car} priority={i < 2} />
              </Reveal>
            ) : (
              <div key={i} className="card w-[78vw] shrink-0 overflow-hidden sm:w-[320px]">
                <div className="skeleton aspect-[4/3]" />
                <div className="space-y-2 p-4">
                  <div className="skeleton h-4 w-3/5 rounded-md" />
                  <div className="skeleton h-3 w-2/5 rounded-md" />
                </div>
              </div>
            ),
          )}
        </div>
      </section>

      {/* ================= HOW IT WORKS — three real steps, one glance ================= */}
      <section className="container-page section-tight">
        <SectionHead
          eyebrow="How it works"
          title="From search to road in three steps."
          action={
            <Link
              to="/how-it-works"
              className="inline-flex items-center gap-1.5 text-body font-medium text-accent transition-colors hover:text-accent-600"
            >
              Learn more <Icon name="arrowRight" size={15} />
            </Link>
          }
        />
        <ol className="mt-8 grid gap-3 sm:grid-cols-3 sm:gap-5">
          {howSteps.map((st, i) => (
            <Reveal key={st.title} delay={i * 80}>
              <li className="flex h-full items-start gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-col sm:gap-5 sm:p-6">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-050 text-accent-700">
                  <Icon name={st.icon} size={20} />
                </span>
                <div>
                  <p className="text-label font-semibold uppercase tracking-[0.14em] text-faint">Step {i + 1}</p>
                  <h3 className="mt-1 font-display text-lg font-semibold text-ink">{st.title}</h3>
                  <p className="mt-1.5 text-detail leading-relaxed text-muted">{st.desc}</p>
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
                <Img src={unsplash(deliveryImage, 1000)} alt="" className="absolute inset-0 h-full w-full object-cover" fallback={null} />
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-noir/45 via-transparent to-transparent" />
              <span className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full bg-white/90 px-3.5 py-2 text-caption font-semibold text-ink shadow-hair backdrop-blur">
                <Icon name="pin" size={14} className="text-accent" /> Delivered to your door
              </span>
            </div>
            <div className="px-6 py-9 sm:px-10 sm:py-12">
              <p className="eyebrow">CX Delivery</p>
              <h2 className="mt-3 font-display text-3xl font-semibold text-ink text-balance sm:text-4xl">
                Your journey starts at your door.
              </h2>
              <p className="mt-3 text-copy leading-relaxed text-muted">
                Land in a new city and your car is already waiting. No queues, no counters, no detours — just the
                first mile of your trip, without the hassle.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'Choose delivery at checkout, to the address you pick',
                  'Hosts set their own delivery fee — you see it before you pay',
                  'Prefer to collect? Pick up from your host instead',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-body text-ink-soft">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-050 text-accent-700">
                      <Icon name="check" size={12} strokeWidth={3} />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
              <Link to="/browse" className="btn btn-accent-bright btn-lg mt-8">
                Find a car near you <Icon name="arrowRight" size={17} />
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
            <div className="relative max-w-xl">
              <p className="inline-flex items-center gap-2 text-caption font-semibold uppercase tracking-[0.2em] text-accent-700">
                <Img
                  src="/cx-logo-symbol.png"
                  alt=""
                  className="h-5 w-5 object-contain"
                  fallback={<Icon name="sparkles" size={16} />}
                /> CX Concierge
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold text-ink text-balance sm:text-4xl">
                Find your CX
              </h2>
              <p className="mt-3 text-copy leading-relaxed text-ink-soft sm:text-lead">
                Tell us how you want to drive — we'll find the right car. You don't need to find the right car; CX finds it for you.
              </p>
              <ConciergeLauncher className="btn btn-accent-bright btn-lg mt-7">
                Start <Icon name="arrowRight" size={17} />
              </ConciergeLauncher>
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
                <p className="eyebrow text-accent-bright">Why CX</p>
                <h2 className="mt-3 font-display text-3xl font-semibold text-on-noir text-balance sm:text-[2.75rem] sm:leading-[1.05]">
                  Drive with confidence.
                </h2>
                <p className="mt-3 max-w-md text-copy leading-relaxed text-on-noir-muted sm:text-lead">
                  Premium cars. Trusted hosts. A better way to rent.
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
                        <p className="text-label font-semibold uppercase tracking-[0.1em] text-on-noir">{b.title}</p>
                        <p className="mt-1.5 text-caption leading-relaxed text-on-noir-muted sm:text-detail">{b.description}</p>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>

              {/* Trust row */}
              <Reveal delay={460}>
                <div className="mt-9 flex flex-wrap gap-x-5 gap-y-2.5 border-t border-white/10 pt-6">
                  {['Verified vehicles', 'Secure booking', 'Transparent pricing', 'Dedicated support'].map((t) => (
                    <span key={t} className="inline-flex items-center gap-1.5 text-caption font-medium text-on-noir-muted">
                      <Icon name="check" size={14} className="text-accent-bright" /> {t}
                    </span>
                  ))}
                </div>
              </Reveal>
            </div>
          </div>

        </div>
      </section>

      {/* ================= EXPLORE BY CATEGORY ================= */}
      <section className="container-page section-tight">
        <SectionHead
          title="Explore by category"
          action={
            <Link
              to="/browse"
              className="inline-flex items-center gap-1.5 text-body font-medium text-accent transition-colors hover:text-accent-600"
            >
              View all cars <Icon name="arrowRight" size={15} />
            </Link>
          }
        />
        <div className="scrollbar-none -mx-5 mt-8 flex snap-x snap-mandatory scroll-pl-5 gap-3 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-5 lg:gap-5">
          {(categoryTiles ?? Array.from({ length: 5 })).map((tile, i) =>
            tile ? (
              <Reveal key={tile.key} delay={i * 60} className="w-[46vw] max-w-[220px] shrink-0 snap-start sm:w-auto sm:max-w-none">
                <Link to={`/browse?type=${encodeURIComponent(tile.key)}`} className="card card-hover group block overflow-hidden">
                  <div className="aspect-[4/3] overflow-hidden bg-panel">
                    {tile.image && (
                      <Img
                        src={unsplash(tile.image, 500)}
                        alt={tile.label}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    )}
                  </div>
                  <div className="p-3.5">
                    <p className="font-display text-copy font-semibold text-ink">{tile.label}</p>
                    {tile.fromPrice !== undefined && (
                      <p className="mt-0.5 text-detail text-muted">From {eur(tile.fromPrice)}/day</p>
                    )}
                  </div>
                </Link>
              </Reveal>
            ) : (
              <div key={i} className="card w-[46vw] max-w-[220px] shrink-0 overflow-hidden sm:w-auto sm:max-w-none">
                <div className="skeleton aspect-[4/3]" />
                <div className="space-y-2 p-3.5">
                  <div className="skeleton h-4 w-3/5 rounded-md" />
                  <div className="skeleton h-3 w-2/5 rounded-md" />
                </div>
              </div>
            ),
          )}
        </div>
      </section>

      {/* ================= SIGNAL — the community advantage ================= */}
      <section className="container-page section">
        <Reveal>
          <div className="relative overflow-hidden rounded-[1.75rem] border border-line bg-panel px-6 py-10 sm:px-12 sm:py-14">
            <div
              className="pointer-events-none absolute inset-0 opacity-70"
              style={{ background: 'radial-gradient(50% 70% at 100% 0%, rgba(0,212,71,0.12), transparent 65%)' }}
            />
            <div className="relative">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-050 text-accent-700">
                  <SignalLogo size={26} />
                </span>
                <p className="eyebrow">CX SIGNAL</p>
              </div>
              <h2 className="mt-4 max-w-2xl font-display text-3xl font-semibold text-ink text-balance sm:text-4xl">
                Great drives deserve to be shared.
              </h2>
              <p className="mt-3 max-w-xl text-copy leading-relaxed text-muted">
                SIGNAL is where the CX world lives — official news, new cars, and the people who make every trip
                worth remembering.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-3 sm:gap-5">
                {[
                  { icon: 'sparkles' as IconName, title: 'Straight from CX', desc: 'News, announcements and new cars from the CX Rent team. One feed, no noise.' },
                  { icon: 'heart' as IconName, title: 'Real stories', desc: 'Verified hosts and drivers share their cars and their drives — Stories, Respect and more.' },
                  { icon: 'trending' as IconName, title: 'A stage for your car', desc: 'Hosts can show their car to the community and put it in front of renters who care.' },
                ].map((f) => (
                  <div key={f.title} className="flex items-start gap-4 rounded-2xl border border-line bg-surface p-5 sm:block">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-050 text-accent-700">
                      <Icon name={f.icon} size={19} />
                    </span>
                    <div className="sm:mt-4">
                      <h3 className="font-display text-lg font-semibold text-ink">{f.title}</h3>
                      <p className="mt-1 text-detail leading-relaxed text-muted sm:mt-1.5">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link to="/signal" className="btn btn-accent-bright btn-lg mt-8">
                Open Signal <Icon name="arrowRight" size={17} />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ================= HOSTS — turn a parked car into income ================= */}
      <section className="container-page section-tight">
        <Reveal>
          <div className="grid items-center gap-8 rounded-[1.75rem] border border-line bg-surface px-6 py-10 sm:px-12 sm:py-14 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="eyebrow">For car owners</p>
              <h2 className="mt-3 font-display text-3xl font-semibold text-ink text-balance sm:text-4xl">
                Your car is parked. It could be earning.
              </h2>
              <p className="mt-3 max-w-lg text-copy leading-relaxed text-muted">
                Share the car you love with drivers who will treat it right. Set your own price, decide how it is
                handed over, and stay in control of every trip.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link to="/list-your-car" className="btn btn-primary btn-lg">
                  List your car <Icon name="arrowRight" size={17} />
                </Link>
                <Link to="/how-it-works" className="btn btn-secondary btn-lg">
                  How hosting works
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
                  <span className="text-body font-medium text-ink-soft">{r.t}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </section>

      {/* ================= TRUST — short, measured, no cards ================= */}
      <section className="container-page section">
        <div className="grid grid-cols-3 gap-3 border-y border-line py-8 sm:gap-6 sm:py-12">
          {trustStats.map((s) => (
            <StatCounter key={s.label} {...s} />
          ))}
        </div>
      </section>

      {/* ================= FINAL CTA — light, quiet, no glow ================= */}
      <section className="container-page mt-20 mb-24 sm:mt-24">
        <Reveal>
          <div className="flex flex-col items-center gap-6 text-center">
            <h2 className="font-display text-3xl font-semibold text-ink text-balance sm:text-5xl">
              Ready for your next journey?
            </h2>
            <p className="max-w-md text-copy leading-relaxed text-muted">
              Premium cars from verified hosts, in {catalogue.cities} European cities.
            </p>
            <Link to="/browse" className="btn btn-accent-bright btn-lg">
              Explore Cars <Icon name="arrowRight" size={17} />
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
