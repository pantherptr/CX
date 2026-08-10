import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { savedCarIds } from '../data/content';
import { Icon, type IconName } from '../components/Icon';

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

export function AppProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(savedCarIds),
  );
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

  const toggleFavorite = useCallback(
    (id: string) => {
      setFavorites((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [],
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
    <div className="fixed z-[100] bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2.5 w-[calc(100%-2rem)] max-w-sm sm:left-auto sm:right-6 sm:translate-x-0 sm:items-end">
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
