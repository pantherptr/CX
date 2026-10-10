import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { POLICY_INFO } from '../lib/cancellationPolicy';
import { CancellationPolicyCard } from '../components/CancellationPolicy';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import { Icon, type IconName } from '../components/Icon';
import { Img } from '../components/motion';
import { motion, AnimatePresence, SPRING_SMOOTH, useReducedMotion } from '../components/motionKit';
import { useLocale } from '../lib/i18n';
import { daysBetween, priceBreakdown } from '../components/BookingCard';
import { DateRangeSheet } from '../components/DateRangeSheet';
import { Group, Row } from '../components/IosList';
import { PremiumPageLoader } from '../components/PremiumLoader';
import { useApp } from '../lib/store';
import { useAuth } from '../lib/auth';
import { fetchCarWithHost } from '../lib/data/cars';
import {
  checkAvailability,
  useExtrasCatalog,
  releasePaymentHold,
  type Booking as BookingRecord,
  type FareTier,
} from '../lib/data/bookings';
import { createPaymentIntent, waitForBookingByPaymentIntent } from '../lib/data/payments';
import { findOrCreateCxConversation } from '../lib/data/messages';
import { useAvailableReward } from '../lib/data/rewards';
import { haptics } from '../lib/native';
import { PaymentStep } from '../components/PaymentStep';
import type { Car, Host } from '../data/types';
import NotFound from './NotFound';

const STEPS = ['Trip details', 'Extras', 'Driver details', 'Payment', 'Confirmation'];
const CONFIRMATION_STEP = STEPS.length - 1;

function Stepper({ step }: { step: number }) {
  const { t } = useLocale();
  return (
    <div>
      <div className="flex items-baseline justify-between text-detail">
        <span className="font-display text-copy font-semibold text-ink">{t(STEPS[step])}</span>
        <span className="text-muted">{t('Step {n} of {m}', { n: step + 1, m: STEPS.length })}</span>
      </div>
      <div className="mt-2.5 flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1}>
        {STEPS.map((s, i) => (
          <span key={s} className="relative h-[5px] flex-1 overflow-hidden rounded-full bg-line">
            <motion.span
              className="absolute inset-0 origin-left rounded-full bg-ink"
              initial={false}
              animate={{ scaleX: i < step ? 1 : i === step ? 0.55 : 0 }}
              transition={SPRING_SMOOTH}
            />
          </span>
        ))}
      </div>
      <ol className="mt-3 hidden justify-between sm:flex">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-1.5 text-caption font-medium transition-colors ${i === step ? 'text-ink' : i < step ? 'text-ink-soft' : 'text-faint'}`}>
            {i < step ? <Icon name="check" size={12} strokeWidth={3} className="text-accent" /> : <span className={`h-1.5 w-1.5 rounded-full ${i === step ? 'bg-ink' : 'bg-line-strong'}`} />}
            {t(s)}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Labeled({ label, children, full, hint, error }: { label: string; children: ReactNode; full?: boolean; hint?: string; error?: string | null }) {
  return (
    <label className={full ? 'sm:col-span-2' : ''}>
      <span className="field-label">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 flex items-center gap-1 text-caption text-danger"><Icon name="info" size={12} /> {error}</span>
      ) : (
        hint && <span className="mt-1 block text-caption text-faint">{hint}</span>
      )}
    </label>
  );
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Booking() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useApp();
  const { session, profile } = useAuth();

  const [result, setResult] = useState<{ car: Car; host: Host } | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [step, setStep] = useState(0);
  const [pickupDate, setPickupDate] = useState(params.get('start') ?? '');
  const [returnDate, setReturnDate] = useState(params.get('end') ?? '');
  const [pickupLoc, setPickupLoc] = useState(params.get('loc') ?? '');
  // See supabase/migrations/0027_delivery_options.sql. Defaulted to
  // 'delivery' below once the car loads, for a delivery-only listing —
  // pickupEnabled/deliveryEnabled are optional on `Car` (only real
  // Supabase-backed cars carry them), so a car predating this feature
  // behaves exactly as before: pickup only, no choice shown.
  const [fulfillmentType, setFulfillmentType] = useState<'pickup' | 'delivery'>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<'checking' | 'available' | 'unavailable' | null>(null);
  // Cancellation terms now come from the host's policy; the old renter-chosen
  // fare tier is always 'standard' (no surcharge) for new bookings.
  const fareTier: FareTier = 'standard';
  const [selectedExtras, setSelectedExtras] = useState<Set<string>>(new Set());
  const { extras: extrasCatalog } = useExtrasCatalog();
  const availableReward = useAvailableReward(session?.user.id);
  const [applyReward, setApplyReward] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<BookingRecord | null>(null);
  const [messaging, setMessaging] = useState(false);
  const reduceMotion = useReducedMotion();
  const [dir, setDir] = useState(1);
  const [sumOpen, setSumOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [driver, setDriver] = useState({ name: '', email: '', phone: '', dob: '', licence: '', country: '', expiry: '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Real-payment state — see src/lib/data/payments.ts and
  // src/components/PaymentStep.tsx. clientSecret/quotedAmount come back
  // from api/create-payment-intent.ts, which prices the trip server-side
  // (quote_booking()) before Stripe is ever involved.
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [quotedAmount, setQuotedAmount] = useState<number | null>(null);
  const [deposit, setDeposit] = useState<number | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Driver details start from the account, once it is known.
  useEffect(() => {
    setDriver((d) => ({
      ...d,
      name: d.name || profile?.full_name || '',
      email: d.email || session?.user.email || '',
      phone: d.phone || profile?.phone || '',
      country: d.country || profile?.location || '',
    }));
  }, [profile?.full_name, profile?.phone, profile?.location, session?.user.email]);

  useEffect(() => {
    let cancelled = false;
    fetchCarWithHost(slug ?? '')
      .then((data) => {
        if (cancelled) return;
        setResult(data);
        if (data && !pickupLoc) setPickupLoc(data.car.location);
        if (data && data.car.pickupEnabled === false && data.car.deliveryEnabled) setFulfillmentType('delivery');
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load this car.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const days = useMemo(
    () => (pickupDate && returnDate ? daysBetween(pickupDate, returnDate) : 0),
    [pickupDate, returnDate],
  );

  // Validate the dates themselves whenever they change.
  useEffect(() => {
    if (!pickupDate || !returnDate) {
      setDateError(null);
      return;
    }
    if (pickupDate < todayISO()) {
      setDateError('Pick-up date is in the past.');
    } else if (returnDate <= pickupDate) {
      setDateError('Return date must be after pick-up.');
    } else {
      setDateError(null);
    }
  }, [pickupDate, returnDate]);

  // Re-check real availability against Supabase whenever valid dates change.
  // This is the UX nicety — the actual guarantee is the exclusion
  // constraint enforced at insert time (see migration 0003).
  useEffect(() => {
    if (!result || dateError || !pickupDate || !returnDate) {
      setAvailability(null);
      return;
    }
    let cancelled = false;
    setAvailability('checking');
    checkAvailability(result.car.id, pickupDate, returnDate)
      .then((ok) => {
        if (!cancelled) setAvailability(ok ? 'available' : 'unavailable');
      })
      .catch(() => {
        if (!cancelled) setAvailability(null);
      });
    return () => {
      cancelled = true;
    };
  }, [result, pickupDate, returnDate, dateError]);

  // Starts a real payment as soon as the renter reaches the Payment step
  // (and re-starts it if they go back and change something that affects
  // price) — see api/create-payment-intent.ts. The booking itself is
  // NOT created here; it's created by the Stripe webhook once the charge
  // actually succeeds, so this effect never touches the bookings table.
  useEffect(() => {
    if (!result || step !== 3 || !session) return;
    if (dateError || !pickupDate || !returnDate) return;
    let cancelled = false;
    // Set by the response below and read from the cleanup's closure once
    // it resolves — lets the cleanup release the hold this run created
    // even though it fires asynchronously, well after this effect body
    // has returned.
    let holdBookingId: string | null = null;
    setClientSecret(null);
    setQuotedAmount(null);
    setDeposit(null);
    setSubmitError(null);
    setPaymentLoading(true);
    createPaymentIntent(
      {
        carId: result.car.id,
        startDate: pickupDate,
        endDate: returnDate,
        pickupLocation: pickupLoc || result.car.location,
        fareTier,
        extraIds: Array.from(selectedExtras),
        rewardId: applyReward && availableReward ? availableReward.id : undefined,
        fulfillmentType,
        deliveryAddress: fulfillmentType === 'delivery' ? deliveryAddress : undefined,
      },
      session.access_token,
    )
      .then((res) => {
        if (cancelled) return;
        setClientSecret(res.clientSecret);
        setQuotedAmount(res.amount);
        setDeposit(res.deposit);
        holdBookingId = res.bookingId;
      })
      .catch((err) => {
        if (cancelled) return;
        setSubmitError(err instanceof Error ? err.message : 'Could not start payment.');
      })
      .finally(() => {
        if (!cancelled) setPaymentLoading(false);
      });
    return () => {
      cancelled = true;
      // Give up these dates immediately rather than waiting out the
      // hold's TTL — covers both leaving Payment for a different step
      // (this effect re-running on its own dependencies) and leaving the
      // page entirely (unmount). A hold the webhook has already confirmed
      // is untouched: release_payment_hold() only ever affects a row
      // that's still 'pending'/'payment_processing'.
      if (holdBookingId) releasePaymentHold(holdBookingId);
    };
    // Depend on stable primitives, not the `result`/`session`/`availableReward`
    // object references themselves. In particular, key off `session.user.id`
    // rather than `session.access_token`: Supabase silently mints a new
    // access token on every auto-refresh, so depending on the token string
    // re-ran this effect on each refresh — each run minted a fresh
    // PaymentIntent and tore down/remounted Stripe Elements before it could
    // ever finish loading, leaving the payment form stuck. The effect still
    // reads the current `session.access_token` via closure when it actually
    // calls createPaymentIntent, so a refreshed token is still used — it
    // just doesn't need to restart the whole quote over a silent refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.car.id, step, session?.user.id, pickupDate, returnDate, pickupLoc, fareTier, selectedExtras, applyReward, availableReward?.id, dateError, fulfillmentType, deliveryAddress]);

  if (loadError) {
    return (
      <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-panel text-danger">
          <Icon name="info" size={26} />
        </span>
        <h1 className="font-display text-xl font-semibold text-ink">Couldn't load this car</h1>
        <p className="max-w-sm text-body text-muted">{loadError}</p>
      </div>
    );
  }

  if (result === undefined) {
    return (
      <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
        <PremiumPageLoader size={90} />
        <p className="text-body text-muted">Loading…</p>
      </div>
    );
  }

  if (result === null) return <NotFound />;
  const { car, host } = result;
  const b = priceBreakdown(car, days || 1);
  const activeDays = days || 1;
  const selectedExtraItems = (extrasCatalog ?? []).filter((e) => selectedExtras.has(e.id));
  const extrasTotal = selectedExtraItems.reduce(
    (sum, e) => sum + (e.priceModel === 'per_day' ? e.price * activeDays : e.price),
    0,
  );
  // Preview only, same trust level as the reward discount below — the
  // real fee is computed server-side in quote_booking() from the car's
  // own stored config, never trusted from here.
  const deliveryFee = fulfillmentType === 'delivery' && car.deliveryFeeType === 'fixed' ? car.deliveryFeeAmount ?? 0 : 0;
  const preDiscountTotal = b.total + extrasTotal + deliveryFee;
  // Preview only — what actually gets charged and shown on the
  // confirmation screen comes back from the real inserted row
  // (confirmed.discountAmount), computed server-side by prepare_booking.
  const discountPreview =
    applyReward && availableReward ? Math.round((preDiscountTotal * availableReward.discountPercentage) / 100) : 0;
  const grandTotal = preDiscountTotal - discountPreview;

  const toggleExtra = (id: string) =>
    setSelectedExtras((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const canContinueStep0 =
    !dateError && pickupDate && returnDate && availability === 'available' &&
    (fulfillmentType === 'pickup' || deliveryAddress.trim().length > 0);

  const driverErrors = (() => {
    const e: Record<string, string> = {};
    if (driver.name.trim().length < 2) e.name = 'Enter the driver\'s full name.';
    if (!/^\S+@\S+\.\S+$/.test(driver.email.trim())) e.email = 'Enter a valid email address.';
    if (driver.phone.replace(/\D/g, '').length < 7) e.phone = 'Enter a phone number we can reach.';
    if (!driver.dob) e.dob = 'Enter the date of birth.';
    else {
      const dob = new Date(driver.dob);
      const age = (Date.now() - dob.getTime()) / (365.25 * 86400000);
      if (Number.isNaN(age) || age < 18) e.dob = 'The driver must be at least 18.';
      else if (age > 100) e.dob = 'Check the date of birth.';
    }
    if (driver.licence.trim().length < 5) e.licence = 'Enter the licence number.';
    if (!driver.country.trim()) e.country = 'Enter the country that issued the licence.';
    if (!driver.expiry) e.expiry = 'Enter the licence expiry date.';
    else if (returnDate && driver.expiry <= returnDate) e.expiry = 'The licence must be valid past your return date.';
    else if (driver.expiry <= todayISO()) e.expiry = 'This licence has expired.';
    return e;
  })();
  const field = (k: keyof typeof driver) => ({
    value: driver[k],
    onChange: (ev: { target: { value: string } }) => setDriver((d) => ({ ...d, [k]: ev.target.value })),
    onBlur: () => setTouched((t) => ({ ...t, [k]: true })),
    'aria-invalid': touched[k] && driverErrors[k] ? true : undefined,
  });
  const err = (k: keyof typeof driver) => (touched[k] ? driverErrors[k] : undefined);

  const next = () => {
    if (step === 0 && !canContinueStep0) return;
    if (step === 2 && Object.keys(driverErrors).length > 0) {
      setTouched({ name: true, email: true, phone: true, dob: true, licence: true, country: true, expiry: true });
      haptics.tick();
      return;
    }
    if (step === 2 && !session) {
      // Payment needs a signed-in renter (their JWT is what scopes the
      // price quote and, later, the charge) — check before showing that
      // step rather than after they've filled in a card.
      toast({ title: 'Sign in to book a car', icon: 'user' });
      navigate('/login', { state: { from: { pathname: `/book/${slug}` } } });
      return;
    }
    if (step < STEPS.length - 1) {
      setDir(1);
      setStep((s) => s + 1);
      window.scrollTo({ top: 0 });
    }
  };
  const back = () => {
    if (step > 0) { setDir(-1); setStep((s) => s - 1); } else navigate(-1);
  };

  const handleMessageHost = async () => {
    if (!session) return;
    setMessaging(true);
    try {
      // Until the trip is booked, questions go to CX — not straight to the host.
      const conversationId = await findOrCreateCxConversation(car.id, session.user.id);
      if (!conversationId) {
        toast({ title: 'Support is not available right now', icon: 'info' });
        setMessaging(false);
        return;
      }
      navigate(`/messages?c=${conversationId}`);
    } catch (err) {
      toast({ title: 'Could not open conversation', desc: err instanceof Error ? err.message : undefined, icon: 'info' });
      setMessaging(false);
    }
  };

  // Called once Stripe confirms the charge actually succeeded (see
  // PaymentStep / stripe.confirmPayment). The booking row itself is
  // created by api/stripe-webhook.ts, not here — this just waits for it
  // to show up and moves to the confirmation screen once it does.
  const handlePaymentSuccess = async (paymentIntentId: string) => {
    setSubmitting(true);
    setSubmitError(null);
    const booking = await waitForBookingByPaymentIntent(paymentIntentId).catch(() => null);
    setSubmitting(false);
    if (!booking) {
      // The charge went through even if the booking hasn't shown up yet
      // (webhook delivery can lag a moment) — never tell the renter this
      // failed. Send them somewhere it'll appear as soon as it lands.
      toast({
        title: 'Payment received',
        desc: "We're finalising your booking — it'll appear in My Trips in a moment.",
        icon: 'checkCircle',
      });
      navigate('/dashboard#trips');
      return;
    }
    setConfirmed(booking);
    setStep(CONFIRMATION_STEP);
    window.scrollTo({ top: 0 });
    haptics.success();
    toast({ title: 'Booking confirmed', desc: 'Your trip is booked.', icon: 'checkCircle' });
  };

  const shortDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const fmtDate = (s: string) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

  /* ---------- Confirmation ---------- */
  if (step === CONFIRMATION_STEP && confirmed) {
    const ymd = (d: string) => d.replace(/-/g, '');
    const dayAfter = (d: string) => {
      const x = new Date(`${d}T12:00:00`);
      x.setDate(x.getDate() + 1);
      return x.toISOString().slice(0, 10);
    };
    const downloadIcs = () => {
      const lines = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CX//Booking//EN', 'BEGIN:VEVENT',
        `UID:${confirmed.reference}@cx`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
        `DTSTART;VALUE=DATE:${ymd(confirmed.startDate)}`,
        `DTEND;VALUE=DATE:${ymd(dayAfter(confirmed.endDate))}`,
        `SUMMARY:CX trip — ${car.year} ${car.make} ${car.model}`,
        `LOCATION:${(confirmed.fulfillmentType === 'delivery' ? confirmed.deliveryAddress : confirmed.pickupLocation) || car.city}`,
        `DESCRIPTION:Booking ${confirmed.reference}`,
        'END:VEVENT', 'END:VCALENDAR',
      ];
      const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `cx-${confirmed.reference}.ics`;
      a.click();
      URL.revokeObjectURL(url);
    };
    const timeline = [
      { icon: 'checkCircle' as IconName, title: 'Booked and paid', sub: 'Your booking is confirmed and your host has been notified.', done: true },
      { icon: 'message' as IconName, title: 'Questions? Ask CX', sub: 'Our team is here before and during your trip.', done: false },
      { icon: 'key' as IconName, title: `Pick-up · ${fmtDate(confirmed.startDate)}`, sub: confirmed.fulfillmentType === 'delivery' ? `Delivery to ${confirmed.deliveryAddress || ''}` : confirmed.pickupLocation || car.location, done: false },
      { icon: 'car' as IconName, title: `Return · ${fmtDate(confirmed.endDate)}`, sub: 'Bring it back as you found it — your deposit is released automatically.', done: false },
    ];
    return (
      <div className="container-page max-w-2xl py-12">
        <div className="text-center">
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={SPRING_SMOOTH}
            className="mx-auto grid h-[72px] w-[72px] place-items-center rounded-full bg-ink text-white shadow-[0_18px_40px_-14px_rgba(22,22,26,0.55)]"
          >
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <motion.path d="M5 12.5l4.2 4.2L19 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.25, duration: 0.5, ease: 'easeOut' }} />
            </svg>
          </motion.span>
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING_SMOOTH, delay: 0.15 }} className="mt-6 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            You're all set.
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-3 text-copy text-muted">
            Booking <span className="font-medium text-ink">{confirmed.reference}</span> is confirmed.
          </motion.p>
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING_SMOOTH, delay: 0.35 }} className="mt-9 overflow-hidden rounded-[28px] border border-line bg-surface">
          <div className="flex items-center gap-4 border-b border-line p-5">
            <Img
              src={unsplash(car.images[0], 240)}
              alt=""
              className="h-20 w-28 rounded-2xl object-cover"
              fallback={<span className="grid h-20 w-28 place-items-center rounded-2xl bg-panel text-muted"><Icon name="car" size={24} /></span>}
            />
            <div className="min-w-0">
              <h2 className="truncate font-display text-lg font-semibold text-ink">{car.year} {car.make} {car.model}</h2>
              <p className="text-detail text-muted">Hosted by {host.name}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-y-5 p-5 sm:grid-cols-4">
            {[
              { l: 'Pick-up', v: fmtDate(confirmed.startDate), icon: 'calendar' as IconName },
              { l: 'Return', v: fmtDate(confirmed.endDate), icon: 'calendar' as IconName },
              confirmed.fulfillmentType === 'delivery'
                ? { l: 'Delivery to', v: confirmed.deliveryAddress || '', icon: 'car' as IconName }
                : { l: 'Location', v: confirmed.pickupLocation || car.location, icon: 'pin' as IconName },
              { l: 'Total paid', v: eur(confirmed.totalPrice), icon: 'card' as IconName },
            ].map((x) => (
              <div key={x.l}>
                <dt className="flex items-center gap-1.5 text-caption text-muted"><Icon name={x.icon} size={14} /> {x.l}</dt>
                <dd className="mt-1 text-body font-medium text-ink">{x.v}</dd>
              </div>
            ))}
          </dl>
          {(confirmed.cancellationPolicy || confirmed.extras.length > 0) && (
            <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-panel px-3 py-1.5 text-caption font-medium text-ink-soft"><Icon name="shield" size={12} /> {POLICY_INFO[confirmed.cancellationPolicy].label} cancellation</span>
              {confirmed.extras.map((ex) => (
                <span key={ex.id} className="rounded-full bg-panel px-3 py-1.5 text-caption font-medium text-ink-soft">{ex.name}</span>
              ))}
            </div>
          )}
          {confirmed.discountAmount > 0 && (
            <div className="flex items-center gap-2 border-t border-line bg-accent-050 px-5 py-3 text-detail text-accent-700">
              <Icon name="gift" size={16} />
              Reward applied: −{eur(confirmed.discountAmount)}
            </div>
          )}
        </motion.div>

        <motion.ol initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING_SMOOTH, delay: 0.45 }} className="mt-6 rounded-[28px] border border-line bg-surface p-5">
          <p className="mb-4 text-label font-semibold uppercase tracking-[0.12em] text-muted">What happens next</p>
          {timeline.map((tl, i) => (
            <li key={tl.title} className="relative flex gap-3.5 pb-5 last:pb-0">
              {i < timeline.length - 1 && <span className="absolute left-[17px] top-9 h-[calc(100%-26px)] w-px bg-line" aria-hidden="true" />}
              <span className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full ${tl.done ? 'bg-ink text-white' : 'bg-panel text-ink-soft'}`}><Icon name={tl.icon} size={16} /></span>
              <div className="min-w-0 pt-0.5">
                <p className="text-body font-medium text-ink">{tl.title}</p>
                <p className="mt-0.5 text-detail text-muted">{tl.sub}</p>
              </div>
            </li>
          ))}
        </motion.ol>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link to="/dashboard#trips" className="btn btn-primary btn-lg sm:col-span-2">View my trip <Icon name="arrowRight" size={17} /></Link>
          <button onClick={downloadIcs} className="btn btn-secondary btn-lg"><Icon name="calendar" size={17} /> Add to calendar</button>
          <button onClick={handleMessageHost} disabled={messaging} className="btn btn-secondary btn-lg disabled:opacity-60"><Icon name="message" size={17} /> {messaging ? 'Opening…' : 'Message CX'}</button>
        </div>
        <Link to="/browse" className="mt-4 block text-center text-detail font-medium text-muted transition-colors hover:text-ink">Explore more cars</Link>
      </div>
    );
  }

  const breakdown = (
    <dl className="space-y-2.5 text-body">
              <div className="flex justify-between"><dt className="text-muted">{eur(car.pricePerDay)} × {days || 1} days</dt><dd className="text-ink">{eur(b.base)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Service fee</dt><dd className="text-ink">{eur(b.service)}</dd></div>
              <div className="flex justify-between"><dt className="flex items-center gap-1 text-muted">Protection <Icon name="shield" size={13} className="text-accent" /></dt><dd className="text-ink">{eur(b.protection)}</dd></div>
              {selectedExtraItems.map((ex) => (
                <div key={ex.id} className="flex justify-between">
                  <dt className="text-muted">{ex.name}</dt>
                  <dd className="text-ink">{eur(ex.priceModel === 'per_day' ? ex.price * activeDays : ex.price)}</dd>
                </div>
              ))}
              {fulfillmentType === 'delivery' && (
                <div className="flex justify-between">
                  <dt className="flex items-center gap-1 text-muted">Delivery fee <Icon name="car" size={13} /></dt>
                  <dd className="text-ink">{deliveryFee > 0 ? eur(deliveryFee) : 'Free'}</dd>
                </div>
              )}
              {discountPreview > 0 && (
                <div className="flex justify-between text-accent">
                  <dt>Discount ({availableReward?.discountPercentage}% OFF)</dt>
                  <dd>−{eur(discountPreview)}</dd>
                </div>
              )}
              <div className="hairline my-1" />
              <div className="flex justify-between text-copy font-semibold text-ink"><dt>Total</dt><dd>{eur(grandTotal)}</dd></div>
            </dl>
  );

  return (
    <div className="container-page py-6 sm:py-8">
      <div className="mb-5 flex items-center gap-3">
        <button onClick={back} aria-label="Back" className="pressable grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-ink ring-1 ring-line">
          <Icon name="chevronLeft" size={20} />
        </button>
        <div className="min-w-0">
          <p className="truncate font-display text-copy font-semibold leading-tight text-ink">{car.make} {car.model}</p>
          <p className="truncate text-caption text-muted">{car.year}{car.trim ? ` · ${car.trim}` : ''} · {car.city}</p>
        </div>
      </div>

      <div className="mb-6 max-w-2xl"><Stepper step={step} /></div>

      {/* A phone sees the trip and the price at the top, tap for the breakdown */}
      {step < 3 && (
        <div className="mb-5 overflow-hidden rounded-[22px] border border-line bg-surface lg:hidden">
          <button onClick={() => setSumOpen((o) => !o)} aria-expanded={sumOpen} className="flex w-full items-center gap-3 p-3 text-left">
            <Img src={unsplash(car.images[0], 240)} alt="" className="h-14 w-[72px] shrink-0 rounded-xl object-cover" fallback={<span className="h-14 w-[72px] shrink-0 rounded-xl bg-panel" />} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-semibold text-ink">{pickupDate && returnDate ? `${shortDate(pickupDate)} → ${shortDate(returnDate)}` : 'Choose your dates'}</span>
              <span className="block text-caption text-muted">{days || 1} {(days || 1) === 1 ? 'day' : 'days'}{extrasTotal > 0 ? ' · + extras' : ''}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="font-display text-lead font-semibold text-ink">{eur(grandTotal)}</span>
              <Icon name="chevronDown" size={16} className={`text-faint transition-transform duration-300 ${sumOpen ? 'rotate-180' : ''}`} />
            </span>
          </button>
          <AnimatePresence initial={false}>
            {sumOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
                <div className="border-t border-line px-4 py-3.5">{breakdown}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_380px] lg:gap-12">
        <div className="min-w-0 pb-24 lg:pb-0">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={step}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: dir * 36 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: dir * -36 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
          {step === 0 && (
            <section>
              <h1 className="font-display text-[1.7rem] font-bold tracking-tight text-ink">Trip details</h1>
              <p className="mt-1 text-body text-muted">Confirm where and when you'd like the car.</p>

              <Group title="Get the car">
                {car.pickupEnabled !== false && car.deliveryEnabled && (
                  <div className="p-3">
                    <div className="flex rounded-xl bg-panel p-1">
                      {([['pickup', 'Pick Up', 'pin'], ['delivery', 'Deliver to Me', 'car']] as const).map(([id, label, ic]) => {
                        const on = fulfillmentType === id;
                        return (
                          <button key={id} type="button" onClick={() => setFulfillmentType(id)} className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-[9px] px-2 py-2 text-detail font-semibold transition-colors ${on ? 'text-ink' : 'text-muted'}`}>
                            {on && <motion.span layoutId="fulfil" className="absolute inset-0 rounded-[9px] bg-surface shadow-hair" transition={SPRING_SMOOTH} />}
                            <span className="relative inline-flex items-center gap-1.5"><Icon name={ic} size={14} /> {label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 px-1 text-caption text-muted">
                      {fulfillmentType === 'pickup' ? "Go to the host's pick-up location." : car.deliveryFeeType === 'fixed' ? `Delivery fee +${eur(car.deliveryFeeAmount ?? 0)}` : 'Delivery is free.'}
                    </p>
                  </div>
                )}
                <label className="flex items-center gap-3.5 px-4 py-3.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-panel text-ink"><Icon name="pin" size={18} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-caption font-semibold uppercase tracking-wide text-muted">{fulfillmentType === 'pickup' ? 'Pick-up location' : 'Delivery address'}</span>
                    {fulfillmentType === 'pickup' ? (
                      <input value={pickupLoc} onChange={(e) => setPickupLoc(e.target.value)} className="mt-0.5 w-full bg-transparent text-[16px] font-medium text-ink outline-none sm:text-body" />
                    ) : (
                      <input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Street, city" className="mt-0.5 w-full bg-transparent text-[16px] font-medium text-ink outline-none placeholder:text-faint sm:text-body" />
                    )}
                  </span>
                </label>
                {fulfillmentType === 'delivery' && (car.deliveryRadiusKm || car.deliveryInstructions) && (
                  <p className="px-4 py-3 text-detail leading-relaxed text-muted">
                    {car.deliveryRadiusKm ? `Delivery available within ~${car.deliveryRadiusKm}km of the host. ` : ''}
                    {car.deliveryInstructions}
                  </p>
                )}
              </Group>

              <Group title="Dates">
                <Row
                  icon="calendar"
                  title={pickupDate && returnDate ? `${fmtDate(pickupDate)} → ${fmtDate(returnDate)}` : 'Choose your dates'}
                  sub={pickupDate && returnDate ? `${days} ${days === 1 ? 'day' : 'days'}` : 'Tap the days you need the car.'}
                  onClick={() => setCalOpen(true)}
                />
                <DateRangeSheet
                  open={calOpen}
                  onClose={() => setCalOpen(false)}
                  carId={car.id}
                  start={pickupDate || null}
                  end={returnDate || null}
                  pricePerDay={car.pricePerDay}
                  onApply={(start, end) => { setPickupDate(start); setReturnDate(end); }}
                />
              </Group>

              {dateError && (
                <p className="mt-3 flex items-center gap-2 rounded-2xl bg-danger/10 px-4 py-3 text-detail text-danger">
                  <Icon name="info" size={16} /> {dateError}
                </p>
              )}
              {!dateError && availability === 'checking' && <p className="mt-3 px-1 text-detail text-muted">Checking availability…</p>}
              {!dateError && availability === 'unavailable' && (
                <p className="mt-3 flex items-center gap-2 rounded-2xl bg-danger/10 px-4 py-3 text-detail text-danger">
                  <Icon name="info" size={16} /> This car is already booked for part of those dates. Try a different range.
                </p>
              )}
              {!dateError && availability === 'available' && (
                <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SPRING_SMOOTH} className="mt-3 flex items-center gap-2 rounded-2xl bg-surface px-4 py-3 text-detail font-semibold text-ink ring-1 ring-line">
                  <Icon name="checkCircle" size={16} className="text-accent" /> Available for your dates
                </motion.p>
              )}

              <Group title="Good to know">
                <Row icon="shield" title="Premium protection included" sub="Every CX trip comes with damage protection and 24/7 roadside assistance." />
                <Row
                  icon="calendar"
                  title={<>Cancellation: {POLICY_INFO[car.cancellationPolicy ?? 'flexible'].label}</>}
                  sub={POLICY_INFO[car.cancellationPolicy ?? 'flexible'].tagline}
                  onClick={() => setPolicyOpen((o) => !o)}
                  open={policyOpen}
                >
                  <CancellationPolicyCard policy={car.cancellationPolicy ?? 'flexible'} />
                </Row>
              </Group>
            </section>
          )}

          {step === 1 && (
            <section>
              <h1 className="font-display text-2xl font-semibold text-ink">Extras</h1>
              <p className="mt-1.5 text-body text-muted">Optional add-ons for this trip — skip if you don't need them.</p>
              <div className="mt-6 space-y-3">
                {(extrasCatalog ?? []).map((extra) => {
                  const checked = selectedExtras.has(extra.id);
                  return (
                    <button
                      type="button"
                      key={extra.id}
                      onClick={() => toggleExtra(extra.id)}
                      aria-pressed={checked}
                      className={`flex w-full items-center gap-4 rounded-[20px] border p-4 text-left transition-[border-color,box-shadow,background-color] duration-300 ${
                        checked ? 'border-ink bg-surface shadow-[0_0_0_1px_#16161a]' : 'border-line bg-surface hover:border-ink/40'
                      }`}
                    >
                      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-colors duration-300 ${checked ? 'bg-ink text-white' : 'bg-panel text-ink-soft'}`}>
                        <Icon name={extra.icon as IconName} size={20} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-ink">{extra.name}</span>
                        <span className="block text-detail text-muted">{extra.description}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-detail font-semibold text-ink">{eur(extra.price)}{extra.priceModel === 'per_day' ? '/day' : ''}</span>
                        <span className={`mt-1 ml-auto grid h-5 w-5 place-items-center rounded-full border transition-all duration-300 ${checked ? 'border-ink bg-ink text-white' : 'border-line-strong text-transparent'}`}>
                          <Icon name="check" size={12} strokeWidth={3} />
                        </span>
                      </span>
                    </button>
                  );
                })}
                {extrasCatalog && extrasCatalog.length === 0 && (
                  <p className="text-detail text-muted">No extras available for this trip.</p>
                )}
              </div>
            </section>
          )}

          {step === 2 && (
            <section>
              <h1 className="font-display text-2xl font-semibold text-ink">Driver details</h1>
              <p className="mt-1.5 text-body text-muted">The person who will drive. We check these against the licence at hand-over.</p>
              <div className="mt-6 rounded-[24px] border border-line bg-surface p-5 sm:p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Labeled label="Full name" full error={err('name')}>
                    <input autoComplete="name" className="input !text-[16px] sm:!text-body" {...field('name')} />
                  </Labeled>
                  <Labeled label="Email" full error={err('email')}>
                    <input type="email" autoComplete="email" className="input !text-[16px] sm:!text-body" {...field('email')} />
                  </Labeled>
                  <Labeled label="Phone" error={err('phone')}>
                    <input type="tel" autoComplete="tel" className="input !text-[16px] sm:!text-body" {...field('phone')} />
                  </Labeled>
                  <Labeled label="Date of birth" error={err('dob')}>
                    <input type="date" max={todayISO()} autoComplete="bday" className="input !text-[16px] sm:!text-body" {...field('dob')} />
                  </Labeled>
                  <Labeled label="Driving licence number" full error={err('licence')}>
                    <input placeholder="e.g. RSSLXA92E14F205X" autoCapitalize="characters" className="input !text-[16px] sm:!text-body" {...field('licence')} />
                  </Labeled>
                  <Labeled label="Licence country" error={err('country')}>
                    <input className="input !text-[16px] sm:!text-body" {...field('country')} />
                  </Labeled>
                  <Labeled label="Licence expiry" error={err('expiry')} hint={returnDate ? 'Must be valid past your return date.' : undefined}>
                    <input type="date" min={todayISO()} className="input !text-[16px] sm:!text-body" {...field('expiry')} />
                  </Labeled>
                </div>
              </div>
              <p className="mt-3 flex items-center gap-2 text-caption text-muted"><Icon name="lock" size={13} /> Your details are used only to verify this booking.</p>
            </section>
          )}

          {step === 3 && (
            <PaymentStep
              clientSecret={clientSecret}
              amount={quotedAmount ?? grandTotal}
              deposit={deposit}
              loading={paymentLoading}
              error={submitError}
              submitting={submitting}
              setSubmitting={setSubmitting}
              onBack={back}
              onPaid={handlePaymentSuccess}
              onError={(message) => setSubmitError(message)}
            />
          )}

          </motion.div>
          </AnimatePresence>

          {step !== 3 && (
            <div className="mt-6 hidden items-center justify-between lg:flex">
              <button onClick={back} className="btn btn-ghost text-muted hover:text-ink">
                <Icon name="chevronLeft" size={16} /> {step === 0 ? 'Cancel' : 'Back'}
              </button>
              <button onClick={next} disabled={step === 0 && !canContinueStep0} className="btn btn-primary btn-lg disabled:opacity-50">
                Continue to Book <Icon name="arrowRight" size={17} />
              </button>
            </div>
          )}
        </div>

        {/* Summary */}
        <aside>
          <div className="sticky top-[84px] overflow-hidden rounded-[24px] border border-line bg-surface">
            <p className="px-4 pt-4 text-label font-semibold uppercase tracking-[0.12em] text-muted">Your CX Drive</p>
            <div className="flex gap-3.5 p-4">
              <Img
                src={unsplash(car.images[0], 240)}
                alt=""
                className="h-20 w-24 shrink-0 rounded-2xl object-cover"
                fallback={<span className="grid h-20 w-24 shrink-0 place-items-center rounded-xl bg-panel text-muted"><Icon name="car" size={22} /></span>}
              />
              <div className="min-w-0">
                <h3 className="truncate font-medium text-ink">{car.make} {car.model}</h3>
                <p className="text-detail text-muted">{car.trim ? `${car.trim} · ` : ''}{car.year}</p>
              </div>
            </div>
            <div className="border-t border-line px-4 py-3.5">
              <div className="flex items-center justify-between text-detail">
                <span className="flex items-center gap-1.5 text-muted"><Icon name="calendar" size={14} /> Dates</span>
                <span className="font-medium text-ink">{fmtDate(pickupDate)} → {fmtDate(returnDate)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-detail">
                <span className="flex items-center gap-1.5 text-muted">
                  <Icon name={fulfillmentType === 'delivery' ? 'car' : 'pin'} size={14} /> {fulfillmentType === 'delivery' ? 'Delivery to' : 'Location'}
                </span>
                <span className="truncate pl-2 font-medium text-ink">{fulfillmentType === 'delivery' ? deliveryAddress : pickupLoc || car.location}</span>
              </div>
            </div>

            {availableReward && (
              <label className="flex cursor-pointer items-center gap-3 border-t border-line px-4 py-3.5">
                <input
                  type="checkbox"
                  checked={applyReward}
                  onChange={(e) => setApplyReward(e.target.checked)}
                  className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                />
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-050 text-accent">
                  <Icon name="gift" size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-detail font-medium text-ink">Apply reward</span>
                  <span className="block truncate font-mono text-caption text-muted">{availableReward.couponCode}</span>
                </span>
                <span className="badge badge-accent shrink-0">{availableReward.discountPercentage}% OFF</span>
              </label>
            )}

            <div className="border-t border-line px-4 py-4">{breakdown}</div>
            <div className="flex items-center gap-2 border-t border-line bg-panel/50 px-4 py-3 text-caption text-muted">
              <Icon name="shield" size={14} className="text-accent" />
              {POLICY_INFO[car.cancellationPolicy ?? 'flexible'].label} cancellation · {POLICY_INFO[car.cancellationPolicy ?? 'flexible'].tagline}
            </div>
          </div>
        </aside>
      </div>

      {step < 3 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <button onClick={back} aria-label="Back" className="pressable grid h-12 w-12 shrink-0 place-items-center rounded-full border border-line text-ink">
              <Icon name="chevronLeft" size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-caption text-muted">Total</p>
              <p className="font-display text-lead font-semibold leading-tight text-ink">{eur(grandTotal)}</p>
            </div>
            <button onClick={next} disabled={step === 0 && !canContinueStep0} className="btn btn-primary btn-lg disabled:opacity-50">
              Continue <Icon name="arrowRight" size={17} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
