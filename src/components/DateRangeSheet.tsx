import { useEffect, useState } from 'react';
import { Modal } from './primitives';
import { Icon } from './Icon';
import { AvailabilityCalendar } from './AvailabilityCalendar';
import { eur } from '../lib/format';
import { useLocale } from '../lib/i18n';
import { uiLocale } from '../lib/i18n/uiLocale';

const short = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' });
};
const nights = (a: string, b: string) => Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));

/** The date picker as a sheet — a bottom sheet on a phone, a centred card on a
 *  desktop — so it never opens underneath the page. Pick-up and return show as
 *  two pills at the top, the calendar sits in the middle, and nothing is applied
 *  until the black button at the bottom is pressed. */
export function DateRangeSheet({
  open,
  onClose,
  carId,
  start,
  end,
  pricePerDay,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  carId: string;
  start: string | null;
  end: string | null;
  pricePerDay?: number;
  onApply: (start: string, end: string) => void;
}) {
  const { t } = useLocale();
  const [range, setRange] = useState<{ s: string | null; e: string | null }>({ s: start, e: end });
  // a pick-up day tapped whose return day is still to choose: shown at once, the old range is not "ready" any more
  const [draft, setDraft] = useState<string | null>(null);
  const [calKey, setCalKey] = useState(0);
  useEffect(() => { if (open) { setRange({ s: start, e: end }); setDraft(null); } }, [open, start, end]);
  const ready = !draft && !!(range.s && range.e);
  const n = ready ? nights(range.s!, range.e!) : 0;

  return (
    <Modal open={open} onClose={onClose} className="rounded-t-[28px] sm:max-w-[420px] sm:rounded-[28px]" labelledBy="date-sheet-title">
      <div className="flex items-center justify-between px-5 pb-1 pt-4">
        <h2 id="date-sheet-title" className="font-display text-lg font-semibold text-ink">{t('Select your dates')}</h2>
        <button onClick={onClose} aria-label={t('Close')} className="pressable grid h-9 w-9 place-items-center rounded-full bg-panel text-ink-soft">
          <Icon name="x" size={17} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 px-5 pt-2">
        {([['Pick-up', draft ?? range.s], ['Return', draft ? null : range.e]] as const).map(([label, v]) => (
          <div key={label} className={`rounded-2xl border px-3.5 py-2.5 transition-colors duration-300 ${v ? 'border-ink bg-surface' : 'border-line bg-panel/60'}`}>
            <p className="text-label font-semibold uppercase tracking-wide text-muted">{t(label)}</p>
            <p className={`mt-0.5 text-body font-semibold ${v ? 'text-ink' : 'text-faint'}`}>{v ? short(v) : '—'}</p>
          </div>
        ))}
      </div>

      <div className="px-4 pb-1 pt-3">
        <AvailabilityCalendar
          key={calKey}
          carId={carId}
          startDate={range.s}
          endDate={range.e}
          onSelect={(s, e) => setRange({ s, e })}
          onDraft={setDraft}
        />
      </div>

      <div className="flex items-center gap-3 border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3.5">
        <div className="min-w-0 flex-1">
          {ready ? (
            <>
              <p className="font-display text-lead font-semibold leading-tight text-ink">{n} {n === 1 ? t('day') : t('days')}</p>
              {pricePerDay != null && <p className="text-caption text-muted">{eur(pricePerDay * n)} · {t('before fees')}</p>}
            </>
          ) : (
            <p className="text-detail text-muted">{t('Pick a pick-up and a return day')}</p>
          )}
        </div>
        {(ready || draft) && (
          <button onClick={() => { setRange({ s: null, e: null }); setDraft(null); setCalKey((k) => k + 1); }} className="shrink-0 px-2 text-detail font-semibold text-muted underline underline-offset-4 transition-colors hover:text-ink">
            {t('Clear')}
          </button>
        )}
        <button
          disabled={!ready}
          onClick={() => { if (range.s && range.e) { onApply(range.s, range.e); onClose(); } }}
          className="btn btn-primary btn-lg shrink-0 disabled:opacity-40"
        >
          {t('Apply')}
        </button>
      </div>
    </Modal>
  );
}
