import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { NotificationsList } from '../NotificationsList';
import { useSheetDrag } from '../motion';
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
  const { handlers: dragHandlers, style: dragStyle, closing, requestClose } = useSheetDrag(onClose);
  const { notifications, loadMore, loadingMore, hasMore, markRead, markAllRead } = useMyNotifications(session?.user.id);

  useEffect(() => {
    markAllRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNotification = (n: SignalNotification) => {
    markRead(n.id);
    requestClose();
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
        className="flex max-h-[75vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface animate-sheet-in sm:max-w-sm sm:rounded-2xl"
        style={dragStyle}
      >
        <div {...dragHandlers} className="flex flex-col items-center pt-2 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-line" aria-hidden="true" />
        </div>
        <div {...dragHandlers} className="flex items-center gap-2 border-b border-line px-5 py-4">
          <Icon name="bell" size={17} className="text-ink-soft" />
          <span className="font-display font-semibold text-ink">Notifications</span>
          <button onClick={requestClose} aria-label="Close" className="pressable ml-auto grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-panel">
            <Icon name="x" size={19} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <NotificationsList
            notifications={notifications}
            loadMore={loadMore}
            loadingMore={loadingMore}
            hasMore={hasMore}
            onOpen={openNotification}
            compact
          />
        </div>
      </div>
    </div>
  );
}
