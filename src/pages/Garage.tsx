import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { CarCard } from '../components/CarCard';
import { ConciergeLauncher } from '../components/Concierge';
import { Reveal, useCountUp } from '../components/motion';
import { CarLoader } from '../components/CarLoader';
import { SectionHead } from '../components/primitives';
import { useAuth } from '../lib/auth';
import { useApp } from '../lib/store';
import { useCompare } from '../lib/compareStore';
import { useCars } from '../lib/data/cars';
import { useMyBookings, classifyBooking, type Booking } from '../lib/data/bookings';
import { useMyRewards } from '../lib/data/rewards';
import { getSavedBuilds, removeBuild } from '../lib/data/carConfig';
import { daysBetween } from '../components/BookingCard';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import type { Car, CarCategory } from '../data/types';

/**
 * CX Garage — a personal automotive space built entirely from data that
 * already exists (favorites, real bookings, real reward claims). There is
 * no points-ledger table in this schema, so where the brief says "CX
 * Points earned" this shows the real count of DRIVE Challenge rewards
 * claimed instead of inventing a number — everything else here (stats,
 * badges, recommendations, the car-match quiz) is derived the same way:
 * computed from rows that are actually in the database, never hand-typed.
 */

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtMonthYear = (s: string) => new Date(s).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

function mostCommon<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  const counts = new Map<T, number>();
  for (const it of items) counts.set(it, (counts.get(it) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  return best;
}

interface Badge {
  id: string;
  label: string;
  description: string;
  icon: IconName;
  unlocked: boolean;
}

function computeBadges(bookings: Booking[], favoritesCount: number, carsById: Map<string, Car>): Badge[] {
  const completed = bookings.filter((b) => classifyBooking(b) === 'completed');
  const bookedCategories = bookings.map((b) => carsById.get(b.car.id)?.category).filter(Boolean) as CarCategory[];
  const locations = new Set(bookings.map((b) => b.pickupLocation || b.car.location));
  const hadQualifyingWeekend = completed.some((b) => {
    const day = new Date(b.startDate).getDay(); // 0=Sun..6=Sat
    const span = daysBetween(b.startDate, b.endDate);
    return (day === 5 || day === 6) && span >= 2 && span <= 3;
  });

  return [
    { id: 'first-drive', label: 'First Drive', description: 'Completed your first CX rental.', icon: 'key', unlocked: completed.length >= 1 },
    { id: 'performance', label: 'Performance', description: 'Rented a performance vehicle.', icon: 'gauge', unlocked: bookedCategories.includes('Sport') },
    { id: 'luxury', label: 'Luxury', description: 'Rented a luxury vehicle.', icon: 'gem', unlocked: bookedCategories.includes('Luxury') },
    { id: 'explorer', label: 'Explorer', description: 'Rented vehicles in multiple locations.', icon: 'globe', unlocked: locations.size >= 2 },
    { id: 'collector', label: 'CX Collector', description: 'Saved multiple vehicles to your Garage.', icon: 'heart', unlocked: favoritesCount >= 3 },
    { id: 'weekend', label: 'Weekend Driver', description: 'Completed a qualifying weekend rental.', icon: 'sun', unlocked: hadQualifyingWeekend },
  ];
}

function StatTile({ icon, value, label }: { icon: IconName; value: string | number; label: string }) {
  const numeric = typeof value === 'number' ? value : undefined;
  const { ref, value: animated } = useCountUp<HTMLParagraphElement>(numeric ?? 0, { duration: 800 });
  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-4 backdrop-blur-md">
      <Icon name={icon} size={18} className="text-accent-bright" />
      <p ref={numeric !== undefined ? ref : undefined} className="mt-2 font-display text-2xl font-semibold text-white tabular-nums">
        {numeric !== undefined ? animated : value}
      </p>
      <p className="mt-0.5 text-caption text-white/60">{label}</p>
    </div>
  );
}

function DriveHistoryRow({ booking, isLast }: { booking: Booking; isLast: boolean }) {
  const days = daysBetween(booking.startDate, booking.endDate);
  const route = booking.pickupLocation || booking.car.location;
  return (
    <div className="relative flex gap-4 pb-8 last:pb-0">
      {!isLast && <span className="absolute left-[15px] top-8 h-full w-px bg-line" />}
      <span className="relative z-10 mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-050 text-accent">
        <Icon name="car" size={15} />
      </span>
      <Link to={`/cars/${booking.car.slug}`} className="group min-w-0 flex-1">
        <p className="font-display text-copy font-semibold text-ink group-hover:text-accent-700">
          {booking.car.make} {booking.car.model}
        </p>
        <p className="mt-0.5 text-detail text-muted">{fmtMonthYear(booking.startDate)}</p>
        <p className="mt-1 text-detail text-ink-soft">
          {route} · {days} {days === 1 ? 'day' : 'days'}
        </p>
      </Link>
    </div>
  );
}

function GarageCarCard({ booking }: { booking: Booking }) {
  return (
    <div className="card overflow-hidden">
      <div className="relative aspect-[4/3] overflow-hidden bg-panel-2">
        <img src={booking.car.image} alt={`${booking.car.make} ${booking.car.model}`} className="h-full w-full object-cover" />
        <span className="absolute left-3 top-3 badge badge-glass capitalize">{classifyBooking(booking)}</span>
      </div>
      <div className="p-4">
        <p className="font-medium text-ink">
          {booking.car.make} {booking.car.model}
        </p>
        <p className="mt-0.5 text-detail text-muted">
          {fmtDate(booking.startDate)} → {fmtDate(booking.endDate)}
        </p>
        <p className="mt-1 flex items-center gap-1 text-detail text-ink-soft">
          <Icon name="pin" size={12} /> {booking.pickupLocation || booking.car.location}
        </p>
        <Link to={`/cars/${booking.car.slug}`} className="btn btn-secondary btn-sm btn-block mt-3">
          View Car
        </Link>
      </div>
    </div>
  );
}

export default function Garage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { favorites } = useApp();
  const { toggleCompare, clearCompare } = useCompare();
  const { cars: allCars, loading: carsLoading } = useCars();
  const { bookings, loading: bookingsLoading } = useMyBookings(session?.user.id);
  const { rewards, loading: rewardsLoading } = useMyRewards(session?.user.id);

  const carsById = useMemo(() => new Map((allCars ?? []).map((c) => [c.id, c])), [allCars]);
  const favoriteCars = useMemo(() => (allCars ?? []).filter((c) => favorites.has(c.id)), [allCars, favorites]);

  // Saved configurator builds — localStorage-backed today (see
  // carConfig.ts); each is joined back to the real car record so a build
  // for a delisted car simply drops out rather than rendering a ghost.
  const [builds, setBuilds] = useState(() => getSavedBuilds());
  const builtCars = useMemo(
    () =>
      builds
        .map((build) => {
          const car = (allCars ?? []).find((c) => c.id === build.carId);
          return car ? { car, build } : null;
        })
        .filter((x): x is { car: Car; build: (typeof builds)[number] } => x !== null),
    [builds, allCars],
  );
  const bookedCarIds = useMemo(() => new Set((bookings ?? []).map((b) => b.car.id)), [bookings]);

  const sortedBookings = useMemo(
    () => [...(bookings ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [bookings],
  );
  const recentlyDriven = sortedBookings.slice(0, 4);

  const loading = carsLoading || bookingsLoading || rewardsLoading;
  const hasAnyData = favoriteCars.length > 0 || (bookings ?? []).length > 0 || builtCars.length > 0;

  // ---- Drive stats — every metric guarded, nothing shown without real data behind it.
  const stats = useMemo(() => {
    const b = bookings ?? [];
    if (b.length === 0) return null;
    const totalDays = b.reduce((sum, x) => sum + daysBetween(x.startDate, x.endDate), 0);
    const categories = b.map((x) => carsById.get(x.car.id)?.category).filter(Boolean) as CarCategory[];
    const brands = b.map((x) => x.car.make);
    const locations = b.map((x) => x.pickupLocation || x.car.location);
    return {
      totalRentals: b.length,
      totalDays,
      favoriteCategory: mostCommon(categories),
      topBrand: mostCommon(brands),
      topLocation: mostCommon(locations),
    };
  }, [bookings, carsById]);

  const badges = useMemo(
    () => computeBadges(bookings ?? [], favorites.size, carsById),
    [bookings, favorites, carsById],
  );

  // ---- Recommended — real inventory only, scored off real favorite/booking signals.
  const recommended = useMemo(() => {
    if (!allCars) return [];
    const signalCategories = [
      ...favoriteCars.map((c) => c.category),
      ...(bookings ?? []).map((b) => carsById.get(b.car.id)?.category).filter(Boolean),
    ] as CarCategory[];
    const topCategory = mostCommon(signalCategories);
    const pool = allCars.filter((c) => !favorites.has(c.id) && !bookedCarIds.has(c.id));
    if (!topCategory) return [...pool].sort((a, b) => b.rating - a.rating).slice(0, 3);
    const matching = pool.filter((c) => c.category === topCategory).sort((a, b) => b.rating - a.rating);
    const rest = pool.filter((c) => c.category !== topCategory).sort((a, b) => b.rating - a.rating);
    return [...matching, ...rest].slice(0, 3);
  }, [allCars, favoriteCars, bookings, carsById, favorites, bookedCarIds]);
  const recommendReason = mostCommon([...favoriteCars.map((c) => `${c.make} ${c.model}`)]);

  const carOfTheWeek = useMemo(() => {
    if (!allCars || allCars.length === 0) return null;
    return [...allCars].sort((a, b) => b.rating - a.rating)[0];
  }, [allCars]);

  const compareMyCars = () => {
    clearCompare();
    favoriteCars.slice(0, 4).forEach((c) => toggleCompare(c.id));
    navigate('/compare');
  };

  // `sortedBookings[0]?.car.image` is already a fully-resolved Unsplash URL
  // (bookings.ts's mapper wraps it at a smaller width for trip rows) —
  // calling `unsplash()` on it again would be a no-op that silently keeps
  // that smaller size, so it's used as-is; the other two sources are raw
  // photo ids and need the wrap for a properly large hero image.
  const heroImage = favoriteCars[0]
    ? unsplash(favoriteCars[0].images[0], 2000)
    : sortedBookings[0]
      ? sortedBookings[0].car.image
      : carOfTheWeek
        ? unsplash(carOfTheWeek.images[0], 2000)
        : null;

  // ---- Signed out — a teaser, not a redirect: the page itself explains
  // what's behind sign-in rather than bouncing away.
  if (!session) {
    return (
      <div className="relative overflow-hidden bg-noir">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{ background: 'radial-gradient(70% 55% at 20% 10%, rgba(0,212,71,0.16), transparent 65%)' }}
        />
        <div className="container-page relative flex min-h-[70vh] flex-col items-center justify-center py-20 text-center">
          <Reveal>
            <span className="grid h-14 w-14 place-items-center rounded-full bg-white/10 text-accent-bright">
              <Icon name="key" size={26} />
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-6 font-display text-3xl font-semibold text-on-noir sm:text-5xl">Your personal CX Garage</h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-3 max-w-md text-copy leading-relaxed text-on-noir-muted">
              Sign in to save cars, track your drives and build your collection.
            </p>
          </Reveal>
          <Reveal delay={200}>
            <Link to="/login" state={{ from: { pathname: '/garage' } }} className="btn btn-accent-bright btn-lg mt-7">
              Sign In <Icon name="arrowRight" size={17} />
            </Link>
          </Reveal>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden bg-noir">
        {heroImage && (
          <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-noir via-noir/75 to-noir/40" />
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{ background: 'radial-gradient(65% 50% at 18% 10%, rgba(0,212,71,0.18), transparent 65%)' }}
        />
        <div className="container-page relative py-16 sm:py-20">
          <Reveal>
            <p className="eyebrow">CX Garage</p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-2 font-display text-4xl font-semibold text-on-noir sm:text-6xl">My CX Garage</h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-3 max-w-md text-lead leading-relaxed text-on-noir-muted sm:text-feature">
              Your cars. Your drives. Your CX.
            </p>
          </Reveal>
          {!loading && (
            <Reveal delay={200}>
              <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">
                <StatTile icon="heart" value={favoriteCars.length} label="Cars saved" />
                <StatTile icon="trips" value={(bookings ?? []).length} label="Rentals" />
                <StatTile icon="gift" value={(rewards ?? []).length} label="Rewards earned" />
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {loading ? (
        <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
          <CarLoader size={90} />
        </div>
      ) : !hasAnyData ? (
        /* ================= EMPTY STATE ================= */
        <div className="container-page py-16 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-panel text-muted">
            <Icon name="car" size={26} />
          </span>
          <h2 className="mt-5 font-display text-2xl font-semibold text-ink">Your Garage is empty</h2>
          <p className="mx-auto mt-2 max-w-sm text-body text-muted">Start building your CX Garage — save cars you love and book your first drive.</p>
          <Link to="/browse" className="btn btn-accent-bright btn-lg mt-6">
            Explore Cars <Icon name="arrowRight" size={17} />
          </Link>
          {carOfTheWeek && (
            <div className="mx-auto mt-14 max-w-sm text-left">
              <SectionHead eyebrow="Car of the Week" title={`${carOfTheWeek.make} ${carOfTheWeek.model}`} />
              <div className="mt-5">
                <CarCard car={carOfTheWeek} />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="container-page space-y-16 py-12 sm:space-y-20">
          {/* ================= MY CARS ================= */}
          {favoriteCars.length > 0 && (
            <section>
              <SectionHead
                eyebrow="My Garage"
                title="My Cars"
                action={
                  favoriteCars.length >= 2 ? (
                    <button onClick={compareMyCars} className="btn btn-secondary">
                      <Icon name="compare" size={16} /> Compare My Cars
                    </button>
                  ) : undefined
                }
              />
              <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {favoriteCars.map((car) => (
                  <CarCard key={car.id} car={car} />
                ))}
              </div>
            </section>
          )}

          {/* ================= MY BUILDS ================= */}
          {builtCars.length > 0 && (
            <section>
              <SectionHead eyebrow="CX Configurator" title="My Builds" />
              <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {builtCars.map(({ car, build }) => (
                  <div key={car.id} className="card overflow-hidden">
                    <Link to={`/cars/${car.slug}?build=1&view=${build.view}`} className="block">
                      <div className="aspect-[4/3] overflow-hidden bg-panel-2">
                        <img
                          src={unsplash(car.images[Math.min(build.view, car.images.length - 1)] ?? car.images[0], 500)}
                          alt={`${car.make} ${car.model}`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    </Link>
                    <div className="p-4">
                      <p className="font-medium text-ink">
                        {car.make} {car.model}
                      </p>
                      <p className="mt-0.5 text-caption text-muted">
                        Saved {new Date(build.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Link
                          to={`/cars/${car.slug}?build=1&view=${build.view}`}
                          className="btn btn-secondary btn-sm flex-1"
                        >
                          Open build
                        </Link>
                        <button
                          onClick={() => setBuilds(removeBuild(car.id))}
                          aria-label="Remove build"
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-muted hover:border-ink hover:text-ink"
                        >
                          <Icon name="x" size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ================= RECENTLY DRIVEN ================= */}
          {recentlyDriven.length > 0 && (
            <section>
              <SectionHead title="Recently Driven" />
              <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {recentlyDriven.map((b) => (
                  <GarageCarCard key={b.id} booking={b} />
                ))}
              </div>
            </section>
          )}

          <div className="grid gap-16 lg:grid-cols-[1.2fr_1fr] lg:gap-10">
            {/* ================= DRIVE HISTORY ================= */}
            {sortedBookings.length > 0 && (
              <section>
                <SectionHead title="My Drive History" />
                <div className="card mt-6 p-6">
                  {sortedBookings.map((b, i) => (
                    <DriveHistoryRow key={b.id} booking={b} isLast={i === sortedBookings.length - 1} />
                  ))}
                </div>
              </section>
            )}

            <div className="space-y-10">
              {/* ================= DRIVE STATS ================= */}
              {stats && (
                <section>
                  <SectionHead title="Your Drive Stats" />
                  <dl className="mt-6 grid grid-cols-2 gap-3">
                    <div className="card p-4">
                      <dt className="text-caption text-muted">Total rentals</dt>
                      <dd className="mt-1 font-display text-xl font-semibold text-ink">{stats.totalRentals}</dd>
                    </div>
                    <div className="card p-4">
                      <dt className="text-caption text-muted">Total rental days</dt>
                      <dd className="mt-1 font-display text-xl font-semibold text-ink">{stats.totalDays}</dd>
                    </div>
                    {stats.favoriteCategory && (
                      <div className="card p-4">
                        <dt className="text-caption text-muted">Favourite category</dt>
                        <dd className="mt-1 font-display text-xl font-semibold text-ink">{stats.favoriteCategory}</dd>
                      </div>
                    )}
                    {stats.topBrand && (
                      <div className="card p-4">
                        <dt className="text-caption text-muted">Most rented brand</dt>
                        <dd className="mt-1 font-display text-xl font-semibold text-ink">{stats.topBrand}</dd>
                      </div>
                    )}
                    {stats.topLocation && (
                      <div className="card col-span-2 p-4">
                        <dt className="text-caption text-muted">Most visited location</dt>
                        <dd className="mt-1 font-display text-xl font-semibold text-ink">{stats.topLocation}</dd>
                      </div>
                    )}
                  </dl>
                </section>
              )}

              {/* ================= BADGES ================= */}
              <section>
                <SectionHead title="CX Garage Badges" />
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {badges.map((b) => (
                    <div
                      key={b.id}
                      title={b.description}
                      className={`flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-colors ${
                        b.unlocked ? 'border-accent-bright/30 bg-accent-050' : 'border-line bg-panel/50 opacity-50'
                      }`}
                    >
                      <span className={`grid h-10 w-10 place-items-center rounded-full ${b.unlocked ? 'bg-accent-bright/15 text-accent-700' : 'bg-panel-2 text-faint'}`}>
                        <Icon name={b.unlocked ? b.icon : 'lock'} size={17} />
                      </span>
                      <p className="text-label font-semibold uppercase tracking-wide text-ink">{b.label}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>

          {/* ================= CAR OF THE WEEK ================= */}
          {carOfTheWeek && (
            <section>
              <SectionHead eyebrow="Featured" title="Car of the Week" />
              <div className="mt-6 card overflow-hidden lg:flex">
                <div className="lg:w-3/5">
                  <img
                    src={unsplash(carOfTheWeek.images[0], 1200)}
                    alt={`${carOfTheWeek.make} ${carOfTheWeek.model}`}
                    className="h-64 w-full object-cover lg:h-full"
                  />
                </div>
                <div className="flex flex-1 flex-col justify-center p-6 sm:p-8">
                  <h3 className="font-display text-2xl font-semibold text-ink">
                    {carOfTheWeek.make} {carOfTheWeek.model}
                  </h3>
                  <p className="mt-2 text-body leading-relaxed text-muted line-clamp-3">{carOfTheWeek.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {[
                      { icon: 'seat' as IconName, v: `${carOfTheWeek.seats} seats` },
                      { icon: 'gear' as IconName, v: carOfTheWeek.transmission },
                      { icon: 'gas' as IconName, v: carOfTheWeek.fuel },
                    ].map((s) => (
                      <span key={s.v} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-detail text-ink-soft">
                        <Icon name={s.icon} size={14} className="text-muted" /> {s.v}
                      </span>
                    ))}
                  </div>
                  <p className="mt-4 text-feature font-semibold text-ink">
                    {eur(carOfTheWeek.pricePerDay)} <span className="text-detail font-normal text-muted">/ day</span>
                  </p>
                  <Link to={`/cars/${carOfTheWeek.slug}`} className="btn btn-accent-bright btn-lg mt-5 w-fit">
                    Discover Car <Icon name="arrowRight" size={17} />
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* ================= RECOMMENDED FOR YOU ================= */}
          {recommended.length > 0 && (
            <section>
              <SectionHead
                eyebrow={recommendReason ? `Because you liked the ${recommendReason}` : undefined}
                title="Recommended For You"
              />
              <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {recommended.map((car) => (
                  <CarCard key={car.id} car={car} />
                ))}
              </div>
            </section>
          )}

          {/* ================= FIND MY NEXT CX (CX Concierge) ================= */}
          <section className="relative overflow-hidden rounded-[1.75rem] bg-noir p-6 sm:p-10">
            <div
              className="pointer-events-none absolute inset-0 opacity-80"
              style={{ background: 'radial-gradient(55% 55% at 85% 20%, rgba(0,212,71,0.16), transparent 62%)' }}
            />
            <div className="relative max-w-xl">
              <p className="inline-flex items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.2em] text-accent-bright">
                <Icon name="sparkles" size={14} /> CX Concierge
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold text-on-noir sm:text-3xl">Find my next CX</h2>
              <p className="mt-2 text-copy leading-relaxed text-on-noir-muted">
                Tell us how you want to drive — we'll match you to the right car from your fleet, personalised to your Garage.
              </p>
              <ConciergeLauncher className="btn btn-accent-bright btn-lg mt-6">
                Start <Icon name="arrowRight" size={17} />
              </ConciergeLauncher>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
