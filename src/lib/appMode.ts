import { Capacitor } from '@capacitor/core';

/** True when the site runs as an installed app (Home Screen / PWA standalone, or the native shell)
 *  rather than inside a Safari tab. Decided once at load. */
export const IS_APP: boolean =
  typeof window !== 'undefined' &&
  (Capacitor.isNativePlatform() ||
    // `?app=1` previews the app experience in a normal browser tab.
    new URLSearchParams(window.location.search).has('app') ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);
