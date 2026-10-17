import { useState } from 'react';
import { Icon } from './Icon';
import { Modal } from './primitives';
import { useLocale } from '../lib/i18n';
import { renterTier, type RenterTier } from '../lib/data/bookings';

const LEVELS: { tier: RenterTier; from: number; line: string }[] = [
  { tier: 'Explorer', from: 1, line: 'Your first trips with CX.' },
  { tier: 'Frequent renter', from: 5, line: 'You know the way: hosts know you too.' },
  { tier: 'Road veteran', from: 15, line: 'The most trusted drivers on CX.' },
];

/** The renter level under a name: "Explorer · 3 trips". Tap it to see the three levels and how far the next one is. */
export function RenterTierBadge({ completed, className = '' }: { completed: number; className?: string }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const tier = renterTier(completed);
  if (!tier) return null;
  const idx = LEVELS.findIndex((l) => l.tier === tier);
  const next = LEVELS[idx + 1];
  const base = LEVELS[idx].from;
  const pct = next ? Math.min(100, ((completed - base) / (next.from - base)) * 100) : 100;
  const trips = completed === 1 ? t('1 trip') : t('{n} trips', { n: completed });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} aria-haspopup="dialog">
        {t(tier)} · {trips}
        <Icon name="info" size={13} className="ml-1.5 opacity-70" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} labelledBy="tier-title">
        <div className="px-5 pb-5 pt-2">
          <p className="eyebrow">{t('Your level')}</p>
          <h2 id="tier-title" className="mt-1 font-display text-[1.6rem] font-semibold tracking-[-0.02em] text-ink">{t(tier)}</h2>
          <p className="mt-1 text-body text-ink-soft">
            {next
              ? t('{n} more trips to reach {tier}.', { n: next.from - completed, tier: t(next.tier) })
              : t('You are at the top level. Thank you for driving with CX.')}
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-panel" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-accent-bright transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-caption text-muted">{t('Levels come from the trips you have completed. Nothing to buy, nothing to claim.')}</p>

          <ul className="mt-5 divide-y divide-line rounded-2xl border border-line">
            {LEVELS.map((l) => {
              const reached = completed >= l.from;
              return (
                <li key={l.tier} className="flex items-center gap-3 px-4 py-3.5">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${reached ? 'bg-accent-050 text-accent-700' : 'bg-panel text-faint'}`}>
                    <Icon name={reached ? 'check' : 'lock'} size={16} strokeWidth={2.4} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[15px] font-semibold ${reached ? 'text-ink' : 'text-ink-soft'}`}>{t(l.tier)}</span>
                    <span className="block text-caption text-muted">{t(l.line)}</span>
                  </span>
                  <span className="shrink-0 text-caption font-semibold text-muted">{t('{n}+ trips', { n: l.from })}</span>
                </li>
              );
            })}
          </ul>
          <button onClick={() => setOpen(false)} className="btn btn-secondary btn-lg mt-5 w-full">{t('Close')}</button>
        </div>
      </Modal>
    </>
  );
}
