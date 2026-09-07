import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardShell, StatCard, StatCardSkeleton, greeting } from '../components/DashboardShell';
import { Icon, type IconName } from '../components/Icon';
import { EmptyState } from '../components/primitives';
import { useHostCars } from '../lib/data/cars';
import { useHostBookings, useBookedRanges, rangesOverlap, classifyBooking, type Booking, type TripPhase } from '../lib/data/bookings';
import { useUnreadMessageCount } from '../lib/data/messages';
import { useVerification } from '../lib/data/verification';
import { WEEKDAYS, MONTH_NAMES, toISO, startOfMonth, addMonths, buildMonthGrid } from '../lib/calendarGrid';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import { useAuth } from '../lib/auth';
import { Reveal } from '../components/motion';

const TABS: { id: TripPhase; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

const phaseBadge: Record<TripPhase, string> = {
  pending: 'bg-panel-2 text-ink-soft',
  payment_processing: 'bg-panel-2 text-ink-soft',
  upcoming: 'badge-accent',
  active: 'bg-accent text-white',
  completed: 'bg-panel-2 text-ink-soft',
  cancelled: 'bg-danger/10 text-danger',
  refunded: 'bg-danger/10 text-danger',
};

const phaseLabel: Record<TripPhase, string> = {
  pending: 'Payment pending',
  payment_processing: 'Payment processing',
  upcoming: 'Confirmed',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Real trailing 6-month earnings series from actual bookings — cancelled
 *  trips excluded, months with no bookings simply show zero rather than
 *  being hidden (so the chart honestly reflects quiet months). */
function monthlySeries(bookings: Booking[]) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, month: d.toLocaleDateString('en', { month: 'short' }) };
  });
  const sums = new Map(months.map((m) => [m.key, 0]));
  bookings.forEach((b) => {
    if (classifyBooking(b) === 'cancelled') return;
    const key = b.startDate.slice(0, 7);
    if (sums.has(key)) sums.set(key, (sums.get(key) ?? 0) + b.totalPrice);
  });
  return months.map((m) => ({ month: m.month, value: sums.get(m.key) ?? 0 }));
}

function EarningsChart({ data }: { data: { month: string; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 220;
  const pad = { t: 20, r: 16, b: 30, l: 16 };
  const max = Math.max(...data.map((d) => d.value)) * 1.15;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (i / (data.length - 1)) * iw;
  const y = (v: number) => pad.t + ih - (v / max) * ih;

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.value)}`).join(' ');
  const area = `${line} L ${x(data.length - 1)} ${pad.t + ih} L ${x(0)} ${pad.t + ih} Z`;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="earn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={pad.l} x2={W - pad.r} y1={pad.t + ih * g} y2={pad.t + ih * g} stroke="var(--color-line)" strokeWidth="1" strokeDasharray="3 4" />
        ))}
        <path d={area} fill="url(#earn)" />
        <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => (
          <g key={i}>
            <rect x={x(i) - iw / data.length / 2} y={pad.t} width={iw / data.length} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
            <circle cx={x(i)} cy={y(d.value)} r={hover === i ? 5.5 : 3.5} fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth="2.5" style={{ transition: 'r 0.15s' }} />
            <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-[var(--color-faint)]" style={{ fontSize: 11 }}>{d.month}</text>
          </g>
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--color-line-strong)" strokeWidth="1" />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute rounded-lg bg-ink px-2.5 py-1.5 text-white shadow-pop" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(data[hover].value) / H) * 100}%`, transform: 'translate(-50%, -130%)' }}>
          <p className="whitespace-nowrap text-caption font-semibold">{eur(data[hover].value)}</p>
          <p className="text-micro text-white/60">{data[hover].month}</p>
        </div>
      )}
    </div>
  );
}

interface ActionItem {
  id: string;
  icon: IconName;
  label: string;
  sub: string;
  to: string;
}

/**
 * Real, actionable signals only — every item here maps to something the
 * backend actually tracks. Deliberately absent are the spec's "Vehicle
 * needs approval" and "New booking request": `car_status` is only
 * `draft`/`published` (no review-queue state) and `booking_status` has no
 * pending/awaiting-host-approval state — bookings confirm immediately.
 * Inventing either would tell a host to expect a workflow this platform
 * doesn't have.
 */
function buildActionItems({
  draftCars,
  soonPickups,
  unreadCount,
  verificationMissing,
}: {
  draftCars: { id: string; make: string; model: string }[];
  soonPickups: Booking[];
  unreadCount: number;
  verificationMissing: boolean;
}): ActionItem[] {
  const items: ActionItem[] = [];

  for (const c of draftCars) {
    items.push({
      id: `draft-${c.id}`,
      icon: 'cars',
      label: `${c.make} ${c.model} is still a draft`,
      sub: 'Unpublished cars don’t earn — finish the listing from My Fleet.',
      to: '/host#cars',
    });
  }

  for (const b of soonPickups) {
    items.push({
      id: `pickup-${b.id}`,
      icon: 'clock',
      label: `Pickup coming up — ${b.car.make} ${b.car.model}`,
      sub: `${b.renter.name} · ${new Date(b.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      to: '/host#bookings',
    });
  }

  if (unreadCount > 0) {
    items.push({
      id: 'unread',
      icon: 'message',
      label: `${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`,
      sub: 'Customers are waiting on a reply.',
      to: '/messages',
    });
  }

  if (verificationMissing) {
    items.push({
      id: 'verification',
      icon: 'shield',
      label: 'Identity verification needed',
      sub: 'Verified hosts build more trust with renters.',
      to: '/settings#security',
    });
  }

  return items;
}

/** Read-only booked/available month grid for one vehicle — the host
 *  equivalent of `AvailabilityCalendar`, backed by the same real
 *  `useBookedRanges` data, but without the renter-facing click-to-select
 *  range interaction (a host is reviewing availability, not booking). */
function HostFleetCalendar({ cars }: { cars: { id: string; make: string; model: string }[] }) {
  const [carId, setCarId] = useState(cars[0]?.id ?? null);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const { ranges, loading } = useBookedRanges(carId);

  const grid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const todayISO = toISO(new Date());
  const activeCar = cars.find((c) => c.id === carId);

  return (
    <div>
      {cars.length > 1 && (
        <div className="mb-4 flex gap-1.5 overflow-x-auto no-scrollbar">
          {cars.map((c) => (
            <button
              key={c.id}
              onClick={() => setCarId(c.id)}
              className={`chip shrink-0 ${carId === c.id ? '!bg-ink !text-white !border-ink' : ''}`}
            >
              {c.make} {c.model}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setViewMonth((m) => addMonths(m, -1))}
          aria-label="Previous month"
          className="grid h-9 w-9 place-items-center rounded-full text-ink transition-colors hover:bg-panel"
        >
          <Icon name="chevronLeft" size={18} />
        </button>
        <p className="font-display text-copy font-semibold text-ink">
          {MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}
          {activeCar && <span className="ml-1.5 font-sans text-detail font-normal text-muted">· {activeCar.make} {activeCar.model}</span>}
        </p>
        <button
          type="button"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          aria-label="Next month"
          className="grid h-9 w-9 place-items-center rounded-full text-ink transition-colors hover:bg-panel"
        >
          <Icon name="chevronRight" size={18} />
        </button>
      </div>

      <div className="relative mt-3 grid grid-cols-7 gap-y-1">
        {loading && <div className="absolute inset-0 z-10 grid place-items-center bg-surface/60"><CarLoaderInline /></div>}
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1 text-center text-label font-semibold uppercase tracking-wide text-faint">{w}</span>
        ))}
        {grid.map((d, i) => {
          const iso = toISO(d);
          const inMonth = d.getMonth() === viewMonth.getMonth();
          const isToday = iso === todayISO;
          const booked = ranges ? rangesOverlap(iso, iso, ranges) : false;
          return (
            <div key={i} className="py-0.5">
              <span
                className={`mx-auto grid h-9 w-9 place-items-center rounded-full text-detail font-medium ${
                  !inMonth
                    ? 'text-transparent'
                    : booked
                      ? 'bg-ink text-white'
                      : isToday
                        ? 'border border-accent-bright text-ink'
                        : 'text-ink-soft'
                }`}
              >
                {d.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-4 text-caption text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-ink" /> Booked</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-accent-bright" /> Today</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-line-strong" /> Available</span>
      </div>
    </div>
  );
}

function CarLoaderInline() {
  return <span className="text-caption text-muted">Loading…</span>;
}

function HostBookingRow({ booking }: { booking: Booking }) {
  const phase = classifyBooking(booking);
  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-panel/50">
      {booking.renter.avatar ? (
        <img src={booking.renter.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-050 text-accent">
          <Icon name="user" size={16} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-detail font-medium text-ink">{booking.renter.name}</p>
        <p className="truncate text-caption text-muted">{booking.car.make} {booking.car.model} · {fmtDate(booking.startDate)}–{fmtDate(booking.endDate)}</p>
      </div>
      <p className="shrink-0 text-detail font-medium text-ink">{eur(booking.totalPrice)}</p>
      <span className={`badge shrink-0 ${phaseBadge[phase]}`}>{phaseLabel[phase]}</span>
    </div>
  );
}

export default function HostDashboard() {
  const { profile, session } = useAuth();
  const { cars: hostCars, loading: carsLoading } = useHostCars(session?.user.id);
  const { bookings: hostBookings, loading: bookingsLoading } = useHostBookings(session?.user.id);
  const unreadCount = useUnreadMessageCount(session?.user.id);
  const { verification, loading: verificationLoading } = useVerification(session?.user.id);
  const [tab, setTab] = useState<TripPhase>('upcoming');
  const firstName = (profile?.full_name || session?.user.email?.split('@')[0] || 'there').split(' ')[0];
  const loading = carsLoading || bookingsLoading;

  const classified = useMemo(
    () => (hostBookings ?? []).map((b) => ({ booking: b, phase: classifyBooking(b) })),
    [hostBookings],
  );

  const totalEarnings = classified.filter((c) => c.phase === 'completed').reduce((sum, c) => sum + c.booking.totalPrice, 0);
  const todayISOKey = toISO(new Date());
  const thisMonthKey = new Date().toISOString().slice(0, 7);
  const thisYearKey = String(new Date().getFullYear());
  const weekAgoKey = toISO(new Date(Date.now() - 6 * 86_400_000));
  // Only phases where the charge is real and was actually kept — see the
  // same note on CustomerDashboard.tsx's totalSpent.
  const earningsInRange = (fromKey: string, toKey?: string) =>
    classified
      .filter(
        (c) =>
          (c.phase === 'upcoming' || c.phase === 'active' || c.phase === 'completed') &&
          c.booking.startDate >= fromKey &&
          (!toKey || c.booking.startDate <= toKey),
      )
      .reduce((sum, c) => sum + c.booking.totalPrice, 0);
  const todayEarnings = earningsInRange(todayISOKey, todayISOKey);
  const weekEarnings = earningsInRange(weekAgoKey);
  const thisMonthEarnings = earningsInRange(`${thisMonthKey}-01`);
  const thisYearEarnings = earningsInRange(`${thisYearKey}-01-01`);
  const upcomingCount = classified.filter((c) => c.phase === 'upcoming' || c.phase === 'active').length;
  const activeCarsCount = (hostCars ?? []).filter((c) => c.status === 'published').length;
  const allReviews = (hostCars ?? []).flatMap((c) => c.reviews);
  const avgRating = allReviews.length ? allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length : null;

  const series = useMemo(() => monthlySeries(hostBookings ?? []), [hostBookings]);
  const hasEarningsData = series.some((d) => d.value > 0);

  // A refunded trip is grouped under the Cancelled tab rather than given
  // its own — see the same note on CustomerDashboard.tsx's tabBookings.
  const tabBookings = classified.filter((c) => c.phase === tab || (tab === 'cancelled' && c.phase === 'refunded')).map((c) => c.booking);

  // Real revenue + booking count per vehicle, for the fleet cards below —
  // grouped from the same bookings already fetched, not a separate query.
  const carStats = useMemo(() => {
    const map = new Map<string, { bookings: number; revenue: number }>();
    for (const { booking, phase } of classified) {
      if (phase === 'cancelled') continue;
      const entry = map.get(booking.car.id) ?? { bookings: 0, revenue: 0 };
      entry.bookings += 1;
      entry.revenue += booking.totalPrice;
      map.set(booking.car.id, entry);
    }
    return map;
  }, [classified]);

  const actionItems = useMemo(() => {
    const soonCutoff = toISO(new Date(Date.now() + 2 * 86_400_000));
    return buildActionItems({
      draftCars: (hostCars ?? []).filter((c) => c.status === 'draft'),
      soonPickups: classified
        .filter((c) => c.phase === 'upcoming' && c.booking.startDate <= soonCutoff)
        .map((c) => c.booking),
      unreadCount,
      verificationMissing: !verificationLoading && (!verification || verification.status === 'rejected'),
    });
  }, [hostCars, classified, unreadCount, verification, verificationLoading]);

  return (
    <DashboardShell variant="host" active="Overview">
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-body text-muted">{greeting()},</p>
            <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{firstName}</h1>
          </div>
          <Link to="/list-your-car" className="btn btn-primary btn-sm"><Icon name="plus" size={16} /> Add a car</Link>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {loading ? (
            <>
              <StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton />
            </>
          ) : (
            <>
              <Reveal delay={0}><StatCard icon="euro" label="Total earnings" value={eur(totalEarnings)} accent /></Reveal>
              <Reveal delay={60}><StatCard icon="trending" label="This month" value={eur(thisMonthEarnings)} /></Reveal>
              <Reveal delay={120}><StatCard icon="cars" label="Active cars" value={String(activeCarsCount)} /></Reveal>
              <Reveal delay={180}><StatCard icon="star" label="Average rating" value={avgRating ? avgRating.toFixed(2) : '—'} /></Reveal>
            </>
          )}
        </div>

        {/* Action Required — the host's real to-do list, built only from
            signals this backend genuinely tracks (see buildActionItems). */}
        {!loading && actionItems.length > 0 && (
          <Reveal delay={200}>
            <section className="mt-6">
              <h2 className="mb-3 font-display text-lg font-semibold text-ink">Action Required</h2>
              <div className="card divide-y divide-line overflow-hidden">
                {actionItems.map((item) => (
                  <Link key={item.id} to={item.to} className="flex items-center gap-3 p-4 transition-colors hover:bg-panel/40">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-star/15 text-star">
                      <Icon name={item.icon} size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-detail font-medium text-ink">{item.label}</p>
                      <p className="truncate text-caption text-muted">{item.sub}</p>
                    </div>
                    <Icon name="chevronRight" size={16} className="shrink-0 text-faint" />
                  </Link>
                ))}
              </div>
            </section>
          </Reveal>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          {/* Earnings chart */}
          <Reveal><section className="card scroll-mt-20 p-6" id="earnings">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">Earnings</h2>
                <p className="text-detail text-muted">Last 6 months</p>
              </div>
            </div>
            <div className="mt-5">
              <div className="flex items-end gap-3">
                <span className="font-display text-3xl font-semibold text-ink">{eur(series.reduce((a, b) => a + b.value, 0))}</span>
              </div>
            </div>
            {!loading && (
              <div className="mt-4 grid grid-cols-4 gap-3 border-y border-line py-3.5">
                {[
                  { l: 'Today', v: todayEarnings },
                  { l: 'This week', v: weekEarnings },
                  { l: 'This month', v: thisMonthEarnings },
                  { l: 'This year', v: thisYearEarnings },
                ].map((x) => (
                  <div key={x.l} className="text-center">
                    <p className="text-body font-semibold text-ink">{eur(x.v)}</p>
                    <p className="mt-0.5 text-caption text-muted">{x.l}</p>
                  </div>
                ))}
              </div>
            )}
            {loading ? (
              <div className="skeleton mt-5 h-[220px] rounded-xl" />
            ) : hasEarningsData ? (
              <div className="mt-3"><EarningsChart data={series} /></div>
            ) : (
              <div className="mt-5 flex flex-col items-center gap-2 rounded-xl border border-line py-10 text-center">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-panel text-muted"><Icon name="euro" size={20} /></span>
                <p className="font-medium text-ink">No earnings yet</p>
                <p className="max-w-xs text-detail text-muted">Bookings on your cars will show up here once they come in.</p>
              </div>
            )}
          </section></Reveal>

          {/* Upcoming reservations */}
          <Reveal delay={80}><section className="card scroll-mt-20 p-6" id="upcoming">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">Upcoming</h2>
              {upcomingCount > 0 && <span className="badge badge-accent">{upcomingCount} reservation{upcomingCount === 1 ? '' : 's'}</span>}
            </div>
            {loading ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <div className="skeleton h-16 w-full rounded-xl" />
              </div>
            ) : upcomingCount > 0 ? (
              <div className="space-y-1">
                {classified
                  .filter((c) => c.phase === 'upcoming' || c.phase === 'active')
                  .slice(0, 4)
                  .map((c) => <HostBookingRow key={c.booking.id} booking={c.booking} />)}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-panel text-muted"><Icon name="trips" size={20} /></span>
                <p className="font-medium text-ink">No upcoming reservations</p>
                <p className="max-w-xs text-detail text-muted">New bookings on your cars will appear here.</p>
              </div>
            )}
          </section></Reveal>
        </div>

        {/* Bookings */}
        <Reveal><section className="mt-8 scroll-mt-20 card overflow-hidden p-6" id="bookings">
          <h2 className="font-display text-lg font-semibold text-ink">Bookings</h2>
          <div className="mt-4 mb-3 flex gap-1.5 overflow-x-auto no-scrollbar">
            {TABS.map((t) => {
              const count = classified.filter((c) => c.phase === t.id).length;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`chip shrink-0 ${tab === t.id ? '!bg-ink !text-white !border-ink' : ''}`}
                >
                  {t.label}
                  {count > 0 && <span className="text-faint">· {count}</span>}
                </button>
              );
            })}
          </div>
          <div key={tab} className="min-h-[100px] divide-y divide-line animate-fade-in">
            {loading ? (
              <div className="py-10 text-center"><div className="skeleton mx-auto h-16 w-full rounded-xl" /></div>
            ) : tabBookings.length > 0 ? (
              tabBookings.map((b) => <HostBookingRow key={b.id} booking={b} />)
            ) : (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-panel text-muted"><Icon name="trips" size={20} /></span>
                <p className="font-medium text-ink">Nothing to show in this tab yet</p>
              </div>
            )}
          </div>
        </section></Reveal>

        {/* My cars */}
        <Reveal>
        <section className="mt-8 scroll-mt-20" id="cars">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">My Fleet</h2>
            <Link to="/list-your-car" className="text-detail font-medium text-muted hover:text-ink">Add vehicle</Link>
          </div>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton aspect-[16/10] rounded-2xl" />)}
            </div>
          ) : hostCars && hostCars.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {hostCars.map((c) => {
                const published = c.status === 'published';
                const stats = carStats.get(c.id);
                const cardInner = (
                  <>
                    <div className="relative aspect-[16/10]">
                      <img src={unsplash(c.images[0], 500)} alt="" className="h-full w-full object-cover" />
                      <span className="absolute left-2.5 top-2.5 badge badge-glass">
                        <span className={`h-1.5 w-1.5 rounded-full ${published ? 'bg-accent' : 'bg-faint'}`} />
                        {published ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <div className="p-4">
                      <p className="truncate text-body font-medium text-ink">{c.make} {c.model}</p>
                      <div className="mt-1 flex items-center justify-between text-detail">
                        <span className="inline-flex items-center gap-1 text-muted">
                          <Icon name="star" size={12} className="text-star" /> {c.reviews.length ? c.rating.toFixed(2) : 'New'}
                        </span>
                        <span className="font-medium text-ink">{eur(c.pricePerDay)}/day</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-caption text-muted">
                        <span>{stats?.bookings ?? 0} booking{stats?.bookings === 1 ? '' : 's'}</span>
                        <span className="font-medium text-ink">{eur(stats?.revenue ?? 0)} earned</span>
                      </div>
                    </div>
                  </>
                );
                return published ? (
                  <Link key={c.id} to={`/cars/${c.slug}`} className="card overflow-hidden">{cardInner}</Link>
                ) : (
                  <div key={c.id} className="card overflow-hidden opacity-80">{cardInner}</div>
                );
              })}
            </div>
          ) : (
            <div className="card flex flex-col items-center gap-2 py-12 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-panel text-muted"><Icon name="cars" size={22} /></span>
              <p className="mt-1 font-medium text-ink">Your fleet starts here</p>
              <p className="max-w-xs text-detail text-muted">Add your first car and start earning on the days you're not driving it.</p>
              <Link to="/list-your-car" className="btn btn-primary btn-sm mt-2"><Icon name="plus" size={16} /> Add Your First Car</Link>
            </div>
          )}
        </section>
        </Reveal>

        {/* Reviews */}
        <Reveal>
        <section className="mt-8 scroll-mt-20" id="reviews">
          <h2 className="mb-4 font-display text-lg font-semibold text-ink">Reviews</h2>
          {allReviews.length > 0 ? (
            <div className="card flex items-center gap-6 p-6">
              <div className="text-center">
                <p className="font-display text-3xl font-semibold text-ink">{avgRating!.toFixed(2)}</p>
                <p className="mt-1 flex items-center justify-center gap-1 text-caption text-muted"><Icon name="star" size={13} className="text-star" /> Average rating</p>
              </div>
              <div className="h-12 w-px bg-line" />
              <div className="text-center">
                <p className="font-display text-3xl font-semibold text-ink">{allReviews.length}</p>
                <p className="mt-1 text-caption text-muted">Total reviews</p>
              </div>
            </div>
          ) : (
            <div className="card">
              <EmptyState
                size="md"
                icon="reviews"
                title="No reviews yet"
                description="Reviews from completed trips will appear here."
                className="py-12"
              />
            </div>
          )}
        </section>
        </Reveal>

        {/* Calendar */}
        <Reveal>
        <section className="mt-8 scroll-mt-20" id="calendar">
          <h2 className="mb-4 font-display text-lg font-semibold text-ink">Calendar</h2>
          {loading ? (
            <div className="skeleton h-80 rounded-2xl" />
          ) : hostCars && hostCars.length > 0 ? (
            <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
              <div className="card p-6">
                <HostFleetCalendar cars={hostCars.map((c) => ({ id: c.id, make: c.make, model: c.model }))} />
              </div>
              <div>
                <p className="mb-3 text-detail font-medium text-ink-soft">Upcoming pickups &amp; returns</p>
                {classified.filter((c) => c.phase === 'upcoming' || c.phase === 'active').length > 0 ? (
                  <div className="card divide-y divide-line">
                    {classified
                      .filter((c) => c.phase === 'upcoming' || c.phase === 'active')
                      .map((c) => (
                        <div key={c.booking.id} className="flex items-center justify-between gap-3 p-4">
                          <div className="min-w-0">
                            <p className="truncate text-detail font-medium text-ink">{c.booking.car.make} {c.booking.car.model}</p>
                            <p className="text-caption text-muted">{fmtDate(c.booking.startDate)} → {fmtDate(c.booking.endDate)}</p>
                          </div>
                          <span className={`badge shrink-0 ${phaseBadge[c.phase]}`}>{phaseLabel[c.phase]}</span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="card flex flex-col items-center gap-2 py-10 text-center">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-panel text-muted"><Icon name="calendar" size={20} /></span>
                    <p className="mt-1 font-medium text-ink">No dates booked yet</p>
                  </div>
                )}
                <p className="mt-3 text-caption text-faint">Manually blocking dates is coming soon.</p>
              </div>
            </div>
          ) : (
            <div className="card flex flex-col items-center gap-2 py-12 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-panel text-muted"><Icon name="calendar" size={22} /></span>
              <p className="mt-1 font-medium text-ink">Add a car to see its calendar</p>
            </div>
          )}
        </section>
        </Reveal>
      </div>
    </DashboardShell>
  );
}
