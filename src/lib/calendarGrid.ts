/**
 * Pure month-grid date math shared by every calendar view in the app
 * (the renter's `AvailabilityCalendar` date-range picker and the host's
 * read-only fleet calendar). Extracted so both stay pixel-for-pixel
 * consistent and a date-math fix only has to happen once.
 *
 * Deliberately local-only throughout: `Date`s here are always constructed
 * via local arithmetic (`new Date(y, m, d)`), so they must be formatted
 * back the same way. `toISOString()` converts to UTC first — for any
 * non-UTC positive timezone offset that silently shifts a local midnight
 * back to the previous UTC day, so a cell visibly labelled "18" would
 * compare as booked/selected against "17". Bookings' `start_date`/
 * `end_date` are plain `date` columns (no time component), so plain
 * string dates are the correct representation throughout.
 */

export const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parses a 'YYYY-MM-DD' string as a local date, not `new Date(iso)`'s
 *  UTC-midnight interpretation — see the module note above. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Monday-first 6x7 grid covering the given month, including the
 *  leading/trailing days from adjacent months needed to fill full weeks. */
export function buildMonthGrid(month: Date): Date[] {
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
