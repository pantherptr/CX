import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { useAuth } from '../lib/auth';
import { useMediaQuery } from './motion';
import { useUnreadMessageCount } from '../lib/data/messages';
import { DriveChallengeLauncher } from './game/DriveChallengeLauncher';

interface Item {
  label: string;
  to: string;
  icon: IconName;
  match: (pathname: string, hash: string) => boolean;
}

// The center slot opens the Drive Challenge modal rather than navigating —
// `to` is unused for it (rendered specially below) and `match` always
// false, since there's no route for a modal to be "on".
//
// Messages sits here rather than Saved Cars — a two-way, time-sensitive
// channel with a real business need (coordinating a pickup) earns a
// primary tab more than a passive wishlist does; Saved Cars is still one
// tap away via Profile's menu, same as My Trips, Rewards and Payments.
const items: Item[] = [
  { label: 'Home', to: '/dashboard', icon: 'grid', match: (p, h) => p === '/dashboard' && h === '' },
  { label: 'Explore', to: '/browse', icon: 'search', match: (p) => p === '/browse' },
  { label: 'Drive', to: '', icon: 'car', match: () => false },
  { label: 'Messages', to: '/messages', icon: 'message', match: (p) => p === '/messages' },
  { label: 'Profile', to: '/settings', icon: 'user', match: (p) => p === '/settings' },
];

/** Routes that already own a bottom sticky action bar — the tab bar would
    stack awkwardly on top of them, so it stays hidden there instead.
    `/messages` is the other case: a real chat composer needs the entire
    bottom edge of the screen to itself (its own safe-area padding, no
    tab bar between it and the keyboard) the same way Messages/WhatsApp/
    Telegram hide their own tab chrome inside a conversation. */
const OWNS_BOTTOM_BAR = [/^\/cars\//, /^\/book\//, /^\/messages/];

/** Single source of truth for "is the bottom tab bar showing right now" —
    shared with App.tsx so it can reserve matching scroll padding. */
export function useBottomNavVisible() {
  const { session } = useAuth();
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const { pathname } = useLocation();
  const suppressed = OWNS_BOTTOM_BAR.some((re) => re.test(pathname));
  return Boolean(session) && isMobile && !suppressed;
}

export function BottomNav() {
  const visible = useBottomNavVisible();
  const { pathname, hash } = useLocation();
  const { session } = useAuth();
  const unreadCount = useUnreadMessageCount(session?.user.id);

  const activeIndex = useMemo(
    () => items.findIndex((it) => it.match(pathname, hash)),
    [pathname, hash],
  );

  if (!visible) return null;

  return (
    <nav
      className="glass fixed inset-x-0 bottom-0 z-50 border-t border-line pb-safe shadow-[0_-6px_20px_-12px_rgba(22,22,26,0.18)] lg:hidden"
      aria-label="Primary"
    >
      <div className="relative grid grid-cols-5">
        {/* Sliding active indicator — a small solid pill rather than a
            glow bloom, so it reads as a clean app tab bar, not a game HUD. */}
        <span
          className="pointer-events-none absolute top-1.5 h-1 w-6 -translate-x-1/2 rounded-full bg-accent transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            left: activeIndex >= 0 ? `${(activeIndex + 0.5) * (100 / items.length)}%` : '-100%',
            opacity: activeIndex >= 0 ? 1 : 0,
          }}
        />
        {items.map((it, i) => {
          const active = i === activeIndex;

          if (it.label === 'Drive') {
            return (
              <DriveChallengeLauncher
                key={it.label}
                className="group relative z-10 flex flex-col items-center justify-center gap-1.5 py-2"
              >
                <img
                  src="/cx-drive-challenge-icon.png"
                  alt="CX Drive Challenge"
                  className="h-11 w-auto object-contain transition-transform duration-200 ease-out group-hover:scale-105 group-active:scale-95"
                  style={{ filter: 'drop-shadow(0 3px 8px rgba(22,22,26,0.22))' }}
                />
                <span className="text-micro font-bold uppercase tracking-wide text-accent">
                  {it.label}
                </span>
              </DriveChallengeLauncher>
            );
          }

          return (
            <Link
              key={it.label}
              to={it.to}
              className="pressable relative z-10 flex flex-col items-center justify-center gap-1.5 py-3"
              aria-current={active ? 'page' : undefined}
            >
              <span className="relative">
                <Icon
                  name={it.icon}
                  size={23}
                  className={`transition-all duration-300 ease-out ${
                    active ? 'scale-110 text-accent' : 'text-ink-soft'
                  }`}
                  strokeWidth={active ? 2.1 : 1.75}
                />
                {it.label === 'Messages' && unreadCount > 0 && (
                  <span className="absolute -right-1.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full border-2 border-surface bg-accent px-0.5 text-[9px] font-bold leading-none text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </span>
              <span
                className={`text-micro font-semibold tracking-wide transition-colors duration-300 ${
                  active ? 'text-accent' : 'text-ink-soft'
                }`}
              >
                {it.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
