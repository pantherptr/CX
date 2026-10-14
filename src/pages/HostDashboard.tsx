import { MonthColumns, StripedBars, InsightCard } from '../components/ui/dash-widgets';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DashboardShell, StatCard, StatCardSkeleton, greeting } from '../components/DashboardShell';
import { Icon, type IconName } from '../components/Icon';
import { Img } from '../components/motion';
import { PremiumPageLoader } from '../components/PremiumLoader';
import { useHostCars } from '../lib/data/cars';
import { useHostBookings, useBookedRanges, rangesOverlap, classifyBooking, type Booking, type TripPhase } from '../lib/data/bookings';
import { useCarBlackoutDates, createCarBlackoutDate, deleteCarBlackoutDate } from '../lib/data/blackoutDates';
import { useConnectStatus, fetchConnectOnboardingLink, refreshConnectStatus, useHostPayouts, type ConnectStatus, type HostPayout } from '../lib/data/payouts';
import { useUnreadMessageCount } from '../lib/data/messages';
import { useVerification } from '../lib/data/verification';
import { WEEKDAYS, MONTH_NAMES, toISO, startOfMonth, addMonths, buildMonthGrid } from '../lib/calendarGrid';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import { useAuth } from '../lib/auth';
import { TripMap } from '../components/TripMap';
import { TripJourney } from '../components/TripJourney';
import { InspectionCard } from '../components/InspectionGrid';
import { useInspectionPhotos } from '../lib/data/inspections';
import { useApp } from '../lib/store';
import { Reveal } from '../components/motion';
import { HostCarsNow, type HostCarNow, type HostTripNow } from '../components/HostCarsNow';
import { ActivePill } from '../components/motionKit';
import { uiLocale } from '../lib/i18n/uiLocale';

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

const fmtDate = (s: string) => new Date(s).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' });

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
  payoutsMissing,
}: {
  draftCars: { id: string; make: string; model: string }[];
  soonPickups: Booking[];
  unreadCount: number;
  verificationMissing: boolean;
  payoutsMissing: boolean;
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
      sub: `${b.renter.name} · ${new Date(b.startDate).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' })}`,
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
      to: '/settings#verification',
    });
  }

  if (payoutsMissing) {
    items.push({
      id: 'payouts',
      icon: 'card',
      label: 'Set up payouts',
      sub: 'Connect a payout account so you get paid when a trip ends.',
      to: '/host#payouts',
    });
  }

  return items;
}

/** Read-only booked/available month grid for one vehicle — the host
 *  equivalent of `AvailabilityCalendar`, backed by the same real
 *  `useBookedRanges` data, but without the renter-facing click-to-select
 *  range interaction (a host is reviewing availability, not booking). */
function HostFleetCalendar({
  cars,
  carId,
  onCarIdChange,
}: {
  cars: { id: string; make: string; model: string }[];
  carId: string | null;
  onCarIdChange: (id: string) => void;
}) {
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
              onClick={() => onCarIdChange(c.id)}
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
        {loading && <div className="absolute inset-0 z-10 grid place-items-center bg-surface/60"><PremiumPageLoader size={64} /></div>}
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

/** A host can take their own car off the market — maintenance, personal
 *  use, an off-platform booking — without a fake reservation to hold the
 *  dates. Writes go through `create_car_blackout_date`/`delete_car_blackout_date`
 *  (migration 0067), which validate against existing bookings server-side;
 *  once blocked, the same dates fall out of `car_booked_ranges` and show
 *  as booked on the calendar to the left with zero extra wiring. */
function HostBlackoutManager({ carId }: { carId: string | null }) {
  const { dates, error: loadError, refresh } = useCarBlackoutDates(carId);
  const { toast } = useApp();
  const [adding, setAdding] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const todayISO = toISO(new Date());

  const resetForm = () => {
    setAdding(false);
    setStart('');
    setEnd('');
    setReason('');
  };

  const handleAdd = async () => {
    if (!carId || !start || !end) return;
    setSaving(true);
    const { error } = await createCarBlackoutDate(carId, start, end, reason.trim() || undefined);
    setSaving(false);
    if (error) {
      toast({ title: 'Could not block these dates', desc: error, icon: 'info' });
      return;
    }
    toast({ title: 'Dates blocked', icon: 'checkCircle' });
    resetForm();
    refresh();
  };

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    const { error } = await deleteCarBlackoutDate(id);
    setRemovingId(null);
    if (error) {
      toast({ title: 'Could not remove block', desc: error, icon: 'info' });
      return;
    }
    refresh();
  };

  if (!carId) return null;

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-detail font-medium text-ink-soft">Blocked dates</p>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-detail font-medium text-accent-700 transition-colors hover:text-accent-800"
          >
            <Icon name="plus" size={15} /> Block dates
          </button>
        )}
      </div>

      {adding && (
        <div className="card mb-3 space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="field-label">From</span>
              <input type="date" min={todayISO} value={start} onChange={(e) => setStart(e.target.value)} className="input" />
            </label>
            <label>
              <span className="field-label">To</span>
              <input type="date" min={start || todayISO} value={end} onChange={(e) => setEnd(e.target.value)} className="input" />
            </label>
          </div>
          <label>
            <span className="field-label">Reason (optional)</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Maintenance, personal use"
              maxLength={140}
              className="input"
            />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={handleAdd} disabled={!start || !end || saving} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? 'Blocking…' : 'Block dates'}
            </button>
            <button type="button" onClick={resetForm} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loadError ? (
        <p className="text-caption text-danger">{loadError}</p>
      ) : dates === null ? (
        <div className="skeleton h-16 rounded-2xl" />
      ) : dates.length > 0 ? (
        <div className="card divide-y divide-line">
          {dates.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-detail font-medium text-ink">
                  {fmtDate(b.startDate)} → {fmtDate(b.endDate)}
                </p>
                {b.reason && <p className="truncate text-caption text-muted">{b.reason}</p>}
              </div>
              <button
                type="button"
                onClick={() => handleRemove(b.id)}
                disabled={removingId === b.id}
                aria-label="Remove block"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-panel hover:text-danger disabled:opacity-50"
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : !adding ? (
        <p className="text-caption text-faint">No dates blocked for this car.</p>
      ) : null}
    </div>
  );
}

/** Stripe Express onboarding status + entry point — see
 *  supabase/migrations/0068_stripe_connect_payouts.sql. `status === null`
 *  is the loading state; `accountId` set but `payoutsEnabled` false means
 *  onboarding was started but Stripe hasn't finished verifying it yet. */
function HostPayoutsCard({
  status,
  error,
  onSetup,
}: {
  status: ConnectStatus | null;
  error: string | null;
  onSetup: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    await onSetup();
    setLoading(false);
  };

  return (
    <section className="mt-8 scroll-mt-20" id="payouts">
      <h2 className="mb-4 font-display text-lg font-semibold text-ink">Payouts</h2>
      {error ? (
        <p className="text-caption text-danger">{error}</p>
      ) : status === null ? (
        <div className="skeleton h-24 rounded-2xl" />
      ) : (
        <div className="card p-5 sm:p-6">
          {status.payoutsEnabled ? (
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-050 text-accent-700">
                <Icon name="checkCircle" size={20} />
              </span>
              <div>
                <p className="font-medium text-ink">Payouts are set up</p>
                <p className="text-detail text-muted">You'll be paid automatically, to your bank account, the day after each trip ends.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-panel text-muted">
                  <Icon name="card" size={20} />
                </span>
                <div>
                  <p className="font-medium text-ink">{status.accountId ? 'Finish setting up payouts' : 'Set up payouts to get paid'}</p>
                  <p className="text-detail text-muted">Add your bank account (IBAN) and ID with Stripe, once. Then you're paid automatically the day after each trip ends.</p>
                </div>
              </div>
              <button onClick={handleClick} disabled={loading} className="btn btn-primary btn-sm shrink-0 disabled:opacity-60">
                {loading ? 'Opening…' : status.accountId ? 'Finish setup' : 'Set up payouts'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** The host's pay: how it works (what CX keeps), and what each finished trip paid out. */
function HostEarningsCard({ payouts, commissionPct, payoutsEnabled }: { payouts: HostPayout[] | null; commissionPct: number | null; payoutsEnabled: boolean }) {
  const total = (payouts ?? []).reduce((n, p) => n + p.net, 0);
  return (
    <section className="mt-4">
      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium text-ink">Your payouts</p>
            <p className="mt-0.5 max-w-xl text-detail text-muted">
              The day after each trip ends you receive the rental price{commissionPct != null && commissionPct > 0 ? `, minus CX's ${commissionPct}% commission` : ''}, straight to the bank account you connected. Stripe usually shows it in your bank within 2–3 working days.
            </p>
          </div>
          {payouts && payouts.length > 0 && (
            <div className="text-right">
              <p className="text-caption text-muted">Paid out so far</p>
              <p className="font-display text-lead font-semibold text-ink">{eur(total)}</p>
            </div>
          )}
        </div>

        {payouts === null ? (
          <div className="skeleton mt-4 h-16 rounded-xl" />
        ) : payouts.length === 0 ? (
          <p className="mt-4 rounded-xl bg-panel/60 px-4 py-3 text-detail text-muted">
            {payoutsEnabled ? 'Nothing paid out yet — your first payout arrives the day after a trip ends.' : 'Set up payouts above, then your earnings appear here.'}
          </p>
        ) : (
          <div className="mt-4 divide-y divide-line rounded-xl border border-line">
            {payouts.map((p) => (
              <div key={p.bookingId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-detail font-medium text-ink">{p.reference ?? 'Trip'}{p.startDate && p.endDate ? ` · ${fmtDate(p.startDate)}–${fmtDate(p.endDate)}` : ''}</p>
                  <p className="text-caption text-muted">
                    {eur(p.gross)} − {eur(p.commission)} CX commission{p.commissionPct ? ` (${p.commissionPct}%)` : ''} · paid {fmtDate(p.paidAt)}
                  </p>
                </div>
                <p className="shrink-0 font-display text-body font-semibold text-ink">{eur(p.net)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** The host's side of the photo record: the same four photos, shared with the renter. */
function HostInspection({ bookingId, afterLocked }: { bookingId: string; afterLocked: boolean }) {
  const { session } = useAuth();
  const { photos, refresh } = useInspectionPhotos(bookingId);
  if (!session) return null;
  return (
    <InspectionCard
      bookingId={bookingId}
      uploaderId={session.user.id}
      photos={photos ?? []}
      onUploaded={refresh}
      afterLocked={afterLocked}
      startOnReturn={false}
    />
  );
}

function HostBookingRow({ booking }: { booking: Booking }) {
  const phase = classifyBooking(booking);
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl transition-colors hover:bg-panel/50">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-2 py-2.5 text-left">
        {booking.renter.avatar ? (
          <Img
            src={booking.renter.avatar}
            alt=""
            className="h-10 w-10 shrink-0 rounded-full object-cover"
            fallback={
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-050 text-accent">
                <Icon name="user" size={16} />
              </span>
            }
          />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-050 text-accent">
            <Icon name="user" size={16} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-detail font-medium text-ink">{booking.renter.name}</p>
          <p className="truncate text-caption text-muted">{booking.car.make} {booking.car.model} · {fmtDate(booking.startDate)}–{fmtDate(booking.endDate)}</p>
          {booking.fulfillmentType === 'delivery' && (
            <p className="truncate text-caption text-muted"><Icon name="car" size={11} className="mr-1 inline" />Deliver to {booking.deliveryAddress}</p>
          )}
        </div>
        <p className="shrink-0 text-detail font-medium text-ink">{eur(booking.totalPrice)}</p>
        <span className={`badge shrink-0 ${phaseBadge[phase]}`}>{phaseLabel[phase]}</span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={15} className="shrink-0 text-faint" />
      </button>
      {open && (
        <div className="px-2 pb-3">
          {phase !== 'cancelled' && phase !== 'refunded' && <TripJourney booking={booking} role="host" inspectionHref={`#inspection-${booking.id}`} />}
          {phase !== 'cancelled' && phase !== 'refunded' && phase !== 'pending' && phase !== 'payment_processing' && (
            <div id={`inspection-${booking.id}`} className="mt-5 scroll-mt-24">
              <p className="mb-2 font-display text-lead font-semibold text-ink">Vehicle inspection</p>
              <HostInspection bookingId={booking.id} afterLocked={phase === 'upcoming'} />
            </div>
          )}
          <div className="mt-4" />
          <TripMap
            carId={booking.car.id}
            city={booking.car.city}
            carLabel={`${booking.car.year} ${booking.car.make} ${booking.car.model}`}
            startDate={booking.startDate}
            endDate={booking.endDate}
            fulfillmentType={booking.fulfillmentType}
            deliveryAddress={booking.deliveryAddress}
            pickupLabel={booking.pickupLocation || booking.car.location}
            phase={phase}
            role="host"
            otherName={booking.renter.name}
            chatHref="/messages"
          />
        </div>
      )}
    </div>
  );
}

export default function HostDashboard() {
  const { profile, session } = useAuth();
  const { cars: hostCars, loading: carsLoading } = useHostCars(session?.user.id);
  const { bookings: hostBookings, loading: bookingsLoading } = useHostBookings(session?.user.id);
  const unreadCount = useUnreadMessageCount(session?.user.id);
  const { verification, loading: verificationLoading } = useVerification(session?.user.id);
  const { status: connectStatus, error: connectError, refresh: refreshConnect } = useConnectStatus(session?.user.id);
  const { payouts: hostPayouts, commissionPct } = useHostPayouts(session?.user.id);
  const { toast } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  // Landed back from Stripe's hosted onboarding (see
  // api/connect-onboarding-link.ts's return_url) — check the real status
  // immediately rather than waiting on the Connect webhook, which can lag
  // a few seconds behind the redirect.
  useEffect(() => {
    if (searchParams.get('onboarded') !== '1' || !session) return;
    refreshConnectStatus(session.access_token).then((result) => {
      if ('error' in result) {
        toast({ title: 'Could not confirm payout status', desc: result.error, icon: 'info' });
      } else {
        toast({
          title: result.payoutsEnabled ? 'Payouts are set up' : 'Payout setup in progress',
          desc: result.payoutsEnabled ? "You'll be paid automatically once each trip ends." : "We'll let you know once Stripe finishes verifying your account.",
          icon: result.payoutsEnabled ? 'checkCircle' : 'info',
        });
      }
      refreshConnect();
    });
    const next = new URLSearchParams(searchParams);
    next.delete('onboarded');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const handleSetupPayouts = async () => {
    if (!session) return;
    const result = await fetchConnectOnboardingLink(session.access_token);
    if ('error' in result) {
      toast({ title: 'Could not start payout setup', desc: result.error, icon: 'info' });
      return;
    }
    window.location.href = result.url;
  };
  const [tab, setTab] = useState<TripPhase>('upcoming');
  const [calendarCarId, setCalendarCarId] = useState<string | null>(null);
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
  const completedTrips = (hostCars ?? []).reduce((sum, c) => sum + (c.trips ?? 0), 0);

  const series = useMemo(() => monthlySeries(hostBookings ?? []), [hostBookings]);
  const hasEarningsData = series.some((d) => d.value > 0);
  // this month against the one before it, only when the one before it has something to compare with
  const monthTrend = (() => {
    const cur = series[series.length - 1]?.value ?? 0;
    const prev = series[series.length - 2]?.value ?? 0;
    if (prev <= 0 || cur <= 0) return null;
    const pct = Math.round(((cur - prev) / prev) * 100);
    return `${pct >= 0 ? '+' : ''}${pct}%`;
  })();

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
  // Where the money comes from, and one sentence worth reading — only from the host's real numbers.
  const carRows = useMemo(
    () => (hostCars ?? [])
      .map((c) => ({ id: c.id, name: `${c.make} ${c.model}`, revenue: carStats.get(c.id)?.revenue ?? 0 }))
      .filter((r) => r.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5),
    [hostCars, carStats],
  );
  const insight = (() => {
    const cur = series[series.length - 1]?.value ?? 0;
    const prev = series[series.length - 2]?.value ?? 0;
    if (monthTrend && prev > 0) {
      const up = cur >= prev;
      return {
        big: monthTrend,
        title: up ? 'Your earnings are up on last month.' : 'Your earnings are down on last month.',
        text: `This month ${eur(cur)}, last month ${eur(prev)}.`,
      };
    }
    if (carRows.length > 0) {
      return { big: eur(carRows[0].revenue), title: `${carRows[0].name} earns the most.`, text: `Across ${carRows.length === 1 ? 'your listing' : `your top ${carRows.length} cars`} so far.` };
    }
    if (upcomingCount > 0) {
      return { big: String(upcomingCount), title: upcomingCount === 1 ? 'A trip is coming up.' : 'Trips are coming up.', text: 'Check the handover steps a day before.' };
    }
    return null;
  })();

  // "Your cars right now": the host's published cars with their real status (on the road / booked / free).
  const nowCars = useMemo<HostCarNow[]>(
    () => (hostCars ?? []).filter((c) => c.status === 'published').map((c) => ({
      id: c.id,
      title: `${c.make} ${c.model}`,
      image: unsplash(c.images[0], 320),
      city: c.city,
    })),
    [hostCars],
  );
  const nowTrips = useMemo<HostTripNow[]>(
    () => classified
      .filter((c) => c.phase === 'active' || c.phase === 'upcoming')
      .map(({ booking: b, phase }) => ({
        carId: b.car.id,
        phase: phase as 'active' | 'upcoming',
        startDate: b.startDate,
        endDate: b.endDate,
        renter: b.renter.name || 'Renter',
      })),
    [classified],
  );

  const actionItems = useMemo(() => {
    const soonCutoff = toISO(new Date(Date.now() + 2 * 86_400_000));
    return buildActionItems({
      draftCars: (hostCars ?? []).filter((c) => c.status === 'draft' && c.reviewStatus !== 'pending'),
      soonPickups: classified
        .filter((c) => c.phase === 'upcoming' && c.booking.startDate <= soonCutoff)
        .map((c) => c.booking),
      unreadCount,
      verificationMissing: !verificationLoading && (!verification || verification.identityStatus === 'none' || verification.identityStatus === 'rejected'),
      payoutsMissing: !connectError && connectStatus !== null && !connectStatus.payoutsEnabled,
    });
  }, [hostCars, classified, unreadCount, verification, verificationLoading, connectStatus, connectError]);

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
              <Reveal delay={0}><StatCard icon="euro" label="Total earnings" value={eur(totalEarnings)} accent bars={series.map((d) => d.value)} barLabels={series.map((d) => d.month.slice(0, 1))} /></Reveal>
              <Reveal delay={60}><StatCard icon="trending" label="This month" value={eur(thisMonthEarnings)} trend={monthTrend ?? undefined} /></Reveal>
              <Reveal delay={120}><StatCard icon="cars" label="Active cars" value={String(activeCarsCount)} /></Reveal>
              <Reveal delay={180}><StatCard icon="route" label="Completed trips" value={String(completedTrips)} /></Reveal>
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

        {/* Your cars right now — real status per published car, no simulation. */}
        {!loading && nowCars.length > 0 && (
          <Reveal delay={160}>
            <div className="mt-6">
              <HostCarsNow cars={nowCars} trips={nowTrips} />
            </div>
          </Reveal>
        )}

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
          {/* Earnings chart */}
          <Reveal><section className="card scroll-mt-20 p-4 sm:p-6" id="earnings">
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
              <div className="mt-4"><MonthColumns data={series} /></div>
            ) : (
              <div className="mt-5 flex flex-col items-center gap-2 rounded-xl border border-line py-10 text-center">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-panel text-muted"><Icon name="euro" size={20} /></span>
                <p className="font-medium text-ink">No earnings yet</p>
                <p className="max-w-xs text-detail text-muted">Bookings on your cars will show up here once they come in.</p>
              </div>
            )}
          </section></Reveal>

          {/* Upcoming reservations */}
          <Reveal delay={80}><section className="card scroll-mt-20 p-4 sm:p-6" id="upcoming">
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

        {!loading && (carRows.length > 0 || insight) && (
          <details className="group mt-6">
            <summary className="card flex cursor-pointer list-none items-center justify-between p-4 sm:px-6 [&::-webkit-details-marker]:hidden">
              <span className="font-display text-lg font-semibold text-ink">Earnings breakdown</span>
              <Icon name="chevronDown" size={18} className="text-muted transition-transform group-open:rotate-180" />
            </summary>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {carRows.length > 0 && (
              <Reveal delay={60}>
                <section className="card p-5 sm:p-6">
                  <h2 className="font-display text-lg font-semibold text-ink">Earnings by car</h2>
                  <div className="mt-5"><StripedBars rows={carRows} /></div>
                </section>
              </Reveal>
            )}
            {insight && (
              <Reveal delay={120}>
                <InsightCard big={insight.big} title={insight.title} text={insight.text} />
              </Reveal>
            )}
          </div>
          </details>
        )}


        {/* Bookings */}
        <Reveal><section className="mt-8 scroll-mt-20 card overflow-hidden p-4 sm:p-6" id="bookings">
          <h2 className="font-display text-lg font-semibold text-ink">Bookings</h2>
          <div className="mt-4 mb-3 flex gap-1.5 overflow-x-auto no-scrollbar">
            {TABS.map((t) => {
              const count = classified.filter((c) => c.phase === t.id).length;
              return (
                <button
                  key={t.id}
                  onClick={(e) => {
                    setTab(t.id);
                    e.currentTarget.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
                  }}
                  aria-pressed={tab === t.id}
                  className={`chip relative shrink-0 ${tab === t.id ? '!border-transparent !bg-transparent !text-white dark:!text-[#0a0b0a]' : ''}`}
                >
                  {tab === t.id && <ActivePill layoutId="host-bookings-tab" className="rounded-full bg-ink" />}
                  <span className="relative">{t.label}</span>
                  {count > 0 && <span className={`relative ${tab === t.id ? 'text-white/60 dark:text-black/55' : 'text-faint'}`}>· {count}</span>}
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton aspect-[16/10] rounded-2xl" />)}
            </div>
          ) : hostCars && hostCars.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {hostCars.map((c) => {
                const published = c.status === 'published';
                const stats = carStats.get(c.id);
                const cardInner = (
                  <>
                    <div className="relative aspect-[16/10]">
                      <Img
                        src={unsplash(c.images[0], 500)}
                        alt=""
                        className="h-full w-full object-cover"
                        fallback={<span className="grid h-full w-full place-items-center bg-panel text-muted"><Icon name="car" size={28} /></span>}
                      />
                      <span className="absolute left-2.5 top-2.5 badge badge-glass">
                        <span className={`h-1.5 w-1.5 rounded-full ${published ? 'bg-accent' : c.reviewStatus === 'pending' ? 'animate-pulse bg-warn' : c.reviewStatus === 'rejected' ? 'bg-danger' : 'bg-faint'}`} />
                        {published ? 'Published' : c.reviewStatus === 'pending' ? 'In review · live soon' : c.reviewStatus === 'rejected' && c.reviewNote !== 'Withdrawn by the host' ? 'Needs changes' : 'Draft'}
                      </span>
                    </div>
                    <div className="p-4">
                      <p className="truncate text-body font-medium text-ink">{c.make} {c.model}</p>
                      <div className="mt-1 flex items-center justify-between text-detail">
                        <span className="inline-flex items-center gap-1 text-muted">
                          <Icon name="route" size={12} className="text-accent-700" /> {c.trips > 0 ? `${c.trips} trips` : 'New'}
                        </span>
                        <span className="font-medium text-ink">{eur(c.pricePerDay)}/day</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-caption text-muted">
                        <span>{stats?.bookings ?? 0} booking{stats?.bookings === 1 ? '' : 's'}</span>
                        <span className="font-medium text-ink">{eur(stats?.revenue ?? 0)} earned</span>
                      </div>
                      <div className="mt-3 flex gap-2 border-t border-line pt-3">
                        {published && (
                          <Link to={`/cars/${c.slug}`} className="btn btn-secondary btn-sm flex-1 !py-1.5">View</Link>
                        )}
                        <Link to={`/host/cars/${c.id}`} className={`btn btn-secondary btn-sm !py-1.5 ${published ? 'flex-1' : 'w-full'}`}>Manage</Link>
                      </div>
                    </div>
                  </>
                );
                return (
                  <div key={c.id} className={`card overflow-hidden ${published ? '' : 'opacity-80'}`}>{cardInner}</div>
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

        {/* Calendar */}
        <Reveal>
        <details className="group mt-8 scroll-mt-20" id="calendar" open={typeof window !== 'undefined' && window.location.hash === '#calendar'}>
          <summary className="card mb-4 flex cursor-pointer list-none items-center justify-between p-4 sm:px-6 [&::-webkit-details-marker]:hidden">
            <span className="font-display text-lg font-semibold text-ink">Calendar</span>
            <Icon name="chevronDown" size={18} className="text-muted transition-transform group-open:rotate-180" />
          </summary>
          {loading ? (
            <div className="skeleton h-80 rounded-2xl" />
          ) : hostCars && hostCars.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
              <div className="card p-4 sm:p-6">
                <HostFleetCalendar
                  cars={hostCars.map((c) => ({ id: c.id, make: c.make, model: c.model }))}
                  carId={calendarCarId ?? hostCars[0]?.id ?? null}
                  onCarIdChange={setCalendarCarId}
                />
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
                <HostBlackoutManager carId={calendarCarId ?? hostCars[0]?.id ?? null} />
              </div>
            </div>
          ) : (
            <div className="card flex flex-col items-center gap-2 py-12 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-panel text-muted"><Icon name="calendar" size={22} /></span>
              <p className="mt-1 font-medium text-ink">Add a car to see its calendar</p>
            </div>
          )}
        </details>
        </Reveal>

        <Reveal>
          <HostPayoutsCard status={connectStatus} error={connectError} onSetup={handleSetupPayouts} />
          <HostEarningsCard payouts={hostPayouts} commissionPct={commissionPct} payoutsEnabled={!!connectStatus?.payoutsEnabled} />
        </Reveal>
      </div>
    </DashboardShell>
  );
}
