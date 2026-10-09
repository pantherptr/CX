import { useState } from 'react';
import { useLocale } from '../lib/i18n';
import { EmptyState, VerifiedBadge, type VerifiedRole } from './primitives';
import { Icon, type IconName } from './Icon';
import { Img } from './motion';
import { motion, AnimatePresence, useReducedMotion, SPRING_SNAPPY } from './motionKit';
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

type Bucket = 'Today' | 'Yesterday' | 'This week' | 'Earlier';
const BUCKETS: Bucket[] = ['Today', 'Yesterday', 'This week', 'Earlier'];
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
function bucketOf(iso: string): Bucket {
  const days = Math.round((dayStart(new Date()) - dayStart(new Date(iso))) / 86400000);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? 'This week' : 'Earlier';
}

// Each kind of event gets a small badge on the actor's photo. Follow and
// Respect keep their own colours (ties to FollowButton's solid ink and the
// post action's accent green); comments and shares stay neutral so the two
// coloured ones read as the events that matter.
const COPY: Record<NotificationType, { icon: IconName; verb: string; badge: string }> = {
  follow: { icon: 'user', verb: 'started following you', badge: 'bg-ink text-white' },
  post_respect: { icon: 'like', verb: 'respected your post', badge: 'bg-accent-bright text-white' },
  post_comment: { icon: 'message', verb: 'commented on your post', badge: 'bg-sky-500 text-white' },
  post_share: { icon: 'share', verb: 'shared your post', badge: 'bg-amber-500 text-white' },
  post_save: { icon: 'bookmark', verb: 'saved your post', badge: 'bg-violet-500 text-white' },
  circle: { icon: 'sparkles', verb: '', badge: 'bg-ink text-white' },
  follow_accepted: { icon: 'check', verb: 'accepted your request', badge: 'bg-ink text-white' },
  vision_selected: { icon: 'sparkles', verb: '', badge: 'bg-accent-bright text-white' },
  vision_featured: { icon: 'sparkles', verb: '', badge: 'bg-accent-bright text-white' },
};

/** What a notification says when the person behind it stays private, or
 *  when several people did the same thing (0078 aggregates these while
 *  unread) — never names a count of people, just the event. */
const ANON_TEXT: Record<NotificationType, string> = {
  follow: 'Someone started following you',
  post_respect: 'Your post received 1 new Respect',
  post_comment: 'Your post received a comment',
  post_share: 'Your post was shared',
  post_save: 'Your post was saved',
  circle: 'You are now in CX Circle',
  follow_accepted: 'Your request was accepted',
  vision_selected: 'Your Vision was selected for Signal Spotlight',
  vision_featured: 'Your Vision is now featured on Signal Spotlight',
};
/** The count>1 version of the same four — a fresh English string per
 *  event/count so it reads naturally in every language, with `{count}`
 *  filled in via `t()`. */
const ANON_TEXT_MANY: Record<NotificationType, string> = {
  follow: 'Someone started following you',
  post_respect: 'Your post received {count} new Respects',
  post_comment: 'Your post received {count} comments',
  post_share: 'Your post was shared {count} times',
  post_save: 'Your post was saved {count} times',
  circle: 'You are now in CX Circle',
  follow_accepted: 'Your request was accepted',
  vision_selected: 'Your Vision was selected for Signal Spotlight',
  vision_featured: 'Your Vision is now featured on Signal Spotlight',
};

type TabId = 'all' | 'unread' | 'follows' | 'activity';
const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'follows', label: 'Follows' },
  { id: 'activity', label: 'Activity' },
];

const isFollowKind = (n: SignalNotification) => n.type === 'follow' || n.type === 'circle' || n.type === 'follow_accepted';
const matches = (n: SignalNotification, tab: TabId) =>
  tab === 'all' ? true : tab === 'unread' ? !n.readAt : tab === 'follows' ? isFollowKind(n) : !isFollowKind(n);

/** The notifications panel: a "mark all as read" action, tabs with live
 *  counts, and one row per event — the actor's photo with a small badge
 *  for what happened, who did it and when, a quoted line of the post it
 *  was about, and a menu per row. Purely presentational: the caller owns
 *  fetching, paging and read-state (via `useMyNotifications`) and hands
 *  the result down, so there is one place that knows what a notification
 *  looks like — `/notifications` and the SIGNAL panel both use it. */
export function NotificationsList({
  notifications,
  loadMore,
  loadingMore,
  hasMore,
  onOpen,
  onMarkRead,
  onMarkAllRead,
  compact = false,
}: {
  notifications: SignalNotification[] | null;
  loadMore: () => void;
  loadingMore: boolean;
  hasMore: boolean;
  onOpen: (n: SignalNotification) => void;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  /** Tighter padding for the small sheet context vs. the full page. */
  compact?: boolean;
}) {
  const { t } = useLocale();
  const anonText = (n: SignalNotification) => (n.count > 1 ? t(ANON_TEXT_MANY[n.type], { count: n.count }) : t(ANON_TEXT[n.type]));
  const [tab, setTab] = useState<TabId>('all');
  const [menuFor, setMenuFor] = useState<string | null>(null);

  if (notifications === null) {
    return (
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex animate-pulse items-center gap-3 border-b border-line p-4 last:border-0">
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

  const unread = notifications.filter((n) => !n.readAt);
  const count = (id: TabId) => (id === 'unread' ? unread.length : id === 'follows' ? unread.filter(isFollowKind).length : id === 'activity' ? unread.filter((n) => !isFollowKind(n)).length : 0);
  const shown = notifications.filter((n) => matches(n, tab));

  return (
    <div className="animate-fade-up">
      {/* Filters (a segmented control) + mark all */}
      <div className="flex items-center justify-between gap-3 px-1 pb-3">
        <div className="no-scrollbar flex min-w-0 gap-1 overflow-x-auto rounded-full bg-panel p-1" role="tablist">
          {TABS.map((t) => {
            const n = count(t.id);
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-detail font-semibold transition-[background-color,color,box-shadow] ${
                  on ? 'bg-surface text-ink shadow-hair' : 'text-muted hover:text-ink'
                }`}
              >
                {t.label}
                {n > 0 && t.id !== 'all' && (
                  <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent-bright px-1 text-[0.6875rem] font-bold leading-none text-white">{n}</span>
                )}
              </button>
            );
          })}
        </div>
        {onMarkAllRead && (
          <button
            onClick={onMarkAllRead}
            disabled={unread.length === 0}
            aria-label="Mark all as read"
            className="pressable inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-2 text-detail font-semibold text-accent transition-colors hover:bg-panel disabled:text-faint disabled:opacity-60"
          >
            <Icon name="check" size={15} strokeWidth={2.5} /> <span className="hidden sm:inline">Mark all as read</span>
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-hair">
          {notifications.length === 0 ? (
            <EmptyState
              size={compact ? 'md' : 'lg'}
              icon="bell"
              title="You're all caught up"
              description="Follows, Respects, comments and shares on SIGNAL will show up here."
              className={compact ? 'px-6 py-12' : 'px-6 py-20'}
            />
          ) : (
            <p className="px-6 py-14 text-center text-detail text-muted">
              {tab === 'unread' ? 'Nothing unread.' : 'Nothing here yet.'}
            </p>
          )}
        </div>
      ) : (
        BUCKETS.map((bucket) => {
          const group = shown.filter((n) => bucketOf(n.createdAt) === bucket);
          if (group.length === 0) return null;
          return (
            <section key={bucket} className="mb-5 last:mb-0">
              <h2 className="mb-2 px-2 text-detail font-semibold uppercase tracking-wide text-muted">{bucket}</h2>
              <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-hair">
                {group.map((n) => {
                  const copy = COPY[n.type];
                  const role = actorRole(n);
                  const isUnread = !n.readAt;
                  return (
                    <div
                      key={n.id}
                      className={`relative flex items-start gap-3.5 border-b border-line last:border-0 ${compact ? 'px-4 py-3.5' : 'px-4 py-4 sm:px-5'} ${
                        isUnread ? 'bg-accent-050/35' : ''
                      }`}
                    >
                      {isUnread && <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-accent-bright" />}
                      <button onClick={() => onOpen(n)} className="pressable relative shrink-0" aria-label={n.actorId ? n.actorName : anonText(n)}>
                        {!n.actorId ? (
                          <span className={`grid h-12 w-12 place-items-center rounded-full ${copy.badge}`}>
                            <Icon name={copy.icon} size={22} />
                          </span>
                        ) : n.actorAvatarUrl ? (
                          <Img
                            src={n.actorAvatarUrl}
                            alt=""
                            className="h-12 w-12 rounded-full object-cover"
                            fallback={
                              <span className="grid h-12 w-12 place-items-center rounded-full bg-panel text-ink-soft">
                                <Icon name="user" size={21} />
                              </span>
                            }
                          />
                        ) : (
                          <span className="grid h-12 w-12 place-items-center rounded-full bg-panel text-ink-soft">
                            <Icon name="user" size={21} />
                          </span>
                        )}
                        {n.actorId && (
                          <span className={`absolute -bottom-0.5 -right-0.5 grid h-[22px] min-w-[22px] place-items-center rounded-full px-1 ring-2 ring-surface ${copy.badge}`}>
                            {n.count > 1 ? <span className="text-[11px] font-bold leading-none">{n.count}</span> : <Icon name={copy.icon} size={12} />}
                          </span>
                        )}
                      </button>

                      <button onClick={() => onOpen(n)} className="min-w-0 flex-1 text-left">
                        {n.actorId && n.type === 'circle' ? (
                          <p className="text-[15px] font-semibold leading-snug text-ink">
                            {t('You and {name} are now in CX Circle', { name: n.actorUsername ? `@${n.actorUsername}` : n.actorName })}
                          </p>
                        ) : n.actorId ? (
                          <p className="text-[15px] leading-snug text-ink">
                            <span className="font-semibold">{n.actorUsername ? `@${n.actorUsername}` : n.actorName}</span>
                            {role && (
                              <span className="mx-1 inline-flex translate-y-[2px] align-baseline">
                                <VerifiedBadge role={role} size={13} />
                              </span>
                            )}{' '}
                            <span className="text-ink-soft">
                              {n.count > 1 && t(n.count > 2 ? 'and {count} others' : 'and {count} other', { count: n.count - 1 })}
                              {n.count > 1 ? ' ' : ''}
                              {copy.verb}
                            </span>
                          </p>
                        ) : (
                          <p className="text-[15px] font-semibold leading-snug text-ink">{anonText(n)}</p>
                        )}
                        {!n.available && <p className="mt-1 text-caption text-faint">{t('This content is no longer available')}</p>}
                        {n.postPreview && (
                          <p className="mt-2 line-clamp-2 rounded-xl bg-panel px-3 py-2 text-detail text-ink-soft">“{n.postPreview}”</p>
                        )}
                        {n.type === 'follow' && n.actorId && (
                          <span className="mt-2.5 inline-flex min-h-9 items-center rounded-full bg-ink px-4 text-detail font-semibold text-white">
                            View profile
                          </span>
                        )}
                      </button>

                      <div className="relative flex shrink-0 flex-col items-end gap-1">
                        <span className={`text-caption tabular-nums ${isUnread ? 'font-semibold text-accent' : 'text-faint'}`}>{timeAgo(n.createdAt)}</span>
                        <div className="flex items-center gap-1.5">
                          <UnreadDot show={isUnread} />
                          <button
                            onClick={() => setMenuFor((m) => (m === n.id ? null : n.id))}
                            aria-label="More"
                            aria-expanded={menuFor === n.id}
                            className="pressable grid h-9 w-9 place-items-center rounded-full text-faint transition-colors hover:bg-panel hover:text-ink"
                          >
                            <Icon name="moreHorizontal" size={18} />
                          </button>
                        </div>
                        {menuFor === n.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                            <div className="absolute right-0 top-14 z-20 w-48 origin-top-right animate-scale-in overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-pop">
                              {isUnread && onMarkRead && (
                                <button
                                  onClick={() => { onMarkRead(n.id); setMenuFor(null); }}
                                  className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-detail text-ink transition-colors hover:bg-panel"
                                >
                                  <Icon name="check" size={15} /> Mark as read
                                </button>
                              )}
                              <button
                                onClick={() => { setMenuFor(null); onOpen(n); }}
                                className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-detail text-ink transition-colors hover:bg-panel"
                              >
                                <Icon name="arrowUpRight" size={15} /> {n.visionId ? 'Open Vision' : n.postId ? 'Open post' : 'Open profile'}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}

      {hasMore && (
        <div className="mt-4">
          <button onClick={loadMore} disabled={loadingMore} className="btn btn-secondary btn-block disabled:opacity-50">
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
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
          className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent-bright"
          initial={reduceMotion ? undefined : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={reduceMotion ? undefined : { scale: 0, opacity: 0 }}
          transition={SPRING_SNAPPY}
        />
      )}
    </AnimatePresence>
  );
}
