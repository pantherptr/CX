import { EMPIRE_CATEGORIES, type EmpireCategory } from '../../lib/data/empireFeed';
import { ActivePill } from '../motionKit';

/** A minimal, fast horizontal category filter — ALL plus the real 8
 *  categories (not a lossy remapping into fewer buckets, which would
 *  make posts in an omitted category unreachable by any filter). State
 *  lives in the parent (`Signal.tsx`), reset on remount — "remembered
 *  during the current Signal session" reasonably means the lifetime of
 *  this page instance.
 *
 *  The active chip's dark fill is one shared `<ActivePill>` (Motion
 *  `layoutId`) rendered inside whichever button is currently active —
 *  it slides/resizes from the previous chip to the new one with real
 *  spring physics instead of each button independently cross-fading its
 *  own background color. */
export function SignalCategoryFilter({
  value,
  onChange,
}: {
  value: EmpireCategory | null;
  onChange: (category: EmpireCategory | null) => void;
}) {
  return (
    <div className="no-scrollbar sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-10 -mx-2.5 mb-2 flex gap-1.5 overflow-x-auto bg-bg/85 px-2.5 py-2 backdrop-blur-xl sm:-mx-4 sm:px-4 lg:top-16 lg:mx-0 lg:rounded-2xl lg:px-1">
      <button
        onClick={() => onChange(null)}
        className={`relative shrink-0 rounded-full px-4 py-2 text-detail font-semibold ${
          value === null ? 'text-white' : 'bg-panel text-ink-soft transition-colors hover:bg-panel-2'
        }`}
      >
        {value === null && <ActivePill layoutId="signal-category-pill" className="rounded-full bg-ink" />}
        <span className="relative">All</span>
      </button>
      {EMPIRE_CATEGORIES.map((c) => (
        <button
          key={c.value}
          onClick={() => onChange(c.value)}
          className={`relative shrink-0 rounded-full px-4 py-2 text-detail font-semibold ${
            value === c.value ? 'text-white' : 'bg-panel text-ink-soft transition-colors hover:bg-panel-2'
          }`}
        >
          {value === c.value && <ActivePill layoutId="signal-category-pill" className="rounded-full bg-ink" />}
          <span className="relative">{c.label}</span>
        </button>
      ))}
    </div>
  );
}
