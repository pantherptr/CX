import { fetchBookingByPaymentIntentId, type Booking, type FareTier } from './bookings';
import { apiUrl } from '../api';

/**
 * Client side of the real-payments flow. The heavy lifting — pricing the
 * trip trustworthily and actually creating the booking — happens server
 * side (api/create-payment-intent.ts, api/stripe-webhook.ts); this file
 * is just the two calls the booking flow needs to talk to that.
 */

export interface CreatePaymentIntentInput {
  carId: string;
  startDate: string;
  endDate: string;
  pickupLocation: string;
  fareTier: FareTier;
  extraIds: string[];
  rewardId?: string;
}

export interface PaymentIntentResult {
  clientSecret: string;
  amount: number;
  currency: string;
  /** The refundable security deposit hold placed after booking — see
   *  api/stripe-webhook.ts and supabase/migrations/0019_security_deposit.sql.
   *  Shown alongside `amount` so the renter knows about it before paying,
   *  not just after. */
  deposit: number;
  /** The reservation hold this PaymentIntent is tied to — see
   *  supabase/migrations/0026_booking_reservations.sql. Lets the client
   *  release it early (Back button, leaving the page) instead of waiting
   *  out its TTL; the webhook confirms it into a real booking on success
   *  regardless. */
  bookingId: string;
}

export async function createPaymentIntent(
  input: CreatePaymentIntentInput,
  accessToken: string,
): Promise<PaymentIntentResult> {
  const res = await fetch(apiUrl('/api/create-payment-intent'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error ?? 'Could not start payment. Please try again.');
  }
  return body as PaymentIntentResult;
}

/**
 * The booking row doesn't exist the instant a payment succeeds client
 * side — it's created moments later by the Stripe webhook. Polls briefly
 * rather than blocking indefinitely; a caller that exhausts the retries
 * should tell the renter their payment went through and point them at
 * "My Trips" instead of implying something failed.
 */
export async function waitForBookingByPaymentIntent(
  paymentIntentId: string,
  { attempts = 10, intervalMs = 700 }: { attempts?: number; intervalMs?: number } = {},
): Promise<Booking | null> {
  for (let i = 0; i < attempts; i++) {
    const booking = await fetchBookingByPaymentIntentId(paymentIntentId);
    if (booking) return booking;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}
