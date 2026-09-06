import { Capacitor } from '@capacitor/core';

/**
 * On the web, `fetch('/api/...')` is a same-origin relative request and
 * just works. Inside the native iOS shell it does not: Capacitor serves the
 * bundled web app from its own origin (capacitor://localhost /
 * https://localhost), not from the real deployed domain, so a relative
 * `/api/...` request would try to reach a route that doesn't exist inside
 * the WKWebView instead of the actual Vercel backend.
 *
 * VITE_API_BASE_URL is baked into the bundle at build time (see
 * .env.example) and left empty for ordinary web builds, where the relative
 * path is already correct. Native builds must set it to the deployed
 * backend's origin before running `npm run build && npx cap sync ios`.
 */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export function apiUrl(path: string): string {
  if (Capacitor.isNativePlatform() && !API_BASE_URL && import.meta.env.DEV === false) {
    console.warn(
      `[api] VITE_API_BASE_URL is not set — "${path}" will fail inside the native iOS app, ` +
        'which has no same-origin backend to call.',
    );
  }
  return `${API_BASE_URL}${path}`;
}
