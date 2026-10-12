import { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './auth';

/** Which side of the app a host is working in: their Host dashboard or the Driver side. Remembered, so
 *  going from the Host dashboard to Signal, Messages, Settings or a car and back keeps the host menu,
 *  the Home tab and the drawer on the host side instead of dropping to Driver. */
export type Workspace = 'host' | 'driver';
const KEY = 'cx-workspace';
const listeners = new Set<() => void>();
let current: Workspace = (() => {
  try { return localStorage.getItem(KEY) === 'host' ? 'host' : 'driver'; } catch { return 'driver'; }
})();

export function setWorkspace(w: Workspace) {
  if (w === current) return;
  current = w;
  try { localStorage.setItem(KEY, w); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function useWorkspace(): Workspace {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => current,
    () => 'driver',
  );
}

/** Mounted once in the app: the Host pages mean "host"; the Driver home means "driver". Everything else
 *  (Signal, chat, settings, browse, cars) keeps whatever side you were on. */
export function WorkspaceTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname === '/host' || pathname.startsWith('/host/')) setWorkspace('host');
    else if (pathname === '/dashboard') setWorkspace('driver');
  }, [pathname]);
  return null;
}

/** Where "home" is for the signed-in person: the Host dashboard for a host on the Host side, else the
 *  Driver dashboard; the landing page when signed out. */
export function useHomePath(): string {
  const { session, profile } = useAuth();
  const w = useWorkspace();
  if (!session) return '/';
  return profile?.is_host && w === 'host' ? '/host' : '/dashboard';
}
