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
 * CX Concierge — a white, premium identity. Every color below reuses the
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
      return "What's the drive?";
    case 'priority':
      return 'What matters most to you?';
    case 'passengers':
      return 'How many people are riding?';
    case 'budget':
      return "What's your daily budget?";
    case 'location':
      return 'Where are you driving?';
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

const CONCIERGE_MARK_VIEWBOX = '0 0 18.355 18.406';
const CONCIERGE_MARK_PATHS = [
  'M2.235,2.695c1.863-1.631,4.293-2.622,6.772-2.69c1.828-0.061,3.673,0.373,5.278,1.254c1.6,0.866,2.943,2.17,3.92,3.7 c0.063,0.121,0.193,0.249,0.136,0.395c-0.106,0.225-0.26,0.422-0.398,0.627c-1.293,1.888-3.201,3.356-5.38,4.068 c0.001,0.943,0,1.886,0,2.829c0.033,1.829,0.006,3.66,0.018,5.489c-0.069,0.029-0.142,0.042-0.216,0.037 c-0.866-0.012-1.733,0.01-2.599-0.01l-0.031-0.035c-0.007-1.347-0.009-2.695-0.01-4.042c-0.002-0.168,0.013-0.337-0.014-0.504 c-0.345,0.009-0.692,0.006-1.037,0.001c-0.024,0.754-0.003,1.509-0.01,2.263c0.004,0.766-0.01,1.534,0.002,2.3 c-0.08,0.02-0.161,0.028-0.244,0.026C7.646,18.4,6.869,18.403,6.092,18.4c-0.01-2.213,0.016-4.428-0.017-6.64 c-0.003-0.566,0.006-1.131-0.004-1.696c-0.017-0.013-0.05-0.037-0.067-0.05C3.531,9.196,1.382,7.469,0,5.267 C0.628,4.318,1.368,3.435,2.235,2.695z M3.786,5.267c1.001,1.28,2.511,2.142,4.109,2.406C7.803,7.595,7.698,7.535,7.597,7.469 C7.074,7.1,6.687,6.542,6.533,5.919c-0.178-0.67-0.055-1.401,0.292-1.997c0.262-0.45,0.665-0.803,1.115-1.058 C6.331,3.151,4.822,3.998,3.786,5.267z M10.453,2.857c0.069,0.054,0.143,0.103,0.22,0.149c0.62,0.371,1.055,1.021,1.207,1.723 c0.148,0.634,0.023,1.316-0.297,1.878c-0.262,0.481-0.691,0.844-1.168,1.101c0.197,0.016,0.384-0.059,0.575-0.097 c1.422-0.336,2.768-1.14,3.615-2.345c-0.315-0.395-0.65-0.782-1.053-1.091c-0.799-0.647-1.766-1.07-2.769-1.279 C10.675,2.868,10.565,2.853,10.453,2.857z',
];

/** The Concierge's face — the CX key on a plain noir disc with a single
 *  thin ring. Kept deliberately simple: this mark shows up small all over
 *  the product (Browse's banner, the homepage card, the dashboards) as the
 *  one consistent brand badge, so it stays a clean, instantly-legible
 *  signature rather than a miniature hero graphic. `live` adds the
 *  "online" dot used in the header — the Concierge is always instantly
 *  available, which is genuinely true of a guided matcher. Exported so
 *  every entry point wears the exact same mark. */
export function ConciergeMark({ size = 30, live = false, className = '' }: { size?: number; live?: boolean; className?: string }) {
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center ${className}`}
      style={{ width: size, height: size }}
    >
      <span className="relative h-[62%] w-[62%]">
        <svg viewBox={CONCIERGE_MARK_VIEWBOX} className="h-full w-full text-accent-bright" fill="currentColor" aria-hidden="true">
          {CONCIERGE_MARK_PATHS.map((d) => (
            <path key={d.slice(0, 24)} d={d} />
          ))}
        </svg>
        {live && (
          <span className="absolute -bottom-px -right-px flex h-[26%] min-h-2 w-[26%] min-w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-accent/55" />
            <span className="relative h-full w-full rounded-full border-2 border-white bg-accent" />
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
      <ConciergeMark />
      <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-line bg-white px-4 py-3 text-copy leading-relaxed text-ink-soft shadow-[0_1px_2px_rgba(22,22,26,0.04),0_6px_16px_-12px_rgba(22,22,26,0.18)] sm:max-w-[75%]">
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
      <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-ink px-4 py-2.5 text-body font-medium text-white shadow-[0_6px_16px_-10px_rgba(22,22,26,0.45)] sm:max-w-[70%]">
        {children}
      </div>
    </div>
  );
}

/** The "concierge is thinking" beat before results land — a tiny
 *  equalizer plus a terminal-style "scanning…" readout instead of a bare
 *  spinner, so the pause reads as the engine actively working the fleet
 *  data rather than a generic loading screen. */
function TypingBubble() {
  return (
    <div className="flex items-center gap-3 animate-fade-up">
      <ConciergeMark />
      <div className="flex items-center gap-3 rounded-2xl rounded-tl-md border border-line bg-white px-4 py-3.5 shadow-hair">
        <div className="flex h-3.5 items-end gap-[3px]" aria-hidden="true">
          {[0, 110, 220, 330, 440].map((d) => (
            <span
              key={d}
              className="h-full w-[3px] animate-concierge-eq rounded-full bg-accent"
              style={{ animationDelay: `${d}ms` }}
            />
          ))}
        </div>
        <span className="font-mono text-[0.68rem] uppercase tracking-[0.1em] text-muted">
          Scanning fleet<span className="animate-concierge-cursor">_</span>
        </span>
      </div>
    </div>
  );
}

/** A quick-reply chip — for the short answers (priorities, passengers,
 *  city). Selected turns ink with a bright-green icon; `multi` choices
 *  also swap their icon for a check, so a multi-select reads as "these
 *  are ticked", not "this one was the answer". */
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
      className={`group inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2.5 text-body font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-200 active:scale-95 ${
        active
          ? 'border-ink bg-ink text-white shadow-[0_8px_20px_-8px_rgba(22,22,26,0.5)]'
          : 'border-line bg-white text-ink-soft shadow-hair hover:-translate-y-0.5 hover:border-accent/40 hover:text-ink'
      }`}
    >
      <span className={`transition-colors ${active ? 'text-accent-bright' : 'text-muted group-hover:text-accent-600'}`}>
        {multi && active ? <Icon name="check" size={17} strokeWidth={2.6} /> : icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

/** A richer answer card — for the questions whose options carry a blurb
 *  (the kind of drive, the budget bands). The blurb is half the decision
 *  ("Road Trip — long-haul comfort"), and the old chip hid it entirely
 *  below `sm:`, so on a phone you picked from labels alone. Two-up grid,
 *  a ~68px target each, icon in its own tile, a monospace index tag
 *  reading it as a panel in a selectable array rather than a plain list. */
function OptionCard({
  index,
  active,
  icon,
  label,
  sub,
  onClick,
}: {
  index: number;
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
      className={`group relative flex min-h-[4.25rem] items-center gap-3 rounded-2xl border p-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-200 active:scale-[0.97] ${
        active
          ? 'border-accent-bright/60 bg-ink text-white shadow-[0_12px_28px_-12px_rgba(22,22,26,0.55),0_0_0_1px_rgba(0,212,71,0.3)]'
          : 'border-line bg-white text-ink shadow-hair hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-soft'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute right-2.5 top-2 font-mono text-[0.6rem] tracking-wide transition-colors ${
          active ? 'text-accent-bright/80' : 'text-faint/70'
        }`}
      >
        {String(index).padStart(2, '0')}
      </span>
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors ${
          active ? 'bg-accent-bright text-noir' : 'bg-accent-050 text-accent-700 group-hover:bg-accent-100'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-body font-semibold leading-tight">{label}</span>
        {sub && <span className={`mt-0.5 block text-caption leading-snug ${active ? 'text-white/65' : 'text-muted'}`}>{sub}</span>}
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
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-1 text-body font-semibold text-accent-700 transition-colors hover:text-accent"
    >
      {children} {icon && <Icon name={icon} size={15} />}
    </button>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mb-2.5 inline-flex min-h-8 items-center gap-1 text-detail font-medium text-faint transition-colors hover:text-muted">
      <Icon name="chevronLeft" size={14} /> Back
    </button>
  );
}

/** Match score as a HUD gauge rather than a bare "92% MATCH" label — tick
 *  marks around the rim plus a monospace arc-fill readout, so it reads as
 *  an instrument reading the engine took, not a decorative badge. */
function MatchRing({ value, size = 56 }: { value: number; size?: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, value));
  const ticks = Array.from({ length: 24 });
  return (
    <span className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden="true">
        {ticks.map((_, i) => (
          <line
            key={i}
            x1="20"
            y1="2"
            x2="20"
            y2="3.6"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.6"
            transform={`rotate(${(i / ticks.length) * 360} 20 20)`}
          />
        ))}
        <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2.5" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke="var(--color-accent-bright)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
          style={{ filter: 'drop-shadow(0 0 4px rgba(0,212,71,0.6))' }}
        />
      </svg>
      <span className="relative text-center leading-none">
        <span className="block font-mono text-[0.9rem] font-bold tabular-nums text-white">{clamped}</span>
        <span className="mt-0.5 block text-[0.45rem] font-semibold uppercase tracking-[0.16em] text-white/55">match</span>
      </span>
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

  // Header progress: which of the 5 gauge segments are filled, lit, or
  // still dark — a HUD readout rather than a smooth continuous bar.
  const progress = step === 'results' ? 100 : Math.round((answeredCount / QUIZ_STEPS.length) * 100);
  const pad = (n: number) => String(n).padStart(2, '0');
  const bracketLabel =
    step === 'results' ? '[OK]' : thinking ? '[••]' : `[${pad(Math.min(answeredCount + 1, QUIZ_STEPS.length))}/${pad(QUIZ_STEPS.length)}]`;
  const stepLabel =
    step === 'results'
      ? 'Match complete'
      : thinking
        ? 'Matching you with the fleet…'
        : `Step ${Math.min(answeredCount + 1, QUIZ_STEPS.length)} of ${QUIZ_STEPS.length}`;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden overscroll-none bg-[#f6f7f3] animate-fade-in">
      {/* Ambient CX light — a quiet green bloom high on the chat ground,
          the same brand light the header's gauge carries. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(55% 38% at 12% 6%, rgba(0,212,71,0.09), transparent 64%), radial-gradient(45% 30% at 100% 100%, rgba(0,133,54,0.05), transparent 70%)' }}
      />

      {/* Chrome — a plain white bar, same as every other header in the
          product, so the Concierge opens like it belongs to CX rather than
          announcing itself with a dark panel. A thin scanline still loops
          the header strip only — a constant, quiet "the system is live"
          signal that never reaches into the chat body the user is actually
          reading. */}
      <div className="relative shrink-0 overflow-hidden border-b border-line bg-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px animate-concierge-scan bg-gradient-to-r from-transparent via-accent/70 to-transparent"
        />
        <div className="relative flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <ConciergeMark size={38} live />
            <div>
              <p className="font-display text-[1.0625rem] font-semibold leading-none tracking-tight text-ink">CX Concierge</p>
              <p className="mt-1.5 flex items-center gap-1.5 text-caption leading-none text-muted" aria-live="polite">
                <span className="font-mono text-[0.6rem] tracking-wide text-accent-700">{bracketLabel}</span>
                {stepLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {session && (
              <button
                onClick={talkToHuman}
                disabled={escalating}
                className="hidden items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-2 text-detail font-medium text-ink-soft transition-colors hover:border-accent/40 hover:bg-panel disabled:opacity-50 sm:inline-flex"
              >
                <Icon name="headset" size={15} className="text-accent" />
                {escalating ? 'Connecting…' : 'Talk to a real person'}
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
        {/* Progress gauge — 5 discrete segments instead of one smooth bar,
            each lighting up as its question is answered. bg-line (#e8e7e1)
            reads as invisible at hairline weight on a white header, so the
            track needs real contrast of its own, and a lit segment needs a
            glow to actually read as "lit" rather than just a color swap. */}
        <div
          className="relative flex h-[5px] gap-[4px] px-4 pb-2.5 sm:px-6"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-label="Concierge progress"
        >
          {QUIZ_STEPS.map((s, i) => {
            const filled = step === 'results' || i < answeredCount;
            return (
              <span
                key={s}
                className={`h-full flex-1 rounded-full transition-all duration-500 ${filled ? 'bg-accent-bright shadow-[0_0_6px_rgba(0,212,71,0.55)]' : 'bg-line-strong'}`}
              />
            );
          })}
        </div>
      </div>

      <div className="concierge-grid relative flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-2 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          {/* Welcome — always at the top, even once questions are
              answered, so the transcript reads like a real conversation
              from the start rather than resetting per step. */}
          <div className="flex flex-col items-center px-2 pb-1 pt-7 text-center animate-fade-up">
            <ConciergeMark size={68} />
            <p className="mt-3 inline-flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-accent-700">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-accent-bright/60" />
                <span className="relative h-full w-full rounded-full bg-accent-bright" />
              </span>
              Engine online
            </p>
            <h2 className="mt-2 font-display text-[1.75rem] font-semibold leading-tight tracking-tight text-ink text-balance sm:text-3xl">
              Let&apos;s find your CX.
            </h2>
            <p className="mt-2 max-w-sm text-body leading-relaxed text-muted text-pretty">
              Five quick questions, then I&apos;ll match you with the right car from the fleet.
              {hasPersonalData && ' I’ll factor in your saved cars and past trips too.'}
            </p>
            {/* Mobile-only escalation — the header button is hidden below sm:. */}
            {session && (
              <button
                onClick={talkToHuman}
                disabled={escalating}
                className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-white px-3.5 text-detail font-medium text-ink-soft shadow-hair transition-colors hover:text-accent-600 disabled:opacity-50 sm:hidden"
              >
                <Icon name="headset" size={14} className="text-accent" />
                {escalating ? 'Connecting…' : 'Prefer a real person?'}
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
              <p className="ml-[42px] mt-2 text-detail text-faint">Matching you with the CX fleet…</p>
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
                    {DRIVE_TYPES.map((d, i) => (
                      <OptionCard
                        key={d.id}
                        index={i + 1}
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
                      {BUDGET_BANDS.map((b, i) => (
                        <OptionCard
                          key={b.id}
                          index={i + 1}
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
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-white transition-transform hover:scale-105"
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
                    <AssistantBubble>
                      Here&apos;s my top pick for you{relaxed ? ', with the search widened to find the closest match' : ''}:
                    </AssistantBubble>
                    <button
                      onClick={startOver}
                      className="mt-1 inline-flex shrink-0 items-center gap-1.5 text-detail font-medium text-muted transition-colors hover:text-ink"
                    >
                      <Icon name="sort" size={13} /> Start over
                    </button>
                  </div>

                  <div className="sm:pl-[42px]">
                    <TopMatch scored={top} prefs={prefs} onRent={rentNow} onClose={onClose} favToggle={toggleFavorite} isFav={isFavorite} onCompare={toggleCompare} />
                  </div>

                  {alternates.length > 0 && (
                    <div className="mt-8">
                      <AssistantBubble delay={80}>A few more options you might like:</AssistantBubble>
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
                    I couldn&apos;t find a perfect match with those preferences. Want me to widen the search? I&apos;ll relax the budget and
                    location to show the closest cars in the fleet.
                  </AssistantBubble>
                  <div className="sm:pl-[42px]">
                    <button onClick={() => setRelaxed(true)} className="btn btn-accent-bright btn-lg">
                      Expand My Options <Icon name="arrowRight" size={17} />
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
    <div className="mt-3 overflow-hidden rounded-[1.75rem] border border-line bg-white shadow-[0_18px_44px_-18px_rgba(22,22,26,0.28)] animate-scale-in">
      <div className="relative aspect-[16/10] w-full overflow-hidden sm:aspect-[21/9]">
        <Img
          src={unsplash(car.images[0], 1400)}
          srcSet={unsplashSrcSet(car.images[0], [800, 1200, 1600])}
          sizes="(min-width: 768px) 720px, 100vw"
          alt={`${car.make} ${car.model}`}
          className="h-full w-full object-cover"
          fallback={<span className="grid h-full w-full place-items-center bg-panel text-muted"><Icon name="car" size={32} /></span>}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/25" />
        {/* The Concierge's own pick, signed with its mark — distinct from
            a generic "Top rated" badge any listing could carry. */}
        <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-accent-bright/25 bg-black/45 py-1 pl-1 pr-3 font-mono text-[0.65rem] font-bold uppercase tracking-[0.14em] text-accent-bright backdrop-blur-md">
          <ConciergeMark size={22} /> [ CX Pick ]
        </span>
        <span className="absolute right-3 top-3 rounded-2xl border border-accent-bright/20 bg-black/45 p-1 backdrop-blur-md">
          <MatchRing value={match} />
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
          <button onClick={() => onRent(car.slug)} className="btn btn-accent-bright btn-lg flex-1">
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
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_6px_20px_-10px_rgba(22,22,26,0.12)]">
      <div className="relative aspect-[16/10] overflow-hidden">
        <Img
          src={unsplash(car.images[0], 700)}
          alt={`${car.make} ${car.model}`}
          className="h-full w-full object-cover"
          fallback={<span className="grid h-full w-full place-items-center bg-panel text-muted"><Icon name="car" size={26} /></span>}
        />
        <span className="absolute right-3 top-3 rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-label font-bold text-accent-bright backdrop-blur-md">
          {match}%
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
