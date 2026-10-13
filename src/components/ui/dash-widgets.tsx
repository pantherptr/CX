import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Icon } from '../Icon';
import { eur } from '../../lib/format';
import { uiLocale } from '../../lib/i18n/uiLocale';

/* Dashboard widgets shared by the host and the client dashboards: hatched month columns you can tap, hatched
 * progress bars, and the deep-green Insights card (the look of the reference dashboard). */

export const STRIPES_ON = 'repeating-linear-gradient(135deg, var(--color-accent) 0 2px, color-mix(in srgb, var(--color-accent) 35%, transparent) 2px 5px)';
export const STRIPES_OFF = 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-ink) 20%, transparent) 0 2px, color-mix(in srgb, var(--color-ink) 7%, transparent) 2px 5px)';

/** The earnings of the last months as columns you can tap: the chosen month is read out big on top (with
 *  how it compares with the month before), the others are small and hatched. */
export function MonthColumns({ data, vsLabel = 'vs the month before' }: { data: { month: string; value: number }[]; vsLabel?: string }) {
  const reduced = useReducedMotion();
  const [sel, setSel] = useState(data.length - 1);
  const max = Math.max(...data.map((d) => d.value), 1);
  const cur = data[sel]?.value ?? 0;
  const prev = sel > 0 ? data[sel - 1].value : 0;
  const pct = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
  const compactEur = (n: number) => new Intl.NumberFormat(uiLocale(), { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(n);
  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <p className="font-display text-[2.4rem] font-semibold leading-none tracking-tight text-ink tabular-nums">{eur(cur)}</p>
        {pct !== null && (
          <span className={`mb-1 inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-caption font-semibold shadow-[0_6px_14px_-8px_rgba(0,0,0,0.35)] ${pct < 0 ? 'text-danger' : 'text-accent-700'}`}>
            <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true" className={pct < 0 ? 'rotate-180' : ''}><path d="M5 1.5 9 8.5H1z" fill="currentColor" /></svg>
            {Math.abs(pct)}%
          </span>
        )}
      </div>
      <p className="mt-1 text-caption text-muted">{data[sel]?.month}{pct !== null ? ` · ${vsLabel}` : ''}</p>
      <div className="mt-5 flex h-44 items-stretch gap-2 sm:gap-3" role="list">
        {data.map((d, i) => {
          const h = Math.max(4, (d.value / max) * 100);
          const on = i === sel;
          return (
            <button
              key={`${d.month}-${i}`}
              type="button"
              role="listitem"
              aria-pressed={on}
              aria-label={`${d.month}: ${eur(d.value)}`}
              onClick={() => setSel(i)}
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5 rounded-xl px-0.5 pb-1 pt-2 transition-colors hover:bg-panel/60"
            >
              <span className={`text-[11px] font-semibold tabular-nums ${on ? 'text-ink' : 'text-faint'}`}>{compactEur(d.value)}</span>
              <span className="flex w-full flex-1 items-end">
                <motion.span
                  initial={reduced ? false : { height: '0%' }}
                  whileInView={{ height: `${h}%` }}
                  viewport={{ once: true }}
                  transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 26, delay: 0.05 + i * 0.06 }}
                  className="block w-full rounded-md"
                  style={{ backgroundImage: on ? STRIPES_ON : STRIPES_OFF }}
                />
              </span>
              <span className={`text-[11px] ${on ? 'font-semibold text-ink' : 'text-faint'}`}>{d.month}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Where the earnings come from: one hatched bar per car, longest = the car that earns most. */
export function StripedBars({ rows }: { rows: { id: string; name: string; revenue: number }[] }) {
  const reduced = useReducedMotion();
  const max = Math.max(...rows.map((r) => r.revenue), 1);
  const FILLS = [STRIPES_ON, 'repeating-linear-gradient(135deg, var(--color-ink) 0 2px, color-mix(in srgb, var(--color-ink) 30%, transparent) 2px 5px)', 'repeating-linear-gradient(135deg, #c9971c 0 2px, color-mix(in srgb, #c9971c 35%, transparent) 2px 5px)'];
  return (
    <div className="space-y-5">
      {rows.map((r, i) => (
        <div key={r.id}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-body text-ink-soft">{r.name}</p>
            <p className="shrink-0 font-display text-body font-semibold tabular-nums text-ink">{eur(r.revenue)}</p>
          </div>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-panel">
            <motion.div
              initial={reduced ? false : { width: '0%' }}
              whileInView={{ width: `${Math.max(3, (r.revenue / max) * 100)}%` }}
              viewport={{ once: true }}
              transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 160, damping: 24, delay: 0.1 + i * 0.08 }}
              className="h-full rounded-full"
              style={{ backgroundImage: FILLS[i % FILLS.length] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** One sentence worth reading, built only from the host's real numbers, on a deep-green card. */
export function InsightCard({ big, title, text }: { big: string; title: string; text: string }) {
  return (
    <div className="relative isolate overflow-hidden rounded-[1.75rem] p-6 text-white sm:p-7" style={{ background: 'linear-gradient(145deg, #0b3d1d 0%, #0a1f12 55%, #050605 100%)' }}>
      <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 -z-10 h-56 w-56 rounded-full" style={{ background: 'radial-gradient(circle, rgba(0,212,71,0.35) 0%, rgba(0,212,71,0) 70%)' }} />
      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-caption font-semibold text-white/90">
        <Icon name="sparkles" size={13} /> Insights
      </span>
      <p className="mt-6 font-display text-[3.4rem] font-semibold leading-none tracking-tight tabular-nums">{big}</p>
      <p className="mt-5 max-w-sm font-display text-lead font-semibold leading-snug">{title}</p>
      <p className="mt-1.5 max-w-sm text-detail leading-snug text-white/70">{text}</p>
    </div>
  );
}

