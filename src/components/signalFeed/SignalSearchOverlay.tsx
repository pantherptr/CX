import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { searchEmpirePosts, type EmpirePost } from '../../lib/data/empireFeed';

/** A lightweight fullscreen search — not a separate page, no filters UI
 *  beyond the category chips the feed already has. Debounced ilike over
 *  title/body via `search_empire_posts`; empty query shows nothing (no
 *  "browse all" behavior — the feed already does that job). */
export function SignalSearchOverlay({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EmpirePost[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    setSearching(true);
    const handle = window.setTimeout(() => {
      searchEmpirePosts(q)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [query]);

  return (
    <div className="fixed inset-0 z-[250] flex flex-col bg-bg" role="dialog" aria-modal="true">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 pt-safe">
        <button onClick={onClose} aria-label="Close search" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-panel">
          <Icon name="chevronLeft" size={20} />
        </button>
        <div className="relative flex-1">
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Signal — news, cars, offers…"
            className="input !py-2 !pl-9"
          />
        </div>
      </div>

      <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-4 py-3">
        {!query.trim() ? (
          <p className="py-16 text-center text-detail text-muted">Search official Signal posts by keyword or category.</p>
        ) : searching ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 w-full rounded-xl" />)}
          </div>
        ) : results && results.length === 0 ? (
          <p className="py-16 text-center text-detail text-muted">No Signal posts match “{query.trim()}”.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {(results ?? []).map((r) => (
              <Link
                key={r.id}
                to={`/signal/post/${r.id}`}
                onClick={onClose}
                className="pressable flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5 hover:border-line-strong"
              >
                {r.mediaUrls[0] ? (
                  <img src={r.mediaUrls[0]} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-panel text-muted"><Icon name="image" size={16} /></span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-detail font-semibold text-ink">{r.title || r.body}</p>
                  <p className="text-caption text-muted">{r.category.replace('_', ' ')}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
