import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Car } from '../data/types';
import { Icon } from './Icon';
import { Modal } from './primitives';
import { AvailabilityCalendar } from './AvailabilityCalendar';
import { useMediaQuery } from './motion';
import { eur } from '../lib/format';
import { useApp } from '../lib/store';
import { useAuth } from '../lib/auth';
import { findOrCreateConversation } from '../lib/data/messages';

// `new Date(iso)` parses a date-only string as UTC midnight; formatting
// that with local-timezone methods can render a day early for negative
// UTC offsets. Build the display date from the string's own components
// instead of round-tripping through UTC.
function fmtShort(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function todayISO(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string) {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

export function priceBreakdown(car: Car, days: number) {
  const base = car.pricePerDay * days;
  const service = Math.round(base * 0.12);
  const protection = Math.round(car.pricePerDay * 0.18) * days;
  return { base, service, protection, total: base + service + protection, days };
}

export function BookingCard({ car, embedded = false }: { car: Car; embedded?: boolean }) {
  const navigate = useNavigate();
  const { toast } = useApp();
  const { session } = useAuth();
  const [pickup, setPickup] = useState(todayISO(3));
  const [ret, setRet] = useState(todayISO(6));
  const [loc, setLoc] = useState(car.location);
  const [messaging, setMessaging] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const isMobile = useMediaQuery('(max-width: 640px)');
  const cardRef = useRef<HTMLDivElement>(null);

  const selectDates = (start: string, end: string) => {
    setPickup(start);
    setRet(end);
    setShowCalendar(false);
  };

  const days = useMemo(() => daysBetween(pickup, ret), [pickup, ret]);
  const b = useMemo(() => priceBreakdown(car, days), [car, days]);

  const reserve = () => {
    const p = new URLSearchParams({ start: pickup, end: ret, loc, days: String(days) });
    navigate(`/book/${car.slug}?${p.toString()}`);
  };

  const contactHost = async () => {
    if (!session) {
      navigate('/login', { state: { from: { pathname: `/cars/${car.slug}` } } });
      return;
    }
    setMessaging(true);
    try {
      const conversationId = await findOrCreateConversation(car.id, session.user.id, car.hostId);
      navigate(`/messages?c=${conversationId}`);
    } catch (err) {
      toast({ title: 'Could not open conversation', desc: err instanceof Error ? err.message : undefined, icon: 'info' });
    } finally {
      setMessaging(false);
    }
  };

  return (
    <div ref={cardRef} className={embedded ? 'relative' : 'card relative p-5 shadow-card'}>
      <div className="flex items-end justify-between">
        <div>
          <span className="text-[26px] font-semibold text-ink">{eur(car.pricePerDay)}</span>
          <span className="text-[15px] text-muted"> / day</span>
        </div>
        <span className="inline-flex items-center gap-1 text-[13.5px] font-medium text-ink">
          <Icon name="star" size={14} className="text-star" />
          {car.rating.toFixed(2)}
          <span className="font-normal text-muted">· {car.trips} trips</span>
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-line-strong">
        <label className="block border-b border-line px-3.5 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Pick-up location</span>
          <div className="mt-0.5 flex items-center gap-2">
            <Icon name="pin" size={15} className="text-muted" />
            <input value={loc} onChange={(e) => setLoc(e.target.value)} className="w-full bg-transparent text-[14.5px] font-medium text-ink outline-none" />
          </div>
        </label>
        <button
          type="button"
          onClick={() => setShowCalendar(true)}
          className="flex w-full items-center justify-between px-3.5 py-2.5 text-left transition-colors hover:bg-panel"
        >
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Dates</span>
            <p className="mt-0.5 text-[14px] font-medium text-ink">
              {fmtShort(pickup)} – {fmtShort(ret)}
            </p>
          </div>
          <Icon name="calendar" size={17} className="text-muted" />
        </button>
      </div>

      {/* Desktop: popover anchored under the card. Mobile: bottom-sheet modal. */}
      {showCalendar && !isMobile && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowCalendar(false)} />
          <div className="absolute left-0 right-0 top-full z-50 mt-2 animate-scale-in rounded-2xl border border-line bg-surface p-4 shadow-pop">
            <AvailabilityCalendar carId={car.id} startDate={pickup} endDate={ret} onSelect={selectDates} />
          </div>
        </>
      )}
      {showCalendar && isMobile && (
        <Modal open={showCalendar} onClose={() => setShowCalendar(false)} className="rounded-t-[1.75rem] p-5 pb-8" labelledBy="cal-title">
          <p id="cal-title" className="mb-4 font-display text-lg font-semibold text-ink">
            Select your dates
          </p>
          <AvailabilityCalendar carId={car.id} startDate={pickup} endDate={ret} onSelect={selectDates} />
        </Modal>
      )}

      <dl className="mt-4 space-y-2.5 text-[14px]">
        <div className="flex items-center justify-between">
          <dt className="text-muted underline decoration-line decoration-1 underline-offset-2">
            {eur(car.pricePerDay)} × {days} {days === 1 ? 'day' : 'days'}
          </dt>
          <dd className="text-ink">{eur(b.base)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted">Service fee</dt>
          <dd className="text-ink">{eur(b.service)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="flex items-center gap-1 text-muted">Protection <Icon name="shield" size={13} className="text-accent" /></dt>
          <dd className="text-ink">{eur(b.protection)}</dd>
        </div>
        <div className="my-1 hairline" />
        <div className="flex items-center justify-between text-[15px]">
          <dt className="font-semibold text-ink">Total</dt>
          <dd className="font-semibold text-ink">{eur(b.total)}</dd>
        </div>
      </dl>

      <button onClick={reserve} className="btn btn-accent-bright btn-block btn-lg mt-4">
        {car.instantBook ? 'Reserve car' : 'Request to book'}
        <Icon name="arrowRight" size={17} />
      </button>
      <button
        onClick={contactHost}
        disabled={messaging}
        className="btn btn-ghost btn-block mt-1.5 text-muted hover:text-ink disabled:opacity-60"
      >
        <Icon name="message" size={16} /> {messaging ? 'Opening…' : 'Contact host'}
      </button>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[12.5px] text-muted">
        <Icon name="lock" size={13} /> You won’t be charged yet
      </p>
    </div>
  );
}
