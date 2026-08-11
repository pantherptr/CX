import { Link } from 'react-router-dom';
import { DashboardShell, StatCard } from '../components/DashboardShell';
import { Icon } from '../components/Icon';
import { CarCard } from '../components/CarCard';
import { carById } from '../data/cars';
import { hosts } from '../data/hosts';
import { customer, customerStats, trips, conversations } from '../data/content';
import { cars } from '../data/cars';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import { useApp } from '../lib/store';

export default function CustomerDashboard() {
  const { favorites } = useApp();
  const upcoming = trips.find((t) => t.status === 'upcoming');
  const upcomingCar = upcoming ? carById(upcoming.carId) : undefined;
  const past = trips.filter((t) => t.status === 'completed');
  const saved = cars.filter((c) => favorites.has(c.id)).slice(0, 4);

  return (
    <DashboardShell variant="customer" active="Overview">
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        {/* Greeting */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[14px] text-muted">Good morning,</p>
            <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{customer.name} 👋</h1>
          </div>
          <Link to="/browse" className="btn btn-primary btn-sm"><Icon name="plus" size={16} /> Book a car</Link>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon="trips" label="Upcoming trips" value={String(customerStats.upcoming)} />
          <StatCard icon="checkCircle" label="Completed trips" value={String(customerStats.completed)} />
          <StatCard icon="heart" label="Saved cars" value={String(favorites.size)} />
          <StatCard icon="wallet" label="Total spent" value={eur(customerStats.spent)} />
        </div>

        {/* Upcoming trip */}
        <div id="trips" className="scroll-mt-20" />
        {upcoming && upcomingCar && (
          <section className="mt-8">
            <h2 className="mb-4 font-display text-lg font-semibold text-ink">Your upcoming trip</h2>
            <div className="card overflow-hidden md:flex">
              <div className="relative md:w-2/5">
                <img src={unsplash(upcomingCar.images[0], 700)} alt="" className="h-52 w-full object-cover md:h-full" />
                <span className="absolute left-3 top-3 badge badge-glass"><Icon name="clock" size={12} className="text-accent" /> In 14 days</span>
              </div>
              <div className="flex flex-1 flex-col justify-between p-6">
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-display text-xl font-semibold text-ink">{upcomingCar.make} {upcomingCar.model}</h3>
                      <p className="text-[13.5px] text-muted">Booking {upcoming.reference}</p>
                    </div>
                    <span className="badge badge-accent">Confirmed</span>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {[
                      { l: 'Pick-up', v: upcoming.start, icon: 'calendar' as const },
                      { l: 'Return', v: upcoming.end, icon: 'calendar' as const },
                      { l: 'Location', v: upcoming.location, icon: 'pin' as const },
                    ].map((x) => (
                      <div key={x.l}>
                        <p className="flex items-center gap-1.5 text-[12px] text-muted"><Icon name={x.icon} size={13} /> {x.l}</p>
                        <p className="mt-0.5 text-[14px] font-medium text-ink">{x.v}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-6 flex items-center gap-3 border-t border-line pt-5">
                  <img src={hosts[upcomingCar.hostId].avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                  <div className="flex-1">
                    <p className="text-[13.5px] font-medium text-ink">{hosts[upcomingCar.hostId].name}</p>
                    <p className="text-[12.5px] text-muted">Your host</p>
                  </div>
                  <Link to="/messages" className="btn btn-secondary btn-sm"><Icon name="message" size={15} /> Message</Link>
                  <Link to={`/cars/${upcomingCar.slug}`} className="btn btn-primary btn-sm">Details</Link>
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          {/* Recent trips */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">Recent trips</h2>
              <Link to="/dashboard" className="text-[13.5px] font-medium text-muted hover:text-ink">View all</Link>
            </div>
            <div className="card divide-y divide-line">
              {past.map((t) => {
                const c = carById(t.carId)!;
                return (
                  <Link key={t.id} to={`/cars/${c.slug}`} className="flex items-center gap-4 p-4 transition-colors hover:bg-panel/40">
                    <img src={unsplash(c.images[0], 200)} alt="" className="h-14 w-20 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{c.make} {c.model}</p>
                      <p className="text-[13px] text-muted">{t.start} · {t.location}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[14px] font-medium text-ink">{eur(t.total)}</p>
                      <span className="inline-flex items-center gap-1 text-[12px] text-muted"><Icon name="check" size={12} className="text-accent" /> Completed</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Messages preview */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">Messages</h2>
              <Link to="/messages" className="text-[13.5px] font-medium text-muted hover:text-ink">Open</Link>
            </div>
            <div className="card divide-y divide-line">
              {conversations.slice(0, 4).map((c) => (
                <Link key={c.id} to="/messages" className="flex items-center gap-3 p-4 transition-colors hover:bg-panel/40">
                  <div className="relative">
                    <img src={c.avatar} alt="" className="h-11 w-11 rounded-full object-cover" />
                    {c.online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-accent ring-2 ring-surface" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="truncate text-[14px] font-medium text-ink">{c.name}</p>
                      <span className="text-[11.5px] text-faint">{c.lastTime}</span>
                    </div>
                    <p className="truncate text-[13px] text-muted">{c.messages[c.messages.length - 1].body}</p>
                  </div>
                  {c.unread > 0 && <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-[11px] font-semibold text-white">{c.unread}</span>}
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* Saved cars */}
        <section className="mt-8 scroll-mt-20" id="saved">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">Saved cars</h2>
            <Link to="/browse" className="text-[13.5px] font-medium text-muted hover:text-ink">Browse more</Link>
          </div>
          {saved.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {saved.map((c) => <CarCard key={c.id} car={c} />)}
            </div>
          ) : (
            <div className="card flex flex-col items-center gap-2 py-12 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-panel text-muted"><Icon name="heart" size={22} /></span>
              <p className="mt-1 font-medium text-ink">No saved cars yet</p>
              <p className="max-w-xs text-[13.5px] text-muted">Tap the heart on any car to save it here for later.</p>
              <Link to="/browse" className="btn btn-primary btn-sm mt-2">Browse cars</Link>
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
