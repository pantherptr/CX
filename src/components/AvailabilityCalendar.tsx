import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { useBookedRanges, rangesOverlap } from '../lib/data/bookings';
import { WEEKDAYS, MONTH_NAMES, toISO, parseISO, startOfMonth, addMonths, buildMonthGrid as buildGrid } from '../lib/calendarGrid';

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
        <p className="font-display text-copy font-semibold text-ink">
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
          <span key={w} className="py-1 text-center text-label font-semibold uppercase tracking-wide text-faint">
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
                className={`relative z-10 mx-auto grid h-9 w-9 place-items-center rounded-full text-detail font-medium transition-all duration-150 ${
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

      <div className="mt-4 flex items-center gap-4 text-caption text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-accent-bright" /> Selected
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border border-line-strong text-center text-nano leading-[10px] text-faint">–</span>
          Booked
        </span>
        {loading && <span className="ml-auto animate-pulse">Checking availability…</span>}
      </div>
    </div>
  );
}
