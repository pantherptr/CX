import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

/**
 * Browser notifications (Web Push) — so a message or a booking update reaches the phone or computer
 * while the site is closed. On iPhone the site must first be added to the Home Screen (Apple's rule);
 * the native app uses APNs instead (src/lib/push.ts).
 *
 * Needs VITE_VAPID_PUBLIC_KEY (and the matching private key on the server).
 */

const PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type WebPushState =
  | 'unsupported'   // this browser cannot do it
  | 'needs-install' // iPhone/iPad Safari tab: add to Home Screen first
  | 'unconfigured'  // the site has no VAPID key yet
  | 'blocked'       // the person said no in the browser
  | 'off'           // possible, not enabled
  | 'on';

const isIosSafariTab = () => {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua);
  const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
};

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function getWebPushState(): Promise<WebPushState> {
  if (Capacitor.isNativePlatform()) return 'unsupported';
  if (isIosSafariTab()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (!PUBLIC_KEY) return 'unconfigured';
  if (Notification.permission === 'denied') return 'blocked';
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = await reg?.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

export async function enableWebPush(): Promise<{ state: WebPushState; error?: string }> {
  const pre = await getWebPushState();
  if (pre === 'unsupported' || pre === 'needs-install' || pre === 'unconfigured' || pre === 'blocked') return { state: pre };
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { state: permission === 'denied' ? 'blocked' : 'off' };
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY as string) as unknown as BufferSource,
      });
    }
    const json = sub.toJSON();
    const { error } = await supabase.rpc('save_web_push_subscription', {
      p_endpoint: sub.endpoint,
      p_p256dh: json.keys?.p256dh ?? '',
      p_auth: json.keys?.auth ?? '',
      p_user_agent: navigator.userAgent,
    });
    if (error) return { state: 'off', error: error.message };
    return { state: 'on' };
  } catch (err) {
    return { state: 'off', error: err instanceof Error ? err.message : 'Could not turn notifications on.' };
  }
}

export async function disableWebPush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await supabase.from('web_push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
  } catch {
    /* nothing to undo */
  }
}

/** Re-saves an existing subscription for the signed-in user (a shared browser, a new account). */
export async function syncWebPush(): Promise<void> {
  try {
    if ((await getWebPushState()) !== 'on') return;
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const json = sub.toJSON();
    await supabase.rpc('save_web_push_subscription', {
      p_endpoint: sub.endpoint,
      p_p256dh: json.keys?.p256dh ?? '',
      p_auth: json.keys?.auth ?? '',
      p_user_agent: navigator.userAgent,
    });
  } catch {
    /* best effort */
  }
}
