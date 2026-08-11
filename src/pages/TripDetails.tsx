import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DashboardShell } from '../components/DashboardShell';
import { Icon, type IconName } from '../components/Icon';
import { CarLoader } from '../components/CarLoader';
import { eur } from '../lib/format';
import { useApp } from '../lib/store';
import {
  cancelBooking,
  classifyBooking,
  fetchBookingById,
  type Booking,
  type TripPhase,
} from '../lib/data/bookings';

const phaseBadge: Record<TripPhase, string> = {
  upcoming: 'badge-accent',
  active: 'bg-accent text-white',
  completed: 'bg-panel-2 text-ink-soft',
  cancelled: 'bg-danger/10 text-danger',
};

const phaseLabel: Record<TripPhase, string> = {
  upcoming: 'Upcoming',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function daysUntil(dateStr: string) {
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

function TimelineStep({ label, done, current }: { label: string; done: boolean; current?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2 text-center">
      <span
        className={`grid h-8 w-8 place-items-center rounded-full text-[12px] font-semibold ${
          done ? 'bg-accent text-white' : current ? 'bg-ink text-white' : 'bg-panel-2 text-faint'
        }`}
      >
        {done ? <Icon name="check" size={14} strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      </span>
      <span className={`text-[11.5px] font-medium uppercase tracking-wide ${done || current ? 'text-ink' : 'text-faint'}`}>{label}</span>
    </div>
  );
}

export default function TripDetails() {
  const { id } = useParams();
  const { toast } = useApp();
  const [booking, setBooking] = useState<Booking | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchBookingById(id ?? '')
      .then((data) => {
        if (!cancelled) setBooking(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load this trip.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadError) {
    return (
      <DashboardShell variant="customer" active="My Trips">
        <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-panel text-danger">
            <Icon name="info" size={26} />
          </span>
          <h1 className="font-display text-xl font-semibold text-ink">Couldn't load this trip</h1>
          <p className="max-w-sm text-[14px] text-muted">{loadError}</p>
        </div>
      </DashboardShell>
    );
  }

  if (booking === undefined) {
    return (
      <DashboardShell variant="customer" active="My Trips">
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <CarLoader size={90} />
          <p className="text-[14px] text-muted">Loading trip…</p>
        </div>
      </DashboardShell>
    );
  }

  if (booking === null) {
    return (
      <DashboardShell variant="customer" active="My Trips">
        <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-panel text-muted">
            <Icon name="search" size={26} />
          </span>
          <h1 className="font-display text-xl font-semibold text-ink">Trip not found</h1>
          <p className="max-w-sm text-[14px] text-muted">
            This trip doesn't exist, or doesn't belong to your account.
          </p>
          <Link to="/dashboard#trips" className="btn btn-primary mt-2">Back to My Trips</Link>
        </div>
      </DashboardShell>
    );
  }

  const phase = classifyBooking(booking);
  const days = Math.max(1, Math.round((new Date(booking.endDate).getTime() - new Date(booking.startDate).getTime()) / 86400000));
  // Same formula as the server-side trigger that computed totalPrice (see
  // migration 0003) and the checkout summary (BookingCard's
  // priceBreakdown) — reconstructed here from the real per-day rate for
  // an itemized display, not guessed from the total.
  const base = booking.car.pricePerDay * days;
  const service = Math.round(base * 0.12);
  const protection = Math.round(booking.car.pricePerDay * 0.18) * days;

  const canCancel = (phase === 'upcoming' || phase === 'active') && daysUntil(booking.startDate) >= 1;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    booking.pickupLocation || booking.car.location,
  )}`;

  const handleCancel = async () => {
    if (!confirm('Cancel this trip? This cannot be undone.')) return;
    setCancelling(true);
    const { error } = await cancelBooking(booking.id);
    setCancelling(false);
    if (error) {
      toast({ title: 'Could not cancel trip', desc: error, icon: 'info' });
      return;
    }
    setBooking({ ...booking, status: 'cancelled' });
    toast({ title: 'Trip cancelled', icon: 'checkCircle' });
  };

  const specs: { icon: IconName; label: string; value: string }[] = [
    { icon: 'calendar', label: 'Pick-up', value: new Date(booking.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) },
    { icon: 'calendar', label: 'Return', value: new Date(booking.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) },
    { icon: 'pin', label: 'Location', value: booking.pickupLocation || booking.car.location },
    { icon: 'card', label: 'Total paid', value: eur(booking.totalPrice) },
  ];

  return (
    <DashboardShell variant="customer" active="My Trips">
      <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
        <Link to="/dashboard#trips" className="mb-5 inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-ink">
          <Icon name="chevronLeft" size={16} /> My Trips
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className={`badge ${phaseBadge[phase]}`}>{phaseLabel[phase]}</span>
            <h1 className="mt-2 font-display text-2xl font-semibold text-ink sm:text-3xl">
              {booking.car.year} {booking.car.make} {booking.car.model}
            </h1>
            <p className="mt-1 text-[13.5px] text-muted">Booking {booking.reference}</p>
          </div>
        </div>

        {phase === 'upcoming' && (
          <div className="mt-5 rounded-2xl bg-ink px-5 py-4 text-white">
            <p className="text-[14.5px] font-medium">
              Your trip starts in {daysUntil(booking.startDate)} {daysUntil(booking.startDate) === 1 ? 'day' : 'days'}
            </p>
          </div>
        )}

        {/* Timeline */}
        {phase !== 'cancelled' && (
          <div className="mt-6 card p-6">
            <div className="flex items-start">
              <TimelineStep label="Booked" done />
              <TimelineStep label="Pick-up" done={phase !== 'upcoming'} current={phase === 'upcoming'} />
              <TimelineStep label="Trip" done={phase === 'completed'} current={phase === 'active'} />
              <TimelineStep label="Returned" done={phase === 'completed'} />
            </div>
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-2xl border border-line">
          <img src={booking.car.image} alt="" className="aspect-[16/9] w-full object-cover" />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          {specs.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-panel text-ink-soft">
                <Icon name={s.icon} size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-[12px] text-muted">{s.label}</p>
                <p className="truncate text-[14px] font-medium text-ink">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Pickup location */}
        <section className="mt-8 border-t border-line pt-6">
          <h2 className="font-display text-lg font-semibold text-ink">Pick-up location</h2>
          <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-line p-4">
            <p className="text-[14px] text-ink-soft">{booking.pickupLocation || booking.car.location}</p>
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm shrink-0">
              Open Maps <Icon name="arrowUpRight" size={14} />
            </a>
          </div>
        </section>

        {/* Host */}
        <section className="mt-8 border-t border-line pt-6">
          <h2 className="font-display text-lg font-semibold text-ink">Your host</h2>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-line p-4">
            {booking.host.avatar ? (
              <img src={booking.host.avatar} alt="" className="h-11 w-11 rounded-full object-cover" />
            ) : (
              <span className="grid h-11 w-11 place-items-center rounded-full bg-accent-050 text-accent">
                <Icon name="user" size={18} />
              </span>
            )}
            <div className="flex-1">
              <p className="text-[14px] font-medium text-ink">{booking.host.name}</p>
              {booking.host.responseTime && <p className="text-[13px] text-muted">Responds {booking.host.responseTime}</p>}
            </div>
            <Link to="/messages" className="btn btn-secondary btn-sm"><Icon name="message" size={15} /> Message</Link>
          </div>
        </section>

        {/* Payment */}
        <section className="mt-8 border-t border-line pt-6">
          <h2 className="font-display text-lg font-semibold text-ink">Payment details</h2>
          <dl className="mt-3 space-y-2.5 rounded-xl border border-line p-4 text-[14px]">
            <div className="flex justify-between"><dt className="text-muted">{days} {days === 1 ? 'day' : 'days'} rental</dt><dd className="text-ink">{eur(base)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Service fee</dt><dd className="text-ink">{eur(service)}</dd></div>
            <div className="flex justify-between"><dt className="flex items-center gap-1 text-muted">Protection <Icon name="shield" size={13} className="text-accent" /></dt><dd className="text-ink">{eur(protection)}</dd></div>
            <div className="hairline my-1" />
            <div className="flex justify-between text-[15px] font-semibold text-ink"><dt>Total</dt><dd>{eur(booking.totalPrice)}</dd></div>
          </dl>
        </section>

        {/* Insurance & cancellation */}
        <section className="mt-8 border-t border-line pt-6">
          <h2 className="font-display text-lg font-semibold text-ink">Insurance &amp; cancellation</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
            This trip includes damage protection and 24/7 roadside assistance. Free cancellation up to 24
            hours before pick-up — after that, the booking stays confirmed with your host.
          </p>
        </section>

        {/* Support */}
        <section className="mt-8 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row">
          <Link to="/help" className="btn btn-secondary flex-1"><Icon name="headset" size={16} /> Get support</Link>
          {canCancel ? (
            <button onClick={handleCancel} disabled={cancelling} className="btn btn-secondary flex-1 !text-danger disabled:opacity-60">
              {cancelling ? 'Cancelling…' : 'Cancel trip'}
            </button>
          ) : phase === 'upcoming' || phase === 'active' ? (
            <p className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-center text-[13px] text-muted">
              Cancellation window has passed — contact your host or support.
            </p>
          ) : null}
        </section>
      </div>
    </DashboardShell>
  );
}
