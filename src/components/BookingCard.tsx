import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Car } from '../data/types';
import { Icon } from './Icon';
import { DateRangeSheet } from './DateRangeSheet';
import { eur } from '../lib/format';
import { useApp } from '../lib/store';
import { useAuth } from '../lib/auth';
import { findOrCreateCxConversation } from '../lib/data/messages';
import { useHasAccess } from '../lib/useAccess';
import { useLocale } from '../lib/i18n';

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
  const { t } = useLocale();
  const hasAccess = useHasAccess();
  const [pickup, setPickup] = useState(todayISO(3));
  const [ret, setRet] = useState(todayISO(6));
  // Visitors without an account only get the city; the neighbourhood comes with sign-in.
  const [locEdit, setLocEdit] = useState<string | null>(null);
  const loc = locEdit ?? (hasAccess ? car.location : car.city);
  const setLoc = (v: string) => setLocEdit(v);
  const [messaging, setMessaging] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const selectDates = (start: string, end: string) => {
    setPickup(start);
    setRet(end);
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
      // Before a booking, questions go to CX — not straight to the host.
      const conversationId = await findOrCreateCxConversation(car.id, session.user.id);
      if (!conversationId) {
        toast({ title: 'Support is not available right now', icon: 'info' });
        return;
      }
      navigate(`/messages?c=${conversationId}`);
    } catch (err) {
      toast({ title: 'Could not open conversation', desc: err instanceof Error ? err.message : undefined, icon: 'info' });
    } finally {
      setMessaging(false);
    }
  };

  return (
    <div ref={cardRef} className={embedded ? 'relative' : 'relative rounded-[28px] border border-line bg-surface p-5 shadow-[0_24px_60px_-30px_rgba(22,22,26,0.35)]'}>
      <div className="flex items-end justify-between">
        <div>
          <span className="text-[26px] font-semibold text-ink">{eur(car.pricePerDay)}</span>
          <span className="text-copy text-muted"> / day</span>
        </div>
        <span className="inline-flex items-center gap-1 text-detail font-medium text-ink">
          <Icon name="star" size={14} className="text-star" />
          {car.rating.toFixed(2)}
          <span className="font-normal text-muted">· {car.trips} trips</span>
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-line-strong">
        <button
          type="button"
          onClick={() => setShowCalendar(true)}
          className="grid w-full grid-cols-2 divide-x divide-line text-left transition-colors hover:bg-panel/60"
        >
          <span className="px-3.5 py-2.5">
            <span className="text-label font-semibold uppercase tracking-wide text-muted">Pick-up</span>
            <span className="mt-0.5 block text-body font-medium text-ink">{fmtShort(pickup)}</span>
          </span>
          <span className="px-3.5 py-2.5">
            <span className="text-label font-semibold uppercase tracking-wide text-muted">Return</span>
            <span className="mt-0.5 block text-body font-medium text-ink">{fmtShort(ret)}</span>
          </span>
        </button>
        <label className="block border-t border-line px-3.5 py-2.5">
          <span className="text-label font-semibold uppercase tracking-wide text-muted">Pick-up location</span>
          <div className="mt-0.5 flex items-center gap-2">
            <Icon name="pin" size={15} className="text-muted" />
            <input value={loc} onChange={(e) => setLoc(e.target.value)} className="w-full bg-transparent text-body font-medium text-ink outline-none" />
          </div>
        </label>
      </div>

      <DateRangeSheet open={showCalendar} onClose={() => setShowCalendar(false)} carId={car.id} start={pickup} end={ret} pricePerDay={car.pricePerDay} onApply={selectDates} />

      <dl className="mt-4 space-y-2.5 text-body">
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
        <div className="flex items-center justify-between text-copy">
          <dt className="font-semibold text-ink">Total</dt>
          <dd className="font-semibold text-ink">{eur(b.total)}</dd>
        </div>
      </dl>

      <button onClick={reserve} className="btn btn-primary btn-block btn-lg mt-4">
        {car.instantBook ? 'Reserve car' : 'Request to book'}
        <Icon name="arrowRight" size={17} />
      </button>
      <button
        onClick={contactHost}
        disabled={messaging}
        className="btn btn-ghost btn-block mt-1.5 text-muted hover:text-ink disabled:opacity-60"
      >
        <Icon name="message" size={16} /> {messaging ? t('Opening…') : t('Contact CX')}
      </button>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-caption text-muted">
        <Icon name="lock" size={13} /> You won’t be charged yet
      </p>
    </div>
  );
}
