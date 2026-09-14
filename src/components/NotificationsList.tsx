import { EmptyState, VerifiedBadge, type VerifiedRole } from './primitives';
import { Icon, type IconName } from './Icon';
import { Img } from './motion';
import { Tap, motion, AnimatePresence, useReducedMotion, SPRING_SNAPPY } from './motionKit';
import type { SignalNotification, NotificationType } from '../lib/data/notifications';

/** Same precedence every other SIGNAL identity surface (posts, comments,
 *  search) already uses — Owner outranks Admin outranks Host outranks
 *  Verified Client, `null` (no badge) for a plain client. Keeps official/
 *  verified actors clearly recognizable here too, without a second
 *  identity system — this reads the exact same profile flags. */
function actorRole(n: SignalNotification): VerifiedRole | null {
  return n.actorIsOwner ? 'owner' : n.actorIsAdmin ? 'admin' : n.actorIsHost ? 'host' : n.actorIsVerifiedClient ? 'client' : null;
}

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

// The two "big" interactions get their own color instead of a uniform
// grey chip — Follow ties to FollowButton's own solid-ink treatment,
// Respect ties to the post action's own accent green. Comment/Share stay
// neutral so the two colored ones read as the emotionally significant
// events, not a rainbow of every type.
const COPY: Record<NotificationType, { icon: IconName; verb: string; chip: string }> = {
  follow: { icon: 'user', verb: 'started following you', chip: 'bg-ink text-white' },
  post_respect: { icon: 'like', verb: 'respected your post', chip: 'bg-accent-bright text-white' },
  post_comment: { icon: 'message', verb: 'commented on your post', chip: 'bg-panel text-ink-soft' },
  post_share: { icon: 'share', verb: 'shared your post', chip: 'bg-panel text-ink-soft' },
};

/** The actual notification rows — pulled out of the full `/notifications`
 *  page so `SignalNotificationsSheet` (the compact in-Signal panel) can
 *  render the exact same real feed instead of a second, lighter-weight
 *  copy of it. Purely presentational: the caller owns fetching, paging
 *  and read-state (via `useMyNotifications`) and just hands the result
 *  down, so there is exactly one place that knows what a notification
 *  row looks like. */
export function NotificationsList({
  notifications,
  loadMore,
  loadingMore,
  hasMore,
  onOpen,
  compact = false,
}: {
  notifications: SignalNotification[] | null;
  loadMore: () => void;
  loadingMore: boolean;
  hasMore: boolean;
  onOpen: (n: SignalNotification) => void;
  /** Tighter padding/sizing for the small sheet context vs. the full page. */
  compact?: boolean;
}) {
  if (notifications === null) {
    return (
      <div className="flex flex-col gap-2">
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
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="animate-fade-up rounded-2xl border border-line bg-surface">
        <EmptyState
          size={compact ? 'md' : 'lg'}
          icon="bell"
          title="You're all caught up"
          description="Follows, Respects, comments and shares on SIGNAL will show up here."
          className={compact ? 'px-6 py-12' : 'px-6 py-20'}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 animate-fade-up">
      {notifications.map((n) => {
        const copy = COPY[n.type];
        const role = actorRole(n);
        return (
          <Tap
            key={n.id}
            as="button"
            onClick={() => onOpen(n)}
            scale={0.98}
            className={`flex w-full items-start gap-3 rounded-2xl border text-left transition-colors ${
              compact ? 'p-3' : 'p-4'
            } ${n.readAt ? 'border-line bg-surface' : 'border-accent-100 bg-accent-050'}`}
          >
            {n.actorAvatarUrl ? (
              <Img
                src={n.actorAvatarUrl}
                alt=""
                className="h-11 w-11 shrink-0 rounded-full object-cover"
                fallback={
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-panel text-ink-soft">
                    <Icon name="user" size={20} />
                  </span>
                }
              />
            ) : (
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-panel text-ink-soft">
                <Icon name="user" size={20} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1 text-body text-ink">
                <span className="font-semibold">{n.actorName}</span>
                {role && <VerifiedBadge role={role} size={13} />}
                <span>{copy.verb}</span>
              </p>
              {n.actorUsername && <p className="truncate text-caption text-faint">@{n.actorUsername}</p>}
              {n.postPreview && <p className="mt-0.5 truncate text-caption text-muted">{n.postPreview}</p>}
              <p className="mt-1 text-caption text-faint">{timeAgo(n.createdAt)}</p>
            </div>
            <span className={`mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full ${copy.chip}`}>
              <Icon name={copy.icon} size={14} />
            </span>
            <UnreadDot show={!n.readAt} />
          </Tap>
        );
      })}
      {hasMore && (
        <button onClick={loadMore} disabled={loadingMore} className="btn btn-secondary btn-block mt-2 disabled:opacity-50">
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

/** The small unread marker — a real Motion pop on the way in, and (the
 *  more important direction) a quiet scale-out the instant a notification
 *  is marked read, rather than an abrupt disappearance. Its own tiny
 *  component so `AnimatePresence` can track its mount/unmount per row
 *  without wrapping every row's much larger layout in a presence group. */
function UnreadDot({ show }: { show: boolean }) {
  const reduceMotion = useReducedMotion();
  return (
    <AnimatePresence>
      {show && (
        <motion.span
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent-bright"
          initial={reduceMotion ? undefined : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={reduceMotion ? undefined : { scale: 0, opacity: 0 }}
          transition={SPRING_SNAPPY}
        />
      )}
    </AnimatePresence>
  );
}
