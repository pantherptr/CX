import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { SignalLogo } from '../SignalLogo';

/** SIGNAL's entire chrome — a sticky minimal header, nothing else. A
 *  single feed doesn't need the old game's HUD/multi-tab nav, so this
 *  replaces that whole shell stack with just: the crest, the "CX SIGNAL"
 *  wordmark, a notifications entry (reusing the site's own existing
 *  Notifications page — not a second notification system), and a clear
 *  way back to CX Rent. `onExit`'s destination is fixed (`/dashboard`
 *  signed-in, `/` signed-out), not `navigate(-1)` — same predictable-exit
 *  convention the old game shell used, regardless of how the visitor
 *  arrived at `/signal`. Stays translucent at the very top of the feed
 *  and gains a touch more opacity once scrolled — the same `scrolled`
 *  pattern Navbar.tsx's PublicNavbar already uses — so it overlays
 *  content rather than reading as a flat website navbar. */
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

  return (
    <header
      className={`sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2.5 px-4 pt-safe backdrop-blur-xl transition-colors duration-300 sm:px-6 ${
        scrolled ? 'border-b border-line bg-surface/92' : 'border-b border-transparent bg-surface/55'
      }`}
    >
      <SignalLogo size={26} />
      <span className="font-display text-lead font-bold tracking-[0.04em] text-ink">CX SIGNAL</span>
      <div className="ml-auto flex items-center gap-1">
        {signedIn && (
          <button
            onClick={onSearchClick}
            aria-label="Search Signal"
            className="pressable grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel hover:text-ink"
          >
            <Icon name="search" size={18} />
          </button>
        )}
        {canManage && (
          <button
            onClick={onAnalyticsClick}
            aria-label="Signal analytics"
            className="pressable grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel hover:text-ink"
          >
            <Icon name="chart" size={18} />
          </button>
        )}
        {signedIn && (
          <Link
            to="/notifications"
            aria-label="Notifications"
            className="pressable grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel hover:text-ink"
          >
            <Icon name="bell" size={18} />
          </Link>
        )}
        <button
          onClick={() => navigate(signedIn ? '/dashboard' : '/')}
          aria-label="Exit Signal"
          className="pressable grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel hover:text-ink"
        >
          <Icon name="x" size={19} />
        </button>
      </div>
    </header>
  );
}
