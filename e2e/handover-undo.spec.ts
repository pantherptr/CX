import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

/**
 * The handover and its "Undo", checked at the database level (no camera needed): the host scans the renter,
 * the renter may NOT undo it, the host may, and the booking goes back to "not verified".
 *
 * It WRITES to the booking you give it (and puts it back), so it only runs when you say so:
 *
 *   E2E_ALLOW_WRITES=1  E2E_HOST_EMAIL  E2E_HOST_PASSWORD  E2E_RENTER_EMAIL  E2E_RENTER_PASSWORD  E2E_BOOKING_ID
 *
 * Use a TEST booking between the two TEST accounts. Never a real customer's.
 */
function viteEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (!existsSync('.env.local')) return undefined;
  const m = readFileSync('.env.local', 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'));
  return m?.[1]?.replace(/^["']|["']$/g, '');
}

const url = viteEnv('VITE_SUPABASE_URL');
const anon = viteEnv('VITE_SUPABASE_ANON_KEY');
const ready = Boolean(
  process.env.E2E_ALLOW_WRITES === '1' && url && anon && process.env.E2E_HOST_EMAIL && process.env.E2E_HOST_PASSWORD &&
    process.env.E2E_RENTER_EMAIL && process.env.E2E_RENTER_PASSWORD && process.env.E2E_BOOKING_ID,
);

async function login(email: string, password: string) {
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = (await r.json()) as { access_token?: string; user?: { id: string } };
  if (!j.access_token || !j.user) throw new Error('sign-in failed');
  return { token: j.access_token, id: j.user.id };
}

async function rpc(token: string, fn: string, body: Record<string, unknown>) {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: anon!, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { ok: r.ok, json, text };
}

test.describe('handover + undo (database level)', () => {
  test.skip(!ready, 'set E2E_ALLOW_WRITES=1 and the E2E_HOST_* / E2E_RENTER_* / E2E_BOOKING_ID variables');

  test('host scans, renter cannot undo, host can, booking is clean again', async () => {
    const booking = process.env.E2E_BOOKING_ID!;
    const host = await login(process.env.E2E_HOST_EMAIL!, process.env.E2E_HOST_PASSWORD!);
    const renter = await login(process.env.E2E_RENTER_EMAIL!, process.env.E2E_RENTER_PASSWORD!);

    // start clean: undo anything left over from before (ignore the answer)
    await rpc(host.token, 'undo_handover', { p_booking_id: booking, p_kind: 'pickup' });

    const scan = await rpc(host.token, 'verify_handover', { p_booking_id: booking, p_counterpart: renter.id });
    expect(scan.ok, scan.text).toBe(true);

    const state = await rpc(host.token, 'booking_handover_state', { p_booking_id: booking });
    const row = (state.json as { pickup_at: string | null; pickup_by: string | null }[])[0];
    expect(row?.pickup_at, 'the pickup is recorded').toBeTruthy();
    expect(row?.pickup_by).toBe(host.id);

    const wrong = await rpc(renter.token, 'undo_handover', { p_booking_id: booking, p_kind: 'pickup' });
    expect(wrong.ok, 'the renter must not be able to undo the host\'s scan').toBe(false);

    const undo = await rpc(host.token, 'undo_handover', { p_booking_id: booking, p_kind: 'pickup' });
    expect(undo.ok, undo.text).toBe(true);

    const after = await rpc(host.token, 'booking_handover_state', { p_booking_id: booking });
    expect((after.json as unknown[]).length, 'no handover left').toBe(0);
  });
});
