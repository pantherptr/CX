import { useNavigate } from 'react-router-dom';
import { DashboardShell } from '../components/DashboardShell';
import { SignalS } from '../components/SignalLogo';
import { NotificationsList } from '../components/NotificationsList';
import { useAuth } from '../lib/auth';
import { useMyNotifications, notificationPath, type SignalNotification } from '../lib/data/notifications';
import { useApp } from '../lib/store';
import { useLocale } from '../lib/i18n';

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
  const { toast } = useApp();
  const { t } = useLocale();
  const { notifications, loadMore, loadingMore, hasMore, markRead, markAllRead } = useMyNotifications(session?.user.id);

  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0;

  const openNotification = (n: SignalNotification) => {
    markRead(n.id);
    if (!n.available) {
      toast({ title: t('This content is no longer available'), icon: 'info' });
      return;
    }
    const path = notificationPath(n, '/signal', session?.user.id);
    if (path) navigate(path);
  };

  return (
    <DashboardShell variant="customer" active="Notifications">
      <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
        <header className="flex items-end justify-between gap-4 px-1 pb-5 pt-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-[2rem] font-bold leading-none tracking-tight text-ink sm:text-4xl">Notifications</h1>
              {unreadCount > 0 && (
                <span className="grid h-7 min-w-7 place-items-center rounded-full bg-accent-bright px-2 text-detail font-bold leading-none text-white shadow-[0_6px_16px_-4px_rgba(0,212,71,0.6)]">
                  {unreadCount}
                </span>
              )}
            </div>
            <p className="mt-2 text-detail text-muted">Follows, Respects, comments and shares on SIGNAL show up here.</p>
          </div>
          <SignalS size={26} className="shrink-0" />
        </header>

        <div>
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
