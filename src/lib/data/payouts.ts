import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { apiUrl } from '../api';

/** A host's Stripe Express payout account — see
 *  supabase/migrations/0068_stripe_connect_payouts.sql. `accountId` is
 *  null until onboarding is started at least once; `payoutsEnabled` only
 *  flips true once Stripe has actually verified the account, not just
 *  because onboarding was started. */
export interface ConnectStatus {
  accountId: string | null;
  payoutsEnabled: boolean;
}

/** `null` while loading, the real status once resolved — same convention
 *  as every other `use*` hook in this codebase. `error` is surfaced
 *  rather than swallowed: a failed query here (e.g. migration
 *  0068_stripe_connect_payouts.sql not yet applied) would otherwise fall
 *  back to `accountId: null, payoutsEnabled: false` and *look* like a
 *  perfectly normal "not set up yet" state instead of a real error. */
export function useConnectStatus(userId: string | undefined) {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (!userId) {
      setStatus(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    supabase
      .from('profiles')
      .select('stripe_connect_account_id, stripe_connect_payouts_enabled')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          return;
        }
        setStatus({
          accountId: data?.stripe_connect_account_id ?? null,
          payoutsEnabled: data?.stripe_connect_payouts_enabled ?? false,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, version]);

  return { status, error, refresh };
}

/** Starts (or resumes) Stripe Express onboarding — returns the URL to
 *  send the host to. See api/connect-onboarding-link.ts. */
export async function fetchConnectOnboardingLink(accessToken: string): Promise<{ url: string } | { error: string }> {
  const res = await fetch(apiUrl('/api/connect-onboarding-link'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) return { error: body?.error ?? 'Could not start payout setup.' };
  return { url: body.url as string };
}

/** Re-checks the account directly against Stripe — called right after
 *  the host returns from onboarding, for instant feedback ahead of the
 *  Connect webhook. See api/connect-onboarding-link.ts (action: 'status'). */
export async function refreshConnectStatus(accessToken: string): Promise<{ payoutsEnabled: boolean } | { error: string }> {
  const res = await fetch(apiUrl('/api/connect-onboarding-link'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ action: 'status' }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) return { error: body?.error ?? 'Could not check payout status.' };
  return { payoutsEnabled: Boolean(body.payoutsEnabled) };
}

/** What a host was paid for a trip, and what CX kept — see supabase/migrations/0102. */
export interface HostPayout {
  bookingId: string;
  reference: string | null;
  startDate: string | null;
  endDate: string | null;
  gross: number;
  commissionPct: number;
  commission: number;
  net: number;
  paidAt: string;
}

/** The host's paid-out trips (newest first) and the current commission %. */
export function useHostPayouts(userId: string | undefined) {
  const [payouts, setPayouts] = useState<HostPayout[] | null>(null);
  const [commissionPct, setCommissionPct] = useState<number | null>(null);
  useEffect(() => {
    if (!userId) { setPayouts(null); return; }
    let cancelled = false;
    (async () => {
      const [list, pct] = await Promise.all([
        supabase
          .from('booking_payouts')
          .select('booking_id, gross, commission_pct, commission, net, paid_at, booking:bookings(reference, start_date, end_date)')
          .eq('host_id', userId)
          .order('paid_at', { ascending: false })
          .limit(20),
        supabase.rpc('fetch_host_commission_pct'),
      ]);
      if (cancelled) return;
      type Row = {
        booking_id: string; gross: number; commission_pct: number; commission: number; net: number; paid_at: string;
        booking: { reference: string | null; start_date: string | null; end_date: string | null } | { reference: string | null; start_date: string | null; end_date: string | null }[] | null;
      };
      setPayouts(
        ((list.data ?? []) as unknown as Row[]).map((r) => {
          const b = Array.isArray(r.booking) ? r.booking[0] : r.booking;
          return {
            bookingId: r.booking_id, reference: b?.reference ?? null, startDate: b?.start_date ?? null, endDate: b?.end_date ?? null,
            gross: Number(r.gross), commissionPct: Number(r.commission_pct), commission: Number(r.commission), net: Number(r.net), paidAt: r.paid_at,
          };
        }),
      );
      if (typeof pct.data === 'number') setCommissionPct(pct.data);
    })();
    return () => { cancelled = true; };
  }, [userId]);
  return { payouts, commissionPct };
}
