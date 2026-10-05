import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
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
const MAX_TOASTS = 3;
const TOAST_MS = 3600;
const SWIPE_DISMISS_PX = 80;

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

  // Auto-dismiss lives in each <ToastItem> (so it can pause while being
  // read/touched), not here. A burst of toasts keeps only the newest few —
  // the oldest is dropped rather than stacking a wall up the screen.
  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { ...t, id }].slice(-MAX_TOASTS));
  }, []);

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

const SUCCESS_ICONS: ReadonlySet<IconName> = new Set(['checkCircle', 'check']);

/** One toast: owns its own auto-dismiss timer so it can pause while the
 *  pointer rests on it or a finger is on it (a long error message is
 *  readable instead of racing away), swipes sideways to dismiss, and
 *  animates out instead of vanishing mid-frame. */
function ToastItem({ t, onDismiss }: { t: Toast; onDismiss: (id: number) => void }) {
  const [leaving, setLeaving] = useState<false | 'fade' | 'left' | 'right'>(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef<number | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const remainingRef = useRef(TOAST_MS);
  const startedAtRef = useRef(0);

  const leave = useCallback(
    (how: 'fade' | 'left' | 'right') => {
      window.clearTimeout(timerRef.current);
      setLeaving(how);
      window.setTimeout(() => onDismiss(t.id), 200);
    },
    [onDismiss, t.id],
  );

  const resume = useCallback(() => {
    window.clearTimeout(timerRef.current);
    startedAtRef.current = Date.now();
    timerRef.current = window.setTimeout(() => leave('fade'), Math.max(600, remainingRef.current));
  }, [leave]);

  const pause = () => {
    window.clearTimeout(timerRef.current);
    remainingRef.current -= Date.now() - startedAtRef.current;
  };

  useEffect(() => {
    resume();
    return () => window.clearTimeout(timerRef.current);
  }, [resume]);

  const onTouchStart = (e: ReactTouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    pause();
  };
  const onTouchMove = (e: ReactTouchEvent) => {
    if (startXRef.current === null) return;
    setDragging(true);
    setDx(e.touches[0].clientX - startXRef.current);
  };
  const onTouchEnd = () => {
    startXRef.current = null;
    setDragging(false);
    if (Math.abs(dx) > SWIPE_DISMISS_PX) {
      leave(dx < 0 ? 'left' : 'right');
      return;
    }
    setDx(0);
    resume();
  };

  const transform =
    leaving === 'left'
      ? 'translateX(-120%)'
      : leaving === 'right'
        ? 'translateX(120%)'
        : leaving === 'fade'
          ? 'translateY(10px) scale(0.96)'
          : dx !== 0
            ? `translateX(${dx}px)`
            : undefined;

  const success = SUCCESS_ICONS.has(t.icon ?? 'checkCircle');

  return (
    <div
      role="status"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        transform,
        opacity: leaving ? 0 : dx !== 0 ? Math.max(0.35, 1 - Math.abs(dx) / 220) : undefined,
        transition: dragging ? 'none' : 'transform 220ms var(--ease-out-expo), opacity 200ms ease',
      }}
      className="pointer-events-auto flex w-full touch-pan-y select-none items-start gap-3 rounded-2xl bg-ink px-4 py-3.5 text-white shadow-pop animate-toast-in"
    >
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          success ? 'bg-accent-bright/20 text-accent-bright' : 'bg-white/12 text-white'
        }`}
      >
        <Icon name={t.icon ?? 'checkCircle'} size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{t.title}</p>
        {t.desc && <p className="mt-0.5 text-detail leading-snug text-white/65">{t.desc}</p>}
      </div>
      <button
        type="button"
        onClick={() => leave('fade')}
        className="-m-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        aria-label="Dismiss"
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

export function Toaster() {
  const { toasts, dismiss } = useApp();
  return (
    <div className="pointer-events-none fixed bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] left-1/2 z-[100] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col items-center gap-2.5 sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0 sm:items-end">
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}
