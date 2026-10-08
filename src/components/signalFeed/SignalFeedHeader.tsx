import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { SignalBarLogo } from '../SignalBarLogo';
import { motion, AnimatePresence, useReducedMotion, SPRING_SNAPPY, SPRING_SMOOTH } from '../motionKit';
import { useAuth } from '../../lib/auth';
import { useUnreadNotificationCount } from '../../lib/data/notifications';

/** SIGNAL's entire chrome — a sticky minimal header, nothing else. A
 *  single feed doesn't need the old game's HUD/multi-tab nav, so this
 *  replaces that whole shell stack with just: the SIGNAL wordmark (the
 *  full `/SIGNALBAR.PNG` lockup, standing in for the "SIGNAL" text
 *  entirely — see `SignalBarLogo`), a notifications entry (reusing the
 *  site's own existing Notifications page — not a second notification
 *  system), and a clear way back to CX Rent. This is now the page's one
 *  prominent showing of the mark — there's no separate hero logo above
 *  Stories any more, and the bottom tab bar's own icon is small — so
 *  branding hierarchy is header wordmark -> content -> small nav icon,
 *  never two large showings at once. `onExit`'s
 *  destination is fixed (`/dashboard` signed-in, `/` signed-out), not
 *  `navigate(-1)` — same predictable-exit convention the old game shell
 *  used, regardless of how the visitor arrived at `/signal`. Stays
 *  translucent at the very top of the feed and gains a touch more
 *  opacity once scrolled — the same `scrolled` pattern Navbar.tsx's
 *  PublicNavbar already uses — so it overlays content rather than
 *  reading as a flat website navbar. */
export function SignalFeedHeader({
  signedIn,
  onSearchClick,
  canManage = false,
  onAnalyticsClick,
  onNotificationsClick,
  searchOpen = false,
  query = '',
  onQueryChange,
  onSearchClose,
}: {
  signedIn: boolean;
  onSearchClick?: () => void;
  canManage?: boolean;
  onAnalyticsClick?: () => void;
  onNotificationsClick?: () => void;
  /** The search dock: the lens opens into a field that takes over the header. */
  searchOpen?: boolean;
  query?: string;
  onQueryChange?: (q: string) => void;
  onSearchClose?: () => void;
}) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const { count: unreadNotifications } = useUnreadNotificationCount(session?.user.id);
  const [scrolled, setScrolled] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // How many icon buttons render on the right (canManage adds a 4th).
  // The invisible mirror below renders exactly this many empty same-size
  // slots on the left, so both flanking grid columns are pixel-identical
  // — a real `1fr`/`1fr` split only guarantees each column is AT LEAST
  // its own content's width, not that the two end up equal, so an empty
  // left column actually shrinks well below the icon group's width
  // instead of matching it (measured ~62px vs ~156px at 375px wide),
  // leaving the middle column, and therefore the wordmark, off-center.
  // Mirroring the real content's width is the only way to guarantee true
  // centering regardless of viewport or icon count. The middle track is
  // `minmax(0, 1fr)`, not bare `auto` — at the narrowest supported phone
  // widths, two full icon groups plus safe-area padding leave very
  // little room, and `minmax(0, …)` lets that middle column (and the
  // shrinkable SignalBarLogo inside it) give way rather than force the
  // header wider than the viewport.
  const iconSlots = (signedIn ? 1 : 0) + (canManage ? 1 : 0) + (signedIn ? 1 : 0);
  // The lens sits left of the other icons; the dock starts there and grows out.
  const dockOffset = ((canManage ? 1 : 0) + 1) * 34;
  const iconButton = 'pressable grid h-8 w-8 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel hover:text-ink';

  return (
    <header
      className={`sticky top-0 z-20 grid h-[calc(3.5rem+env(safe-area-inset-top,0px))] shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center px-4 pt-safe backdrop-blur-xl transition-colors duration-300 sm:px-6 lg:h-16 lg:grid-cols-[minmax(0,1fr)_auto] lg:px-8 ${
        scrolled ? 'border-b border-line bg-surface/92' : 'border-b border-transparent bg-surface/55'
      }`}
    >
      {/* Search dock — grows out of the lens and takes over the whole bar */}
      <AnimatePresence>
        {searchOpen && (
          <div className="absolute inset-x-4 inset-y-0 flex items-center justify-end pt-safe sm:inset-x-6 lg:left-auto lg:right-24 lg:w-[34rem]">
            <motion.div
              className="flex h-10 items-center overflow-hidden rounded-full border border-line-strong bg-surface shadow-soft"
              initial={reduceMotion ? { width: '100%', x: 0 } : { width: 32, x: -dockOffset }}
              animate={{ width: '100%', x: 0 }}
              exit={reduceMotion ? { width: '100%', x: 0 } : { width: 32, x: -dockOffset }}
              transition={reduceMotion ? { duration: 0 } : SPRING_SMOOTH}
            >
              <span className="grid h-10 w-8 shrink-0 place-items-center text-ink-soft">
                <Icon name="search" size={17} />
              </span>
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <input
                autoFocus
                value={query}
                onChange={(e) => onQueryChange?.(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') onSearchClose?.();
                }}
                placeholder="Search people, news, cars, offers…"
                aria-label="Search Signal"
                className="min-w-0 flex-1 bg-transparent px-1.5 text-[16px] text-ink outline-none placeholder:text-faint"
                autoCapitalize="none"
                autoCorrect="off"
                enterKeyHint="search"
              />
              <button
                onClick={onSearchClose}
                aria-label="Close search"
                className="pressable mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel hover:text-ink"
              >
                <Icon name="x" size={17} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <div aria-hidden="true" className="pointer-events-none invisible flex items-center gap-0.5 lg:hidden">
        {Array.from({ length: iconSlots }, (_, i) => (
          <span key={i} className="h-8 w-8" />
        ))}
      </div>
      <div className={`flex min-w-0 justify-center overflow-hidden transition-opacity duration-200 lg:justify-start ${searchOpen ? 'opacity-0' : ''}`}>
        <SignalBarLogo size={20} />
      </div>
      <div className={`flex items-center justify-self-end gap-0.5 transition-opacity duration-200 ${searchOpen ? 'pointer-events-none opacity-0' : ''}`}>
        {signedIn && (
          <button onClick={onSearchClick} aria-label="Search Signal" className={iconButton}>
            <Icon name="search" size={17} />
          </button>
        )}
        {canManage && (
          <button onClick={onAnalyticsClick} aria-label="Signal analytics" className={iconButton}>
            <Icon name="chart" size={17} />
          </button>
        )}
        {signedIn && (
          <button onClick={onNotificationsClick} aria-label="Notifications" className={`relative ${iconButton}`}>
            <Icon name="bell" size={17} />
            <AnimatePresence>
              {unreadNotifications > 0 && (
                <motion.span
                  className="absolute right-1 top-1 h-2 w-2 rounded-full border-2 border-surface bg-accent-bright"
                  initial={reduceMotion ? undefined : { scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={reduceMotion ? undefined : { scale: 0, opacity: 0 }}
                  transition={SPRING_SNAPPY}
                />
              )}
            </AnimatePresence>
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate(signedIn ? '/dashboard' : '/')}
          aria-label="Close SIGNAL"
          className="pressable ml-3 hidden h-9 w-9 place-items-center rounded-full border border-line-strong text-ink transition-colors hover:bg-panel lg:grid"
        >
          <Icon name="x" size={17} />
        </button>
      </div>
    </header>
  );
}
