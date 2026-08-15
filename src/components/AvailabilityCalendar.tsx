import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { useBookedRanges, rangesOverlap } from '../lib/data/bookings';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Deliberately local-only date handling throughout this file: `Date`s here
// are always constructed via local arithmetic (`new Date(y, m, d)`), so
// they must be formatted back the same way. `toISOString()` converts to
// UTC first — for any non-UTC positive timezone offset that silently
// shifts a local midnight back to the previous UTC day, so a cell visibly
// labelled "18" would compare as booked/selected against "17". Bookings'
// `start_date`/`end_date` are plain `date` columns (no time component),
// so plain string dates are the correct representation throughout.
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parses a 'YYYY-MM-DD' string as a local date, not `new Date(iso)`'s
 *  UTC-midnight interpretation — see the note on `toISO` above. */
function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Monday-first 6x7 grid covering the given month, including the
 *  leading/trailing days from adjacent months needed to fill full weeks. */
function buildGrid(month: Date): Date[] {
  const first = startOfMonth(month);
  const firstWeekday = (first.getDay() + 6) % 7; // 0 = Monday
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - firstWeekday);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

/**
 * A real month-view date-range picker backed by actual booked dates for
 * the car (`useBookedRanges`, migration 0009's `car_booked_ranges`
 * function — the only honest way to show availability, since `bookings`'
 * own RLS hides other renters' rows from a browsing customer). Click a
 * start day, then an end day; clicking before the start or across a
 * booked date restarts the selection rather than erroring, matching how
 * every real booking calendar behaves.
 */
export function AvailabilityCalendar({
  carId,
  startDate,
  endDate,
  onSelect,
}: {
  carId: string;
  startDate: string | null;
  endDate: string | null;
  onSelect: (start: string, end: string) => void;
}) {
  const { ranges, loading } = useBookedRanges(carId);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(startDate ? parseISO(startDate) : new Date()));
  const [draftStart, setDraftStart] = useState<string | null>(null);

  const todayISO = toISO(new Date());
  const effectiveStart = draftStart ?? startDate;
  const effectiveEnd = draftStart ? null : endDate;

  const isBooked = (iso: string) => (ranges ? rangesOverlap(iso, iso, ranges) : false);

  const hasBookedBetween = (from: string, to: string) => {
    if (!ranges) return false;
    let d = parseISO(from);
    const end = parseISO(to);
    while (d < end) {
      d.setDate(d.getDate() + 1);
      const iso = toISO(d);
      if (iso < to && isBooked(iso)) return true;
    }
    return false;
  };

  const handleDayClick = (iso: string) => {
    if (iso < todayISO || isBooked(iso)) return;
    if (!draftStart) {
      setDraftStart(iso);
      return;
    }
    if (iso <= draftStart || hasBookedBetween(draftStart, iso)) {
      setDraftStart(iso);
      return;
    }
    onSelect(draftStart, iso);
    setDraftStart(null);
  };

  const grid = useMemo(() => buildGrid(viewMonth), [viewMonth]);
  const canGoBack = startOfMonth(viewMonth) > startOfMonth(new Date());

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => canGoBack && setViewMonth((m) => addMonths(m, -1))}
          disabled={!canGoBack}
          aria-label="Previous month"
          className="grid h-9 w-9 place-items-center rounded-full text-ink transition-colors hover:bg-panel disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Icon name="chevronLeft" size={18} />
        </button>
        <p className="font-display text-[15px] font-semibold text-ink">
          {MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}
        </p>
        <button
          type="button"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          aria-label="Next month"
          className="grid h-9 w-9 place-items-center rounded-full text-ink transition-colors hover:bg-panel"
        >
          <Icon name="chevronRight" size={18} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-y-1">
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-faint">
            {w}
          </span>
        ))}

        {grid.map((d, i) => {
          const iso = toISO(d);
          const inMonth = d.getMonth() === viewMonth.getMonth();
          const past = iso < todayISO;
          const booked = isBooked(iso);
          const disabled = past || booked || !inMonth;
          const isStart = iso === effectiveStart;
          const isEnd = iso === effectiveEnd;
          const inRange =
            effectiveStart && effectiveEnd ? iso > effectiveStart && iso < effectiveEnd : false;

          return (
            <div key={i} className="relative py-0.5">
              {(inRange || isEnd) && <div className="absolute inset-y-0 left-0 right-1/2 bg-accent-050" />}
              {(inRange || isStart) && <div className="absolute inset-y-0 left-1/2 right-0 bg-accent-050" />}
              <button
                type="button"
                onClick={() => handleDayClick(iso)}
                disabled={disabled}
                aria-label={iso}
                aria-pressed={isStart || isEnd}
                className={`relative z-10 mx-auto grid h-9 w-9 place-items-center rounded-full text-[13.5px] font-medium transition-all duration-150 ${
                  isStart || isEnd
                    ? 'bg-accent-bright text-noir shadow-hair'
                    : !inMonth
                      ? 'text-transparent'
                      : booked
                        ? 'text-faint line-through decoration-line-strong'
                        : past
                          ? 'text-faint'
                          : 'text-ink hover:bg-panel'
                } ${disabled && inMonth && !booked ? 'cursor-not-allowed' : ''} ${disabled ? 'pointer-events-none' : ''}`}
              >
                {d.getDate()}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-4 text-[12.5px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-accent-bright" /> Selected
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border border-line-strong text-center text-[9px] leading-[10px] text-faint">–</span>
          Booked
        </span>
        {loading && <span className="ml-auto animate-pulse">Checking availability…</span>}
      </div>
    </div>
  );
}
