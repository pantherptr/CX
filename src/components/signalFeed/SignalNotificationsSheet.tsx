import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { CxsLogo } from '../CxsLogo';
import { NotificationsList } from '../NotificationsList';
import { useSheetDrag } from '../motion';
import { useHideForNavigation } from '../motionKit';
import { useAuth } from '../../lib/auth';
import { useMyNotifications, type SignalNotification } from '../../lib/data/notifications';

/** Notifications, reached from inside Signal, as the same compact
 *  bottom-sheet every other Signal action (Share, Analytics) already
 *  uses — not a full-page navigation away from the feed. Same real data
 *  and the exact same row rendering as the full `/notifications` page
 *  (`useMyNotifications` + `NotificationsList`, both unchanged), just a
 *  different, lighter container — tapping a notification closes the
 *  sheet and opens the post/profile as a Signal overlay on top of the
 *  feed that's still sitting right there underneath, instead of leaving
 *  Signal entirely and having to navigate all the way back in. */
export function SignalNotificationsSheet({ onClose, base }: { onClose: () => void; base: string }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { handlers: dragHandlers, style: dragStyle, closing, requestClose } = useSheetDrag(onClose);
  // Opening a notification's post/profile must not throw away this
  // panel's already-loaded, already-marked-read list — same "hide, don't
  // unmount" primitive SignalSearchOverlay and SignalStoryViewer use for
  // their own version of this exact problem.
  const { hidden, hideForNavigation } = useHideForNavigation(pathname);
  const { notifications, loadMore, loadingMore, hasMore, markRead, markAllRead } = useMyNotifications(session?.user.id);

  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0;

  if (hidden) return null;

  const openNotification = (n: SignalNotification) => {
    markRead(n.id);
    hideForNavigation();
    if (n.postId) navigate(`${base}/post/${n.postId}`, { viewTransition: true });
    else if (n.actorId) navigate(`${base}/profile/${n.actorId}`, { viewTransition: true });
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 animate-fade-in sm:items-center"
      style={{ opacity: closing ? 0 : undefined, transition: 'opacity 220ms var(--ease-out-expo)' }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative flex h-[97vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface animate-sheet-in sm:h-[88vh] sm:max-w-lg sm:rounded-3xl"
        style={dragStyle}
      >
        <div {...dragHandlers} className="relative shrink-0 overflow-hidden bg-surface">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-accent-bright/15 blur-3xl" />
          <div className="flex flex-col items-center pt-2.5 sm:hidden">
            <span className="h-1 w-9 rounded-full bg-ink/15" aria-hidden="true" />
          </div>
          <div className="relative flex items-center justify-between px-5 pt-4 sm:px-6">
            <CxsLogo size={34} />
            <button onClick={requestClose} aria-label="Close" className="pressable grid h-9 w-9 shrink-0 place-items-center rounded-full bg-panel text-ink-soft transition-colors hover:text-ink">
              <Icon name="x" size={18} />
            </button>
          </div>
          <div className="relative px-5 pb-5 pt-5 sm:px-6">
            <div className="flex items-center gap-2.5">
              <h2 className="font-display text-[1.75rem] font-bold leading-none tracking-tight text-ink">Notifications</h2>
              {unreadCount > 0 && (
                <span className="grid h-6 min-w-6 place-items-center rounded-full bg-accent-bright px-1.5 text-detail font-bold leading-none text-white shadow-[0_6px_16px_-4px_rgba(0,212,71,0.6)]">
                  {unreadCount}
                </span>
              )}
            </div>
            <p className="mt-2 text-detail text-muted">Everything happening around your SIGNAL activity</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-panel/60 p-4 sm:p-5">
          <NotificationsList
            notifications={notifications}
            loadMore={loadMore}
            loadingMore={loadingMore}
            hasMore={hasMore}
            onOpen={openNotification}
            onMarkRead={markRead}
            onMarkAllRead={markAllRead}
            compact
          />
        </div>
      </div>
    </div>
  );
}
