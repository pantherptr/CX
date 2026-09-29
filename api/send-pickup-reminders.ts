import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { sendPickupReminderEmail, sendReturnReminderEmail } from './_lib/email.js';
import { sendPushToUser } from './_lib/push.js';

/**
 * The daily housekeeping sweep — everything here runs once a day rather
 * than being triggered by the app, so it all lives in one endpoint
 * (mindful of the Vercel Hobby plan's cron-job count limit — see the
 * single `crons` entry in vercel.json, `0 8 * * *`):
 *
 *  1. Pickup/return reminders — "promemoria ritiro, scadenza noleggio"
 *     from the original feature list.
 *  2. Releasing security deposit holds (see
 *     supabase/migrations/0019_security_deposit.sql) once a trip has
 *     ended — the "trattenuta e rilasciata automaticamente" half of the
 *     deposit feature; placing the hold itself happens at booking time,
 *     in api/stripe-webhook.ts.
 *  3. Paying out hosts for completed trips (see
 *     supabase/migrations/0068_stripe_connect_payouts.sql) — a Stripe
 *     Transfer of the base rental price to the host's Connect account,
 *     once a trip has ended. Same trip-ended query shape as the deposit
 *     release right above it, so a payout lands within the same ~24h
 *     window a deposit does.
 *
 * "Tomorrow"/"ended" are computed in UTC — a booking's start_date/
 * end_date are plain calendar dates with no timezone of their own, so
 * this is a reasonable approximation rather than something precise per
 * pickup location; good enough for a once-a-day sweep, not worth the
 * complexity of per-city timezones for v1.
 *
 * Protected by CRON_SECRET so this can't be hit by anyone who finds the
 * URL — Vercel Cron sends this header automatically when CRON_SECRET is
 * set as a project env var.
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

interface ReminderBookingRow {
  id: string;
  reference: string;
  renter_id: string;
  start_date: string;
  end_date: string;
  pickup_location: string | null;
  total_price: number;
  car: { make: string; model: string; year: number } | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[send-pickup-reminders] missing Supabase service role configuration');
    return res.status(500).json({ error: 'Not configured.' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowISO = tomorrow.toISOString().slice(0, 10);

  const SELECT = 'id, reference, renter_id, start_date, end_date, pickup_location, total_price, car:cars!bookings_car_id_fkey (make, model, year)';

  const [{ data: pickups, error: pickupsError }, { data: returns, error: returnsError }] = await Promise.all([
    supabase.from('bookings').select(SELECT).eq('status', 'confirmed').eq('start_date', tomorrowISO),
    supabase.from('bookings').select(SELECT).eq('status', 'confirmed').eq('end_date', tomorrowISO),
  ]);

  if (pickupsError || returnsError) {
    console.error('[send-pickup-reminders] query failed', pickupsError || returnsError);
    return res.status(500).json({ error: 'Could not load bookings.' });
  }

  let pickupSent = 0;
  let returnSent = 0;

  for (const row of (pickups ?? []) as unknown as ReminderBookingRow[]) {
    const { data: auth } = await supabase.auth.admin.getUserById(row.renter_id);
    const email = auth?.user?.email;
    const carLabel = row.car ? `${row.car.year} ${row.car.make} ${row.car.model}` : 'your car';
    if (email) {
      await sendPickupReminderEmail(email, {
        reference: row.reference,
        carLabel,
        startDate: row.start_date,
        endDate: row.end_date,
        pickupLocation: row.pickup_location || '',
        totalPrice: Number(row.total_price),
      });
      pickupSent++;
    }
    await sendPushToUser(supabase, row.renter_id, {
      title: 'Pick-up is tomorrow',
      body: `Your ${carLabel} is ready for pick-up tomorrow.`,
      data: { url: '/dashboard#trips' },
    });
  }

  for (const row of (returns ?? []) as unknown as ReminderBookingRow[]) {
    const { data: auth } = await supabase.auth.admin.getUserById(row.renter_id);
    const email = auth?.user?.email;
    const carLabel = row.car ? `${row.car.year} ${row.car.make} ${row.car.model}` : 'your car';
    if (email) {
      await sendReturnReminderEmail(email, {
        reference: row.reference,
        carLabel,
        startDate: row.start_date,
        endDate: row.end_date,
        pickupLocation: row.pickup_location || '',
        totalPrice: Number(row.total_price),
      });
      returnSent++;
    }
    await sendPushToUser(supabase, row.renter_id, {
      title: 'Return is tomorrow',
      body: `Your ${carLabel} is due back tomorrow.`,
      data: { url: '/dashboard#trips' },
    });
  }

  // --- Release security deposits for trips that have ended -------------
  // One day of buffer after end_date (rather than releasing the moment a
  // trip ends) gives a host a small window to flag damage before the
  // hold disappears — a host-facing "capture instead" action is future
  // work; today an admin can still capture a held deposit's PaymentIntent
  // directly from the Stripe dashboard before this sweep releases it.
  const todayISO = new Date().toISOString().slice(0, 10);
  let depositsReleased = 0;
  const { data: endedBookings, error: endedError } = await supabase
    .from('bookings')
    .select('id, stripe_deposit_intent_id')
    .eq('deposit_status', 'held')
    .lt('end_date', todayISO);

  if (endedError) {
    console.error('[send-pickup-reminders] deposit query failed', endedError);
  } else {
    for (const row of endedBookings ?? []) {
      if (!row.stripe_deposit_intent_id) continue;
      try {
        await stripe.paymentIntents.cancel(row.stripe_deposit_intent_id);
        await supabase.from('bookings').update({ deposit_status: 'released' }).eq('id', row.id);
        depositsReleased++;
      } catch (err) {
        // If it's already been captured or cancelled on Stripe's side
        // (e.g. an admin acted on it manually), cancel() errors — that's
        // not a bug here, just leave deposit_status as-is for the next
        // sweep rather than guessing at what happened.
        console.error('[send-pickup-reminders] deposit release failed for booking', row.id, err);
      }
    }
  }

  // --- Pay out hosts for trips that have ended -------------------------
  // 'blocked' is retried every run too — a host who finishes Connect
  // onboarding a day or two after their trip ended still gets paid on
  // the next sweep, rather than being stuck forever for missing the
  // original window.
  let payoutsSent = 0;
  let payoutsBlocked = 0;
  const { data: payoutDue, error: payoutError } = await supabase
    .from('bookings')
    .select('id, host_id, host_payout_amount, host:profiles!bookings_host_id_fkey (stripe_connect_account_id, stripe_connect_payouts_enabled)')
    .eq('status', 'confirmed')
    .in('payout_status', ['pending', 'blocked'])
    .lt('end_date', todayISO);

  if (payoutError) {
    console.error('[send-pickup-reminders] payout query failed', payoutError);
  } else {
    for (const row of (payoutDue ?? []) as unknown as {
      id: string;
      host_id: string;
      host_payout_amount: number | null;
      host: { stripe_connect_account_id: string | null; stripe_connect_payouts_enabled: boolean } | null;
    }[]) {
      const amount = Number(row.host_payout_amount ?? 0);
      if (amount <= 0) {
        await supabase.from('bookings').update({ payout_status: 'not_required' }).eq('id', row.id);
        continue;
      }
      if (!row.host?.stripe_connect_account_id || !row.host.stripe_connect_payouts_enabled) {
        await supabase.from('bookings').update({ payout_status: 'blocked' }).eq('id', row.id);
        payoutsBlocked++;
        continue;
      }
      try {
        const transfer = await stripe.transfers.create(
          {
            amount: Math.round(amount * 100),
            currency: 'eur',
            destination: row.host.stripe_connect_account_id,
            transfer_group: row.id,
            metadata: { bookingId: row.id },
          },
          { idempotencyKey: `payout-${row.id}` },
        );
        await supabase
          .from('bookings')
          .update({ payout_status: 'paid', stripe_transfer_id: transfer.id, payout_paid_at: new Date().toISOString() })
          .eq('id', row.id);
        payoutsSent++;
      } catch (err) {
        console.error('[send-pickup-reminders] payout failed for booking', row.id, err);
        await supabase.from('bookings').update({ payout_status: 'failed' }).eq('id', row.id);
      }
    }
  }

  return res.status(200).json({ date: tomorrowISO, pickupSent, returnSent, depositsReleased, payoutsSent, payoutsBlocked });
}
