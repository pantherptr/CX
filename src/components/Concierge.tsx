import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { Img } from './motion';
import { PremiumPageLoader } from './PremiumLoader';
import { useAuth } from '../lib/auth';
import { useApp } from '../lib/store';
import { useCompare } from '../lib/compareStore';
import { useCars } from '../lib/data/cars';
import { useMyBookings } from '../lib/data/bookings';
import { fetchSupportAccountId, findOrCreateConversation } from '../lib/data/messages';
import { unsplash, unsplashSrcSet } from '../lib/img';
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

/**
 * CX Concierge — a calm, professional vehicle advisor: white surfaces, one
 * brand green, plain labels (no terminal/HUD styling). Every color below reuses the
 * same light-theme tokens the rest of the product already builds on
 * (CarDetails, Browse, the dashboards) rather than inventing a new
 * palette: this is the same "exclusive, quiet, expensive" surface, not a
 * separate look bolted onto one feature. `--color-accent` (not
 * `accent-bright`) is what holds real AA contrast on white — accent-bright
 * stays reserved for on-photo/on-dark spots, matching how index.css's own
 * comments describe the split.
 */

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
const QUIZ_STEPS = STEP_ORDER.filter((s): s is Exclude<Step, 'results'> => s !== 'results');

function questionFor(s: Exclude<Step, 'results'>): string {
  switch (s) {
    case 'drive':
      return 'What kind of trip is this?';
    case 'priority':
      return 'What matters most to you in a car?';
    case 'passengers':
      return 'How many people are travelling?';
    case 'budget':
      return 'What is your daily budget?';
    case 'location':
      return 'Where will you be driving?';
  }
}

/** The chat-history line for a step that's already been answered — always
 *  derived from `prefs`, never stored separately, so going back and
 *  changing an answer can never leave a stale line behind. */
function answerFor(s: Exclude<Step, 'results'>, prefs: Preferences): string {
  switch (s) {
    case 'drive':
      return DRIVE_TYPES.find((d) => d.id === prefs.driveType)?.label ?? '—';
    case 'priority':
      return prefs.priorities.length
        ? prefs.priorities.map((id) => PRIORITIES.find((p) => p.id === id)?.label).filter(Boolean).join(', ')
        : 'No particular priority';
    case 'passengers':
      return prefs.passengers ? `${prefs.passengers} people` : 'Not specified';
    case 'budget':
      if (prefs.maxPricePerDay) return `Up to €${prefs.maxPricePerDay} / day`;
      return prefs.budget ? BUDGET_BANDS.find((b) => b.id === prefs.budget)?.label ?? 'Flexible' : 'Flexible';
    case 'location':
      return prefs.city ?? 'Any location';
  }
}

/** The trigger button — pass whatever styling the placement wants via
 *  `className`, so the homepage, Cars page and Garage each style their
 *  own entry point but share this one modal implementation. */
export function ConciergeLauncher({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children' | 'onClick'>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={className} {...rest}>
        {children}
      </button>
      {open && <ConciergeModal onClose={() => setOpen(false)} />}
    </>
  );
}



/** The Concierge's face — the CX key on a plain noir disc with a single
 *  thin ring. Kept deliberately simple: this mark shows up small all over
 *  the product (Browse's banner, the homepage card, the dashboards) as the
 *  one consistent brand badge, so it stays a clean, instantly-legible
 *  signature rather than a miniature hero graphic. `live` adds the
 *  "online" dot used in the header — the Concierge is always instantly
 *  available, which is genuinely true of a guided matcher. Exported so
 *  every entry point wears the exact same mark. */
export function ConciergeMark({ size = 30, live = false, className = '' }: { size?: number; live?: boolean; className?: string }) {
  // Black mark with the logo's own green (#009646) showing through its eye
  // cut-outs, on a white disc so it reads on both the dark banners and the
  // white chat header. The green breathes and the whole eye blinks now and
  // then, so the assistant looks alive (both stop for reduced-motion users).
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center rounded-full bg-white shadow-[0_0_0_1px_rgba(14,20,17,0.12)] ${className}`}
      style={{ width: size, height: size }}
    >
      <span className="relative h-[78%] w-[78%]">
        <img src="/brand/cx-bat-man.webp" alt="" width={120} height={57} draggable={false} className="h-full w-full select-none object-contain" />
        {live && (
          <span className="absolute -bottom-px -right-px flex h-[26%] min-h-2 w-[26%] min-w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-[#009646]/55" />
            <span className="relative h-full w-full rounded-full border-2 border-white bg-[#009646]" />
          </span>
        )}
      </span>
    </span>
  );
}

/** Left-aligned "assistant is speaking" message — the CX mark plus a
 *  white bubble on the chat's soft neutral ground, reused for every
 *  question, lead-in and empty state so the whole flow reads as one
 *  conversation rather than a form. */
function AssistantBubble({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <div className="flex items-start gap-3 animate-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <ConciergeMark size={32} />
      <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-line bg-white px-4 py-3 text-copy font-medium leading-relaxed text-ink shadow-hair sm:max-w-[75%]">
        {children}
      </div>
    </div>
  );
}

/** Right-aligned recap of the user's own answer — ink, like the user's
 *  own messages everywhere else in CX (Messages uses the same), so the
 *  transcript reads as a real back-and-forth. */
function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end animate-fade-up">
      <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-ink px-4 py-2.5 text-body font-medium text-white sm:max-w-[70%]">
        {children}
      </div>
    </div>
  );
}

/** The brief "reviewing the fleet" beat before results land — three quiet
 *  dots, the universal "typing" signal, rather than a technical readout. */
function TypingBubble() {
  return (
    <div className="flex items-center gap-3 animate-fade-up">
      <ConciergeMark size={32} />
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-line bg-white px-4 py-3.5 shadow-hair" aria-hidden="true">
        {[0, 160, 320].map((d) => (
          <span key={d} className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" style={{ animationDelay: `${d}ms` }} />
        ))}
      </div>
    </div>
  );
}

/** A quick-reply chip — for the short answers (priorities, passengers,
 *  city). A selected chip gets the brand-green outline and tint; `multi`
 *  choices also swap their icon for a check, so a multi-select reads as
 *  "these are ticked", not "this one was the answer". */
function QuickReply({
  active,
  icon,
  label,
  multi = false,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  multi?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`group inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2.5 text-body font-medium transition-[background-color,border-color,color] duration-200 active:scale-[0.98] ${
        active
          ? 'border-ink bg-ink text-white'
          : 'border-line bg-white text-ink-soft shadow-hair hover:border-ink/40 hover:text-ink'
      }`}
    >
      <span className={`transition-colors ${active ? 'text-white' : 'text-muted group-hover:text-ink-soft'}`}>
        {multi && active ? <Icon name="check" size={17} strokeWidth={2.6} /> : icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

/** A richer answer card — for the questions whose options carry a blurb
 *  (the kind of drive, the budget bands). The blurb is half the decision
 *  ("Road Trip — long-haul comfort"), so it stays visible on phones too:
 *  two-up grid, a ~68px target each, the icon in its own tile. */
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
      aria-pressed={active}
      className={`group relative flex min-h-[4.25rem] items-center gap-3 rounded-[20px] border p-3 text-left transition-[background-color,border-color,box-shadow] duration-200 active:scale-[0.98] ${
        active
          ? 'border-ink bg-white shadow-[0_0_0_1px_#16161a]'
          : 'border-line bg-white shadow-hair hover:border-ink/40 hover:shadow-soft'
      }`}
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors ${
          active ? 'bg-ink text-white' : 'bg-panel text-ink-soft group-hover:bg-panel-2 group-hover:text-ink'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-body font-semibold leading-tight text-ink">{label}</span>
        {sub && <span className="mt-0.5 block text-caption leading-snug text-muted">{sub}</span>}
      </span>
    </button>
  );
}

/** A quiet text-link action alongside the chips — "Continue", "Skip",
 *  "Any location" — distinct from a quick-reply because it doesn't
 *  represent a choice, it moves the conversation forward. */
function ActionLink({ children, onClick, icon }: { children: ReactNode; onClick: () => void; icon?: IconName }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-1 text-body font-semibold text-ink underline underline-offset-4 transition-colors hover:text-ink-soft"
    >
      {children} {icon && <Icon name={icon} size={15} />}
    </button>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mb-2.5 inline-flex min-h-8 items-center gap-1 text-detail font-medium text-muted transition-colors hover:text-ink">
      <Icon name="chevronLeft" size={14} /> Back
    </button>
  );
}

/** Match score as a plain, legible pill ("92% match"). */
function MatchBadge({ value }: { value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <span className="inline-flex items-baseline gap-1 rounded-full bg-white/95 px-3 py-1.5 shadow-hair backdrop-blur">
      <span className="font-display text-lg font-semibold leading-none tabular-nums text-ink">{clamped}%</span>
      <span className="text-caption font-medium leading-none text-muted">match</span>
    </span>
  );
}

function ConciergeModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { favorites, toggleFavorite, isFavorite, toast } = useApp();
  const { toggleCompare } = useCompare();
  const { cars } = useCars();
  const { bookings } = useMyBookings(session?.user.id);

  const [step, setStep] = useState<Step>('drive');
  const [prefs, setPrefs] = useState<Preferences>(EMPTY_PREFS);
  const [thinking, setThinking] = useState(false);
  const [relaxed, setRelaxed] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Keep the transcript pinned to its latest message, the way a real chat
  // does, every time a question is answered, results land, or the
  // "thinking" beat starts.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [step, thinking]);

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

  const quizIndex = QUIZ_STEPS.indexOf(step as (typeof QUIZ_STEPS)[number]);
  // Once the concierge is "thinking" or has landed on results, every
  // question counts as answered for transcript purposes — the boundary
  // only sits mid-conversation while a question is still being asked.
  const answeredCount = thinking || step === 'results' ? QUIZ_STEPS.length : quizIndex;

  const rentNow = (slug: string) => {
    onClose();
    navigate(`/book/${slug}`);
  };

  /** Escalation to a real person — CX Concierge is a deterministic guide,
   *  never a chatbot pretending to be human, so when someone actually
   *  wants a human this hands them off for real: the same Owner/Owner
   *  Assistant identity the rest of the messaging system already uses,
   *  via a genuine conversation, not a canned reply. */
  const talkToHuman = async () => {
    if (!session) {
      onClose();
      navigate('/login');
      return;
    }
    setEscalating(true);
    try {
      const ownerId = await fetchSupportAccountId();
      if (!ownerId) {
        toast({ title: 'Support is not available right now', icon: 'info' });
        return;
      }
      const conversationId = await findOrCreateConversation(null, session.user.id, ownerId);
      onClose();
      navigate(`/messages?c=${conversationId}`);
    } catch {
      toast({ title: "Couldn't reach our team — please try again", icon: 'info' });
    } finally {
      setEscalating(false);
    }
  };

  const top = match?.results[0] ?? null;
  const alternates = match?.results.slice(1, 5) ?? [];

  const progress = step === 'results' ? 100 : Math.round((answeredCount / QUIZ_STEPS.length) * 100);
  const stepLabel =
    step === 'results'
      ? 'Your recommendation'
      : thinking
        ? 'Reviewing the fleet…'
        : `Step ${Math.min(answeredCount + 1, QUIZ_STEPS.length)} of ${QUIZ_STEPS.length}`;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden overscroll-none bg-[#f6f7f3] animate-fade-in">
      <div className="relative shrink-0 border-b border-line/70 bg-white/85 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <ConciergeMark size={38} live />
            <div>
              <p className="font-display text-[1.0625rem] font-semibold leading-none tracking-tight text-ink">CX Concierge</p>
              <p className="mt-1.5 text-caption leading-none text-muted" aria-live="polite">
                {stepLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {session && (
              <button
                onClick={talkToHuman}
                disabled={escalating}
                className="hidden items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-2 text-detail font-medium text-ink-soft transition-colors hover:border-line-strong hover:bg-panel disabled:opacity-50 sm:inline-flex"
              >
                <Icon name="headset" size={15} className="text-accent" />
                {escalating ? 'Connecting…' : 'Talk to a person'}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-11 w-11 place-items-center rounded-full text-muted transition-colors hover:bg-panel hover:text-ink active:bg-panel"
            >
              <Icon name="x" size={20} />
            </button>
          </div>
        </div>
        <div className="flex gap-1.5 px-4 pb-2.5 sm:px-6" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Concierge progress">
          {QUIZ_STEPS.map((qs, i) => (
            <span key={qs} className="relative h-[4px] flex-1 overflow-hidden rounded-full bg-line">
              <span className="absolute inset-0 origin-left rounded-full bg-ink transition-transform duration-500 ease-out" style={{ transform: `scaleX(${step === 'results' || i < answeredCount ? 1 : i === answeredCount && !thinking ? 0.45 : 0})` }} />
            </span>
          ))}
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-2 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          {/* Welcome — always at the top, even once questions are
              answered, so the transcript reads like a real conversation
              from the start rather than resetting per step. */}
          <div className="px-1 pb-1 pt-7 animate-fade-up">
            <p className="text-label font-semibold uppercase tracking-[0.14em] text-muted">Personal vehicle advisor</p>
            <h2 className="mt-2 font-display text-[2rem] font-bold leading-[1.08] tracking-tight text-ink text-balance sm:text-4xl">
              Find the right car in five questions.
            </h2>
            <p className="mt-2 max-w-lg text-body leading-relaxed text-muted text-pretty">
              Tell me about your trip and I&apos;ll recommend the best match from the CX fleet.
              {hasPersonalData && ' I’ll also take your saved cars and past trips into account.'}
            </p>
            {/* Mobile-only escalation — the header button is hidden below sm:. */}
            {session && (
              <button
                onClick={talkToHuman}
                disabled={escalating}
                className="mt-4 inline-flex min-h-9 items-center gap-1.5 text-detail font-medium text-ink-soft transition-colors hover:text-accent-700 disabled:opacity-50 sm:hidden"
              >
                <Icon name="headset" size={14} className="text-accent" />
                {escalating ? 'Connecting…' : 'Prefer to talk to a person?'}
              </button>
            )}
          </div>

          {/* Already-answered questions, derived straight from `prefs` —
              never a separate log, so a Back + re-answer can't leave a
              stale line in the transcript. */}
          {QUIZ_STEPS.slice(0, answeredCount).map((s, i) => (
            <div key={s} className="flex flex-col gap-3">
              <AssistantBubble delay={i * 40}>{questionFor(s)}</AssistantBubble>
              <UserBubble>{answerFor(s, prefs)}</UserBubble>
            </div>
          ))}

          {thinking && (
            <div>
              <TypingBubble />
            </div>
          )}

          {/* The current, still-unanswered question */}
          {!thinking && step !== 'results' && (
            <div key={step} className="flex flex-col gap-3">
              <AssistantBubble>{questionFor(step)}</AssistantBubble>

              {/* Answers span the full width on phones (the 42px indent
                  that lines them up under the bubble costs a quarter of a
                  narrow screen); from sm: up they sit under the bubble. */}
              <div className="sm:pl-[42px]">
                {quizIndex > 0 && <BackLink onClick={back} />}

                {step === 'drive' && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {DRIVE_TYPES.map((d) => (
                      <OptionCard
                        key={d.id}
                        active={prefs.driveType === d.id}
                        icon={<Icon name={d.icon} size={18} />}
                        label={d.label}
                        sub={d.blurb}
                        onClick={() => {
                          setPrefs((p) => ({ ...p, driveType: d.id as DriveType }));
                          advance('drive');
                        }}
                      />
                    ))}
                  </div>
                )}

                {step === 'priority' && (
                  <>
                    <p className="mb-2.5 text-detail text-faint">Pick any that apply</p>
                    <div className="flex flex-wrap gap-2">
                      {PRIORITIES.map((p) => (
                        <QuickReply
                          key={p.id}
                          multi
                          active={prefs.priorities.includes(p.id as Priority)}
                          icon={<Icon name={p.icon} size={17} />}
                          label={p.label}
                          onClick={() => togglePriority(p.id as Priority)}
                        />
                      ))}
                    </div>
                    <div className="mt-3">
                      <ActionLink onClick={() => advance('priority')} icon="arrowRight">
                        Continue
                      </ActionLink>
                    </div>
                  </>
                )}

                {step === 'passengers' && (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {PASSENGER_BANDS.map((b) => (
                        <QuickReply
                          key={b.id}
                          active={prefs.passengers === b.id}
                          icon={<Icon name="users" size={17} />}
                          label={b.label}
                          onClick={() => {
                            setPrefs((p) => ({ ...p, passengers: b.id as PassengerBand }));
                            advance('passengers');
                          }}
                        />
                      ))}
                    </div>
                    <div className="mt-3">
                      <ActionLink onClick={() => advance('passengers')}>Skip</ActionLink>
                    </div>
                  </>
                )}

                {step === 'budget' && (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {BUDGET_BANDS.map((b) => (
                        <OptionCard
                          key={b.id}
                            active={prefs.budget === b.id}
                          icon={<Icon name={b.id === 'flexible' ? 'sparkles' : 'wallet'} size={18} />}
                          label={b.label}
                          sub={b.note}
                          onClick={() => {
                            setPrefs((p) => ({ ...p, budget: b.id as BudgetBand, maxPricePerDay: null }));
                            advance('budget');
                          }}
                        />
                      ))}
                    </div>

                    <p className="mb-2 mt-4 text-detail text-faint">Or tell me an exact daily maximum</p>
                    <div className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-white py-1.5 pl-4 pr-1.5 shadow-hair transition-colors focus-within:border-accent/50 focus-within:shadow-[0_0_0_3px_var(--color-accent-100)]">
                      <span className="text-faint">€</span>
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        placeholder="250"
                        value={prefs.maxPricePerDay ?? ''}
                        onChange={(e) =>
                          setPrefs((p) => ({
                            ...p,
                            maxPricePerDay: e.target.value ? Number(e.target.value) : null,
                            budget: e.target.value ? null : p.budget,
                          }))
                        }
                        onKeyDown={(e) => e.key === 'Enter' && advance('budget')}
                        className="w-20 bg-transparent text-body text-ink outline-none"
                      />
                      <span className="text-caption text-faint">/ day</span>
                      <button
                        onClick={() => advance('budget')}
                        aria-label="Confirm budget"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-white transition-transform hover:scale-105"
                      >
                        <Icon name="arrowRight" size={15} strokeWidth={2.5} />
                      </button>
                    </div>
                    <div className="mt-3">
                      <ActionLink onClick={() => advance('budget')}>Continue</ActionLink>
                    </div>
                  </>
                )}

                {step === 'location' && (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {CITIES.map((c) => (
                        <QuickReply
                          key={c}
                          active={prefs.city === c}
                          icon={<Icon name="pin" size={17} />}
                          label={c}
                          onClick={() => {
                            setPrefs((p) => ({ ...p, city: c }));
                            advance('location');
                          }}
                        />
                      ))}
                    </div>
                    <div className="mt-3">
                      <ActionLink
                        onClick={() => {
                          setPrefs((p) => ({ ...p, city: null }));
                          advance('location');
                        }}
                      >
                        Any location
                      </ActionLink>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ---------- RESULTS ---------- */}
          {!thinking && step === 'results' && (
            <div className="pb-8">
              {!cars ? (
                <div className="flex min-h-[40dvh] items-center justify-center">
                  <PremiumPageLoader size={80} />
                </div>
              ) : top ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                    <AssistantBubble>
                      My recommendation for you{relaxed ? ' (closest matches)' : ''}:
                    </AssistantBubble>
                    </div>
                    <button
                      onClick={startOver}
                      className="mt-1 inline-flex shrink-0 items-center gap-1.5 text-detail font-medium text-muted transition-colors hover:text-ink"
                    >
                      <Icon name="sort" size={13} /> Restart
                    </button>
                  </div>

                  <div className="sm:pl-[42px]">
                    <TopMatch scored={top} prefs={prefs} onRent={rentNow} onClose={onClose} favToggle={toggleFavorite} isFav={isFavorite} onCompare={toggleCompare} />
                  </div>

                  {alternates.length > 0 && (
                    <div className="mt-8">
                      <AssistantBubble delay={80}>Other options worth considering:</AssistantBubble>
                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:pl-[42px]">
                        {alternates.map((s) => (
                          <AltCard key={s.car.id} scored={s} onRent={rentNow} onClose={onClose} onCompare={toggleCompare} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* No match */
                <div className="flex flex-col gap-4">
                  <AssistantBubble>
                    I couldn&apos;t find an exact match for those preferences. I can widen the search by relaxing the budget and location
                    to show the closest cars in the fleet.
                  </AssistantBubble>
                  <div className="sm:pl-[42px]">
                    <button onClick={() => setRelaxed(true)} className="btn btn-accent-bright btn-lg">
                      Widen the search <Icon name="arrowRight" size={17} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>,
    document.body,
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
    <div className="mt-3 overflow-hidden rounded-3xl border border-line bg-white shadow-soft animate-scale-in">
      <div className="relative aspect-[16/10] w-full overflow-hidden sm:aspect-[21/9]">
        <Img
          src={unsplash(car.images[0], 1400)}
          srcSet={unsplashSrcSet(car.images[0], [800, 1200, 1600])}
          sizes="(min-width: 768px) 720px, 100vw"
          alt={`${car.make} ${car.model}`}
          className="h-full w-full object-cover"
          fallback={<span className="grid h-full w-full place-items-center bg-panel text-muted"><Icon name="car" size={32} /></span>}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/20" />
        <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-caption font-semibold text-ink shadow-hair backdrop-blur">
          <Icon name="checkCircle" size={14} className="text-accent" /> Recommended for you
        </span>
        <span className="absolute right-4 top-4">
          <MatchBadge value={match} />
        </span>
        <div className="absolute bottom-4 left-5 right-5">
          <h3 className="font-display text-2xl font-semibold text-white sm:text-3xl">
            {car.make} {car.model}
          </h3>
          <p className="text-body text-white/80">
            {car.trim ? `${car.trim} · ` : ''}
            {car.year} · {car.category}
          </p>
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <p className="text-body leading-relaxed text-ink-soft">{summary(car, prefs)}</p>

        {scored.reasons.length > 0 && (
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {scored.reasons.map((r) => (
              <li key={r} className="flex items-center gap-2 text-detail text-ink-soft">
                <Icon name="checkCircle" size={16} className="shrink-0 text-accent" /> {r}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex items-end justify-between">
          <p className="text-ink">
            <span className="font-display text-2xl font-semibold">{eur(car.pricePerDay)}</span>
            <span className="text-detail text-muted"> / day</span>
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button onClick={() => onRent(car.slug)} className="btn btn-primary btn-lg flex-1">
            Rent This Car <Icon name="arrowRight" size={17} />
          </button>
          <Link
            to={`/cars/${car.slug}`}
            onClick={onClose}
            className="btn btn-lg flex-1 border border-line bg-white text-ink hover:border-line-strong hover:bg-panel"
          >
            View Details
          </Link>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => favToggle(car.id)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-detail font-medium text-ink-soft hover:border-line-strong hover:bg-panel"
          >
            <Icon name="heart" size={15} fill={fav} className={fav ? 'text-[#e2384d]' : ''} /> {fav ? 'Saved' : 'Save to Garage'}
          </button>
          <button
            onClick={() => onCompare(car.id)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-detail font-medium text-ink-soft hover:border-line-strong hover:bg-panel"
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
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-hair">
      <div className="relative aspect-[16/10] overflow-hidden">
        <Img
          src={unsplash(car.images[0], 700)}
          alt={`${car.make} ${car.model}`}
          className="h-full w-full object-cover"
          fallback={<span className="grid h-full w-full place-items-center bg-panel text-muted"><Icon name="car" size={26} /></span>}
        />
        <span className="absolute right-3 top-3">
          <MatchBadge value={match} />
        </span>
      </div>
      <div className="p-4">
        <p className="font-medium text-ink">
          {car.make} {car.model}
        </p>
        <p className="mt-0.5 text-caption text-muted">
          {car.seats} seats · {car.transmission} · {car.fuel}
        </p>
        <p className="mt-2 text-ink">
          <span className="text-lead font-semibold">{eur(car.pricePerDay)}</span>
          <span className="text-caption text-muted"> / day</span>
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => onRent(car.slug)} className="btn btn-accent-bright btn-sm flex-1">
            Rent
          </button>
          <Link
            to={`/cars/${car.slug}`}
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-ink-soft hover:border-line-strong hover:bg-panel"
            aria-label="View details"
          >
            <Icon name="arrowUpRight" size={16} />
          </Link>
          <button
            onClick={() => onCompare(car.id)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-ink-soft hover:border-line-strong hover:bg-panel"
            aria-label="Compare"
          >
            <Icon name="compare" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
