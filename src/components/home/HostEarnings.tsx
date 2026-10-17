import { useState } from 'react';
import { useLocale } from '../../lib/i18n';
import { eur } from '../../lib/format';

/** Home → owners: two sliders and a number. An estimate only (host keeps the rate minus CX's commission, 5% by default). */
const COMMISSION = 0.05;

export function HostEarnings() {
  const { t } = useLocale();
  const [rate, setRate] = useState(80);
  const [days, setDays] = useState(10);
  const month = Math.round(rate * days * (1 - COMMISSION));
  const track = (v: number, min: number, max: number) => ({ background: `linear-gradient(90deg, var(--color-accent) ${((v - min) / (max - min)) * 100}%, var(--color-line) 0)` });
  return (
    <div className="rounded-2xl border border-line bg-panel/60 p-5">
      <p className="text-caption font-semibold uppercase tracking-[0.14em] text-muted">{t('What could you earn?')}</p>
      <p className="mt-2 font-display text-[2.6rem] font-semibold leading-none tracking-tight text-ink" aria-live="polite">
        {eur(month)} <span className="text-detail font-medium tracking-normal text-muted">/ {t('month')}</span>
      </p>
      <label className="mt-5 block">
        <span className="flex items-center justify-between text-detail font-medium text-ink-soft"><span>{t('Daily rate')}</span><span className="font-semibold text-ink">{eur(rate)}</span></span>
        <input type="range" min={30} max={400} step={5} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="cx-range mt-2 w-full" style={track(rate, 30, 400)} aria-label={t('Daily rate')} />
      </label>
      <label className="mt-4 block">
        <span className="flex items-center justify-between text-detail font-medium text-ink-soft"><span>{t('Days rented per month')}</span><span className="font-semibold text-ink">{days}</span></span>
        <input type="range" min={1} max={28} step={1} value={days} onChange={(e) => setDays(Number(e.target.value))} className="cx-range mt-2 w-full" style={track(days, 1, 28)} aria-label={t('Days rented per month')} />
      </label>
      <p className="mt-4 text-caption text-faint">{t('An estimate, after CX’s small commission. Your real earnings depend on your bookings.')}</p>
    </div>
  );
}
