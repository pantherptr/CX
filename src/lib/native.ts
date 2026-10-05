// Thin wrapper around Capacitor's native plugins. Every function here is a
// safe no-op (or a sane web fallback) when running in a regular browser tab —
// `Capacitor.isNativePlatform()` is only true inside the iOS app shell — so
// this file can be imported from shared components without branching on
// platform at every call site.
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';

const isNative = () => Capacitor.isNativePlatform();

export const haptics = {
  light: () => {
    if (isNative()) void Haptics.impact({ style: ImpactStyle.Light });
  },
  success: () => {
    if (isNative()) void Haptics.notification({ type: NotificationType.Success });
  },
  warning: () => {
    if (isNative()) void Haptics.notification({ type: NotificationType.Warning });
  },
  error: () => {
    if (isNative()) void Haptics.notification({ type: NotificationType.Error });
  },
  /** One light tick for a discrete UI change — a switch flipping, a tab
   *  changing, a photo snapping to the next slide. Native haptics inside
   *  the app; the Vibration API on Android browsers; nothing on iOS
   *  Safari, which exposes no haptics to the web at all. Never both: a
   *  native Android shell also exposes `navigator.vibrate`, and firing
   *  both would double the buzz. */
  tick: () => {
    if (isNative()) {
      void Haptics.impact({ style: ImpactStyle.Light });
      return;
    }
    try {
      navigator.vibrate?.(6);
    } catch {
      // Throws in some embedded/iframe contexts — never worth surfacing.
    }
  },
};

/**
 * Opens the iOS share sheet natively; falls back to the Web Share API, then
 * to copying the link to the clipboard, so the same call works everywhere.
 */
export async function shareLink(opts: { title: string; text?: string; url: string }): Promise<'shared' | 'copied' | 'failed'> {
  if (isNative()) {
    try {
      await Share.share(opts);
      return 'shared';
    } catch {
      return 'failed';
    }
  }
  if (navigator.share) {
    try {
      await navigator.share(opts);
      return 'shared';
    } catch {
      return 'failed';
    }
  }
  try {
    await navigator.clipboard.writeText(opts.url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
