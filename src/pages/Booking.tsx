import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import { Icon, type IconName } from '../components/Icon';
import { daysBetween, priceBreakdown } from '../components/BookingCard';
import { CarLoader } from '../components/CarLoader';
import { useApp } from '../lib/store';
import { useAuth } from '../lib/auth';
import { fetchCarWithHost } from '../lib/data/cars';
import { checkAvailability, createBooking, type Booking as BookingRecord } from '../lib/data/bookings';
import type { Car, Host } from '../data/types';
import NotFound from './NotFound';

const STEPS = ['Trip details', 'Driver details', 'Payment', 'Confirmation'];

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-center">
      {STEPS.map((s, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <li key={s} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2.5">
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold transition-all ${
                  done ? 'bg-accent text-white' : active ? 'bg-ink text-white' : 'bg-panel-2 text-faint'
                }`}
              >
                {done ? <Icon name="check" size={15} strokeWidth={3} /> : i + 1}
              </span>
              <span className={`hidden text-[13.5px] font-medium sm:block ${active || done ? 'text-ink' : 'text-faint'}`}>{s}</span>
            </div>
            {i < STEPS.length - 1 && (
              <span className={`mx-3 h-px flex-1 ${done ? 'bg-accent' : 'bg-line'}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Labeled({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <label className={full ? 'sm:col-span-2' : ''}>
      <span className="field-label">{label}</span>
      {children}
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
  const [dateError, setDateError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<'checking' | 'available' | 'unavailable' | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<BookingRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCarWithHost(slug ?? '')
      .then((data) => {
        if (cancelled) return;
        setResult(data);
        if (data && !pickupLoc) setPickupLoc(data.car.location);
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

  if (loadError) {
    return (
      <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-panel text-danger">
          <Icon name="info" size={26} />
        </span>
        <h1 className="font-display text-xl font-semibold text-ink">Couldn't load this car</h1>
        <p className="max-w-sm text-[14px] text-muted">{loadError}</p>
      </div>
    );
  }

  if (result === undefined) {
    return (
      <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
        <CarLoader size={90} />
        <p className="text-[14px] text-muted">Loading…</p>
      </div>
    );
  }

  if (result === null) return <NotFound />;
  const { car, host } = result;
  const b = priceBreakdown(car, days || 1);

  const canContinueStep0 = !dateError && pickupDate && returnDate && availability === 'available';

  const next = () => {
    if (step === 0 && !canContinueStep0) return;
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
      window.scrollTo({ top: 0 });
    }
  };
  const back = () => (step > 0 ? setStep((s) => s - 1) : navigate(-1));

  const confirmBooking = async () => {
    if (!session) {
      toast({ title: 'Sign in to book a car', icon: 'user' });
      navigate('/login', { state: { from: { pathname: `/book/${slug}` } } });
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const { booking, error } = await createBooking({
      carId: car.id,
      renterId: session.user.id,
      startDate: pickupDate,
      endDate: returnDate,
      pickupLocation: pickupLoc || car.location,
      protectionAddon: true,
    });
    setSubmitting(false);
    if (error || !booking) {
      setSubmitError(error ?? 'Something went wrong. Please try again.');
      return;
    }
    setConfirmed(booking);
    setStep(3);
    window.scrollTo({ top: 0 });
    toast({ title: 'Booking confirmed', desc: 'Your trip is booked.', icon: 'checkCircle' });
  };

  const fmtDate = (s: string) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

  /* ---------- Confirmation ---------- */
  if (step === 3 && confirmed) {
    return (
      <div className="container-page max-w-2xl py-14">
        <div className="animate-scale-in text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-accent-050 text-accent">
            <Icon name="checkCircle" size={34} />
          </span>
          <h1 className="mt-6 font-display text-3xl font-semibold text-ink sm:text-4xl">You're all set.</h1>
          <p className="mt-3 text-[15px] text-muted">
            Your booking is confirmed. Your host has been notified.
          </p>
        </div>

        <div className="mt-9 card overflow-hidden">
          <div className="flex items-center gap-4 border-b border-line p-5">
            <img src={unsplash(car.images[0], 240)} alt="" className="h-20 w-28 rounded-xl object-cover" />
            <div className="min-w-0">
              <p className="text-[12px] font-medium uppercase tracking-wide text-accent">Booking {confirmed.reference}</p>
              <h2 className="mt-0.5 truncate font-display text-lg font-semibold text-ink">{car.year} {car.make} {car.model}</h2>
              <p className="text-[13.5px] text-muted">Hosted by {host.name}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-y-5 p-5 sm:grid-cols-4">
            {[
              { l: 'Pick-up', v: fmtDate(confirmed.startDate), icon: 'calendar' as IconName },
              { l: 'Return', v: fmtDate(confirmed.endDate), icon: 'calendar' as IconName },
              { l: 'Location', v: confirmed.pickupLocation || car.location, icon: 'pin' as IconName },
              { l: 'Total paid', v: eur(confirmed.totalPrice), icon: 'card' as IconName },
            ].map((x) => (
              <div key={x.l}>
                <dt className="flex items-center gap-1.5 text-[12px] text-muted"><Icon name={x.icon} size={14} /> {x.l}</dt>
                <dd className="mt-1 text-[14.5px] font-medium text-ink">{x.v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex items-center gap-3 border-t border-line bg-panel/50 p-5">
            <img src={host.avatar} alt="" className="h-11 w-11 rounded-full object-cover" />
            <div className="flex-1">
              <p className="text-[14px] font-medium text-ink">{host.name}</p>
              <p className="text-[13px] text-muted">Responds {host.responseTime}</p>
            </div>
            <Link to="/messages" className="btn btn-secondary btn-sm"><Icon name="message" size={15} /> Message</Link>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link to="/dashboard#trips" className="btn btn-primary btn-lg flex-1">View my trips <Icon name="arrowRight" size={17} /></Link>
          <Link to="/browse" className="btn btn-secondary btn-lg flex-1">Browse more cars</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <button onClick={back} className="mb-6 inline-flex items-center gap-1.5 text-[14px] text-muted transition-colors hover:text-ink">
        <Icon name="chevronLeft" size={16} /> Back
      </button>

      <div className="mb-8 max-w-2xl"><Stepper step={step} /></div>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px] lg:gap-12">
        <div className="min-w-0">
          {step === 0 && (
            <section className="animate-fade-up">
              <h1 className="font-display text-2xl font-semibold text-ink">Trip details</h1>
              <p className="mt-1.5 text-[14.5px] text-muted">Confirm where and when you'd like the car.</p>
              <div className="mt-6 card p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Labeled label="Pick-up location" full>
                    <div className="relative">
                      <Icon name="pin" size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                      <input value={pickupLoc} onChange={(e) => setPickupLoc(e.target.value)} className="input !pl-11" />
                    </div>
                  </Labeled>
                  <Labeled label="Pick-up date">
                    <input type="date" min={todayISO()} value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className="input" />
                  </Labeled>
                  <Labeled label="Return date">
                    <input type="date" min={pickupDate || todayISO()} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="input" />
                  </Labeled>
                </div>

                {dateError && (
                  <p className="mt-4 flex items-center gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-[13.5px] text-danger">
                    <Icon name="info" size={16} /> {dateError}
                  </p>
                )}
                {!dateError && availability === 'checking' && (
                  <p className="mt-4 text-[13.5px] text-muted">Checking availability…</p>
                )}
                {!dateError && availability === 'unavailable' && (
                  <p className="mt-4 flex items-center gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-[13.5px] text-danger">
                    <Icon name="info" size={16} /> This car is already booked for part of those dates. Try a different range.
                  </p>
                )}
                {!dateError && availability === 'available' && (
                  <p className="mt-4 flex items-center gap-2 rounded-xl bg-accent-050 px-3.5 py-2.5 text-[13.5px] text-accent-700">
                    <Icon name="checkCircle" size={16} /> Available for your dates.
                  </p>
                )}

                <div className="mt-5 rounded-xl bg-panel p-4">
                  <p className="flex items-center gap-2 text-[13.5px] font-medium text-ink"><Icon name="shield" size={16} className="text-accent" /> Premium protection included</p>
                  <p className="mt-1 text-[13px] text-muted">Every Velora trip comes with damage protection and 24/7 roadside assistance.</p>
                </div>
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="animate-fade-up">
              <h1 className="font-display text-2xl font-semibold text-ink">Driver details</h1>
              <p className="mt-1.5 text-[14.5px] text-muted">We need a few details to verify the primary driver.</p>
              <div className="mt-6 card p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Labeled label="Full name" full>
                    <input defaultValue={profile?.full_name ?? ''} className="input" />
                  </Labeled>
                  <Labeled label="Email" full>
                    <input type="email" defaultValue={session?.user.email ?? ''} className="input" />
                  </Labeled>
                  <Labeled label="Phone">
                    <input defaultValue={profile?.phone ?? ''} className="input" />
                  </Labeled>
                  <Labeled label="Date of birth"><input type="date" className="input" /></Labeled>
                  <Labeled label="Driving licence number" full><input placeholder="e.g. RSSLXA92E14F205X" className="input" /></Labeled>
                  <Labeled label="Licence country"><input defaultValue={profile?.location ?? ''} className="input" /></Labeled>
                  <Labeled label="Licence expiry"><input type="date" className="input" /></Labeled>
                </div>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="animate-fade-up">
              <h1 className="font-display text-2xl font-semibold text-ink">Payment</h1>
              <p className="mt-1.5 flex items-center gap-1.5 text-[14.5px] text-muted"><Icon name="lock" size={15} className="text-accent" /> Encrypted &amp; secure. This is a demo — no real payment is taken.</p>
              <div className="mt-6 card p-6">
                <div className="mb-5 flex gap-2">
                  {['card', 'apple'].map((m) => (
                    <span key={m} className={`chip capitalize ${m === 'card' ? '!bg-ink !text-white !border-ink' : ''}`}>
                      <Icon name={m === 'card' ? 'card' : 'apple'} size={15} /> {m === 'card' ? 'Card' : 'Apple Pay'}
                    </span>
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Labeled label="Card number" full>
                    <div className="relative">
                      <input defaultValue="4242 4242 4242 4242" className="input !pr-24" />
                      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 gap-1">
                        <span className="h-5 w-8 rounded bg-gradient-to-br from-[#eb001b] to-[#f79e1b] opacity-90" />
                        <span className="h-5 w-8 rounded bg-[#1a1f71]" />
                      </div>
                    </div>
                  </Labeled>
                  <Labeled label="Name on card" full><input defaultValue={profile?.full_name ?? ''} className="input" /></Labeled>
                  <Labeled label="Expiry"><input defaultValue="08 / 28" className="input" /></Labeled>
                  <Labeled label="CVC"><input defaultValue="123" className="input" /></Labeled>
                  <Labeled label="Billing postcode"><input defaultValue="20121" className="input" /></Labeled>
                  <Labeled label="Country"><input defaultValue="Italy" className="input" /></Labeled>
                </div>
                <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-[13.5px] text-muted">
                  <input type="checkbox" defaultChecked className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" />
                  Save this card for faster checkout next time.
                </label>

                {submitError && (
                  <p className="mt-5 flex items-center gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-[13.5px] text-danger">
                    <Icon name="info" size={16} /> {submitError}
                  </p>
                )}
              </div>
            </section>
          )}

          <div className="mt-6 flex items-center justify-between">
            <button onClick={back} className="btn btn-ghost text-muted hover:text-ink">
              <Icon name="chevronLeft" size={16} /> {step === 0 ? 'Cancel' : 'Back'}
            </button>
            {step === 2 ? (
              <button onClick={confirmBooking} disabled={submitting} className="btn btn-primary btn-lg disabled:opacity-60">
                {submitting ? 'Confirming…' : `Pay ${eur(b.total)}`}
                {!submitting && <Icon name="arrowRight" size={17} />}
              </button>
            ) : (
              <button onClick={next} disabled={step === 0 && !canContinueStep0} className="btn btn-primary btn-lg disabled:opacity-50">
                Continue <Icon name="arrowRight" size={17} />
              </button>
            )}
          </div>
        </div>

        {/* Summary */}
        <aside>
          <div className="sticky top-[84px] card overflow-hidden">
            <div className="flex gap-3.5 p-4">
              <img src={unsplash(car.images[0], 240)} alt="" className="h-20 w-24 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0">
                <h3 className="truncate font-medium text-ink">{car.make} {car.model}</h3>
                <p className="text-[13px] text-muted">{car.trim ? `${car.trim} · ` : ''}{car.year}</p>
                <span className="mt-1 inline-flex items-center gap-1 text-[12.5px] text-muted">
                  <Icon name="star" size={12} className="text-star" /> {car.rating.toFixed(2)} · {car.trips} trips
                </span>
              </div>
            </div>
            <div className="border-t border-line px-4 py-3.5">
              <div className="flex items-center justify-between text-[13.5px]">
                <span className="flex items-center gap-1.5 text-muted"><Icon name="calendar" size={14} /> Dates</span>
                <span className="font-medium text-ink">{fmtDate(pickupDate)} → {fmtDate(returnDate)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[13.5px]">
                <span className="flex items-center gap-1.5 text-muted"><Icon name="pin" size={14} /> Location</span>
                <span className="truncate pl-2 font-medium text-ink">{pickupLoc || car.location}</span>
              </div>
            </div>
            <dl className="space-y-2.5 border-t border-line px-4 py-4 text-[14px]">
              <div className="flex justify-between"><dt className="text-muted">{eur(car.pricePerDay)} × {days || 1} days</dt><dd className="text-ink">{eur(b.base)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Service fee</dt><dd className="text-ink">{eur(b.service)}</dd></div>
              <div className="flex justify-between"><dt className="flex items-center gap-1 text-muted">Protection <Icon name="shield" size={13} className="text-accent" /></dt><dd className="text-ink">{eur(b.protection)}</dd></div>
              <div className="hairline my-1" />
              <div className="flex justify-between text-[15px] font-semibold text-ink"><dt>Total</dt><dd>{eur(b.total)}</dd></div>
            </dl>
            <div className="flex items-center gap-2 border-t border-line bg-panel/50 px-4 py-3 text-[12.5px] text-muted">
              <Icon name="shield" size={14} className="text-accent" /> Free cancellation up to 24h before pick-up
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
