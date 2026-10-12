// Thin wrapper around Capacitor's native plugins. Every function here is a
// safe no-op (or a sane web fallback) when running in a regular browser tab —
// `Capacitor.isNativePlatform()` is only true inside the iOS app shell — so
// this file can be imported from shared components without branching on
// platform at every call site.
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';

const isNative = () => Capacitor.isNativePlatform();

/** iOS Safari (17.4+) exposes no haptics API, but toggling a native `<input switch>` fires the system
 *  tick. A hidden switch is clicked from inside a user gesture. Fails soft everywhere else. */
let tickLabel: HTMLLabelElement | null = null;
function iosWebTick(): boolean {
  try {
    if (typeof document === 'undefined' || !/iP(hone|ad|od)/.test(navigator.userAgent)) return false;
    if (!tickLabel || !tickLabel.isConnected) {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
      tickLabel = label;
    }
    tickLabel.click();
    return true;
  } catch {
    return false;
  }
}

export const haptics = {
  light: () => {
    if (isNative()) void Haptics.impact({ style: ImpactStyle.Light });
    else iosWebTick();
  },
  /** A firmer thud — a sheet snapping closed, a scan landing. */
  medium: () => {
    if (isNative()) void Haptics.impact({ style: ImpactStyle.Medium });
    else iosWebTick();
  },
  success: () => {
    if (isNative()) void Haptics.notification({ type: NotificationType.Success });
    else iosWebTick();
  },
  warning: () => {
    if (isNative()) void Haptics.notification({ type: NotificationType.Warning });
    else iosWebTick();
  },
  error: () => {
    if (isNative()) void Haptics.notification({ type: NotificationType.Error });
    else iosWebTick();
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
    if (iosWebTick()) return;
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
