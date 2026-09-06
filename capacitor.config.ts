import type { CapacitorConfig } from '@capacitor/cli';

// PLACEHOLDER — appId must match the Bundle Identifier you register in
// your own Apple Developer account / App Store Connect before this can
// ever be archived or uploaded. "com.cxrent.app" is a stand-in; nobody
// but you can create the real one, since it's tied to your Apple
// Developer Team ID. Change it here AND in Xcode (Signing & Capabilities)
// — they must match exactly.
const config: CapacitorConfig = {
  appId: 'com.cxrent.app',
  appName: 'CX Rent',
  webDir: 'dist',
  ios: {
    // Matches the app's existing warm off-white surface (--color-bg in
    // index.css) so the native chrome doesn't flash a mismatched color
    // during launch/orientation changes.
    backgroundColor: '#FBFBF9',
  },
  plugins: {
    SplashScreen: {
      // Brief and brand-colored, not a multi-second animated intro —
      // matches the brief's own "keep it elegant and fast" instruction.
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#FBFBF9',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'DARK', // dark text/icons — the app's default surface is light
    },
    Keyboard: {
      // 'native' resizes the actual WKWebView when the keyboard shows,
      // which is what makes `dvh`-based layouts (see Messages.tsx's chat
      // view) correctly shrink to leave room for the keyboard instead of
      // being covered by it. This is already Capacitor's own default —
      // set explicitly so it can't silently change in a future version.
      resize: 'native',
    },
  },
};

export default config;
