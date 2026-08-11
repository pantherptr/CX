import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from '../components/Icon';
import { useAuth } from './auth';
import { supabase, isSupabaseConfigured } from './supabase';

export interface Toast {
  id: number;
  title: string;
  desc?: string;
  icon?: IconName;
}

interface AppState {
  favorites: Set<string>;
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
  toasts: Toast[];
  toast: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<AppState | null>(null);

let toastId = 0;

/**
 * Nested inside AuthProvider (see main.tsx), so it can read the signed-in
 * session directly — favorites are per-user, backed by the real
 * `favorites` table (RLS-scoped to the owning user), not local-only state.
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = ++toastId;
      setToasts((prev) => [...prev, { ...t, id }]);
      setTimeout(() => dismiss(id), 3600);
    },
    [dismiss],
  );

  useEffect(() => {
    if (!session || !isSupabaseConfigured) {
      setFavorites(new Set());
      return;
    }
    let cancelled = false;
    supabase
      .from('favorites')
      .select('car_id')
      .eq('user_id', session.user.id)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast({ title: 'Could not load your saved cars', desc: error.message, icon: 'info' });
          return;
        }
        setFavorites(new Set((data ?? []).map((r) => r.car_id as string)));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const toggleFavorite = useCallback(
    (id: string) => {
      if (!session) {
        toast({
          title: 'Sign in to save cars',
          desc: 'Create a free account to keep a list of your favourites.',
          icon: 'heart',
        });
        return;
      }
      if (!isSupabaseConfigured) return;

      const uid = session.user.id;
      const wasFav = favorites.has(id);

      setFavorites((prev) => {
        const next = new Set(prev);
        if (wasFav) next.delete(id);
        else next.add(id);
        return next;
      });

      const write = wasFav
        ? supabase.from('favorites').delete().eq('user_id', uid).eq('car_id', id)
        : supabase.from('favorites').insert({ user_id: uid, car_id: id });

      write.then(({ error }) => {
        if (!error) {
          toast({ title: wasFav ? 'Removed from saved' : 'Saved to your list', icon: 'heart' });
          return;
        }
        // Revert the optimistic update on failure.
        setFavorites((prev) => {
          const next = new Set(prev);
          if (wasFav) next.add(id);
          else next.delete(id);
          return next;
        });
        toast({ title: 'Could not update saved cars', desc: error.message, icon: 'info' });
      });
    },
    [session, favorites, toast],
  );

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites]);

  const value = useMemo(
    () => ({ favorites, toggleFavorite, isFavorite, toasts, toast, dismiss }),
    [favorites, toggleFavorite, isFavorite, toasts, toast, dismiss],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function Toaster() {
  const { toasts, dismiss } = useApp();
  return (
    <div className="fixed z-[100] bottom-24 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2.5 w-[calc(100%-2rem)] max-w-sm sm:left-auto sm:right-6 sm:bottom-6 sm:translate-x-0 sm:items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="animate-scale-in w-full flex items-start gap-3 bg-ink text-white rounded-2xl px-4 py-3.5 shadow-pop"
        >
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/12 text-white">
            <Icon name={t.icon ?? 'checkCircle'} size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug">{t.title}</p>
            {t.desc && <p className="text-[13px] text-white/65 mt-0.5 leading-snug">{t.desc}</p>}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            className="text-white/50 hover:text-white transition-colors"
            aria-label="Dismiss"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
