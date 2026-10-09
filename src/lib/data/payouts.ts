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
