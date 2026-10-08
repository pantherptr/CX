import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

/** Full-screen dark surfaces (Story camera/editor/viewer, a profile cover)
 *  need light status-bar text; the app's own surface is light, so it goes
 *  back to dark on exit (or whenever `light` turns false). A no-op
 *  everywhere but the native iOS shell. */
export function useLightStatusBar(light = true) {
  useEffect(() => {
    if (!light || !Capacitor.isNativePlatform()) return;
    void StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    return () => {
      void StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    };
  }, [light]);
}
