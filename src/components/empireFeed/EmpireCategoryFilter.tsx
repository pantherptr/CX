import { EMPIRE_CATEGORIES, type EmpireCategory } from '../../lib/data/empireFeed';

/** A minimal, fast horizontal category filter — ALL plus the real 8
 *  categories (not a lossy remapping into fewer buckets, which would
 *  make posts in an omitted category unreachable by any filter). State
 *  lives in the parent (`Empire.tsx`), reset on remount — "remembered
 *  during the current Empire session" reasonably means the lifetime of
 *  this page instance. */
export function EmpireCategoryFilter({
  value,
  onChange,
}: {
  value: EmpireCategory | null;
  onChange: (category: EmpireCategory | null) => void;
}) {
  return (
    <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto pb-1">
      <button
        onClick={() => onChange(null)}
        className={`shrink-0 rounded-full px-3.5 py-1.5 text-caption font-semibold uppercase tracking-wide transition-colors ${
          value === null ? 'bg-ink text-white' : 'bg-panel text-ink-soft hover:bg-panel-2'
        }`}
      >
        All
      </button>
      {EMPIRE_CATEGORIES.map((c) => (
        <button
          key={c.value}
          onClick={() => onChange(c.value)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-caption font-semibold uppercase tracking-wide transition-colors ${
            value === c.value ? 'bg-ink text-white' : 'bg-panel text-ink-soft hover:bg-panel-2'
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
