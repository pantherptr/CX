import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { SearchBar } from '../components/SearchBar';
import { CarCard } from '../components/CarCard';
import { SectionHead } from '../components/primitives';
import { Reveal, Img, useParallax } from '../components/motion';
import { useFeaturedCars, useCars } from '../lib/data/cars';
import { DriveChallengeLauncher } from '../components/game/DriveChallengeLauncher';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import { catalogue } from '../lib/catalogue';
import type { CarCategory } from '../data/types';

const whyCX: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'verified', title: 'Verified cars', desc: 'Every vehicle inspected and confirmed before it goes live.' },
  { icon: 'lock', title: 'Secure bookings', desc: 'Encrypted payments and protection on every trip, no exceptions.' },
  { icon: 'users', title: 'Real people', desc: 'Identity-checked local hosts, not a faceless rental counter.' },
];

const trustRow: { icon: IconName; label: string }[] = [
  { icon: 'shield', label: 'Verified hosts' },
  { icon: 'calendar', label: 'Free cancellation' },
  { icon: 'headset', label: '24/7 support' },
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

export default function Home() {
  const heroParallax = useParallax(0.06, 30);
  const { cars: featuredCars, loading: featuredLoading } = useFeaturedCars(4);
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

  const heroCar = featuredCars?.[0];

  return (
    <div>
      {/* ---------------- HERO ---------------- */}
      <section className="relative overflow-hidden bg-bg">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(50% 45% at 85% 4%, rgba(0,133,54,0.07), transparent 62%), radial-gradient(38% 38% at 4% 96%, rgba(0,133,54,0.05), transparent 65%)',
          }}
        />
        <div className="container-page relative z-10 grid items-center gap-10 pt-12 pb-8 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:pt-16">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-soft shadow-hair">
              <span className="relative flex h-2 w-2 items-center justify-center">
                <span className="absolute h-2 w-2 animate-ping rounded-full bg-accent-bright/50" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-accent-bright" />
              </span>
              Now live in {catalogue.cities} European cities
            </span>

            <h1 className="mt-5 font-display text-[2.75rem] font-semibold leading-[1.03] tracking-[-0.02em] text-ink text-balance sm:text-6xl lg:text-[4rem]">
              Your next car
              <br />
              <span className="text-accent">is waiting.</span>
            </h1>
            <p className="mt-4 max-w-md text-[17px] leading-relaxed text-muted text-pretty">
              Premium cars. Verified hosts. Ready for the road.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
              {trustRow.map((t) => (
                <span key={t.label} className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ink-soft">
                  <Icon name={t.icon} size={16} className="text-accent" />
                  {t.label}
                </span>
              ))}
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link to="/browse" className="btn btn-accent-bright btn-lg">
                Explore Cars <Icon name="arrowRight" size={17} />
              </Link>
              <Link to="/list-your-car" className="btn btn-primary btn-lg">
                List Your Car
              </Link>
            </div>
          </div>

          {/* Hero visual — a real, top-rated car from the live catalogue */}
          <div className="relative animate-scale-in" style={{ transform: `translateY(${heroParallax}px)` }}>
            <div className="relative mx-auto max-w-sm lg:max-w-none">
              <div className="relative overflow-hidden rounded-[2rem] bg-panel">
                {heroCar ? (
                  <div className="animate-float-slow">
                    <Img
                      src={unsplash(heroCar.images[0], 1100)}
                      alt={`${heroCar.make} ${heroCar.model} — available on CX`}
                      className="aspect-[4/3] w-full object-cover lg:aspect-[5/4]"
                    />
                    {/* Soft green sheen sweeping across the photo, once entrance settles */}
                    <div
                      className="animate-light-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-accent-bright/15 to-transparent"
                      style={{ animationDelay: '1.6s' }}
                    />
                  </div>
                ) : (
                  <div className="skeleton aspect-[4/3] w-full lg:aspect-[5/4]" />
                )}
              </div>

              {/* Floating rating chip */}
              {heroCar && (
                <div className="absolute -left-3 top-7 hidden animate-float rounded-2xl border border-line bg-surface/95 px-3.5 py-2.5 shadow-pop backdrop-blur sm:block">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-050 text-accent">
                      <Icon name="verified" size={18} />
                    </span>
                    <div className="text-[12.5px] leading-tight">
                      <p className="font-semibold text-ink">Verified host</p>
                      <p className="text-muted">
                        {heroCar.rating.toFixed(2)} · {heroCar.trips} trips
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Floating price chip */}
              {heroCar && (
                <div className="absolute bottom-5 right-0 animate-float-slow rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-pop backdrop-blur">
                  <p className="text-[12px] text-muted">
                    {heroCar.make} {heroCar.model}
                  </p>
                  <div className="mt-0.5 flex items-baseline gap-1">
                    <span className="text-xl font-semibold text-ink">{eur(heroCar.pricePerDay)}</span>
                    <span className="text-[13px] text-muted">/ day</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search module — floating card, half in the hero, half out */}
        <div className="container-page relative z-10 mt-2 pb-14 lg:mt-0">
          <div className="mx-auto max-w-5xl">
            <SearchBar variant="hero" />
          </div>
        </div>
      </section>

      {/* ---------------- EXPLORE BY CATEGORY ---------------- */}
      <section className="container-page mt-16 sm:mt-20">
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

      {/* ---------------- FEATURED CARS ---------------- */}
      <section className="container-page mt-16 sm:mt-20">
        <SectionHead
          eyebrow="Featured"
          title="Cars people love to drive"
          action={
            <Link to="/browse" className="btn btn-secondary btn-sm">
              View all cars <Icon name="arrowRight" size={16} />
            </Link>
          }
        />
        <div className="mt-9 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {featuredLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card overflow-hidden">
                  <div className="skeleton aspect-[4/3]" />
                  <div className="space-y-2.5 p-4">
                    <div className="skeleton h-4 w-3/5 rounded-md" />
                    <div className="skeleton h-3 w-2/5 rounded-md" />
                  </div>
                </div>
              ))
            : (featuredCars ?? []).map((car, i) => (
                <Reveal key={car.id} delay={(i % 4) * 70}>
                  <CarCard car={car} priority={i < 4} />
                </Reveal>
              ))}
        </div>
      </section>

      {/* ---------------- DRIVE CHALLENGE TEASER ---------------- */}
      <section className="container-page mt-16 sm:mt-20">
        <Reveal>
          <div className="flex flex-col items-center gap-5 rounded-3xl border border-line bg-panel/60 px-6 py-9 text-center sm:flex-row sm:justify-between sm:px-10 sm:text-left">
            <div className="flex items-center gap-4">
              <span className="hidden h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-accent-bright/15 text-accent sm:grid">
                <img
                  src="/cx-drive-challenge-icon.png"
                  alt=""
                  className="h-full w-full object-cover"
                  style={{ objectPosition: '50% 10%' }}
                />
              </span>
              <div>
                <h2 className="font-display text-xl font-semibold text-ink sm:text-2xl">Think you can drive?</h2>
                <p className="mt-1 text-[14.5px] text-muted">
                  Beat the CX Drive Challenge and unlock a reward for your next trip.
                </p>
              </div>
            </div>
            <DriveChallengeLauncher className="btn btn-accent-bright btn-lg shrink-0">
              Play the Challenge <Icon name="arrowRight" size={17} />
            </DriveChallengeLauncher>
          </div>
        </Reveal>
      </section>

      {/* ---------------- WHY CX ---------------- */}
      <section className="container-page mt-16 sm:mt-20">
        <div className="grid gap-8 sm:grid-cols-3">
          {whyCX.map((f, i) => (
            <Reveal key={f.title} delay={i * 90}>
              <div className="flex flex-col items-start gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-050 text-accent">
                  <Icon name={f.icon} size={22} />
                </span>
                <h3 className="font-display text-lg font-semibold text-ink">{f.title}</h3>
                <p className="text-[14.5px] leading-relaxed text-muted">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- FINAL CTA ---------------- */}
      <section className="relative mt-20 overflow-hidden bg-noir py-20 sm:mt-24 sm:py-28">
        <div
          className="glow-accent-bright pointer-events-none absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 opacity-60"
        />
        <Reveal className="relative">
          <div className="container-page flex flex-col items-center gap-6 text-center">
            <h2 className="font-display text-3xl font-semibold text-on-noir text-balance sm:text-5xl">
              Ready for your next journey?
            </h2>
            <Link to="/browse" className="btn btn-accent-bright btn-lg">
              Explore Cars <Icon name="arrowRight" size={17} />
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
