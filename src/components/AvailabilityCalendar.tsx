import { useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { motion, AnimatePresence, useReducedMotion } from './motionKit';
import { useBookedRanges, rangesOverlap, type BookedRange } from '../lib/data/bookings';
import { WEEKDAYS, MONTH_NAMES, toISO, parseISO, startOfMonth, addMonths, buildMonthGrid as buildGrid } from '../lib/calendarGrid';
import { useLocale } from '../lib/i18n';

interface FlightPath {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/**
 * A date-range picker backed by the car's real booked dates (`useBookedRanges`,
 * migration 0009's `car_booked_ranges` — the only honest way to show
 * availability, since `bookings`' own RLS hides other renters' rows from a
 * browsing customer).
 *
 * Tap a pick-up day, then a return day. While the pick-up is chosen and the
 * pointer moves over later days, the trip is previewed (a soft band and the
 * number of days); tapping an earlier day, or one beyond a booked date, simply
 * starts over. Cells are 44 px, today carries a dot, booked days are struck
 * through, and months slide — swipe or use the arrows. Completing a range races
 * a small car from the first cell to the last (skipped under reduced motion).
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
  const { t } = useLocale();
  const { ranges: rawRanges, loading } = useBookedRanges(carId);
  const ranges = useMemo<BookedRange[] | null>(() => {
    if (!rawRanges || !excludeRange) return rawRanges;
    return rawRanges.filter((r) => !(r.startDate === excludeRange.start && r.endDate === excludeRange.end));
  }, [rawRanges, excludeRange]);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(startDate ? parseISO(startDate) : new Date()));
  const [dir, setDir] = useState(1);
  const [draftStart, setDraftStart] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
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
    const d = parseISO(from);
    const end = parseISO(to);
    while (d < end) {
      d.setDate(d.getDate() + 1);
      const iso = toISO(d);
      if (iso < to && isBooked(iso)) return true;
    }
    return false;
  };

  // the trip being previewed while the pointer is over a later day
  const previewEnd = draftStart && hover && hover > draftStart && !isBooked(hover) && !hasBookedBetween(draftStart, hover) ? hover : null;
  const bandEnd = effectiveEnd ?? previewEnd;
  const previewDays = draftStart && previewEnd ? Math.round((parseISO(previewEnd).getTime() - parseISO(draftStart).getTime()) / 86400000) : 0;

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
    setHover(null);
  };

  const grid = useMemo(() => buildGrid(viewMonth), [viewMonth]);
  const canGoBack = startOfMonth(viewMonth) > startOfMonth(new Date());
  const go = (n: number) => {
    if (n < 0 && !canGoBack) return;
    setDir(n);
    setViewMonth((m) => addMonths(m, n));
  };

  return (
    <div className="w-full select-none">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={!canGoBack}
          aria-label={t('Previous month')}
          className="grid h-10 w-10 place-items-center rounded-full text-ink transition-colors hover:bg-panel active:bg-panel-2 disabled:opacity-25 disabled:hover:bg-transparent"
        >
          <Icon name="chevronLeft" size={19} />
        </button>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={viewMonth.toISOString()}
            initial={{ opacity: 0, y: dir * 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: dir * -6 }}
            transition={{ duration: 0.16 }}
            className="font-display text-copy font-semibold text-ink"
          >
            {t(MONTH_NAMES[viewMonth.getMonth()])} {viewMonth.getFullYear()}
          </motion.p>
        </AnimatePresence>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label={t('Next month')}
          className="grid h-10 w-10 place-items-center rounded-full text-ink transition-colors hover:bg-panel active:bg-panel-2"
        >
          <Icon name="chevronRight" size={19} />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7">
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1.5 text-center text-label font-semibold uppercase tracking-wide text-faint">
            {t(w)}
          </span>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={viewMonth.toISOString()}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: dir * 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: dir * -28 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.18}
          onDragEnd={(_, info) => {
            if (info.offset.x < -50) go(1);
            else if (info.offset.x > 50) go(-1);
          }}
          style={{ touchAction: 'pan-y' }}
        >
          <div ref={gridRef} className="relative grid grid-cols-7" onMouseLeave={() => setHover(null)}>
            {grid.map((d, i) => {
              const iso = toISO(d);
              const inMonth = d.getMonth() === viewMonth.getMonth();
              const past = iso < todayISO;
              const booked = isBooked(iso);
              const disabled = past || booked || !inMonth;
              const isStart = iso === effectiveStart;
              const isEnd = iso === effectiveEnd;
              const isPreviewEnd = !effectiveEnd && iso === previewEnd;
              const inBand = effectiveStart && bandEnd ? iso > effectiveStart && iso < bandEnd : false;
              const bandLeft = inMonth && (inBand || iso === bandEnd) && !(isStart && !bandEnd);
              const bandRight = inMonth && (inBand || (isStart && !!bandEnd));
              const isToday = iso === todayISO;

              return (
                <div key={i} className="relative flex h-11 items-center justify-center">
                  {bandLeft && <div className="absolute inset-y-[3px] left-0 right-1/2 bg-ink/[0.07]" />}
                  {bandRight && <div className="absolute inset-y-[3px] left-1/2 right-0 bg-ink/[0.07]" />}
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) cellRefs.current.set(iso, el);
                      else cellRefs.current.delete(iso);
                    }}
                    onClick={() => handleDayClick(iso)}
                    onMouseEnter={() => !disabled && setHover(iso)}
                    disabled={disabled}
                    aria-label={iso}
                    aria-pressed={isStart || isEnd}
                    className={`relative z-10 grid h-10 w-10 place-items-center rounded-full text-body font-medium transition-[background-color,color,transform,box-shadow] duration-150 active:scale-90 ${
                      isStart || isEnd
                        ? 'bg-ink text-white shadow-hair'
                        : isPreviewEnd
                          ? 'bg-surface text-ink ring-2 ring-ink'
                          : !inMonth
                            ? 'text-transparent'
                            : booked
                              ? 'text-faint line-through decoration-line-strong'
                              : past
                                ? 'text-faint/70'
                                : 'text-ink hover:bg-panel'
                    } ${disabled ? 'pointer-events-none' : ''}`}
                  >
                    {d.getDate()}
                    {isToday && inMonth && !isStart && !isEnd && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-ink" />}
                  </button>
                </div>
              );
            })}

            <AnimatePresence>
              {flight && (
                <motion.div
                  key="car-flight"
                  className="pointer-events-none absolute left-0 top-0 z-20 text-ink"
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
        </motion.div>
      </AnimatePresence>

      <div className="mt-3 flex min-h-5 items-center gap-4 text-caption text-muted">
        {draftStart ? (
          <span className="font-medium text-ink">{previewDays > 0 ? `${previewDays} ${previewDays === 1 ? t('day') : t('days')}` : t('Now choose the return day')}</span>
        ) : (
          <>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-ink" /> {t('Selected')}</span>
            <span className="flex items-center gap-1.5"><span className="text-faint line-through">12</span> {t('Booked')}</span>
          </>
        )}
        {loading && <span className="ml-auto animate-pulse">{t('Checking availability…')}</span>}
      </div>
    </div>
  );
}
