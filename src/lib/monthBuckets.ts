import { uiLocale } from './i18n/uiLocale';

/** Counts per calendar month for the last `n` months (oldest first), from ISO date strings. */
export function monthBuckets(dates: (string | null | undefined)[], n = 6): { values: number[]; labels: string[] } {
  const now = new Date();
  const keys = Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString(uiLocale(), { month: 'short' }).slice(0, 1).toUpperCase() };
  });
  const counts = new Map(keys.map((k) => [k.key, 0]));
  for (const d of dates) {
    const k = d?.slice(0, 7);
    if (k && counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return { values: keys.map((k) => counts.get(k.key) ?? 0), labels: keys.map((k) => k.label) };
}
