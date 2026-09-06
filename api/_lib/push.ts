import { createSign } from 'crypto';
import http2 from 'http2';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Push notifications over APNs, using Node's own `crypto` and `http2`
 * rather than a library — the whole thing is a signed JWT and one HTTP/2
 * POST per device, which doesn't warrant a new dependency.
 *
 * Requires an APNs Auth Key (.p8) from the Apple Developer portal
 * (Certificates, Identifiers & Profiles -> Keys -> "Apple Push
 * Notifications service"), which only exists once you have a paid
 * developer account — see the iOS runbook's "Apple-account boundary".
 * Until these env vars are set, every call here is a no-op that logs a
 * warning, the same graceful-skip pattern api/_lib/email.ts uses for
 * Resend.
 */

const APNS_KEY_ID = process.env.APNS_KEY_ID;
const APNS_TEAM_ID = process.env.APNS_TEAM_ID;
// The .p8 file's contents, PEM-armored ("-----BEGIN PRIVATE KEY-----...").
// Vercel env vars support literal newlines pasted in directly; if yours
// arrives with escaped "\n" instead (common when copy-pasting into a
// single-line field), this unescapes it.
const APNS_PRIVATE_KEY = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, '\n');
// Must equal the app's real bundle identifier (capacitor.config.ts's
// appId once it's the real one, not the com.cxrent.app placeholder).
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID;
const APNS_HOST = process.env.APNS_ENVIRONMENT === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';

const configured = Boolean(APNS_KEY_ID && APNS_TEAM_ID && APNS_PRIVATE_KEY && APNS_BUNDLE_ID);

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// APNs JWTs are valid up to an hour; reusing one instead of signing a new
// one per request is what Apple's own docs recommend. Refreshed a few
// minutes early to avoid a request landing right on the expiry edge.
let cachedJwt: { token: string; issuedAt: number } | null = null;

function getProviderToken(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.issuedAt < 50 * 60) return cachedJwt.token;

  const header = base64url(JSON.stringify({ alg: 'ES256', kid: APNS_KEY_ID }));
  const payload = base64url(JSON.stringify({ iss: APNS_TEAM_ID, iat: now }));
  const signingInput = `${header}.${payload}`;
  // APNs expects the raw JOSE (IEEE P1363, r||s concatenated) signature
  // format, not the DER encoding Node's crypto produces by default for EC
  // keys — `dsaEncoding: 'ieee-p1363'` is what makes that switch.
  const signature = createSign('SHA256')
    .update(signingInput)
    .sign({ key: APNS_PRIVATE_KEY as string, dsaEncoding: 'ieee-p1363' });

  const token = `${signingInput}.${base64url(signature)}`;
  cachedJwt = { token, issuedAt: now };
  return token;
}

interface PushPayload {
  title: string;
  body: string;
  /** Arbitrary extra fields merged into the APNs payload, outside `aps` —
   *  e.g. a conversation or booking id so the app can deep-link on tap. */
  data?: Record<string, string>;
}

interface SendResult {
  ok: boolean;
  status: number;
  /** APNs' machine-readable failure reason (e.g. "BadDeviceToken",
   *  "Unregistered") when ok is false and the request actually reached
   *  Apple. */
  reason?: string;
}

function sendOne(token: string, payload: PushPayload): Promise<SendResult> {
  return new Promise((resolve) => {
    const client = http2.connect(APNS_HOST);
    client.on('error', (err) => resolve({ ok: false, status: 0, reason: String(err) }));

    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${getProviderToken()}`,
      'apns-topic': APNS_BUNDLE_ID,
      'apns-push-type': 'alert',
      'content-type': 'application/json',
    });

    let status = 0;
    let body = '';
    req.on('response', (headers) => {
      status = Number(headers[':status'] ?? 0);
    });
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      client.close();
      if (status === 200) {
        resolve({ ok: true, status });
        return;
      }
      let reason: string | undefined;
      try {
        reason = JSON.parse(body).reason;
      } catch {
        // Non-JSON body — reason stays undefined, status still reported.
      }
      resolve({ ok: false, status, reason });
    });
    req.on('error', (err) => {
      client.close();
      resolve({ ok: false, status: 0, reason: String(err) });
    });

    req.end(
      JSON.stringify({
        aps: { alert: { title: payload.title, body: payload.body }, sound: 'default' },
        ...payload.data,
      }),
    );
  });
}

/**
 * Sends a push to every device a user is currently registered on (see
 * src/lib/push.ts for registration). Fire-and-forget from the caller's
 * point of view — a push failing must never fail the booking/message/
 * reminder it's attached to, mirroring how api/_lib/email.ts is used.
 *
 * A token APNs reports as permanently dead (`Unregistered` / `410`, or
 * `BadDeviceToken` / `400`) is removed from device_tokens so it isn't
 * retried forever — the same "prune on hard failure" approach a bounced
 * email address would get, just done inline since there's no bounce
 * webhook here.
 */
export async function sendPushToUser(supabase: SupabaseClient, userId: string, payload: PushPayload): Promise<void> {
  if (!configured) {
    console.warn('[push] APNs is not configured — skipping push:', payload.title, 'to user', userId);
    return;
  }

  const { data: rows, error } = await supabase.from('device_tokens').select('token').eq('user_id', userId);
  if (error || !rows || rows.length === 0) return;

  const results = await Promise.all(
    (rows as { token: string }[]).map((row) => sendOne(row.token, payload).then((result) => ({ token: row.token, result }))),
  );

  const deadTokens = results
    .filter(({ result }: { result: SendResult }) => !result.ok && (result.status === 410 || result.reason === 'BadDeviceToken' || result.reason === 'Unregistered'))
    .map(({ token }: { token: string }) => token);

  const failed = results.filter(({ token, result }: { token: string; result: SendResult }) => !result.ok && !deadTokens.includes(token));
  if (failed.length > 0) {
    console.error(
      '[push] send failed for',
      failed.length,
      'of',
      results.length,
      'device(s) for user',
      userId,
      failed.map((f) => f.result.reason),
    );
  }

  if (deadTokens.length > 0) {
    await supabase.from('device_tokens').delete().in('token', deadTokens);
  }
}
