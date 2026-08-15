import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardShell, StatCard, StatCardSkeleton, greeting } from '../components/DashboardShell';
import { Icon } from '../components/Icon';
import { useHostCars } from '../lib/data/cars';
import { useHostBookings, classifyBooking, type Booking, type TripPhase } from '../lib/data/bookings';
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
  upcoming: 'badge-accent',
  active: 'bg-accent text-white',
  completed: 'bg-panel-2 text-ink-soft',
  cancelled: 'bg-danger/10 text-danger',
};

const phaseLabel: Record<TripPhase, string> = {
  upcoming: 'Confirmed',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
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
          <p className="whitespace-nowrap text-[12px] font-semibold">{eur(data[hover].value)}</p>
          <p className="text-[10.5px] text-white/60">{data[hover].month}</p>
        </div>
      )}
    </div>
  );
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
        <p className="truncate text-[13.5px] font-medium text-ink">{booking.renter.name}</p>
        <p className="truncate text-[12.5px] text-muted">{booking.car.make} {booking.car.model} · {fmtDate(booking.startDate)}–{fmtDate(booking.endDate)}</p>
      </div>
      <p className="shrink-0 text-[13.5px] font-medium text-ink">{eur(booking.totalPrice)}</p>
      <span className={`badge shrink-0 ${phaseBadge[phase]}`}>{phaseLabel[phase]}</span>
    </div>
  );
}

export default function HostDashboard() {
  const { profile, session } = useAuth();
  const { cars: hostCars, loading: carsLoading } = useHostCars(session?.user.id);
  const { bookings: hostBookings, loading: bookingsLoading } = useHostBookings(session?.user.id);
  const [tab, setTab] = useState<TripPhase>('upcoming');
  const firstName = (profile?.full_name || session?.user.email?.split('@')[0] || 'there').split(' ')[0];
  const loading = carsLoading || bookingsLoading;

  const classified = useMemo(
    () => (hostBookings ?? []).map((b) => ({ booking: b, phase: classifyBooking(b) })),
    [hostBookings],
  );

  const totalEarnings = classified.filter((c) => c.phase === 'completed').reduce((sum, c) => sum + c.booking.totalPrice, 0);
  const thisMonthKey = new Date().toISOString().slice(0, 7);
  const thisMonthEarnings = classified
    .filter((c) => c.phase !== 'cancelled' && c.booking.startDate.slice(0, 7) === thisMonthKey)
    .reduce((sum, c) => sum + c.booking.totalPrice, 0);
  const upcomingCount = classified.filter((c) => c.phase === 'upcoming' || c.phase === 'active').length;
  const activeCarsCount = (hostCars ?? []).filter((c) => c.status === 'published').length;
  const allReviews = (hostCars ?? []).flatMap((c) => c.reviews);
  const avgRating = allReviews.length ? allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length : null;

  const series = useMemo(() => monthlySeries(hostBookings ?? []), [hostBookings]);
  const hasEarningsData = series.some((d) => d.value > 0);

  const tabBookings = classified.filter((c) => c.phase === tab).map((c) => c.booking);

  return (
    <DashboardShell variant="host" active="Overview">
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[14px] text-muted">{greeting()},</p>
            <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{firstName} 👋</h1>
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

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          {/* Earnings chart */}
          <Reveal><section className="card scroll-mt-20 p-6" id="earnings">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">Earnings</h2>
                <p className="text-[13px] text-muted">Last 6 months</p>
              </div>
            </div>
            <div className="mt-5">
              <div className="flex items-end gap-3">
                <span className="font-display text-3xl font-semibold text-ink">{eur(series.reduce((a, b) => a + b.value, 0))}</span>
              </div>
            </div>
            {loading ? (
              <div className="skeleton mt-5 h-[220px] rounded-xl" />
            ) : hasEarningsData ? (
              <div className="mt-3"><EarningsChart data={series} /></div>
            ) : (
              <div className="mt-5 flex flex-col items-center gap-2 rounded-xl border border-line py-10 text-center">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-panel text-muted"><Icon name="euro" size={20} /></span>
                <p className="font-medium text-ink">No earnings yet</p>
                <p className="max-w-xs text-[13px] text-muted">Bookings on your cars will show up here once they come in.</p>
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
                <p className="max-w-xs text-[13px] text-muted">New bookings on your cars will appear here.</p>
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
          <h2 className="mb-4 font-display text-lg font-semibold text-ink">My cars</h2>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton aspect-[16/10] rounded-2xl" />)}
            </div>
          ) : hostCars && hostCars.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {hostCars.map((c) => {
                const published = c.status === 'published';
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
                      <p className="truncate text-[14px] font-medium text-ink">{c.make} {c.model}</p>
                      <div className="mt-1 flex items-center justify-between text-[13px]">
                        <span className="inline-flex items-center gap-1 text-muted">
                          <Icon name="star" size={12} className="text-star" /> {c.reviews.length ? c.rating.toFixed(2) : 'New'}
                        </span>
                        <span className="font-medium text-ink">{eur(c.pricePerDay)}/day</span>
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
              <p className="max-w-xs text-[13.5px] text-muted">Add your first car and start earning on the days you're not driving it.</p>
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
                <p className="mt-1 flex items-center justify-center gap-1 text-[12.5px] text-muted"><Icon name="star" size={13} className="text-star" /> Average rating</p>
              </div>
              <div className="h-12 w-px bg-line" />
              <div className="text-center">
                <p className="font-display text-3xl font-semibold text-ink">{allReviews.length}</p>
                <p className="mt-1 text-[12.5px] text-muted">Total reviews</p>
              </div>
            </div>
          ) : (
            <div className="card flex flex-col items-center gap-2 py-12 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-panel text-muted"><Icon name="reviews" size={22} /></span>
              <p className="mt-1 font-medium text-ink">No reviews yet</p>
              <p className="max-w-xs text-[13.5px] text-muted">Reviews from completed trips will appear here.</p>
            </div>
          )}
        </section>
        </Reveal>

        {/* Calendar */}
        <Reveal>
        <section className="mt-8 scroll-mt-20" id="calendar">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">Calendar</h2>
            <button disabled className="btn btn-secondary btn-sm cursor-not-allowed opacity-60" title="Coming soon">
              <Icon name="calendar" size={15} /> Block dates
            </button>
          </div>
          {classified.filter((c) => c.phase === 'upcoming' || c.phase === 'active').length > 0 ? (
            <div className="card divide-y divide-line">
              {classified
                .filter((c) => c.phase === 'upcoming' || c.phase === 'active')
                .map((c) => (
                  <div key={c.booking.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium text-ink">{c.booking.car.make} {c.booking.car.model}</p>
                      <p className="text-[12.5px] text-muted">{fmtDate(c.booking.startDate)} → {fmtDate(c.booking.endDate)}</p>
                    </div>
                    <span className={`badge shrink-0 ${phaseBadge[c.phase]}`}>{phaseLabel[c.phase]}</span>
                  </div>
                ))}
            </div>
          ) : (
            <div className="card flex flex-col items-center gap-2 py-12 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-panel text-muted"><Icon name="calendar" size={22} /></span>
              <p className="mt-1 font-medium text-ink">No dates booked yet</p>
              <p className="max-w-xs text-[13.5px] text-muted">Manually blocking dates is coming soon.</p>
            </div>
          )}
        </section>
        </Reveal>
      </div>
    </DashboardShell>
  );
}
