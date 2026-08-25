import { Link, useLocation } from 'react-router-dom';
import { useCompare } from '../lib/compareStore';
import { useCars } from '../lib/data/cars';
import { unsplash } from '../lib/img';
import { Icon } from './Icon';

/**
 * The floating "you have cars staged for comparison" bar — mounted once
 * at the app root (see `App.tsx`, next to `CartDrawer`/`Toaster`) so it
 * persists across navigation exactly like a real cart. Renders nothing
 * once the compare list is empty, so it costs nothing on every other page.
 */
export function CompareTray() {
  const { ids, removeFromCompare, clearCompare } = useCompare();
  const { cars } = useCars();
  const { pathname } = useLocation();

  // The compare page itself already shows everything this tray would —
  // surfacing it there too would just cover the table it's pointing at.
  if (ids.length === 0 || pathname === '/compare') return null;

  const selected = ids.map((id) => cars?.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 sm:bottom-6">
      <div className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-pop backdrop-blur-xl">
        <div className="flex -space-x-2.5">
          {ids.slice(0, 4).map((id) => {
            const car = selected.find((c) => c.id === id);
            return (
              <div key={id} className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border-2 border-surface bg-panel-2">
                {car ? (
                  <img src={unsplash(car.images[0], 120)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="skeleton h-full w-full" />
                )}
                <button
                  onClick={() => removeFromCompare(id)}
                  aria-label="Remove from compare"
                  className="pressable absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-ink text-white"
                >
                  <Icon name="x" size={9} strokeWidth={3} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-detail font-medium text-ink">
            {ids.length} car{ids.length > 1 ? 's' : ''} to compare
          </p>
          <button onClick={clearCompare} className="text-caption text-muted transition-colors hover:text-ink">
            Clear all
          </button>
        </div>
        <Link to="/compare" className="btn btn-accent-bright btn-sm shrink-0">
          Compare {ids.length > 1 ? `(${ids.length})` : ''} <Icon name="arrowRight" size={15} />
        </Link>
      </div>
    </div>
  );
}
