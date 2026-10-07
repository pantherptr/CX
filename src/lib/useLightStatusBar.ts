import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

/** Full-screen dark surfaces (Story camera/editor) need light status-bar
 *  text; the app's own surface is light, so it goes back to dark on exit.
 *  A no-op everywhere but the native iOS shell. */
export function useLightStatusBar() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    return () => {
      void StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    };
  }, []);
}
