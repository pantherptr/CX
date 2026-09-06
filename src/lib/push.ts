import { Capacitor } from '@capacitor/core';
import { PushNotifications, type ActionPerformed, type PushNotificationSchema, type Token } from '@capacitor/push-notifications';
import { supabase } from './supabase';

/**
 * Registers this device for push notifications and upserts the resulting
 * token into device_tokens (see supabase/migrations/0020_push_device_tokens.sql)
 * so api/_lib/push.ts can find it later. A no-op on the web build —
 * Capacitor.isNativePlatform() is only true inside the iOS shell.
 *
 * Wired from AuthProvider (src/lib/auth.tsx) so it runs once per signed-in
 * session: on cold launch if already signed in, and again right after a
 * fresh sign-in.
 */

let currentToken: string | null = null;
let listenersAttached = false;

export async function registerPushToken(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  if (!listenersAttached) {
    listenersAttached = true;

    PushNotifications.addListener('registration', (token: Token) => {
      currentToken = token.value;
      void supabase
        .from('device_tokens')
        .upsert({ user_id: userId, token: token.value, platform: 'ios', updated_at: new Date().toISOString() }, { onConflict: 'token' });
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('[push] registration failed', err);
    });

    // Foreground delivery — iOS doesn't show a banner for a notification
    // that arrives while the app is already open, so this is where an
    // in-app toast would hook in if/when one is added.
    PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      console.log('[push] received in foreground', notification);
    });

    // Tapping a notification (app backgrounded or closed). A full
    // navigation via location.assign is the simplest reliable way to
    // deep-link from a plain lib module with no router context — the same
    // thing a notification's web-push equivalent or a mailto link would
    // do, just inside the app's own webview.
    PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      const url = action.notification.data?.url;
      if (typeof url === 'string') window.location.assign(url);
    });
  }

  const current = await PushNotifications.checkPermissions();
  let status = current.receive;
  if (status === 'prompt' || status === 'prompt-with-rationale') {
    status = (await PushNotifications.requestPermissions()).receive;
  }
  if (status !== 'granted') return;

  await PushNotifications.register();
}

/** Removes this device's token so a shared or lost device stops receiving
 *  push for the account that just signed out. Called before
 *  supabase.auth.signOut() so the delete still runs under that user's own
 *  RLS policy (auth.uid() = user_id). */
export async function unregisterPushToken(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !currentToken) return;
  await supabase.from('device_tokens').delete().eq('token', currentToken);
  currentToken = null;
}
