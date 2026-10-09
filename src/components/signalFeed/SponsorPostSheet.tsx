import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Icon } from '../Icon';
import { useAuth } from '../../lib/auth';
import { useLocale } from '../../lib/i18n';
import { AD_DAY_OPTIONS, money, MAX_DAILY_CENTS, MIN_DAILY_CENTS, createAdPayment, type AdCheckout } from '../../lib/data/ads';

const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) : null;

const BUDGETS = [199, 499, 999, 1999];

/** Sponsor one of your own public posts: pick a daily budget (from 1.99) and the days, pay,
 *  then the CX team approves it. A rejected sponsorship is refunded in full. */
export function SponsorPostSheet({ postId, onClose }: { postId: string; onClose: () => void }) {
  const { t } = useLocale();
  const { session } = useAuth();
  const [dailyCents, setDailyCents] = useState(499);
  const [custom, setCustom] = useState('');
  const [days, setDays] = useState(7);
  const [checkout, setCheckout] = useState<AdCheckout | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const total = dailyCents * days;
  const valid = dailyCents >= MIN_DAILY_CENTS && dailyCents <= MAX_DAILY_CENTS;

  const setCustomValue = (v: string) => {
    setCustom(v);
    const n = Math.round(parseFloat(v.replace(',', '.')) * 100);
    if (Number.isFinite(n)) setDailyCents(n);
  };

  const start = async () => {
    if (!session || !valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      setCheckout(await createAdPayment({ postId, dailyCents, days }, session.access_token));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Something went wrong.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[320] flex items-end justify-center bg-black/55 sm:items-center" role="dialog" aria-modal="true" onClick={busy ? undefined : onClose} data-no-open>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-bg p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-pop sm:max-w-lg sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-micro font-semibold uppercase tracking-[0.3em] text-faint">{t('Sponsored')}</p>
            <h3 className="mt-1.5 font-display text-[20px] font-semibold text-ink">{t('Sponsor this post')}</h3>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-panel hover:text-ink disabled:opacity-40">
            <Icon name="x" size={18} />
          </button>
        </div>

        {paid ? (
          <div className="py-8 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent-050 text-accent"><Icon name="check" size={26} strokeWidth={2.6} /></span>
            <p className="mt-4 font-display text-lead font-semibold text-ink">{t('Payment received')}</p>
            <p className="mx-auto mt-1.5 max-w-xs text-detail text-muted">{t('The CX team will review your sponsorship. If it is not approved, you get a full refund.')}</p>
            <button type="button" onClick={onClose} className="btn btn-primary mt-5 min-h-12 w-full justify-center rounded-full text-[15px]">{t('Done')}</button>
          </div>
        ) : checkout ? (
          !stripePromise ? (
            <p className="mt-4 text-detail text-danger">{t('Payments are not set up on this deployment yet.')}</p>
          ) : (
            <Elements stripe={stripePromise} options={{ clientSecret: checkout.clientSecret, appearance: { theme: 'stripe' } }}>
              <PayForm amount={checkout.amount} onPaid={() => setPaid(true)} onBack={() => setCheckout(null)} />
            </Elements>
          )
        ) : (
          <>
            <p className="mt-3 text-detail text-muted">{t('Your post is shown now and then in the Community feed, marked Sponsored. A higher daily budget is shown more often.')}</p>

            <p className="mt-4 text-caption font-semibold uppercase tracking-wide text-faint">{t('Budget per day')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {BUDGETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setDailyCents(c); setCustom(''); }}
                  aria-pressed={dailyCents === c && !custom}
                  className={`pressable min-h-10 rounded-full px-4 text-detail font-semibold transition-colors ${dailyCents === c && !custom ? 'bg-ink text-white' : 'bg-panel text-ink-soft hover:text-ink'}`}
                >
                  {money(c)}
                </button>
              ))}
              <input
                value={custom}
                onChange={(e) => setCustomValue(e.target.value)}
                inputMode="decimal"
                placeholder={t('Other')}
                aria-label={t('Other amount')}
                className="input !min-h-10 !w-24 !rounded-full !py-2 text-center text-detail"
              />
            </div>
            {!valid && <p className="mt-2 text-caption text-danger">{t('From {min} to {max} a day.', { min: money(MIN_DAILY_CENTS), max: money(MAX_DAILY_CENTS) })}</p>}

            <p className="mt-4 text-caption font-semibold uppercase tracking-wide text-faint">{t('For how long')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {AD_DAY_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  aria-pressed={days === d}
                  className={`pressable min-h-10 rounded-full px-4 text-detail font-semibold transition-colors ${days === d ? 'bg-ink text-white' : 'bg-panel text-ink-soft hover:text-ink'}`}
                >
                  {d === 1 ? t('1 day') : t('{n} days', { n: d })}
                </button>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between rounded-2xl bg-panel px-4 py-3">
              <span className="text-detail text-muted">{t('Total')}</span>
              <span className="font-display text-lead font-semibold text-ink">{valid ? money(total) : '—'}</span>
            </div>
            <p className="mt-2.5 flex items-start gap-2 text-caption text-muted">
              <Icon name="shield" size={14} className="mt-0.5 shrink-0 text-accent" />
              {t('You pay now. The CX team approves it afterwards — if it is not approved, the whole amount is refunded. Only public posts can be sponsored.')}
            </p>
            {error && <p className="mt-3 text-detail font-medium text-danger">{error}</p>}
            <button type="button" onClick={start} disabled={!valid || busy || !session} className="btn btn-primary mt-4 min-h-12 w-full justify-center rounded-full text-[15px] disabled:opacity-50">
              {busy ? t('Preparing…') : t('Continue to payment')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PayForm({ amount, onPaid, onBack }: { amount: number; onPaid: () => void; onBack: () => void }) {
  const { t } = useLocale();
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setError(null);
    const { error: err, paymentIntent } = await stripe.confirmPayment({ elements, redirect: 'if_required' });
    setBusy(false);
    if (err) { setError(err.message ?? t('Your payment could not be completed.')); return; }
    if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing') onPaid();
    else setError(t('Your payment could not be completed.'));
  };

  return (
    <div className="mt-4">
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-panel px-4 py-3">
        <span className="text-detail text-muted">{t('You pay today')}</span>
        <span className="font-display text-lead font-semibold text-ink">{money(Math.round(amount * 100))}</span>
      </div>
      <PaymentElement />
      {error && <p className="mt-3 text-detail font-medium text-danger">{error}</p>}
      <div className="mt-4 flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} disabled={busy} className="btn btn-ghost text-muted hover:text-ink disabled:opacity-60">{t('Back')}</button>
        <button type="button" onClick={pay} disabled={!stripe || !elements || busy} className="btn btn-primary min-h-12 rounded-full px-6 text-[15px] disabled:opacity-60">
          {busy ? t('Confirming…') : `${t('Pay')} ${money(Math.round(amount * 100))}`}
        </button>
      </div>
    </div>
  );
}
