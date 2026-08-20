import { lazy, Suspense, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { SearchBar } from '../components/SearchBar';
import { SectionHead } from '../components/primitives';
import { Reveal, Img, useCountUp } from '../components/motion';
import { useCars } from '../lib/data/cars';
import { DriveChallengeLauncher } from '../components/game/DriveChallengeLauncher';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import { catalogue } from '../lib/catalogue';
import { getFeaturedProducts } from '../lib/data/shop';
import type { CarCategory } from '../data/types';

// Code-split — the hero's live WebGL scene (and Three.js with it) only
// downloads for visitors who reach the homepage, not every route.
const Hero3D = lazy(() => import('../components/Hero3D'));

const shopFeatured = getFeaturedProducts(4);

const trustRow: { icon: IconName; label: string }[] = [
  { icon: 'shield', label: 'Verified hosts' },
  { icon: 'calendar', label: 'Free cancellation' },
  { icon: 'headset', label: '24/7 support' },
];

/** Real, measured facts from the catalogue — no invented numbers. */
const trustStats: { value: number; decimals?: number; label: string }[] = [
  { value: catalogue.cities, label: 'European cities' },
  { value: catalogue.vehicles, label: 'Cars on the platform' },
  { value: catalogue.meanRating, decimals: 2, label: 'Average rating' },
];

/** Every claim here maps to a real, shippable feature — not aspirational
 *  copy. Booking.tsx's 5-step flow (easy booking), its editable pickup
 *  location + calendar (flexible pickup), its free-cancellation policy
 *  (also echoed in the hero trust row), the real /help + messaging-backed
 *  support channel (24/7 support), and profiles.verified host identity
 *  checks (verified hosts) are all live in the product today. */
const benefits: { icon: IconName; title: string; description: string }[] = [
  { icon: 'instant', title: 'Easy Booking', description: 'Book your car quickly and easily online.' },
  { icon: 'pin', title: 'Flexible Pickup', description: 'Choose a convenient pickup location and time.' },
  { icon: 'calendar', title: 'Free Cancellation', description: 'Plans change — cancel anytime before pick-up.' },
  { icon: 'headset', title: '24/7 Support', description: 'Our team is available whenever you need assistance.' },
  { icon: 'verified', title: 'Verified Hosts', description: 'Every host is identity-verified before listing.' },
  { icon: 'sparkles', title: 'Premium Experience', description: 'A simple, modern and stress-free way to rent.' },
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
      <p ref={ref} className="font-display text-4xl font-semibold tabular-nums text-ink sm:text-5xl">
        {decimals ? animated.toFixed(decimals) : animated}
      </p>
      <p className="mt-1.5 text-[13.5px] text-muted">{label}</p>
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

  return (
    <div>
      {/* ================= HERO — the car is the architecture ================= */}
      <section className="relative overflow-hidden bg-bg">
        <div className="grid lg:grid-cols-[minmax(0,43%)_1fr] lg:items-stretch">
          {/* Content */}
          <div className="relative z-10 flex flex-col justify-center px-5 py-14 sm:py-16 md:px-8 lg:px-10 lg:py-24 xl:px-12">
            <Reveal>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[12px] font-medium text-ink-soft">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute h-1.5 w-1.5 animate-ping rounded-full bg-accent-bright/50" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-accent-bright" />
                </span>
                Now live in {catalogue.cities} European cities
              </span>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="mt-6 font-display text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.02em] text-ink text-balance sm:text-6xl xl:text-[4.25rem]">
                Your next car
                <br />
                <span className="text-accent">is waiting.</span>
              </h1>
            </Reveal>

            <Reveal delay={140}>
              <p className="mt-5 max-w-sm text-[17px] leading-relaxed text-muted text-pretty">
                Premium cars. Verified hosts. Ready for the road.
              </p>
            </Reveal>

            <Reveal delay={190}>
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2.5">
                {trustRow.map((t) => (
                  <span key={t.label} className="inline-flex items-center gap-2 text-[13.5px] font-medium text-ink-soft">
                    <Icon name={t.icon} size={16} className="text-accent" />
                    {t.label}
                  </span>
                ))}
              </div>
            </Reveal>

            <Reveal delay={240}>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link to="/browse" className="btn btn-accent-bright btn-lg">
                  Explore Cars <Icon name="arrowRight" size={17} />
                </Link>
                <Link to="/list-your-car" className="btn btn-secondary btn-lg">
                  List Your Car
                </Link>
              </div>
            </Reveal>
          </div>

          {/* Edge-to-edge automotive visual — bleeds to the viewport's right
              edge rather than sitting boxed inside the page container, so
              the car reads as part of the page's structure, not a photo
              dropped into a rounded card. A live WebGL scene instead of a
              photo: real-time, not a rendered clip. */}
          <div className="relative h-[320px] overflow-hidden bg-noir sm:h-[440px] lg:h-auto lg:min-h-[600px] xl:min-h-[660px]">
            <Suspense fallback={<div className="skeleton absolute inset-0" />}>
              <Hero3D />
            </Suspense>
            {/* Blends the scene's left edge into the page rather than a hard
                seam — reads as one continuous composition on wide screens. */}
            <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-28 bg-gradient-to-r from-bg to-transparent lg:block" />
          </div>
        </div>

        {/* Integrated search — cut into the seam of the hero photo instead
            of floating in its own separate section below it. */}
        <div className="relative z-10 px-5 md:px-8 xl:px-10">
          <div className="mx-auto -mt-9 max-w-6xl sm:-mt-11 lg:-mt-16">
            <Reveal delay={300}>
              <SearchBar variant="hero" />
            </Reveal>
          </div>
        </div>
        <div className="h-10 sm:h-14 lg:h-16" />
      </section>

      {/* ================= WHY CX — real platform benefits, no filler ================= */}
      <section className="container-page mt-14 sm:mt-16">
        <SectionHead eyebrow="Why CX" title="Everything you need, built in" />
        <div className="mt-8 grid grid-cols-2 gap-3.5 sm:gap-4 lg:grid-cols-3">
          {benefits.map((b, i) => (
            <Reveal key={b.title} delay={i * 60}>
              <div className="card card-hover group flex h-full flex-col gap-3.5 p-5 sm:p-6">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/10 text-accent transition-transform duration-300 ease-out group-hover:scale-110">
                  <Icon name={b.icon} size={21} />
                </span>
                <div>
                  <p className="font-display text-[15px] font-semibold text-ink">{b.title}</p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{b.description}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ================= EXPLORE BY CATEGORY ================= */}
      <section className="container-page mt-4 sm:mt-6">
        <SectionHead
          title="Explore by category"
          action={
            <Link
              to="/browse"
              className="inline-flex items-center gap-1.5 text-[14.5px] font-medium text-accent transition-colors hover:text-accent-600"
            >
              View all cars <Icon name="arrowRight" size={15} />
            </Link>
          }
        />
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 lg:gap-5">
          {(categoryTiles ?? Array.from({ length: 5 })).map((tile, i) =>
            tile ? (
              <Reveal key={tile.key} delay={i * 60}>
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
                    <p className="font-display text-[15px] font-semibold text-ink">{tile.label}</p>
                    {tile.fromPrice !== undefined && (
                      <p className="mt-0.5 text-[13px] text-muted">From {eur(tile.fromPrice)}/day</p>
                    )}
                  </div>
                </Link>
              </Reveal>
            ) : (
              <div key={i} className="card overflow-hidden">
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

      {/* ================= DRIVE — small, elegant, one clear CTA ================= */}
      <section className="container-page mt-16 sm:mt-20">
        <Reveal>
          <div className="flex flex-col items-center gap-6 rounded-2xl border border-line bg-panel/50 px-6 py-9 text-center sm:flex-row sm:justify-between sm:px-10 sm:text-left">
            <div className="flex items-center gap-5">
              <img
                src="/cx-drive-challenge-icon.png"
                alt=""
                className="hidden h-16 w-auto shrink-0 object-contain sm:block"
                style={{ objectPosition: '50% 8%' }}
              />
              <div>
                <p className="eyebrow">CX Drive Challenge</p>
                <h2 className="mt-1 font-display text-2xl font-semibold text-ink text-balance sm:text-[1.75rem]">
                  Play DRIVE. Beat the score. Unlock your reward.
                </h2>
                <p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-muted">
                  A fast, addictive driving challenge built right into CX — score high enough and earn a real discount on your next booking.
                </p>
              </div>
            </div>
            <DriveChallengeLauncher className="btn btn-accent-bright btn-lg shrink-0">
              Play DRIVE <Icon name="arrowRight" size={17} />
            </DriveChallengeLauncher>
          </div>
        </Reveal>
      </section>

      {/* ================= SHOP — small teaser, never competes with cars ================= */}
      <section className="container-page mt-16 sm:mt-20">
        <Reveal>
          <div className="rounded-2xl border border-line bg-panel/50 px-6 py-9 sm:px-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow">The CX Shop</p>
                <h2 className="mt-1 font-display text-2xl font-semibold text-ink text-balance sm:text-[1.75rem]">
                  More than a rental. It&apos;s a lifestyle.
                </h2>
              </div>
              <Link to="/shop" className="btn btn-secondary shrink-0">
                Explore CX Shop <Icon name="arrowRight" size={16} />
              </Link>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {shopFeatured.map((p) => (
                <Link key={p.id} to={`/shop/${p.slug}`} className="group block">
                  <div className="aspect-square overflow-hidden rounded-xl bg-panel-2">
                    <img
                      src={unsplash(p.images[0], 300)}
                      alt={p.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <p className="mt-1.5 truncate text-[12.5px] font-medium text-ink-soft">{p.name}</p>
                  <p className="text-[12.5px] font-semibold text-ink">{eur(p.price)}</p>
                </Link>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ================= TRUST — short, measured, no cards ================= */}
      <section className="container-page mt-20 sm:mt-24">
        <div className="grid grid-cols-1 gap-8 border-y border-line py-10 sm:grid-cols-3 sm:gap-6 sm:py-12">
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
            <p className="max-w-md text-[15.5px] leading-relaxed text-muted">
              Join thousands of drivers already booking premium cars across Europe with CX.
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
