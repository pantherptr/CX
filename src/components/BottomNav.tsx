import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { useAuth } from '../lib/auth';
import { useMediaQuery } from './motion';

interface Item {
  label: string;
  to: string;
  icon: IconName;
  match: (pathname: string, hash: string) => boolean;
}

const items: Item[] = [
  { label: 'Home', to: '/dashboard', icon: 'grid', match: (p, h) => p === '/dashboard' && h === '' },
  { label: 'Explore', to: '/browse', icon: 'search', match: (p) => p === '/browse' },
  { label: 'Trips', to: '/dashboard#trips', icon: 'trips', match: (p, h) => p === '/dashboard' && h === '#trips' },
  { label: 'Saved', to: '/dashboard#saved', icon: 'heart', match: (p, h) => p === '/dashboard' && h === '#saved' },
  { label: 'Profile', to: '/settings', icon: 'user', match: (p) => p === '/settings' },
];

/** Routes that already own a bottom sticky action bar — the tab bar would
    stack awkwardly on top of them, so it stays hidden there instead. */
const OWNS_BOTTOM_BAR = [/^\/cars\//, /^\/book\//];

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

  const activeIndex = useMemo(
    () => items.findIndex((it) => it.match(pathname, hash)),
    [pathname, hash],
  );

  if (!visible) return null;

  return (
    <nav
      className="glass fixed inset-x-0 bottom-0 z-50 border-t border-line pb-safe lg:hidden"
      aria-label="Primary"
    >
      <div className="relative grid grid-cols-5">
        {/* Sliding active indicator */}
        <span
          className="pointer-events-none absolute top-1.5 h-[3px] w-8 -translate-x-1/2 rounded-full bg-accent transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            left: activeIndex >= 0 ? `${(activeIndex + 0.5) * (100 / items.length)}%` : '-100%',
            opacity: activeIndex >= 0 ? 1 : 0,
          }}
        />
        {items.map((it, i) => {
          const active = i === activeIndex;
          return (
            <Link
              key={it.label}
              to={it.to}
              className="pressable flex flex-col items-center gap-1 py-2.5"
              aria-current={active ? 'page' : undefined}
            >
              <Icon
                name={it.icon}
                size={22}
                className={active ? 'text-ink' : 'text-faint'}
                strokeWidth={active ? 2.2 : 1.8}
              />
              <span className={`text-[10.5px] font-medium ${active ? 'text-ink' : 'text-faint'}`}>
                {it.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
