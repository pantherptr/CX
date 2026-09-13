import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardShell } from '../components/DashboardShell';
import { NotificationsList } from '../components/NotificationsList';
import { useAuth } from '../lib/auth';
import { useMyNotifications, type SignalNotification } from '../lib/data/notifications';

/** A real notification feed, generated entirely by actual interactions —
 *  see 0054_notifications.sql. Replaces the old hardcoded empty state
 *  that predated any notification-generating event existing at all.
 *  `NotificationsList` owns the actual rows — `SignalNotificationsSheet`
 *  (the compact panel reached from inside Signal) renders that exact
 *  same component over this same `useMyNotifications` hook, not a second
 *  lighter copy of either. */
export default function Notifications() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const { notifications, loadMore, loadingMore, hasMore, markRead, markAllRead } = useMyNotifications(session?.user.id);

  useEffect(() => {
    markAllRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNotification = (n: SignalNotification) => {
    markRead(n.id);
    if (n.postId) navigate(`/signal/post/${n.postId}`);
    else if (n.actorId) navigate(`/signal/profile/${n.actorId}`);
  };

  return (
    <DashboardShell variant="customer" active="Notifications">
      <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Notifications</h1>
        <p className="mt-1 text-body text-muted">Follows, Respects, comments and shares on SIGNAL show up here.</p>

        <div className="mt-6">
          <NotificationsList
            notifications={notifications}
            loadMore={loadMore}
            loadingMore={loadingMore}
            hasMore={hasMore}
            onOpen={openNotification}
          />
        </div>
      </div>
    </DashboardShell>
  );
}
