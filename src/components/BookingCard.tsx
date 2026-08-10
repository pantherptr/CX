import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Car } from '../data/types';
import { Icon } from './Icon';
import { eur } from '../lib/format';
import { useApp } from '../lib/store';

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
  const [pickup, setPickup] = useState(todayISO(3));
  const [ret, setRet] = useState(todayISO(6));
  const [loc, setLoc] = useState(car.location);

  const days = useMemo(() => daysBetween(pickup, ret), [pickup, ret]);
  const b = useMemo(() => priceBreakdown(car, days), [car, days]);

  const reserve = () => {
    const p = new URLSearchParams({ start: pickup, end: ret, loc, days: String(days) });
    navigate(`/book/${car.slug}?${p.toString()}`);
  };

  return (
    <div className={embedded ? '' : 'card p-5 shadow-card'}>
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
        <div className="grid grid-cols-2 divide-x divide-line">
          <label className="block px-3.5 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Pick-up</span>
            <input type="date" value={pickup} min={todayISO()} onChange={(e) => setPickup(e.target.value)} className="mt-0.5 w-full bg-transparent text-[14px] font-medium text-ink outline-none" />
          </label>
          <label className="block px-3.5 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Return</span>
            <input type="date" value={ret} min={pickup} onChange={(e) => setRet(e.target.value)} className="mt-0.5 w-full bg-transparent text-[14px] font-medium text-ink outline-none" />
          </label>
        </div>
      </div>

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

      <button onClick={reserve} className="btn btn-primary btn-block btn-lg mt-4">
        {car.instantBook ? 'Reserve car' : 'Request to book'}
        <Icon name="arrowRight" size={17} />
      </button>
      <button
        onClick={() => toast({ title: `Message sent to your host`, desc: 'They typically reply within an hour.', icon: 'message' })}
        className="btn btn-ghost btn-block mt-1.5 text-muted hover:text-ink"
      >
        <Icon name="message" size={16} /> Contact host
      </button>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[12.5px] text-muted">
        <Icon name="lock" size={13} /> You won’t be charged yet
      </p>
    </div>
  );
}
