import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Icon } from './Icon';
import { Img } from './motion';
import { Logo } from './primitives';
import { SignalLogo } from './SignalLogo';
import { useAuth } from '../lib/auth';
import { customerNav, hostNav, type NavItem } from '../lib/nav';
import { useUnreadMessageCount } from '../lib/data/messages';
import { useViewportBottomGap } from '../lib/useViewportGap';
import { haptics } from '../lib/native';
import { motion, AnimatePresence, useReducedMotion, SPRING_SMOOTH, ActivePill } from './motionKit';

/** A flick or a drag past this far to the right closes the drawer — the
 *  same direction it slid in from, so the gesture undoes the entrance. */
const DRAG_CLOSE_PX = 90;
const DRAG_CLOSE_VELOCITY = 500;

const linkClass = (isActive: boolean) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-body transition-colors active:bg-panel ${
    isActive ? 'bg-panel font-semibold text-ink' : 'font-medium text-ink-soft hover:bg-panel'
  }`;

/** Which single item is "you are here". NavLink alone can't decide this:
 *  it ignores the hash (so Overview, My Trips, Saved and Rewards — all
 *  `/dashboard#…` — would light up together) and the nav repeats a target
 *  (Profile and Settings are both `/settings`). Exact path+hash wins;
 *  otherwise the first hash-less item for the path (so an unlisted
 *  `/settings#notifications` still marks Profile, not nothing). */
function activeNavLabel(items: NavItem[], pathname: string, hash: string): string | null {
  const exact = items.find((n) => {
    const [path, frag] = n.to.split('#');
    return path === pathname && (frag ? `#${frag}` : '') === hash;
  });
  if (exact) return exact.label;
  return items.find((n) => !n.to.includes('#') && n.to === pathname)?.label ?? null;
}

/** The one authenticated-app mobile drawer — shared by `AppNavbar` (pages
 *  with no sidebar: Browse, car details, help, booking, list-a-car) and
 *  `DashboardShell` (pages with a sidebar: dashboard, messages, settings…).
 *  These used to be two separately-maintained drawers that had quietly
 *  drifted apart — one slid in from the right with a spring and carried
 *  the full nav (mode toggle, Owner/Admin, SIGNAL, help), the other slid
 *  in from the left with a plain CSS keyframe and a thinner link list —
 *  so the menu visibly changed shape depending on which page you opened it
 *  from. Centralizing it here means every authenticated page opens the
 *  exact same drawer. */
export function AppMobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<'customer' | 'host'>('customer');
  const { pathname, hash } = useLocation();
  const reduceMotion = !!useReducedMotion();
  const gap = useViewportBottomGap();
  const { session, profile, signOut } = useAuth();
  const isHost = !!profile?.is_host;
  const unreadCount = useUnreadMessageCount(session?.user.id);
  const nav = mode === 'host' && isHost ? hostNav(unreadCount) : customerNav(unreadCount);
  const activeLabel = activeNavLabel(nav, pathname, hash);

  const displayName = profile?.full_name || session?.user.email?.split('@')[0] || 'Your account';
  const displayAvatar = profile?.avatar_url ?? null;

  useEffect(() => {
    onClose();
    // Only the route should close the drawer — including `onClose` here
    // would re-run this (harmlessly, but pointlessly) on every parent
    // re-render that hands down a new function identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => void (document.body.style.overflow = '');
  }, [open]);

  // Open on the side of the app you're actually in — a host opening the
  // menu from their Host dashboard shouldn't land on the Driver list.
  useEffect(() => {
    if (open) setMode(isHost && pathname.startsWith('/host') ? 'host' : 'customer');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const switchMode = (next: 'customer' | 'host') => {
    if (next === mode) return;
    haptics.tick();
    setMode(next);
  };

  const handleSignOut = async () => {
    onClose();
    await signOut();
    // Hard navigation — see DashboardShell's own handleSignOut for why a
    // plain navigate('/') here races ProtectedRoute's redirect and can lose.
    window.location.assign('/');
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-x-0 top-0 z-[70] lg:hidden" style={{ bottom: gap }}>
          <motion.div
            className="absolute inset-0 bg-ink/45 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.22 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-0 flex h-full w-full flex-col overflow-hidden bg-surface text-ink shadow-pop"
            initial={reduceMotion ? false : { x: '100%' }}
            animate={{ x: 0 }}
            exit={reduceMotion ? undefined : { x: '100%' }}
            transition={reduceMotion ? { duration: 0 } : SPRING_SMOOTH}
            // Swipe right to dismiss. Constrained at 0 on both sides but
            // fully elastic to the right, so the panel follows the finger
            // 1:1 outward, resists inward, and springs home on a short
            // drag. Motion sets `touch-action: pan-y` for an x-drag, so the
            // nav list's own vertical scroll is untouched.
            drag={reduceMotion ? false : 'x'}
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0.04, right: 1 }}
            onDragEnd={(_, info) => {
              if (info.offset.x > DRAG_CLOSE_PX || info.velocity.x > DRAG_CLOSE_VELOCITY) onClose();
            }}
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5 pt-safe">
              <Logo variant="wordmark" />
              <button
                onClick={onClose}
                className="grid h-10 w-10 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel hover:text-ink"
                aria-label="Close menu"
              >
                <Icon name="x" size={20} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-3">
              <img src="/brand/cx-bat.webp" alt="" aria-hidden="true" width={220} height={79} className="mx-auto mb-4 mt-1 h-12 w-auto select-none" draggable={false} />
              {isHost && (
                <div role="tablist" aria-label="Menu for" className="mb-3 flex gap-1 rounded-xl border border-line bg-panel/60 p-1">
                  {(
                    [
                      ['customer', 'Driver'],
                      ['host', 'Host'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={mode === id}
                      onClick={() => switchMode(id)}
                      className={`relative flex-1 rounded-lg py-2 text-center text-detail font-medium transition-colors duration-200 ${
                        mode === id ? 'text-white' : 'text-ink-soft'
                      }`}
                    >
                      {mode === id && <ActivePill layoutId="app-drawer-mode" className="rounded-lg bg-ink shadow-hair" />}
                      <span className="relative">{label}</span>
                    </button>
                  ))}
                </div>
              )}
              {profile?.is_owner ? (
                <NavLink
                  to="/owner"
                  onClick={onClose}
                  className="mb-3 flex items-center gap-3 rounded-xl border border-line bg-noir px-3 py-2.5 text-body font-medium text-white transition-colors hover:bg-noir-2"
                >
                  <Icon name="verified" size={19} className="text-accent-bright" />
                  Owner Control Center
                </NavLink>
              ) : profile?.is_admin ? (
                <NavLink
                  to="/admin"
                  onClick={onClose}
                  className="mb-3 flex items-center gap-3 rounded-xl border border-line bg-panel/60 px-3 py-2.5 text-body font-medium text-ink-soft transition-colors hover:bg-panel"
                >
                  <Icon name="shield" size={19} className="text-muted" />
                  Admin panel
                </NavLink>
              ) : null}
              <NavLink
                to="/signal"
                onClick={onClose}
                className={({ isActive }) =>
                  `group relative mb-3 flex items-center justify-between overflow-hidden rounded-xl border px-3 py-2.5 text-body font-bold transition-all duration-300 ${
                    isActive
                      ? 'border-accent-bright bg-accent-bright/15 text-ink'
                      : 'border-accent-bright/30 bg-accent-bright/[0.06] text-ink hover:border-accent-bright/55 hover:bg-accent-bright/10'
                  }`
                }
              >
                <span
                  className="pointer-events-none absolute inset-0 -z-10 opacity-0 blur-[12px] transition-opacity duration-300 group-hover:opacity-100"
                  style={{ background: 'radial-gradient(closest-side, rgba(0,212,71,0.3), transparent 75%)' }}
                />
                <span className="flex items-center gap-3">
                  <SignalLogo size={24} className="transition-transform duration-300 group-hover:scale-110" />
                  <span className="tracking-wide">SIGNAL</span>
                </span>
                <Icon name="chevronRight" size={16} className="text-accent-700 transition-transform duration-300 group-hover:translate-x-0.5" />
              </NavLink>
              <ul className="flex flex-col gap-0.5">
                {nav.map((n) => {
                  const isActive = n.label === activeLabel;
                  return (
                    <li key={n.label}>
                      <Link
                        to={n.to}
                        onClick={onClose}
                        aria-current={isActive ? 'page' : undefined}
                        className={linkClass(isActive)}
                      >
                        <Icon name={n.icon} size={19} className={isActive ? 'text-accent' : 'text-muted'} />
                        <span className="flex-1">{n.label}</span>
                        {n.badge && (
                          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-label font-semibold text-white">
                            {n.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="hairline my-3" />
              <Link
                to="/help"
                onClick={onClose}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-body font-medium text-ink-soft transition-colors hover:bg-panel active:bg-panel"
              >
                <Icon name="headset" size={19} className="text-muted" />
                Help &amp; Support
              </Link>
            </nav>

            <div className="shrink-0 border-t border-line p-3 pb-safe">
              <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                {displayAvatar ? (
                  <Img
                    src={displayAvatar}
                    alt=""
                    className="h-9 w-9 rounded-full object-cover"
                    fallback={
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-050 text-accent">
                        <Icon name="user" size={16} />
                      </span>
                    }
                  />
                ) : (
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-050 text-accent">
                    <Icon name="user" size={16} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-detail font-medium text-ink">{displayName}</p>
                  <p className="truncate text-caption text-muted">{session?.user.email}</p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-body text-danger hover:bg-panel"
              >
                <Icon name="logout" size={19} />
                Sign out
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
