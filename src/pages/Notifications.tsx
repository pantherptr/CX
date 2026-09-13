import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardShell } from '../components/DashboardShell';
import { EmptyState } from '../components/primitives';
import { Icon, type IconName } from '../components/Icon';
import { useAuth } from '../lib/auth';
import { useMyNotifications, type SignalNotification, type NotificationType } from '../lib/data/notifications';

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const COPY: Record<NotificationType, { icon: IconName; verb: string }> = {
  follow: { icon: 'user', verb: 'started following you' },
  post_respect: { icon: 'like', verb: 'respected your post' },
  post_comment: { icon: 'message', verb: 'commented on your post' },
  post_share: { icon: 'share', verb: 'shared your post' },
};

/** A real notification feed, generated entirely by actual interactions —
 *  see 0054_notifications.sql. Replaces the old hardcoded empty state
 *  that predated any notification-generating event existing at all. */
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

        {notifications === null ? (
          <div className="mt-8 flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 rounded-2xl border border-line bg-surface p-4">
                <div className="skeleton h-11 w-11 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3.5 w-3/4 rounded-md" />
                  <div className="skeleton h-3 w-1/3 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="animate-fade-up mt-8 rounded-2xl border border-line bg-surface">
            <EmptyState
              size="lg"
              icon="bell"
              title="You're all caught up"
              description="Follows, Respects, comments and shares on SIGNAL will show up here."
              className="px-6 py-20"
            />
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-2">
            {notifications.map((n) => {
              const copy = COPY[n.type];
              return (
                <button
                  key={n.id}
                  onClick={() => openNotification(n)}
                  className={`pressable flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${
                    n.readAt ? 'border-line bg-surface' : 'border-accent-100 bg-accent-050'
                  }`}
                >
                  {n.actorAvatarUrl ? (
                    <img src={n.actorAvatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-panel text-ink-soft">
                      <Icon name="user" size={20} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-body text-ink">
                      <span className="font-semibold">{n.actorName}</span> {copy.verb}
                    </p>
                    {n.postPreview && <p className="mt-0.5 truncate text-caption text-muted">{n.postPreview}</p>}
                    <p className="mt-1 text-caption text-faint">{timeAgo(n.createdAt)}</p>
                  </div>
                  <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-panel text-ink-soft">
                    <Icon name={copy.icon} size={14} />
                  </span>
                  {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent-bright" />}
                </button>
              );
            })}
            {hasMore && (
              <button onClick={loadMore} disabled={loadingMore} className="btn btn-secondary btn-block mt-2 disabled:opacity-50">
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
