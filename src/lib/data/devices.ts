import { Capacitor } from '@capacitor/core';
import { supabase } from '../supabase';

/**
 * "Devices & access": the devices an account has used. The list is informational — the sign-ins
 * themselves are Supabase Auth sessions; signing out others / everywhere goes through the Auth API.
 * Everything fails soft until migration 0105 has been run.
 */

export interface DeviceRow {
  id: string;
  deviceId: string;
  label: string;
  platform: string;
  firstSeen: string;
  lastSeen: string;
}

const KEY = 'cx.device-id';

export function getDeviceId(): string {
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'session-' + Math.random().toString(36).slice(2);
  }
}

/** "iPhone · Safari", "Mac · Chrome", "CX app · iPhone" … from the user agent. */
export function describeDevice(): { label: string; platform: string } {
  const ua = navigator.userAgent;
  const native = Capacitor.isNativePlatform();
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : /Linux/.test(ua) ? 'Linux' : 'Device';
  if (native) return { label: `CX app · ${device}`, platform: 'ios-app' };
  const browser = /EdgA?\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return { label: `${device} · ${browser}`, platform: 'web' };
}

let lastTouch = 0;

/** Records "this device is signed in" (at most every 20 minutes). */
export async function touchDevice(): Promise<void> {
  if (Date.now() - lastTouch < 20 * 60 * 1000) return;
  lastTouch = Date.now();
  const { label, platform } = describeDevice();
  try {
    await supabase.rpc('touch_device', { p_device_id: getDeviceId(), p_label: label, p_platform: platform });
  } catch {
    /* migration not run yet */
  }
}

export async function fetchDevices(): Promise<{ data: DeviceRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('user_devices')
    .select('id, device_id, label, platform, first_seen, last_seen')
    .order('last_seen', { ascending: false });
  if (error) return { data: [], error: error.message };
  return {
    error: null,
    data: (data ?? []).map((r) => ({
      id: r.id as string,
      deviceId: r.device_id as string,
      label: r.label as string,
      platform: r.platform as string,
      firstSeen: r.first_seen as string,
      lastSeen: r.last_seen as string,
    })),
  };
}

/** Signs every other device out (their next refresh is refused) and tidies the list. */
export async function signOutOtherDevices(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signOut({ scope: 'others' });
  if (error) return { error: error.message };
  await supabase.rpc('forget_other_devices', { p_keep_device_id: getDeviceId() });
  return { error: null };
}
