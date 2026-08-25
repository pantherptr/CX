import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { CarLoader } from './CarLoader';
import { useAuth } from '../lib/auth';
import { useApp } from '../lib/store';
import { useCompare } from '../lib/compareStore';
import { useCars } from '../lib/data/cars';
import { useMyBookings } from '../lib/data/bookings';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import {
  matchCars,
  summary,
  DRIVE_TYPES,
  PRIORITIES,
  PASSENGER_BANDS,
  BUDGET_BANDS,
  type Preferences,
  type DriveType,
  type Priority,
  type PassengerBand,
  type BudgetBand,
  type PersonalSignals,
  type ScoredCar,
} from '../lib/carMatch';
import type { CarCategory } from '../data/types';

const CITIES = ['Milan', 'Rome', 'Florence', 'Paris', 'Barcelona', 'Munich', 'Amsterdam'];

const EMPTY_PREFS: Preferences = {
  driveType: null,
  priorities: [],
  passengers: null,
  budget: null,
  maxPricePerDay: null,
  city: null,
};

type Step = 'drive' | 'priority' | 'passengers' | 'budget' | 'location' | 'results';
const STEP_ORDER: Step[] = ['drive', 'priority', 'passengers', 'budget', 'location', 'results'];

/** The trigger button — pass whatever styling the placement wants via
 *  `className`, same shape as `DriveChallengeLauncher`, so the homepage,
 *  Cars page and Garage each style their own entry point but share this
 *  one modal implementation. */
export function ConciergeLauncher({ className, children }: { className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open && <ConciergeModal onClose={() => setOpen(false)} />}
    </>
  );
}

function OptionCard({
  active,
  icon,
  label,
  sub,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all duration-200 ${
        active
          ? 'border-accent-bright/60 bg-accent-bright/10 text-white'
          : 'border-white/12 bg-white/[0.04] text-white/85 hover:border-white/30 hover:bg-white/[0.08]'
      }`}
    >
      <span className={active ? 'text-accent-bright' : 'text-white/60'}>{icon}</span>
      <span className="text-body font-semibold">{label}</span>
      {sub && <span className="text-caption text-white/50">{sub}</span>}
    </button>
  );
}

function ConciergeModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { favorites, toggleFavorite, isFavorite } = useApp();
  const { toggleCompare } = useCompare();
  const { cars } = useCars();
  const { bookings } = useMyBookings(session?.user.id);

  const [step, setStep] = useState<Step>('drive');
  const [prefs, setPrefs] = useState<Preferences>(EMPTY_PREFS);
  const [thinking, setThinking] = useState(false);
  const [relaxed, setRelaxed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Real personalisation signals — only ever the user's own favorites and
  // rented categories, and only when logged in with data present.
  const personal: PersonalSignals = useMemo(() => {
    if (!session || !cars) return {};
    const byId = new Map(cars.map((c) => [c.id, c]));
    const favoriteCategories = cars.filter((c) => favorites.has(c.id)).map((c) => c.category);
    const rentedCategories = (bookings ?? [])
      .map((b) => byId.get(b.car.id)?.category)
      .filter(Boolean) as CarCategory[];
    return {
      favoriteCategories,
      rentedCategories,
      rentedCarIds: (bookings ?? []).map((b) => b.car.id),
    };
  }, [session, cars, favorites, bookings]);

  const hasPersonalData =
    (personal.favoriteCategories?.length ?? 0) > 0 || (personal.rentedCategories?.length ?? 0) > 0;

  const match = useMemo(() => {
    if (!cars || step !== 'results') return null;
    const effective: Preferences = relaxed
      ? { ...prefs, budget: 'flexible', maxPricePerDay: null, city: null }
      : prefs;
    return matchCars(cars, effective, personal);
  }, [cars, step, prefs, personal, relaxed]);

  const goToResults = () => {
    setThinking(true);
    // A brief, deliberate "concierge is selecting" beat — not a fake
    // network wait, just a premium reveal (skipped instantly if the user
    // has reduced motion on).
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => {
      setThinking(false);
      setStep('results');
    }, reduced ? 0 : 900);
  };

  const advance = (from: Step) => {
    const idx = STEP_ORDER.indexOf(from);
    const nextStep = STEP_ORDER[idx + 1];
    if (nextStep === 'results') goToResults();
    else setStep(nextStep);
  };

  const back = () => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
  };

  const startOver = () => {
    setPrefs(EMPTY_PREFS);
    setRelaxed(false);
    setStep('drive');
  };

  const togglePriority = (p: Priority) =>
    setPrefs((prev) => ({
      ...prev,
      priorities: prev.priorities.includes(p) ? prev.priorities.filter((x) => x !== p) : [...prev.priorities, p],
    }));

  const stepIndex = STEP_ORDER.indexOf(step);
  const progress = step === 'results' ? 1 : stepIndex / (STEP_ORDER.length - 1);

  const rentNow = (slug: string) => {
    onClose();
    navigate(`/book/${slug}`);
  };

  const top = match?.results[0] ?? null;
  const alternates = match?.results.slice(1, 5) ?? [];

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden overscroll-none bg-noir">
      {/* Ambient CX wash */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: 'radial-gradient(60% 45% at 15% 5%, rgba(0,212,71,0.14), transparent 62%)' }}
      />

      {/* Chrome */}
      <div className="relative flex h-16 shrink-0 items-center justify-between px-4 sm:px-6" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <span className="flex items-center gap-2 text-detail font-semibold uppercase tracking-[0.14em] text-white">
          <Icon name="sparkles" size={16} className="text-accent-bright" /> CX Concierge
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid h-10 w-10 place-items-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Icon name="x" size={20} />
        </button>
      </div>

      {/* Progress */}
      <div className="relative h-0.5 w-full shrink-0 bg-white/10">
        <div className="h-full bg-accent-bright transition-all duration-500" style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="relative flex-1 overflow-y-auto px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          {thinking ? (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
              <CarLoader size={90} />
              <p className="animate-fade-in text-copy font-medium text-white/70">Finding your CX…</p>
            </div>
          ) : step !== 'results' ? (
            <div key={step} className="animate-fade-up">
              {hasPersonalData && step === 'drive' && (
                <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-caption text-white/60">
                  <Icon name="user" size={13} className="text-accent-bright" /> Personalised from your CX history
                </p>
              )}

              {/* Q1 — drive type */}
              {step === 'drive' && (
                <>
                  <QuestionHead n={1} title="What's the drive?" />
                  <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {DRIVE_TYPES.map((d) => (
                      <OptionCard
                        key={d.id}
                        active={prefs.driveType === d.id}
                        icon={<Icon name={d.icon} size={22} />}
                        label={d.label}
                        sub={d.blurb}
                        onClick={() => {
                          setPrefs((p) => ({ ...p, driveType: d.id as DriveType }));
                          advance('drive');
                        }}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* Q2 — priorities (multi) */}
              {step === 'priority' && (
                <>
                  <QuestionHead n={2} title="What matters most?" hint="Pick any that apply" />
                  <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {PRIORITIES.map((p) => (
                      <OptionCard
                        key={p.id}
                        active={prefs.priorities.includes(p.id as Priority)}
                        icon={<Icon name={p.icon} size={22} />}
                        label={p.label}
                        onClick={() => togglePriority(p.id as Priority)}
                      />
                    ))}
                  </div>
                  <StepFooter onBack={back} onNext={() => advance('priority')} nextLabel="Continue" />
                </>
              )}

              {/* Q3 — passengers */}
              {step === 'passengers' && (
                <>
                  <QuestionHead n={3} title="How many people?" />
                  <div className="mt-6 grid grid-cols-3 gap-3">
                    {PASSENGER_BANDS.map((b) => (
                      <OptionCard
                        key={b.id}
                        active={prefs.passengers === b.id}
                        icon={<Icon name="users" size={22} />}
                        label={b.label}
                        onClick={() => {
                          setPrefs((p) => ({ ...p, passengers: b.id as PassengerBand }));
                          advance('passengers');
                        }}
                      />
                    ))}
                  </div>
                  <StepFooter onBack={back} onNext={() => advance('passengers')} nextLabel="Skip" subtle />
                </>
              )}

              {/* Q4 — budget */}
              {step === 'budget' && (
                <>
                  <QuestionHead n={4} title="What's your budget?" />
                  <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {BUDGET_BANDS.map((b) => (
                      <OptionCard
                        key={b.id}
                        active={prefs.budget === b.id}
                        icon={<Icon name="wallet" size={22} />}
                        label={b.label}
                        sub={b.note}
                        onClick={() => {
                          setPrefs((p) => ({ ...p, budget: b.id as BudgetBand, maxPricePerDay: null }));
                          advance('budget');
                        }}
                      />
                    ))}
                  </div>
                  <div className="mt-5 rounded-2xl border border-white/12 bg-white/[0.04] p-4">
                    <label className="block text-caption font-semibold uppercase tracking-wide text-white/50">
                      Or set an exact daily maximum
                    </label>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="relative flex-1">
                        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50">€</span>
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          placeholder="e.g. 250"
                          value={prefs.maxPricePerDay ?? ''}
                          onChange={(e) =>
                            setPrefs((p) => ({
                              ...p,
                              maxPricePerDay: e.target.value ? Number(e.target.value) : null,
                              budget: e.target.value ? null : p.budget,
                            }))
                          }
                          className="w-full rounded-xl border border-white/15 bg-black/30 py-2.5 pl-8 pr-3 text-copy text-white outline-none [color-scheme:dark] focus:border-accent-bright/50"
                        />
                      </div>
                      <span className="text-detail text-white/45">/ day</span>
                    </div>
                  </div>
                  <StepFooter onBack={back} onNext={() => advance('budget')} nextLabel="Continue" />
                </>
              )}

              {/* Q5 — location */}
              {step === 'location' && (
                <>
                  <QuestionHead n={5} title="Where are you driving?" />
                  <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {CITIES.map((c) => (
                      <OptionCard
                        key={c}
                        active={prefs.city === c}
                        icon={<Icon name="pin" size={22} />}
                        label={c}
                        onClick={() => {
                          setPrefs((p) => ({ ...p, city: c }));
                          advance('location');
                        }}
                      />
                    ))}
                  </div>
                  <StepFooter
                    onBack={back}
                    onNext={() => {
                      setPrefs((p) => ({ ...p, city: null }));
                      advance('location');
                    }}
                    nextLabel="Any location"
                    subtle
                  />
                </>
              )}
            </div>
          ) : (
            /* ---------- RESULTS ---------- */
            <div className="animate-fade-up pb-8">
              {!cars ? (
                <div className="flex min-h-[50vh] items-center justify-center">
                  <CarLoader size={80} />
                </div>
              ) : top ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-caption font-semibold uppercase tracking-[0.2em] text-accent-bright">Your CX Match</p>
                    <button onClick={startOver} className="inline-flex items-center gap-1.5 text-detail font-medium text-white/60 hover:text-white">
                      <Icon name="sort" size={14} /> Start over
                    </button>
                  </div>
                  {relaxed && (
                    <p className="mt-2 text-detail text-white/55">Options expanded — showing the closest matches across the fleet.</p>
                  )}

                  {/* Hero match */}
                  <TopMatch scored={top} prefs={prefs} onRent={rentNow} onClose={onClose} favToggle={toggleFavorite} isFav={isFavorite} onCompare={toggleCompare} />

                  {/* Alternatives */}
                  {alternates.length > 0 && (
                    <>
                      <p className="mt-10 text-caption font-semibold uppercase tracking-[0.2em] text-white/50">More Options</p>
                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {alternates.map((s) => (
                          <AltCard key={s.car.id} scored={s} onRent={rentNow} onClose={onClose} onCompare={toggleCompare} />
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                /* No match */
                <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-white/10 text-white/60">
                    <Icon name="search" size={26} />
                  </span>
                  <h2 className="font-display text-2xl font-semibold text-white">We couldn't find the perfect match</h2>
                  <p className="max-w-sm text-body text-white/60">Let's widen the search — we'll relax your budget and location to find the closest cars in the CX fleet.</p>
                  <button onClick={() => setRelaxed(true)} className="btn btn-accent-bright btn-lg">
                    Expand My Options <Icon name="arrowRight" size={17} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function QuestionHead({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div>
      <p className="text-caption font-semibold uppercase tracking-[0.2em] text-white/45">Question {n} of 5</p>
      <h2 className="mt-2 font-display text-2xl font-semibold text-white sm:text-3xl">{title}</h2>
      {hint && <p className="mt-1 text-detail text-white/50">{hint}</p>}
    </div>
  );
}

function StepFooter({
  onBack,
  onNext,
  nextLabel,
  subtle,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  subtle?: boolean;
}) {
  return (
    <div className="mt-8 flex items-center justify-between">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-body font-medium text-white/60 hover:text-white">
        <Icon name="chevronLeft" size={16} /> Back
      </button>
      <button
        onClick={onNext}
        className={subtle ? 'text-body font-medium text-white/60 hover:text-white' : 'btn btn-accent-bright'}
      >
        {nextLabel} {!subtle && <Icon name="arrowRight" size={16} />}
      </button>
    </div>
  );
}

function TopMatch({
  scored,
  prefs,
  onRent,
  onClose,
  favToggle,
  isFav,
  onCompare,
}: {
  scored: ScoredCar;
  prefs: Preferences;
  onRent: (slug: string) => void;
  onClose: () => void;
  favToggle: (id: string) => void;
  isFav: (id: string) => boolean;
  onCompare: (id: string) => void;
}) {
  const { car, match } = scored;
  const fav = isFav(car.id);
  return (
    <div className="mt-4 overflow-hidden rounded-[1.75rem] border border-white/12 bg-white/[0.04]">
      <div className="relative aspect-[16/10] w-full overflow-hidden sm:aspect-[21/9]">
        <img src={unsplash(car.images[0], 1400)} alt={`${car.make} ${car.model}`} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        <span className="absolute right-4 top-4 rounded-full border border-accent-bright/40 bg-black/50 px-3 py-1.5 text-detail font-bold text-accent-bright backdrop-blur-md">
          {match}% MATCH
        </span>
        <div className="absolute bottom-4 left-5 right-5">
          <h3 className="font-display text-2xl font-semibold text-white sm:text-3xl">
            {car.make} {car.model}
          </h3>
          <p className="text-body text-white/70">
            {car.trim ? `${car.trim} · ` : ''}
            {car.year} · {car.category}
          </p>
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <p className="text-body leading-relaxed text-white/75">{summary(car, prefs)}</p>

        {scored.reasons.length > 0 && (
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {scored.reasons.map((r) => (
              <li key={r} className="flex items-center gap-2 text-detail text-white/80">
                <Icon name="checkCircle" size={16} className="shrink-0 text-accent-bright" /> {r}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex items-end justify-between">
          <p className="text-white">
            <span className="font-display text-2xl font-semibold">{eur(car.pricePerDay)}</span>
            <span className="text-detail text-white/60"> / day</span>
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button onClick={() => onRent(car.slug)} className="btn btn-accent-bright btn-lg flex-1">
            Rent This Car <Icon name="arrowRight" size={17} />
          </button>
          <Link
            to={`/cars/${car.slug}`}
            onClick={onClose}
            className="btn btn-lg flex-1 border border-white/20 bg-white/[0.06] text-white hover:border-white/35 hover:bg-white/10"
          >
            View Details
          </Link>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => favToggle(car.id)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 py-2.5 text-detail font-medium text-white/80 hover:border-white/30"
          >
            <Icon name="heart" size={15} fill={fav} className={fav ? 'text-[#e2384d]' : ''} /> {fav ? 'Saved' : 'Save to Garage'}
          </button>
          <button
            onClick={() => onCompare(car.id)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 py-2.5 text-detail font-medium text-white/80 hover:border-white/30"
          >
            <Icon name="compare" size={15} /> Compare
          </button>
        </div>
      </div>
    </div>
  );
}

function AltCard({
  scored,
  onRent,
  onClose,
  onCompare,
}: {
  scored: ScoredCar;
  onRent: (slug: string) => void;
  onClose: () => void;
  onCompare: (id: string) => void;
}) {
  const { car, match } = scored;
  return (
    <div className="overflow-hidden rounded-2xl border border-white/12 bg-white/[0.04]">
      <div className="relative aspect-[16/10] overflow-hidden">
        <img src={unsplash(car.images[0], 700)} alt={`${car.make} ${car.model}`} className="h-full w-full object-cover" />
        <span className="absolute right-3 top-3 rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-label font-bold text-accent-bright backdrop-blur-md">
          {match}%
        </span>
      </div>
      <div className="p-4">
        <p className="font-medium text-white">
          {car.make} {car.model}
        </p>
        <p className="mt-0.5 text-caption text-white/55">
          {car.seats} seats · {car.transmission} · {car.fuel}
        </p>
        <p className="mt-2 text-white">
          <span className="text-lead font-semibold">{eur(car.pricePerDay)}</span>
          <span className="text-caption text-white/55"> / day</span>
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => onRent(car.slug)} className="btn btn-accent-bright btn-sm flex-1">
            Rent
          </button>
          <Link
            to={`/cars/${car.slug}`}
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/15 text-white/75 hover:border-white/30"
            aria-label="View details"
          >
            <Icon name="arrowUpRight" size={16} />
          </Link>
          <button
            onClick={() => onCompare(car.id)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/15 text-white/75 hover:border-white/30"
            aria-label="Compare"
          >
            <Icon name="compare" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
