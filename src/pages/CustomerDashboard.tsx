import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DashboardShell, StatCard, StatCardSkeleton, greeting } from '../components/DashboardShell';
import { Icon, type IconName } from '../components/Icon';
import { CarCard } from '../components/CarCard';
import { CarLoader } from '../components/CarLoader';
import { SearchBar } from '../components/SearchBar';
import { EmptyState } from '../components/primitives';
import { ConciergeLauncher } from '../components/Concierge';
import { Reveal } from '../components/motion';
import { useCars } from '../lib/data/cars';
import { useMyBookings, classifyBooking, renterTier, type Booking, type TripPhase } from '../lib/data/bookings';
import { useConversations, findOrCreateConversation } from '../lib/data/messages';
import { useMyRewards, rewardStatus, claimGameReward, takePendingClaim, type Reward, type RewardStatus } from '../lib/data/rewards';
import { DriveChallengeLauncher } from '../components/game/DriveChallengeLauncher';
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

const REWARD_TABS: { id: RewardStatus; label: string }[] = [
  { id: 'available', label: 'Available' },
  { id: 'used', label: 'Used' },
  { id: 'expired', label: 'Expired' },
];

const rewardBadge: Record<RewardStatus, string> = {
  available: 'badge-accent',
  used: 'bg-panel-2 text-ink-soft',
  expired: 'bg-danger/10 text-danger',
};

function RewardRow({ reward }: { reward: Reward }) {
  const status = rewardStatus(reward);
  return (
    <div className="flex items-center gap-4 p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-050 text-accent">
        <Icon name="gift" size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{reward.discountPercentage}% OFF your next booking</p>
        <p className="font-mono text-detail text-muted">{reward.couponCode}</p>
      </div>
      <div className="text-right">
        <p className="text-caption text-muted">
          {status === 'used' && reward.usedAt
            ? `Used ${fmtDate(reward.usedAt)}`
            : `Expires ${fmtDate(reward.expiresAt)}`}
        </p>
        <span className={`badge mt-1 ${rewardBadge[status]}`}>{status[0].toUpperCase() + status.slice(1)}</span>
      </div>
    </div>
  );
}

function QuickAction({ icon, label, to, onClick }: { icon: IconName; label: string; to?: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-panel text-ink-soft transition-colors group-hover:bg-ink group-hover:text-white">
        <Icon name={icon} size={19} />
      </span>
      <span className="text-detail font-medium text-ink-soft transition-colors group-hover:text-ink">{label}</span>
    </>
  );
  const cls = 'card group flex flex-col items-center justify-center gap-2.5 py-5 text-center transition-transform hover:-translate-y-0.5';
  return to ? (
    <Link to={to} className={cls}>{inner}</Link>
  ) : (
    <button onClick={onClick} className={cls}>{inner}</button>
  );
}

interface ActivityItem {
  id: string;
  icon: IconName;
  label: string;
  sub: string;
  at: string;
}

/** Recent Activity, built entirely from data the dashboard already
 *  fetched — no separate activity/event-log table exists in the backend,
 *  so this is derived rather than read from one. Two event types the
 *  original brief asked for are deliberately absent: "Payment completed"
 *  (bookings don't record a payment moment distinct from creation — it
 *  would just duplicate "Booking confirmed" at the same instant) and
 *  "Concierge request" (the Concierge is a stateless matching flow with
 *  no persisted request record). Showing either would be inventing an
 *  event that never truthfully happened. */
function buildActivity(bookings: Booking[], rewards: Reward[]): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const b of bookings) {
    const phase = classifyBooking(b);
    if (phase === 'cancelled') {
      items.push({ id: `${b.id}-cancelled`, icon: 'info', label: 'Booking cancelled', sub: `${b.car.make} ${b.car.model} · ${b.reference}`, at: b.createdAt });
    } else {
      items.push({ id: `${b.id}-confirmed`, icon: 'checkCircle', label: 'Booking confirmed', sub: `${b.car.make} ${b.car.model} · ${b.reference}`, at: b.createdAt });
      if (phase === 'completed') {
        items.push({ id: `${b.id}-completed`, icon: 'trips', label: 'Rental completed', sub: `${b.car.make} ${b.car.model} · ${b.reference}`, at: `${b.endDate}T00:00:00` });
      }
    }
  }

  for (const r of rewards) {
    items.push({ id: `${r.id}-earned`, icon: 'gift', label: 'Reward earned', sub: `${r.discountPercentage}% off · ${r.couponCode}`, at: r.createdAt });
    if (r.usedAt) {
      items.push({ id: `${r.id}-used`, icon: 'gift', label: 'Reward used', sub: `${r.discountPercentage}% off · ${r.couponCode}`, at: r.usedAt });
    }
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
}

const relativeTime = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''} ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

function TripRow({ booking }: { booking: Booking }) {
  const phase = classifyBooking(booking);
  return (
    <Link to={`/trips/${booking.id}`} className="group flex items-center gap-4 p-4 transition-colors hover:bg-panel/40">
      <img src={booking.car.image} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover transition-transform duration-500 group-hover:scale-105" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{booking.car.make} {booking.car.model}</p>
        <p className="text-detail text-muted">
          {fmtDate(booking.startDate)} → {fmtDate(booking.endDate)} · {booking.pickupLocation || booking.car.location}
        </p>
        <p className="mt-0.5 text-caption text-faint">Booking {booking.reference}</p>
      </div>
      <div className="text-right">
        <p className="text-body font-medium text-ink">{eur(booking.totalPrice)}</p>
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
  const { rewards, loading: rewardsLoading } = useMyRewards(session?.user.id);
  const [tab, setTab] = useState<TripPhase>('upcoming');
  const [rewardTab, setRewardTab] = useState<RewardStatus>('available');
  const [messaging, setMessaging] = useState(false);

  // A CX Drive Challenge run played while signed out stays claimable —
  // DriveChallengeLauncher stashes its session id before sending the
  // player to /signup (see stashPendingClaim in lib/data/rewards.ts).
  // This is where it actually gets redeemed, since a fresh sign-up
  // always lands on the dashboard.
  useEffect(() => {
    if (!session) return;
    const pending = takePendingClaim();
    if (!pending) return;
    claimGameReward(pending).then(({ reward, error }) => {
      if (reward) {
        toast({ title: 'Reward added to your account', desc: `${reward.discountPercentage}% OFF — ${reward.couponCode}`, icon: 'gift' });
      } else if (error) {
        toast({ title: "Couldn't claim your Drive Challenge reward", desc: error, icon: 'info' });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

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

  const activity = useMemo(() => buildActivity(bookings ?? [], rewards ?? []), [bookings, rewards]);

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
            <p className="text-body text-muted">{greeting()},</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{firstName}</h1>
              {tier && <span className="badge badge-accent">{tier}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/garage" className="btn btn-secondary btn-sm"><Icon name="key" size={16} /> CX Garage</Link>
            <Link to="/browse" className="btn btn-primary btn-sm"><Icon name="plus" size={16} /> Book a car</Link>
          </div>
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

        {/* Quick actions */}
        <Reveal delay={220}>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <QuickAction icon="search" label="Find a Car" to="/browse" />
            <QuickAction icon="trips" label="My Bookings" to="/dashboard#trips" />
            <QuickAction icon="heart" label="Favorites" to="/dashboard#saved" />
            <ConciergeLauncher className="card group flex flex-col items-center justify-center gap-2.5 py-5 text-center transition-transform hover:-translate-y-0.5">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-panel text-ink-soft transition-colors group-hover:bg-ink group-hover:text-white">
                <Icon name="sparkles" size={19} />
              </span>
              <span className="text-detail font-medium text-ink-soft transition-colors group-hover:text-ink">Concierge</span>
            </ConciergeLauncher>
          </div>
        </Reveal>

        {/* Search from dashboard */}
        <Reveal delay={260}>
          <section className="mt-6">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Find another car</h2>
            <SearchBar variant="compact" />
          </section>
        </Reveal>

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
                      <p className="text-detail text-muted">Booking {nextTrip.reference}</p>
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
                        <p className="flex items-center gap-1.5 text-caption text-muted"><Icon name={x.icon} size={13} /> {x.l}</p>
                        <p className="mt-0.5 text-body font-medium text-ink">{x.v}</p>
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
                    <p className="text-detail font-medium text-ink">{nextTrip.host.name}</p>
                    <p className="text-caption text-muted">Your host</p>
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
                <EmptyState
                  size="sm"
                  icon="trips"
                  className="px-4 py-10"
                  title={
                    tab === 'upcoming'
                      ? 'No upcoming trips'
                      : tab === 'active'
                        ? 'No trips in progress'
                        : tab === 'completed'
                          ? 'No completed trips yet'
                          : 'No cancelled trips'
                  }
                  description={tab === 'upcoming' ? 'Your next journey starts here.' : 'Nothing to show in this tab yet.'}
                  action={tab === 'upcoming' ? <Link to="/browse" className="btn btn-primary btn-sm">Browse cars</Link> : undefined}
                />
              )}
            </div>
          </section>

          {/* Messages preview */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">Messages</h2>
              <Link to="/messages" className="text-detail font-medium text-muted hover:text-ink">Open</Link>
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
                        <p className="truncate text-body font-medium text-ink">{c.other.name}</p>
                      </div>
                      <p className="truncate text-detail text-muted">{c.lastMessage ? c.lastMessage.body : 'No messages yet'}</p>
                    </div>
                    {c.unreadCount > 0 && <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-label font-semibold text-white">{c.unreadCount}</span>}
                  </Link>
                ))
              ) : (
                <EmptyState size="sm" icon="message" title="No conversations yet" className="px-4 py-10" />
              )}
            </div>
          </section>
        </div>

        {/* Saved cars */}
        <section className="mt-8 scroll-mt-20" id="saved">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">Saved cars</h2>
            <Link to="/browse" className="text-detail font-medium text-muted hover:text-ink">Browse more</Link>
          </div>
          {saved.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {saved.map((c) => <CarCard key={c.id} car={c} />)}
            </div>
          ) : (
            <div className="card">
              <EmptyState
                size="md"
                icon="heart"
                title="No saved cars yet"
                description="Tap the heart on any car to save it here for later."
                action={<Link to="/browse" className="btn btn-primary btn-sm">Browse cars</Link>}
                className="py-12"
              />
            </div>
          )}
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.3fr]">
          {/* Concierge */}
          <section className="relative overflow-hidden rounded-2xl bg-noir p-6">
            <div
              className="pointer-events-none absolute inset-0 opacity-70"
              style={{ background: 'radial-gradient(55% 55% at 85% 10%, rgba(0,212,71,0.16), transparent 62%)' }}
            />
            <div className="relative">
              <p className="inline-flex items-center gap-1.5 text-label font-semibold uppercase tracking-[0.16em] text-accent-bright">
                <Icon name="sparkles" size={14} /> CX Concierge
              </p>
              <h2 className="mt-2 font-display text-xl font-semibold text-white">Need something specific?</h2>
              <p className="mt-2 text-detail leading-relaxed text-white/60">
                Tell us how you want to drive — city, road trip, business, performance — and we'll match you to the
                right car from the fleet in under a minute.
              </p>
              <ConciergeLauncher className="btn btn-accent-bright btn-sm mt-5">
                Ask the Concierge <Icon name="arrowRight" size={15} />
              </ConciergeLauncher>
            </div>
          </section>

          {/* Recent activity */}
          <section>
            <h2 className="mb-4 font-display text-lg font-semibold text-ink">Recent Activity</h2>
            <div className="card min-h-[120px] divide-y divide-line">
              {bookingsLoading || rewardsLoading ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <CarLoader size={60} />
                </div>
              ) : activity.length > 0 ? (
                activity.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-050 text-accent">
                      <Icon name={item.icon} size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-detail font-medium text-ink">{item.label}</p>
                      <p className="truncate text-caption text-muted">{item.sub}</p>
                    </div>
                    <span className="shrink-0 text-caption text-faint">{relativeTime(item.at)}</span>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-panel text-muted"><Icon name="clock" size={20} /></span>
                  <p className="mt-1 font-medium text-ink">Nothing yet</p>
                  <p className="max-w-xs text-detail text-muted">Your bookings and rewards will show up here as they happen.</p>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Rewards */}
        <section className="mt-8 scroll-mt-20" id="rewards">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">Rewards</h2>
            <DriveChallengeLauncher className="btn btn-secondary btn-sm self-start">
              <img
                src="/cx-drive-challenge-icon.png"
                alt=""
                className="h-4 w-4 rounded object-cover"
                style={{ objectPosition: '50% 10%' }}
              />
              Play the Challenge
            </DriveChallengeLauncher>
          </div>
          <div className="mb-3 flex gap-1.5 overflow-x-auto no-scrollbar">
            {REWARD_TABS.map((t) => {
              const count = (rewards ?? []).filter((r) => rewardStatus(r) === t.id).length;
              return (
                <button
                  key={t.id}
                  onClick={() => setRewardTab(t.id)}
                  className={`chip shrink-0 ${rewardTab === t.id ? '!bg-ink !text-white !border-ink' : ''}`}
                >
                  {t.label}
                  {count > 0 && <span className="text-faint">· {count}</span>}
                </button>
              );
            })}
          </div>
          <div key={rewardTab} className="card min-h-[120px] divide-y divide-line animate-fade-in">
            {rewardsLoading ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <CarLoader size={70} />
              </div>
            ) : (rewards ?? []).filter((r) => rewardStatus(r) === rewardTab).length > 0 ? (
              (rewards ?? [])
                .filter((r) => rewardStatus(r) === rewardTab)
                .map((r) => <RewardRow key={r.id} reward={r} />)
            ) : (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-panel text-muted">
                  <Icon name="gift" size={20} />
                </span>
                <p className="mt-1 font-medium text-ink">
                  {rewardTab === 'available' && 'No rewards yet'}
                  {rewardTab === 'used' && 'No used rewards'}
                  {rewardTab === 'expired' && 'No expired rewards'}
                </p>
                <p className="max-w-xs text-detail text-muted">
                  {rewardTab === 'available'
                    ? 'Play the CX Drive Challenge above to earn a real discount.'
                    : 'Nothing to show in this tab yet.'}
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
