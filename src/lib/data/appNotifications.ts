import { useCallback, useEffect, useId, useState } from 'react';
import { supabase } from '../supabase';
import type { IconName } from '../../components/Icon';

/**
 * The platform inbox (migration 0110): bookings, payments, payouts, verification, listing review…
 * Everything fails soft before the migration has run (empty list, zero count).
 */

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  createdAt: string;
  readAt: string | null;
}

interface Row {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  created_at: string;
  read_at: string | null;
}

const toNotification = (r: Row): AppNotification => ({
  id: r.id, kind: r.kind, title: r.title, body: r.body, url: r.url, createdAt: r.created_at, readAt: r.read_at,
});

/** How each kind looks in the inbox: icon + tone. Unknown kinds fall back to a neutral bell. */
export const KIND_STYLE: Record<string, { icon: IconName; tone: 'green' | 'ink' | 'amber' | 'red' }> = {
  booking_confirmed: { icon: 'checkCircle', tone: 'green' },
  handover_verified: { icon: 'verified', tone: 'green' },
  host_respect_trip: { icon: 'like', tone: 'green' },
  share_trip: { icon: 'camera', tone: 'ink' },
  booking_new: { icon: 'trips', tone: 'green' },
  booking_cancelled: { icon: 'x', tone: 'red' },
  booking_refunded: { icon: 'euro', tone: 'green' },
  pickup_tomorrow: { icon: 'key', tone: 'ink' },
  return_tomorrow: { icon: 'clock', tone: 'amber' },
  handover_tomorrow: { icon: 'key', tone: 'ink' },
  return_expected: { icon: 'clock', tone: 'amber' },
  deposit_released: { icon: 'wallet', tone: 'green' },
  payout_sent: { icon: 'euro', tone: 'green' },
  payout_blocked: { icon: 'wallet', tone: 'amber' },
  verification_approved: { icon: 'verified', tone: 'green' },
  verification_rejected: { icon: 'info', tone: 'red' },
  listing_live: { icon: 'cars', tone: 'green' },
  listing_rejected: { icon: 'info', tone: 'red' },
  listing_review: { icon: 'shield', tone: 'amber' },
  review_new: { icon: 'star', tone: 'green' },
  chat_report: { icon: 'shield', tone: 'amber' },
  handover_undone: { icon: 'key', tone: 'amber' },
};

export async function fetchAppNotifications(limit = 60): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('app_notifications')
    .select('id, kind, title, body, url, created_at, read_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as Row[]).map(toNotification);
}

export async function fetchUnreadAppCount(): Promise<number> {
  const { count, error } = await supabase
    .from('app_notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  return error ? 0 : count ?? 0;
}

export async function markAppNotificationRead(id: string): Promise<void> {
  await supabase.rpc('mark_app_notification_read', { p_id: id });
}

export async function markAllAppNotificationsRead(): Promise<void> {
  await supabase.rpc('mark_all_app_notifications_read');
}

/** The inbox list, live: new rows appear at the top the moment they are written. */
export function useAppNotifications(userId: string | undefined) {
  const instanceId = useId();
  const [items, setItems] = useState<AppNotification[] | null>(null);

  useEffect(() => {
    if (!userId) { setItems([]); return; }
    let off = false;
    void fetchAppNotifications().then((r) => { if (!off) setItems(r); });
    const channel = supabase
      .channel(`app-notifications:${userId}:${instanceId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'app_notifications', filter: `user_id=eq.${userId}` }, (p) => {
        const row = toNotification(p.new as Row);
        setItems((prev) => (prev && !prev.some((n) => n.id === row.id) ? [row, ...prev] : prev));
      })
      .subscribe();
    return () => { off = true; supabase.removeChannel(channel); };
  }, [userId, instanceId]);

  const markRead = useCallback((id: string) => {
    setItems((prev) => prev?.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)) ?? prev);
    void markAppNotificationRead(id);
  }, []);
  const markAllRead = useCallback(() => {
    setItems((prev) => prev?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? prev);
    void markAllAppNotificationsRead();
  }, []);

  return { items, markRead, markAllRead };
}

// ---------------------------------------------------------------- what to hear about
export interface PlatformPrefs {
  trips: boolean;
  messages: boolean;
  promos: boolean;
  push: boolean;
}
export const DEFAULT_PLATFORM_PREFS: PlatformPrefs = { trips: true, messages: true, promos: false, push: true };

export async function fetchPlatformPrefs(): Promise<PlatformPrefs> {
  const { data, error } = await supabase.from('user_notification_prefs').select('trips, messages, promos, push').maybeSingle();
  if (error || !data) return DEFAULT_PLATFORM_PREFS;
  return data as PlatformPrefs;
}

export async function savePlatformPrefs(p: PlatformPrefs): Promise<void> {
  await supabase.rpc('save_my_notification_prefs', { p_trips: p.trips, p_messages: p.messages, p_promos: p.promos, p_push: p.push });
}
