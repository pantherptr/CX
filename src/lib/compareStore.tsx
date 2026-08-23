import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from './store';

const COMPARE_KEY = 'cx-compare-cars';
const MAX_COMPARE = 4;

interface CompareState {
  ids: string[];
  isComparing: (carId: string) => boolean;
  toggleCompare: (carId: string) => void;
  removeFromCompare: (carId: string) => void;
  clearCompare: () => void;
}

const Ctx = createContext<CompareState | null>(null);

/**
 * Which cars a visitor has staged for side-by-side comparison — purely a
 * local scratchpad (like a browser's own tab group), not user-account
 * data, so localStorage is the right home for it rather than Supabase:
 * there's nothing here worth syncing across devices, and it should reset
 * cleanly if the user clears their browser. Capped at four, matching
 * every comparison UI on this kind of site (Enterprise, Hertz, Kayak).
 */
export function CompareProvider({ children }: { children: ReactNode }) {
  const { toast } = useApp();
  const [ids, setIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(COMPARE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(0, MAX_COMPARE) : [];
    } catch {
      return [];
    }
  });

  // Storage is a pure side effect of whatever `ids` settles to — kept
  // separate from the state update itself so every setter below can use
  // the functional `setIds(prev => ...)` form safely. That matters
  // because two toggles fired in the same tick (e.g. two synchronous
  // clicks React batches together) must each see the *other's* result,
  // not both compute against the same stale `ids` and have the second
  // overwrite the first.
  useEffect(() => {
    try {
      localStorage.setItem(COMPARE_KEY, JSON.stringify(ids));
    } catch {
      // Storage unavailable — the selection just won't survive a reload.
    }
  }, [ids]);

  // A toast fired from *inside* the `setIds` updater above updates
  // AppProvider (a different component's state) mid-render, which React
  // rightly flags as an error. `idsRef` mirrors the latest committed
  // `ids` so the toggle handler can decide what happened and toast for
  // it from a normal event-handler context instead — outside render,
  // where a cross-component setState is perfectly fine. The array
  // mutation itself still goes through the functional `setIds` form
  // above, so that stays correct even if two toggles land in the same
  // tick; only the toast copy could theoretically lag by one such tick,
  // which no real click sequence can trigger.
  const idsRef = useRef(ids);
  useEffect(() => {
    idsRef.current = ids;
  }, [ids]);

  const isComparing = useCallback((carId: string) => ids.includes(carId), [ids]);

  const toggleCompare = useCallback(
    (carId: string) => {
      const current = idsRef.current;
      if (current.includes(carId)) {
        setIds((prev) => prev.filter((id) => id !== carId));
        toast({ title: 'Removed from compare', icon: 'compare' });
        return;
      }
      if (current.length >= MAX_COMPARE) {
        toast({ title: `You can compare up to ${MAX_COMPARE} cars`, desc: 'Remove one to add another.', icon: 'compare' });
        return;
      }
      setIds((prev) => (prev.includes(carId) || prev.length >= MAX_COMPARE ? prev : [...prev, carId]));
      toast({ title: 'Added to compare', desc: current.length === 0 ? 'Add another car to compare them.' : undefined, icon: 'compare' });
    },
    [toast],
  );

  const removeFromCompare = useCallback((carId: string) => setIds((prev) => prev.filter((id) => id !== carId)), []);
  const clearCompare = useCallback(() => setIds([]), []);

  const value = useMemo(
    () => ({ ids, isComparing, toggleCompare, removeFromCompare, clearCompare }),
    [ids, isComparing, toggleCompare, removeFromCompare, clearCompare],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCompare() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCompare must be used within CompareProvider');
  return ctx;
}
