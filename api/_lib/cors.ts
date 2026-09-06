import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Requests from the native iOS app arrive with an `Origin` header the
 * browser's same-origin web build never sends, because Capacitor's
 * WKWebView serves the bundled app from its own origin rather than this
 * deployment's domain — `capacitor://localhost` with Capacitor's default
 * scheme, or `https://localhost` if that default is ever switched. Without
 * an explicit Access-Control-Allow-Origin response, the WebView blocks the
 * response before the app ever sees it, even though the request itself
 * reached this function fine.
 *
 * The plain web app needs no CORS headers at all (it's same-origin), so
 * this only ever matches the native app's fixed origins — never `*`, since
 * these endpoints act on the caller's own bearer token.
 */
const ALLOWED_ORIGINS = ['capacitor://localhost', 'https://localhost', 'http://localhost'];

export function applyCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
