import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { notifyUser } from './push.js';

export interface PayoutRow {
  id: string;
  host_id: string;
  payout_status: string | null;
  host_payout_amount: number | null;
  host: { stripe_connect_account_id: string | null; stripe_connect_payouts_enabled: boolean } | null;
}

export const PAYOUT_SELECT =
  'id, host_id, payout_status, host_payout_amount, host:profiles!bookings_host_id_fkey (stripe_connect_account_id, stripe_connect_payouts_enabled)';

/** CX's commission on the host's share (migration 0102): a percentage of the base price, never above 50. */
export async function loadCommissionPct(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase.from('platform_settings').select('host_commission_pct').eq('id', 'main').maybeSingle();
  return Math.min(50, Math.max(0, Number(data?.host_commission_pct ?? 0)));
}

export type PayoutResult = 'paid' | 'blocked' | 'not_required' | 'failed';

/**
 * Pays one booking's host share (a Stripe Transfer to their Connect account) and records it. The same
 * code serves the daily sweep (a day after a trip ends) and a verified handover (the moment both people
 * scan each other's CX Pass). The transfer's idempotency key is per booking, so asking twice can never
 * pay twice.
 */
export async function payHostForBooking(
  supabase: SupabaseClient,
  stripe: Stripe,
  row: PayoutRow,
  commissionPct: number,
): Promise<PayoutResult> {
  const amount = Number(row.host_payout_amount ?? 0);
  if (amount <= 0) {
    await supabase.from('bookings').update({ payout_status: 'not_required' }).eq('id', row.id);
    return 'not_required';
  }
  if (!row.host?.stripe_connect_account_id || !row.host.stripe_connect_payouts_enabled) {
    await supabase.from('bookings').update({ payout_status: 'blocked' }).eq('id', row.id);
    // Once, not every time: only when it first becomes blocked.
    if (row.payout_status !== 'blocked') {
      await notifyUser(supabase, row.host_id, {
        kind: 'payout_blocked',
        key: 'payout_blocked',
        vars: { amount: amount.toFixed(2) },
        title: 'Finish your payout setup',
        body: `A €${amount.toFixed(2)} payout is waiting — add your bank details to receive it.`,
        url: '/host#earnings',
      });
    }
    return 'blocked';
  }
  const commission = Math.round(amount * commissionPct) / 100;
  const net = Math.round((amount - commission) * 100) / 100;
  try {
    const transfer = await stripe.transfers.create(
      {
        amount: Math.round(net * 100),
        currency: 'eur',
        destination: row.host.stripe_connect_account_id,
        transfer_group: row.id,
        metadata: { bookingId: row.id, gross: String(amount), commissionPct: String(commissionPct), commission: String(commission) },
      },
      { idempotencyKey: `payout-${row.id}` },
    );
    const { error: ledgerError } = await supabase.from('booking_payouts').upsert({
      booking_id: row.id,
      host_id: row.host_id,
      gross: amount,
      commission_pct: commissionPct,
      commission,
      net,
      stripe_transfer_id: transfer.id,
    });
    if (ledgerError) console.error('[payout] ledger insert failed', row.id, ledgerError);
    await supabase
      .from('bookings')
      .update({ payout_status: 'paid', stripe_transfer_id: transfer.id, payout_paid_at: new Date().toISOString() })
      .eq('id', row.id);
    await notifyUser(supabase, row.host_id, {
      kind: 'payout_sent',
      key: 'payout_sent',
      vars: { amount: net.toFixed(2) },
      title: 'Payout on its way',
      body: `€${net.toFixed(2)} is being sent to your bank.`,
      url: '/host#earnings',
    });
    return 'paid';
  } catch (err) {
    console.error('[payout] failed for booking', row.id, err);
    await supabase.from('bookings').update({ payout_status: 'failed' }).eq('id', row.id);
    return 'failed';
  }
}
