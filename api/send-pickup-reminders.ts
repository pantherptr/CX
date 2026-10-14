import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { sendPickupReminderEmail, sendReturnReminderEmail } from './_lib/email.js';
import { notifyUser } from './_lib/push.js';
import { PAYOUT_SELECT, loadCommissionPct, payHostForBooking, type PayoutRow } from './_lib/payout.js';
import { getUserLang } from './_lib/texts.js';

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
  host_id?: string | null;
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

  const SELECT = 'id, reference, renter_id, host_id, start_date, end_date, pickup_location, total_price, car:cars!bookings_car_id_fkey (make, model, year)';

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
        lang: await getUserLang(supabase, row.renter_id),
        reference: row.reference,
        carLabel,
        startDate: row.start_date,
        endDate: row.end_date,
        pickupLocation: row.pickup_location || '',
        totalPrice: Number(row.total_price),
      });
      pickupSent++;
    }
    await notifyUser(supabase, row.renter_id, {
      kind: 'pickup_tomorrow',
      key: 'pickup_tomorrow',
      vars: { car: carLabel },
      title: 'Pick-up is tomorrow',
      body: `Your ${carLabel} is ready for pick-up tomorrow.`,
      url: '/dashboard#trips',
    });
    // The host hands the car over tomorrow too.
    if (row.host_id) {
      await notifyUser(supabase, row.host_id, {
        kind: 'handover_tomorrow',
        key: 'handover_tomorrow',
        vars: { car: carLabel, ref: row.reference },
        title: 'Hand-over is tomorrow',
        body: `${carLabel} goes out tomorrow (${row.reference}).`,
        url: '/host#bookings',
      });
    }
  }

  for (const row of (returns ?? []) as unknown as ReminderBookingRow[]) {
    const { data: auth } = await supabase.auth.admin.getUserById(row.renter_id);
    const email = auth?.user?.email;
    const carLabel = row.car ? `${row.car.year} ${row.car.make} ${row.car.model}` : 'your car';
    if (email) {
      await sendReturnReminderEmail(email, {
        lang: await getUserLang(supabase, row.renter_id),
        reference: row.reference,
        carLabel,
        startDate: row.start_date,
        endDate: row.end_date,
        pickupLocation: row.pickup_location || '',
        totalPrice: Number(row.total_price),
      });
      returnSent++;
    }
    await notifyUser(supabase, row.renter_id, {
      kind: 'return_tomorrow',
      key: 'return_tomorrow',
      vars: { car: carLabel },
      title: 'Return is tomorrow',
      body: `Your ${carLabel} is due back tomorrow.`,
      url: '/dashboard#trips',
    });
    if (row.host_id) {
      await notifyUser(supabase, row.host_id, {
        kind: 'return_expected',
        key: 'return_expected',
        vars: { car: carLabel, ref: row.reference },
        title: 'Your car comes back tomorrow',
        body: `${carLabel} is due back tomorrow (${row.reference}).`,
        url: '/host#bookings',
      });
    }
  }

  // --- SIGNAL: publish posts whose scheduled time has passed -------------
  try {
    await supabase.rpc('publish_due_scheduled_posts');
  } catch (err) {
    console.error('[send-pickup-reminders] scheduled posts failed', err);
  }

  // --- "Share your trip": the day after a trip ended, once ---------------
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayISO = yesterday.toISOString().slice(0, 10);
  const { data: justEnded } = await supabase
    .from('bookings')
    .select(SELECT)
    .eq('status', 'confirmed')
    .eq('end_date', yesterdayISO);
  for (const row of (justEnded ?? []) as unknown as ReminderBookingRow[]) {
    const carLabel = row.car ? `${row.car.year} ${row.car.make} ${row.car.model}` : 'your car';
    await notifyUser(supabase, row.renter_id, {
      kind: 'share_trip',
      key: 'share_trip',
      vars: { car: carLabel },
      title: 'Your trip is over — share it',
      body: `Turn your ${carLabel} trip into a card on SIGNAL.`,
      url: `/trips/${row.id}`,
    });
  }

  // --- "A car you saved is still free": one reminder per person per week (migration 0130) ---------------
  let savedReminders = 0;
  try {
    const { data: due, error: dueErr } = await supabase.rpc('saved_car_reminder_candidates', { max_rows: 200 });
    if (!dueErr) {
      for (const r of (due ?? []) as { user_id: string; car_id: string; slug: string; make: string; model: string; city: string }[]) {
        const car = `${r.make} ${r.model}`;
        await notifyUser(supabase, r.user_id, {
          kind: 'saved_car',
          key: 'saved_car',
          vars: { car, city: r.city },
          title: `Your saved ${car} is still free`,
          body: `Available in ${r.city} this week. Book it before someone else does.`,
          url: `/cars/${r.slug}`,
        });
        await supabase.from('favorites').update({ reminded_at: new Date().toISOString() }).eq('user_id', r.user_id).eq('car_id', r.car_id);
        savedReminders += 1;
      }
    }
  } catch (err) {
    console.error('[send-pickup-reminders] saved-car reminders failed', err);
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
    .select('id, renter_id, reference, stripe_deposit_intent_id')
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
        const dep = row as unknown as { renter_id?: string; reference?: string };
        if (dep.renter_id) {
          await notifyUser(supabase, dep.renter_id, {
            kind: 'deposit_released',
            key: 'deposit_released',
            vars: { ref: dep.reference ?? '' },
            title: 'Your deposit was released',
            body: `The hold for booking ${dep.reference ?? ''} is back with you. How was the trip? Leave a review.`,
            url: '/dashboard#trips',
          });
        }
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
  // 'blocked' is retried every run too — a host who finishes Connect onboarding a day or two after
  // their trip ended still gets paid on the next sweep. Trips whose handover was verified were paid
  // the moment it happened (api/_lib/payout.ts); this catches everything else.
  let payoutsSent = 0;
  let payoutsBlocked = 0;
  const commissionPct = await loadCommissionPct(supabase);
  const { data: payoutDue, error: payoutError } = await supabase
    .from('bookings')
    .select(PAYOUT_SELECT)
    .eq('status', 'confirmed')
    .in('payout_status', ['pending', 'blocked'])
    .lt('end_date', todayISO);

  if (payoutError) {
    console.error('[send-pickup-reminders] payout query failed', payoutError);
  } else {
    for (const row of (payoutDue ?? []) as unknown as PayoutRow[]) {
      const result = await payHostForBooking(supabase, stripe, row, commissionPct);
      if (result === 'paid') payoutsSent++;
      if (result === 'blocked') payoutsBlocked++;
    }
  }

  return res.status(200).json({ date: tomorrowISO, pickupSent, returnSent, depositsReleased, payoutsSent, payoutsBlocked, savedReminders });
}
