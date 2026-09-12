import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { SignalBarLogo } from '../SignalBarLogo';

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
}: {
  signedIn: boolean;
  onSearchClick?: () => void;
  canManage?: boolean;
  onAnalyticsClick?: () => void;
}) {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

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
  const iconSlots = (signedIn ? 1 : 0) + (canManage ? 1 : 0) + (signedIn ? 1 : 0) + 1;
  const iconButton = 'pressable grid h-8 w-8 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel hover:text-ink';

  return (
    <header
      className={`sticky top-0 z-20 grid h-14 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center px-4 pt-safe backdrop-blur-xl transition-colors duration-300 sm:px-6 ${
        scrolled ? 'border-b border-line bg-surface/92' : 'border-b border-transparent bg-surface/55'
      }`}
    >
      <div aria-hidden="true" className="pointer-events-none invisible flex items-center gap-0.5">
        {Array.from({ length: iconSlots }, (_, i) => (
          <span key={i} className="h-8 w-8" />
        ))}
      </div>
      <div className="flex min-w-0 justify-center overflow-hidden">
        <SignalBarLogo size={20} />
      </div>
      <div className="flex items-center justify-self-end gap-0.5">
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
          <Link to="/notifications" aria-label="Notifications" className={iconButton}>
            <Icon name="bell" size={17} />
          </Link>
        )}
        <button onClick={() => navigate(signedIn ? '/dashboard' : '/')} aria-label="Exit Signal" className={iconButton}>
          <Icon name="x" size={18} />
        </button>
      </div>
    </header>
  );
}
