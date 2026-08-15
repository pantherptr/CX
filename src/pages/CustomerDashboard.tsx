import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DashboardShell, StatCard, StatCardSkeleton, greeting } from '../components/DashboardShell';
import { Icon } from '../components/Icon';
import { CarCard } from '../components/CarCard';
import { CarLoader } from '../components/CarLoader';
import { Reveal } from '../components/motion';
import { useCars } from '../lib/data/cars';
import { useMyBookings, classifyBooking, renterTier, type Booking, type TripPhase } from '../lib/data/bookings';
import { useConversations, findOrCreateConversation } from '../lib/data/messages';
import { eur } from '../lib/format';
import { useApp } from '../lib/store';
import { useAuth } from '../lib/auth';

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

function TripRow({ booking }: { booking: Booking }) {
  const phase = classifyBooking(booking);
  return (
    <Link to={`/trips/${booking.id}`} className="group flex items-center gap-4 p-4 transition-colors hover:bg-panel/40">
      <img src={booking.car.image} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover transition-transform duration-500 group-hover:scale-105" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{booking.car.make} {booking.car.model}</p>
        <p className="text-[13px] text-muted">
          {fmtDate(booking.startDate)} → {fmtDate(booking.endDate)} · {booking.pickupLocation || booking.car.location}
        </p>
        <p className="mt-0.5 text-[12px] text-faint">Booking {booking.reference}</p>
      </div>
      <div className="text-right">
        <p className="text-[14px] font-medium text-ink">{eur(booking.totalPrice)}</p>
        <span className={`badge mt-1 ${phaseBadge[phase]}`}>{phaseLabel[phase]}</span>
      </div>
      <Icon name="chevronRight" size={16} className="shrink-0 text-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-muted" />
    </Link>
  );
}

export default function CustomerDashboard() {
  const navigate = useNavigate();
  const { favorites, toast } = useApp();
  const { profile, session } = useAuth();
  const { cars } = useCars();
  const { bookings, loading: bookingsLoading } = useMyBookings(session?.user.id);
  const { conversations, loading: conversationsLoading } = useConversations(session?.user.id);
  const [tab, setTab] = useState<TripPhase>('upcoming');
  const [messaging, setMessaging] = useState(false);

  const saved = (cars ?? []).filter((c) => favorites.has(c.id)).slice(0, 4);
  const firstName = (profile?.full_name || session?.user.email?.split('@')[0] || 'there').split(' ')[0];

  const classified = useMemo(
    () => (bookings ?? []).map((b) => ({ booking: b, phase: classifyBooking(b) })),
    [bookings],
  );

  const upcomingCount = classified.filter((c) => c.phase === 'upcoming' || c.phase === 'active').length;
  const completedCount = classified.filter((c) => c.phase === 'completed').length;
  const tier = renterTier(completedCount);
  const totalSpent = classified
    .filter((c) => c.phase !== 'cancelled')
    .reduce((sum, c) => sum + c.booking.totalPrice, 0);

  // The one trip worth surfacing above the fold: an active trip beats a
  // future one, and among future ones the soonest wins.
  const nextTrip = useMemo(() => {
    const relevant = classified.filter((c) => c.phase === 'upcoming' || c.phase === 'active');
    const active = relevant.find((c) => c.phase === 'active');
    if (active) return active.booking;
    return relevant.sort((a, b) => a.booking.startDate.localeCompare(b.booking.startDate))[0]?.booking;
  }, [classified]);

  const tabBookings = classified.filter((c) => c.phase === tab).map((c) => c.booking);

  const handleMessageHost = async () => {
    if (!session || !nextTrip) return;
    setMessaging(true);
    try {
      const conversationId = await findOrCreateConversation(nextTrip.car.id, session.user.id, nextTrip.host.id);
      navigate(`/messages?c=${conversationId}`);
    } catch (err) {
      toast({ title: 'Could not open conversation', desc: err instanceof Error ? err.message : undefined, icon: 'info' });
      setMessaging(false);
    }
  };

  return (
    <DashboardShell variant="customer" active="Overview">
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        {/* Greeting */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[14px] text-muted">{greeting()},</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{firstName} 👋</h1>
              {tier && <span className="badge badge-accent">{tier}</span>}
            </div>
          </div>
          <Link to="/browse" className="btn btn-primary btn-sm"><Icon name="plus" size={16} /> Book a car</Link>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {bookingsLoading ? (
            <>
              <StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton />
            </>
          ) : (
            <>
              <Reveal delay={0}><StatCard icon="trips" label="Upcoming trips" value={String(upcomingCount)} countTo={upcomingCount} /></Reveal>
              <Reveal delay={60}><StatCard icon="checkCircle" label="Completed trips" value={String(completedCount)} countTo={completedCount} /></Reveal>
              <Reveal delay={120}><StatCard icon="heart" label="Saved cars" value={String(favorites.size)} countTo={favorites.size} /></Reveal>
              <Reveal delay={180}><StatCard icon="wallet" label="Total spent" value={eur(totalSpent)} countTo={totalSpent} format={eur} /></Reveal>
            </>
          )}
        </div>

        {/* Next trip highlight */}
        {bookingsLoading ? (
          <section className="mt-8">
            <div className="skeleton mb-4 h-6 w-36 rounded-lg" />
            <div className="skeleton card h-52 md:h-64" />
          </section>
        ) : nextTrip && (
          <Reveal>
          <section className="mt-8">
            <h2 className="mb-4 font-display text-lg font-semibold text-ink">Your next trip</h2>
            <div className="card overflow-hidden md:flex">
              <div className="relative md:w-2/5">
                <img src={nextTrip.car.image} alt="" className="h-52 w-full object-cover md:h-full" />
                <span className="absolute left-3 top-3 badge badge-glass">
                  <Icon name="clock" size={12} className="text-accent" />
                  {classifyBooking(nextTrip) === 'active' ? 'In progress' : `From ${fmtDate(nextTrip.startDate)}`}
                </span>
              </div>
              <div className="flex flex-1 flex-col justify-between p-6">
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-display text-xl font-semibold text-ink">{nextTrip.car.make} {nextTrip.car.model}</h3>
                      <p className="text-[13.5px] text-muted">Booking {nextTrip.reference}</p>
                    </div>
                    <span className={`badge ${phaseBadge[classifyBooking(nextTrip)]}`}>{phaseLabel[classifyBooking(nextTrip)]}</span>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {[
                      { l: 'Pick-up', v: fmtDate(nextTrip.startDate), icon: 'calendar' as const },
                      { l: 'Return', v: fmtDate(nextTrip.endDate), icon: 'calendar' as const },
                      { l: 'Location', v: nextTrip.pickupLocation || nextTrip.car.location, icon: 'pin' as const },
                    ].map((x) => (
                      <div key={x.l}>
                        <p className="flex items-center gap-1.5 text-[12px] text-muted"><Icon name={x.icon} size={13} /> {x.l}</p>
                        <p className="mt-0.5 text-[14px] font-medium text-ink">{x.v}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-6 flex items-center gap-3 border-t border-line pt-5">
                  {nextTrip.host.avatar ? (
                    <img src={nextTrip.host.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-accent-050 text-accent">
                      <Icon name="user" size={16} />
                    </span>
                  )}
                  <div className="flex-1">
                    <p className="text-[13.5px] font-medium text-ink">{nextTrip.host.name}</p>
                    <p className="text-[12.5px] text-muted">Your host</p>
                  </div>
                  <button onClick={handleMessageHost} disabled={messaging} className="btn btn-secondary btn-sm disabled:opacity-60">
                    <Icon name="message" size={15} /> {messaging ? 'Opening…' : 'Message'}
                  </button>
                  <Link to={`/trips/${nextTrip.id}`} className="btn btn-primary btn-sm">Details</Link>
                </div>
              </div>
            </div>
          </section>
          </Reveal>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          {/* My Trips */}
          <section id="trips" className="scroll-mt-20">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">My Trips</h2>
            </div>
            <div className="mb-3 flex gap-1.5 overflow-x-auto no-scrollbar">
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

            <div key={tab} className="card min-h-[120px] divide-y divide-line animate-fade-in">
              {bookingsLoading ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <CarLoader size={70} />
                </div>
              ) : tabBookings.length > 0 ? (
                tabBookings.map((b) => <TripRow key={b.id} booking={b} />)
              ) : (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-panel text-muted">
                    <Icon name="trips" size={20} />
                  </span>
                  <p className="mt-1 font-medium text-ink">
                    {tab === 'upcoming' && 'No upcoming trips'}
                    {tab === 'active' && 'No trips in progress'}
                    {tab === 'completed' && 'No completed trips yet'}
                    {tab === 'cancelled' && 'No cancelled trips'}
                  </p>
                  <p className="max-w-xs text-[13px] text-muted">
                    {tab === 'upcoming' ? 'Your next journey starts here.' : 'Nothing to show in this tab yet.'}
                  </p>
                  {tab === 'upcoming' && (
                    <Link to="/browse" className="btn btn-primary btn-sm mt-1">Browse cars</Link>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Messages preview */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">Messages</h2>
              <Link to="/messages" className="text-[13.5px] font-medium text-muted hover:text-ink">Open</Link>
            </div>
            <div className="card min-h-[120px] divide-y divide-line">
              {conversationsLoading ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <CarLoader size={60} />
                </div>
              ) : conversations && conversations.length > 0 ? (
                conversations.slice(0, 4).map((c) => (
                  <Link key={c.id} to={`/messages?c=${c.id}`} className="flex items-center gap-3 p-4 transition-colors hover:bg-panel/40">
                    {c.other.avatar ? (
                      <img src={c.other.avatar} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-050 text-accent">
                        <Icon name="user" size={16} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-[14px] font-medium text-ink">{c.other.name}</p>
                      </div>
                      <p className="truncate text-[13px] text-muted">{c.lastMessage ? c.lastMessage.body : 'No messages yet'}</p>
                    </div>
                    {c.unreadCount > 0 && <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-white">{c.unreadCount}</span>}
                  </Link>
                ))
              ) : (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-panel text-muted"><Icon name="message" size={20} /></span>
                  <p className="mt-1 font-medium text-ink">No conversations yet</p>
                </div>
              )}
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
