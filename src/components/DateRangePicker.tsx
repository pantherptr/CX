import { useEffect, useMemo, useState } from 'react';
import { Modal } from './primitives';
import { Icon } from './Icon';
import { useLocale } from '../lib/i18n';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);

/** A range calendar: tap a pick-up day, tap a return day, the days in between are filled as one
 *  continuous band. Past days are disabled; a third tap starts over. Weeks start on Monday. */
function RangeCalendar({
  start, end, minDate, onChange,
}: { start: string | null; end: string | null; minDate: string; onChange: (s: string | null, e: string | null) => void }) {
  const { lang } = useLocale();
  const loc = lang === 'en' ? 'en-GB' : lang;
  const [view, setView] = useState(() => { const d = start ? parse(start) : parse(minDate); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [hover, setHover] = useState<string | null>(null);
  const today = iso(new Date());

  const monthLabel = view.toLocaleDateString(loc, { month: 'long', year: 'numeric' });
  const weekdays = useMemo(() => {
    // 2024-01-01 is a Monday
    return Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(loc, { weekday: 'narrow' }));
  }, [loc]);

  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7; // Monday = 0
    const count = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const out: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= count; d++) out.push(iso(new Date(view.getFullYear(), view.getMonth(), d)));
    while (out.length % 7) out.push(null);
    return out;
  }, [view]);

  const canPrev = iso(new Date(view.getFullYear(), view.getMonth(), 1)) > minDate.slice(0, 8) + '01';

  const pick = (d: string) => {
    if (d < minDate) return;
    if (!start || (start && end)) onChange(d, null);
    else if (d <= start) onChange(d, null);
    else onChange(start, d);
  };

  const rangeEnd = end ?? (start && hover && hover > start ? hover : null);

  return (
    <div className="select-none">
      <div className="flex items-center justify-between px-1 pb-3">
        <button
          type="button"
          onClick={() => canPrev && setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
          disabled={!canPrev}
          aria-label="Previous month"
          className="pressable grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel disabled:opacity-30"
        >
          <Icon name="chevronLeft" size={18} />
        </button>
        <p className="font-display text-[1.0625rem] font-semibold capitalize text-ink">{monthLabel}</p>
        <button
          type="button"
          onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
          aria-label="Next month"
          className="pressable grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel"
        >
          <Icon name="chevronRight" size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 pb-1">
        {weekdays.map((w, i) => (
          <span key={i} className="py-1.5 text-center text-label font-semibold uppercase text-faint">{w}</span>
        ))}
      </div>

      <div className="grid grid-cols-7" onMouseLeave={() => setHover(null)}>
        {cells.map((d, i) => {
          if (!d) return <span key={i} className="h-11" />;
          const disabled = d < minDate;
          const isStart = d === start;
          const isEnd = d === end;
          const inRange = !!(start && rangeEnd && d > start && d < rangeEnd);
          const edge = isStart || isEnd;
          // the band: full width between, half on the start/end cells
          const band = (inRange || (isStart && rangeEnd) || isEnd) ? true : false;
          return (
            <button
              key={d}
              type="button"
              disabled={disabled}
              onClick={() => pick(d)}
              onMouseEnter={() => setHover(d)}
              aria-pressed={edge}
              aria-label={parse(d).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' })}
              className="relative grid h-11 place-items-center disabled:cursor-not-allowed"
            >
              {band && (
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-1 bg-accent-050 ${inRange ? 'inset-x-0' : isStart ? 'left-1/2 right-0' : 'left-0 right-1/2'}`}
                />
              )}
              <span
                className={`relative grid h-10 w-10 place-items-center rounded-full text-[15px] tabular-nums transition-colors ${
                  edge
                    ? 'bg-ink font-semibold text-white'
                    : disabled
                      ? 'text-faint/60 line-through decoration-faint/30'
                      : 'font-medium text-ink hover:bg-panel'
                } ${d === today && !edge ? 'ring-1 ring-line-strong' : ''}`}
              >
                {parse(d).getDate()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The search bar's date field: pick-up → return in one tap target. Opens a sheet (bottom sheet on a
 *  phone, centred card on a desktop) with the range calendar; nothing changes until Apply. */
export function DateRangeField({
  start, end, onApply, dark = false, minDate,
}: { start: string; end: string; onApply: (s: string, e: string) => void; dark?: boolean; minDate: string }) {
  const { t, lang } = useLocale();
  const loc = lang === 'en' ? 'en-GB' : lang;
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<{ s: string | null; e: string | null }>({ s: start, e: end });
  useEffect(() => { if (open) setRange({ s: start, e: end }); }, [open, start, end]);

  const fmt = (d: string) => parse(d).toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' });
  const days = daysBetween(start, end);
  const ready = !!(range.s && range.e);
  const n = ready ? Math.max(1, daysBetween(range.s!, range.e!)) : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="group flex min-w-0 flex-[1.6] items-center gap-3 px-4 py-3 text-left"
      >
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors ${
            dark ? 'bg-white/10 text-white/70 group-hover:bg-accent-bright/20 group-hover:text-accent-bright' : 'bg-panel text-muted group-hover:bg-accent-050 group-hover:text-accent'
          }`}
        >
          <Icon name="calendar" size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-label font-semibold uppercase tracking-wide ${dark ? 'text-white/50' : 'text-muted'}`}>
            {t('Pick-up')} → {t('Return')}
          </span>
          <span className={`mt-0.5 flex items-center gap-2 truncate text-copy font-medium ${dark ? 'text-white' : 'text-ink'}`}>
            <span className="truncate capitalize">{fmt(start)}</span>
            <Icon name="arrowRight" size={14} className={dark ? 'text-white/40' : 'text-faint'} />
            <span className="truncate capitalize">{fmt(end)}</span>
            <span className={`ml-auto hidden shrink-0 rounded-full px-2 py-0.5 text-caption font-semibold sm:inline ${dark ? 'bg-white/10 text-white/80' : 'bg-panel text-ink-soft'}`}>
              {days} {days === 1 ? t('day') : t('days')}
            </span>
          </span>
        </span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} className="rounded-t-[28px] sm:max-w-[420px] sm:rounded-[28px]" labelledBy="hero-date-title">
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <h2 id="hero-date-title" className="font-display text-lg font-semibold text-ink">{t('Select your dates')}</h2>
          <button onClick={() => setOpen(false)} aria-label={t('Close')} className="pressable grid h-9 w-9 place-items-center rounded-full bg-panel text-ink-soft">
            <Icon name="x" size={17} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 px-5 pt-2">
          {([['Pick-up', range.s], ['Return', range.e]] as const).map(([label, v]) => (
            <div key={label} className={`rounded-2xl border px-3.5 py-2.5 transition-colors duration-300 ${v ? 'border-ink bg-surface' : 'border-line bg-panel/60'}`}>
              <p className="text-label font-semibold uppercase tracking-wide text-muted">{t(label)}</p>
              <p className={`mt-0.5 text-body font-semibold capitalize ${v ? 'text-ink' : 'text-faint'}`}>{v ? fmt(v) : '—'}</p>
            </div>
          ))}
        </div>

        <div className="px-4 pb-2 pt-4">
          <RangeCalendar start={range.s} end={range.e} minDate={minDate} onChange={(s, e) => setRange({ s, e })} />
        </div>

        <div className="flex items-center gap-3 border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3.5">
          <div className="min-w-0 flex-1">
            {ready ? (
              <p className="font-display text-lead font-semibold leading-tight text-ink">{n} {n === 1 ? t('day') : t('days')}</p>
            ) : (
              <p className="text-detail text-muted">{t('Pick a pick-up and a return day')}</p>
            )}
          </div>
          {(range.s || range.e) && (
            <button onClick={() => setRange({ s: null, e: null })} className="shrink-0 px-2 text-detail font-semibold text-muted underline underline-offset-4 transition-colors hover:text-ink">
              {t('Clear')}
            </button>
          )}
          <button
            disabled={!ready}
            onClick={() => { if (range.s && range.e) { onApply(range.s, range.e); setOpen(false); } }}
            className="btn btn-primary btn-lg shrink-0 disabled:opacity-40"
          >
            {t('Apply')}
          </button>
        </div>
      </Modal>
    </>
  );
}
