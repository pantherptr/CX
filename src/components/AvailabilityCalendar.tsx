import { useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { motion, AnimatePresence, useReducedMotion } from './motionKit';
import { useBookedRanges, rangesOverlap, type BookedRange } from '../lib/data/bookings';
import { WEEKDAYS, MONTH_NAMES, toISO, parseISO, startOfMonth, addMonths, buildMonthGrid as buildGrid } from '../lib/calendarGrid';

interface FlightPath {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/**
 * A real month-view date-range picker backed by actual booked dates for
 * the car (`useBookedRanges`, migration 0009's `car_booked_ranges`
 * function — the only honest way to show availability, since `bookings`'
 * own RLS hides other renters' rows from a browsing customer). Click a
 * start day, then an end day; clicking before the start or across a
 * booked date restarts the selection rather than erroring, matching how
 * every real booking calendar behaves.
 *
 * The one signature flourish: completing a range (the second click) races
 * a small car glyph from the pick-up cell to the return cell, accelerating
 * in and fading out on arrival — purely decorative, skipped entirely
 * under reduced motion or when either cell isn't in the currently
 * rendered month (nothing sensible to fly from/to in that case).
 */
export function AvailabilityCalendar({
  carId,
  startDate,
  endDate,
  onSelect,
  excludeRange,
}: {
  carId: string;
  startDate: string | null;
  endDate: string | null;
  onSelect: (start: string, end: string) => void;
  /** Drops a single real range matching these exact dates before
   *  computing booked/disabled cells — used when modifying an existing
   *  booking's own dates, which would otherwise show as "booked" against
   *  itself (`car_booked_ranges` has no per-caller exclusion). */
  excludeRange?: { start: string; end: string };
}) {
  const { ranges: rawRanges, loading } = useBookedRanges(carId);
  const ranges = useMemo<BookedRange[] | null>(() => {
    if (!rawRanges || !excludeRange) return rawRanges;
    return rawRanges.filter((r) => !(r.startDate === excludeRange.start && r.endDate === excludeRange.end));
  }, [rawRanges, excludeRange]);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(startDate ? parseISO(startDate) : new Date()));
  const [draftStart, setDraftStart] = useState<string | null>(null);
  const [flight, setFlight] = useState<FlightPath | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const reduceMotion = !!useReducedMotion();

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
    if (!reduceMotion && gridRef.current) {
      const fromEl = cellRefs.current.get(draftStart);
      const toEl = cellRefs.current.get(iso);
      if (fromEl && toEl) {
        const gridRect = gridRef.current.getBoundingClientRect();
        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();
        setFlight({
          from: { x: fromRect.left + fromRect.width / 2 - gridRect.left, y: fromRect.top + fromRect.height / 2 - gridRect.top },
          to: { x: toRect.left + toRect.width / 2 - gridRect.left, y: toRect.top + toRect.height / 2 - gridRect.top },
        });
      }
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

      <div ref={gridRef} className="relative mt-3 grid grid-cols-7 gap-y-1">
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
                ref={(el) => {
                  if (el) cellRefs.current.set(iso, el);
                  else cellRefs.current.delete(iso);
                }}
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

        <AnimatePresence>
          {flight && (
            <motion.div
              key="car-flight"
              className="pointer-events-none absolute left-0 top-0 z-20 text-accent-bright"
              initial={{ x: flight.from.x - 9, y: flight.from.y - 9, opacity: 1 }}
              animate={{ x: flight.to.x - 9, y: flight.to.y - 9, opacity: [1, 1, 0] }}
              transition={{ duration: 0.55, ease: 'easeIn', opacity: { duration: 0.55, times: [0, 0.7, 1] } }}
              onAnimationComplete={() => setFlight(null)}
            >
              <Icon name="car" size={18} />
            </motion.div>
          )}
        </AnimatePresence>
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
