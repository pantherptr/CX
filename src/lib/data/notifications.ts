import { useCallback, useEffect, useId, useState } from 'react';
import { supabase } from '../supabase';

/**
 * A real, general notification feed — see
 * supabase/migrations/0054_notifications.sql for why this is deliberately
 * not SIGNAL-specific (a `type` + optional `post_id`, not a "signal_
 * notifications" table): a future booking/message event can reuse this
 * exact table and these same RPCs rather than a second parallel system.
 * Every write happens server-side as a side effect of a real interaction
 * (toggle_profile_follow, toggle_empire_post_like, add_empire_post_comment,
 * increment_empire_post_share) — nothing here ever inserts a notification
 * directly, matching this app's "every write through an RPC" convention.
 */

export type NotificationType =
  | 'follow' | 'post_respect' | 'post_comment' | 'post_share' | 'post_save'
  | 'circle' | 'follow_accepted' | 'follow_request' | 'vision_selected' | 'vision_featured'
  | 'collab_invite' | 'collab_left';

export interface SignalNotification {
  id: string;
  type: NotificationType;
  createdAt: string;
  readAt: string | null;
  /** How many times this event has happened since it was last read (0074-style
   *  aggregation — see 0078). 1 for a plain, un-aggregated notification. */
  count: number;
  actorId: string | null;
  actorName: string;
  actorAvatarUrl: string | null;
  /** `null` until the actor has chosen one — same real username every
   *  other SIGNAL surface (posts, comments, search) already shows. */
  actorUsername: string | null;
  actorIsOwner: boolean;
  actorIsAdmin: boolean;
  actorIsHost: boolean;
  actorIsVerifiedClient: boolean;
  postId: string | null;
  /** The Vision a Spotlight notification points at. */
  visionId: string | null;
  /** False when what it points at was deleted or is no longer visible to you — open the safe state, not the content. */
  available: boolean;
  /** A follow request still waiting for you to accept or decline it. */
  pendingRequest: boolean;
  /** A short preview of the post this notification refers to, if any —
   *  `null` for a follow (no post involved) or if the post was since
   *  deleted (the FK is `on delete cascade`, so in practice the whole
   *  notification row would already be gone in that case too). */
  postPreview: string | null;
}

interface NotificationRow {
  id: string;
  type: NotificationType;
  created_at: string;
  read_at: string | null;
  count: number;
  actor_id: string | null;
  actor_name: string | null;
  actor_avatar_url: string | null;
  actor_username?: string | null;
  actor_is_owner?: boolean;
  actor_is_admin?: boolean;
  actor_is_host?: boolean;
  actor_is_verified_client?: boolean;
  post_id: string | null;
  post_body: string | null;
  vision_id?: string | null;
  available?: boolean;
  pending_request?: boolean;
}

function mapNotification(row: NotificationRow): SignalNotification {
  return {
    id: row.id,
    type: row.type,
    createdAt: row.created_at,
    readAt: row.read_at,
    count: row.count ?? 1,
    actorId: row.actor_id,
    // `actorId` is null when the actor stays private (not connected to the
    // recipient) — the server never sends their identity in that case.
    actorName: row.actor_name ?? '',
    actorAvatarUrl: row.actor_avatar_url,
    actorUsername: row.actor_username ?? null,
    actorIsOwner: row.actor_is_owner ?? false,
    actorIsAdmin: row.actor_is_admin ?? false,
    actorIsHost: row.actor_is_host ?? false,
    actorIsVerifiedClient: row.actor_is_verified_client ?? false,
    postId: row.post_id,
    visionId: row.vision_id ?? null,
    available: row.available ?? true,
    pendingRequest: row.pending_request ?? false,
    postPreview: row.post_body ? row.post_body.slice(0, 120) : null,
  };
}

/** Where a notification leads, or null when there is nothing to open. */
export function notificationPath(n: SignalNotification, base: string, myId: string | undefined): string | null {
  if ((n.type === 'collab_invite' || n.type === 'collab_left') && n.visionId && !n.postId) {
    const owner = n.type === 'collab_invite' ? n.actorId : myId;
    return owner ? `${base}/profile/${owner}?vision=${n.visionId}` : null;
  }
  if (n.type === 'vision_selected' || n.type === 'vision_featured') {
    return myId && n.visionId ? `${base}/profile/${myId}?vision=${n.visionId}` : null;
  }
  if (n.postId) return `${base}/post/${n.postId}`;
  if (n.actorId) return `${base}/profile/${n.actorId}`;
  return null;
}

/** The five groups of Activity the person can switch on or off (kept on the server, so a
 *  switched-off kind is never created). */
export interface NotificationPrefs { followers: boolean; requests: boolean; circle: boolean; respects: boolean; visions: boolean }
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = { followers: true, requests: true, circle: true, respects: true, visions: true };

export async function fetchNotificationPrefs(): Promise<NotificationPrefs> {
  const { data, error } = await supabase.rpc('get_my_notification_prefs');
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) return DEFAULT_NOTIFICATION_PREFS;
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(row as Partial<NotificationPrefs>) };
}

export async function saveNotificationPrefs(p: NotificationPrefs): Promise<void> {
  await supabase.rpc('set_my_notification_prefs', {
    p_followers: p.followers, p_requests: p.requests, p_circle: p.circle, p_respects: p.respects, p_visions: p.visions,
  });
}

const PAGE_SIZE = 30;

export async function fetchMyNotifications(before?: string): Promise<SignalNotification[]> {
  const { data, error } = await supabase.rpc('fetch_my_notifications', { p_limit: PAGE_SIZE, p_before: before ?? null });
  if (error) throw error;
  return (data as NotificationRow[]).map(mapNotification);
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const { data, error } = await supabase.rpc('fetch_unread_notification_count');
  if (error) return 0;
  return (data as number) ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.rpc('mark_notification_read', { p_notification_id: id });
}

export async function markAllNotificationsRead(): Promise<void> {
  await supabase.rpc('mark_all_notifications_read');
}

/** The bell badge count — same live-update shape `useUnreadMessageCount`
 *  (messages.ts) already established: an initial fetch plus a debounced
 *  refetch on any insert/update to the underlying table, rather than a
 *  second polling mechanism. */
export function useUnreadNotificationCount(userId: string | undefined) {
  const instanceId = useId();
  const [count, setCount] = useState(0);

  const refetch = useCallback(() => {
    if (!userId) {
      setCount(0);
      return;
    }
    fetchUnreadNotificationCount().then(setCount);
  }, [userId]);

  useEffect(() => {
    refetch();
    if (!userId) return;
    let debounceHandle: number | null = null;
    const scheduleRefetch = () => {
      if (debounceHandle) window.clearTimeout(debounceHandle);
      debounceHandle = window.setTimeout(refetch, 250);
    };
    const channel = supabase
      .channel(`notifications-count:${userId}:${instanceId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, scheduleRefetch)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications' }, scheduleRefetch)
      .subscribe();
    return () => {
      if (debounceHandle) window.clearTimeout(debounceHandle);
      supabase.removeChannel(channel);
    };
  }, [userId, instanceId, refetch]);

  return { count, refetch };
}

/** The full notification list page — a plain paginated fetch (same
 *  `loadMore`/`refresh` shape as useEmpireFeed), plus a `markRead` that
 *  optimistically flips one row locally so tapping a notification feels
 *  instant instead of waiting on the round trip. */
export function useMyNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<SignalNotification[] | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadInitial = useCallback(() => {
    if (!userId) {
      setNotifications([]);
      setHasMore(false);
      return;
    }
    setNotifications(null);
    fetchMyNotifications()
      .then((rows) => {
        setNotifications(rows);
        setHasMore(rows.length === PAGE_SIZE);
      })
      .catch(() => {
        setNotifications([]);
        setHasMore(false);
      });
  }, [userId]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (!notifications || notifications.length === 0 || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const rows = await fetchMyNotifications(notifications[notifications.length - 1].createdAt);
      setNotifications((prev) => [...(prev ?? []), ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [notifications, loadingMore, hasMore]);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => (prev ? prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)) : prev));
    void markNotificationRead(id);
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => (prev ? prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) : prev));
    void markAllNotificationsRead();
  }, []);

  return { notifications, loadMore, loadingMore, hasMore, refresh: loadInitial, markRead, markAllRead };
}
