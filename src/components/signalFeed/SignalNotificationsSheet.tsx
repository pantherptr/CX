import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
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

  useEffect(() => {
    markAllRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <div {...dragHandlers} className="relative shrink-0 overflow-hidden bg-gradient-to-b from-accent-050 to-transparent">
          <div className="flex flex-col items-center pt-2.5 sm:hidden">
            <span className="h-1 w-9 rounded-full bg-ink/15" aria-hidden="true" />
          </div>
          <div className="flex items-center gap-3.5 px-6 pb-6 pt-5">
            <span className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent-bright text-white shadow-[0_8px_24px_-6px_rgba(0,212,71,0.55)]">
              <Icon name="bell" size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-feature font-bold text-ink">Notifications</h2>
              <p className="text-detail text-muted">Everything happening around your SIGNAL activity</p>
            </div>
            <button onClick={requestClose} aria-label="Close" className="pressable grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-panel">
              <Icon name="x" size={21} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto border-t border-line p-4 sm:p-5">
          <NotificationsList
            notifications={notifications}
            loadMore={loadMore}
            loadingMore={loadingMore}
            hasMore={hasMore}
            onOpen={openNotification}
          />
        </div>
      </div>
    </div>
  );
}
