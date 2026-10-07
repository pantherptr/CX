import { useNavigate } from 'react-router-dom';
import { DashboardShell } from '../components/DashboardShell';
import { CxsLogo } from '../components/CxsLogo';
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

  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0;

  const openNotification = (n: SignalNotification) => {
    markRead(n.id);
    if (n.postId) navigate(`/signal/post/${n.postId}`);
    else if (n.actorId) navigate(`/signal/profile/${n.actorId}`);
  };

  return (
    <DashboardShell variant="customer" active="Notifications">
      <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
        <div className="relative overflow-hidden rounded-3xl border border-line bg-surface px-6 py-6 shadow-hair sm:px-8 sm:py-8">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-28 h-64 w-64 rounded-full bg-accent-bright/15 blur-3xl" />
          <div className="relative">
            <CxsLogo size={34} />
            <div className="mt-5 flex items-center gap-3">
              <h1 className="font-display text-3xl font-bold leading-none tracking-tight text-ink sm:text-4xl">Notifications</h1>
              {unreadCount > 0 && (
                <span className="grid h-7 min-w-7 place-items-center rounded-full bg-accent-bright px-2 text-detail font-bold leading-none text-white shadow-[0_6px_16px_-4px_rgba(0,212,71,0.6)]">
                  {unreadCount}
                </span>
              )}
            </div>
            <p className="mt-2.5 text-body text-muted">Follows, Respects, comments and shares on SIGNAL show up here.</p>
          </div>
        </div>

        <div className="mt-6">
          <NotificationsList
            notifications={notifications}
            loadMore={loadMore}
            loadingMore={loadingMore}
            hasMore={hasMore}
            onOpen={openNotification}
            onMarkRead={markRead}
            onMarkAllRead={markAllRead}
          />
        </div>
      </div>
    </DashboardShell>
  );
}
