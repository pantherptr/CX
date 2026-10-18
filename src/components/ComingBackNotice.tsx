import { useEffect, useState } from 'react';
import { useLocale } from '../lib/i18n';
import { CxWordmark } from './CxWordmark';
import { NumberFlow } from './NumberFlow';

/** The date the service is expected back (Supabase billing-cycle reset). Change it here when it moves. */
const BACK_ON = new Date('2026-11-10T12:00:00Z').getTime();

function useCountdown() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const left = Math.max(0, BACK_ON - now);
  return { days: Math.floor(left / 86_400_000), hours: Math.floor(left / 3_600_000) % 24, minutes: Math.floor(left / 60_000) % 60, seconds: Math.floor(left / 1000) % 60, over: left === 0 };
}

/** Shown where content would be (instead of a grey box that never fills): work in progress, with a count to the day
 *  the data is back, and a retry. */
export function ComingBackNotice({ onRetry, className = '' }: { onRetry?: () => void; className?: string }) {
  const { t } = useLocale();
  const { days, hours, minutes, seconds, over } = useCountdown();
  return (
    <div className={`rounded-[28px] border border-line bg-panel px-5 py-8 text-center ${className}`}>
      <CxWordmark className="mx-auto h-14 w-auto text-ink" title="CX" />
      <p className="mt-4 font-display text-[1.35rem] font-semibold leading-tight tracking-[-0.01em] text-ink">{t('Work in progress')}</p>
      <p className="mx-auto mt-1.5 max-w-xs text-detail leading-relaxed text-muted">
        {over ? t('The cars are on their way. Try again in a moment.') : t('We are getting the cars ready. They will be here on 10 November.')}
      </p>
      {!over && (
        <div className="mx-auto mt-4 flex w-fit items-stretch gap-2">
          {[[days, t('days')], [hours, t('hours')], [minutes, t('min')], [seconds, t('sec')]].map(([v, l]) => (
            <div key={String(l)} className="min-w-[3.6rem] rounded-2xl bg-white px-2.5 py-2 shadow-hair">
              <NumberFlow className="font-display text-[1.6rem] font-semibold leading-none text-ink" format={{ minimumIntegerDigits: 2, useGrouping: false }} trend={-1} value={Number(v)} />
              <p className="mt-1 text-caption text-muted">{l}</p>
            </div>
          ))}
        </div>
      )}
      {onRetry && <button onClick={onRetry} className="btn btn-secondary btn-sm mt-5">{t('Try again')}</button>}
    </div>
  );
}

/** True once `loading` has lasted longer than `ms` (the data is not coming). */
export function useSlowLoading(loading: boolean, ms = 6000): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) { setSlow(false); return; }
    const id = window.setTimeout(() => setSlow(true), ms);
    return () => window.clearTimeout(id);
  }, [loading, ms]);
  return slow;
}
