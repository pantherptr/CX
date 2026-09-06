import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Icon } from './Icon';
import { eur } from '../lib/format';

/**
 * loadStripe() must only be called once per publishable key — this
 * module-level promise is shared across every mount of PaymentStep
 * rather than recreated per render/step-visit. `null` (no key configured)
 * is a valid, handled state: local dev without Stripe set up yet still
 * renders the rest of the booking flow, it just can't take a real
 * payment.
 */
const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY, { apiVersion: '2025-02-24.acacia' })
  : null;

interface PaymentFormProps {
  amount: number | null;
  deposit: number | null;
  submitting: boolean;
  setSubmitting: (value: boolean) => void;
  onBack: () => void;
  onPaid: (paymentIntentId: string) => void;
  onError: (message: string) => void;
}

function PaymentForm({ amount, deposit, submitting, setSubmitting, onBack, onPaid, onError }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [localError, setLocalError] = useState<string | null>(null);

  const handlePay = async () => {
    if (!stripe || !elements || submitting) return;
    setLocalError(null);
    setSubmitting(true);
    // redirect: 'if_required' keeps the renter on this page for the
    // common case (a card that doesn't need 3-D Secure); only payment
    // methods that truly require leaving the page will redirect.
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });
    setSubmitting(false);

    if (error) {
      const message = error.message ?? 'Your payment could not be completed.';
      setLocalError(message);
      onError(message);
      return;
    }
    if (paymentIntent?.status === 'succeeded') {
      onPaid(paymentIntent.id);
      return;
    }
    const message = 'Payment is still processing — check My Trips in a moment.';
    setLocalError(message);
    onError(message);
  };

  return (
    <>
      <div className="mt-6 card p-6">
        <PaymentElement />
        {deposit != null && deposit > 0 && (
          <p className="mt-5 flex items-start gap-2 rounded-xl bg-panel px-3.5 py-2.5 text-detail text-muted">
            <Icon name="shield" size={16} className="mt-0.5 shrink-0 text-accent" />
            A refundable {eur(deposit)} security deposit will also be held on this card — not charged, just
            authorised — and released automatically after your trip.
          </p>
        )}
        {localError && (
          <p className="mt-5 flex items-center gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-detail text-danger">
            <Icon name="info" size={16} /> {localError}
          </p>
        )}
      </div>
      <div className="mt-6 flex items-center justify-between">
        <button onClick={onBack} disabled={submitting} className="btn btn-ghost text-muted hover:text-ink disabled:opacity-60">
          <Icon name="chevronLeft" size={16} /> Back
        </button>
        <button
          onClick={handlePay}
          disabled={!stripe || !elements || submitting}
          className="btn btn-accent-bright btn-lg disabled:opacity-60"
        >
          {submitting ? 'Confirming…' : `Pay ${amount != null ? eur(amount) : ''}`}
          {!submitting && <Icon name="arrowRight" size={17} />}
        </button>
      </div>
    </>
  );
}

export interface PaymentStepProps {
  /** From api/create-payment-intent.ts — null until that call resolves. */
  clientSecret: string | null;
  /** The server-quoted total (see quote_booking() in
   *  supabase/migrations/0015_stripe_payments.sql) — the amount actually
   *  charged, which is what's shown on the Pay button. */
  amount: number | null;
  /** The refundable security deposit hold — see quote_booking() and
   *  api/stripe-webhook.ts. Shown as a note, not part of `amount`: the
   *  deposit is authorised, not charged. */
  deposit: number | null;
  loading: boolean;
  error: string | null;
  submitting: boolean;
  setSubmitting: (value: boolean) => void;
  onBack: () => void;
  onPaid: (paymentIntentId: string) => void;
  onError: (message: string) => void;
}

export function PaymentStep({ clientSecret, amount, deposit, loading, error, submitting, setSubmitting, onBack, onPaid, onError }: PaymentStepProps) {
  return (
    <section className="animate-fade-up">
      <h1 className="font-display text-2xl font-semibold text-ink">Payment</h1>
      <p className="mt-1.5 flex items-center gap-1.5 text-body text-muted">
        <Icon name="lock" size={15} className="text-accent" /> Encrypted &amp; secure, powered by Stripe.
      </p>

      {!stripePromise && (
        <p className="mt-6 flex items-center gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-detail text-danger">
          <Icon name="info" size={16} /> Payments aren't set up on this deployment yet — VITE_STRIPE_PUBLISHABLE_KEY is
          missing. See .env.example.
        </p>
      )}

      {stripePromise && loading && (
        <div className="mt-6 card flex items-center justify-center p-10">
          <p className="text-body text-muted">Preparing your payment…</p>
        </div>
      )}

      {stripePromise && !loading && !clientSecret && error && (
        <div className="mt-6 card p-6">
          <p className="flex items-center gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-detail text-danger">
            <Icon name="info" size={16} /> {error}
          </p>
          <div className="mt-6 flex items-center justify-between">
            <button onClick={onBack} className="btn btn-ghost text-muted hover:text-ink">
              <Icon name="chevronLeft" size={16} /> Back
            </button>
          </div>
        </div>
      )}

      {stripePromise && clientSecret && (
        <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
          <PaymentForm amount={amount} deposit={deposit} submitting={submitting} setSubmitting={setSubmitting} onBack={onBack} onPaid={onPaid} onError={onError} />
        </Elements>
      )}
    </section>
  );
}
