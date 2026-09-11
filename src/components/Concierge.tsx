import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { PremiumPageLoader } from './PremiumLoader';
import { useAuth } from '../lib/auth';
import { useApp } from '../lib/store';
import { useCompare } from '../lib/compareStore';
import { useCars } from '../lib/data/cars';
import { useMyBookings } from '../lib/data/bookings';
import { fetchSupportAccountId, findOrCreateConversation } from '../lib/data/messages';
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

function ConciergeAvatar({ size = 30 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-accent-050 ring-1 ring-accent-100"
      style={{ width: size, height: size }}
    >
      <img src="/cx-logo-symbol.png" alt="" className="h-[58%] w-[58%] object-contain" />
    </span>
  );
}

/** Left-aligned "assistant is speaking" message — the CX mark plus a
 *  soft panel bubble, reused for every question, lead-in and empty state
 *  so the whole flow reads as one conversation rather than a form. */
function AssistantBubble({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <div className="flex items-start gap-3 animate-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <ConciergeAvatar />
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-line bg-panel px-4 py-3 text-copy leading-relaxed text-ink-soft sm:max-w-[75%]">
        {children}
      </div>
    </div>
  );
}

/** Right-aligned recap of the user's own answer — accent-tinted so the
 *  transcript reads as a real back-and-forth, not just a log. */
function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end animate-fade-up">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm border border-accent-100 bg-accent-050 px-4 py-2.5 text-body font-medium text-ink sm:max-w-[70%]">
        {children}
      </div>
    </div>
  );
}

/** The "concierge is thinking" beat before results land — three dots
 *  instead of a bare spinner, so the pause itself feels like part of the
 *  conversation rather than a loading screen. */
function TypingBubble() {
  return (
    <div className="flex items-center gap-3 animate-fade-up">
      <ConciergeAvatar />
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-line bg-panel px-4 py-3.5">
        {[0, 150, 300].map((d) => (
          <span key={d} className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-faint" style={{ animationDelay: `${d}ms` }} />
        ))}
      </div>
    </div>
  );
}

/** A quick-reply chip — the chat-native replacement for the old option
 *  cards. Compact, wraps naturally on mobile, and still carries the
 *  icon + optional blurb that made each choice legible. */
function QuickReply({
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
      className={`group inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-body font-medium transition-all duration-200 ${
        active
          ? 'border-accent bg-accent text-white shadow-[0_8px_20px_rgba(0,133,54,0.22)]'
          : 'border-line bg-white text-ink-soft hover:-translate-y-0.5 hover:border-accent/40 hover:bg-accent-050/50'
      }`}
    >
      <span className={active ? 'text-white' : 'text-muted group-hover:text-accent-600'}>{icon}</span>
      <span>{label}</span>
      {sub && <span className={`hidden text-caption sm:inline ${active ? 'text-white/75' : 'text-faint'}`}>· {sub}</span>}
    </button>
  );
}

/** A quiet text-link action alongside the chips — "Continue", "Skip",
 *  "Any location" — distinct from a quick-reply because it doesn't
 *  represent a choice, it moves the conversation forward. */
function ActionLink({ children, onClick, icon }: { children: ReactNode; onClick: () => void; icon?: IconName }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 text-body font-medium text-muted transition-colors hover:text-ink">
      {children} {icon && <Icon name={icon} size={15} />}
    </button>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mb-2.5 inline-flex items-center gap-1 text-detail font-medium text-faint transition-colors hover:text-muted">
      <Icon name="chevronLeft" size={14} /> Back
    </button>
  );
}

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="relative flex shrink-0 items-center justify-center gap-1.5 pb-3.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i < current ? 'w-1.5 bg-accent/45' : i === current ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong'
          }`}
        />
      ))}
    </div>
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

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden overscroll-none bg-white">
      {/* Ambient CX wash — a whisper of the brand green, not a glow;
          "premium" here means restraint, not atmosphere. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{ background: 'radial-gradient(60% 45% at 15% 0%, rgba(0,133,54,0.06), transparent 62%)' }}
      />

      {/* Chrome */}
      <div className="relative flex h-16 shrink-0 items-center justify-between border-b border-line bg-white/90 px-4 backdrop-blur-xl sm:px-6" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-2.5">
          <ConciergeAvatar size={34} />
          <div>
            <p className="text-detail font-semibold uppercase tracking-[0.14em] leading-none text-ink">CX Concierge</p>
            <p className="mt-1 text-micro uppercase leading-none tracking-[0.18em] text-faint">
              {step === 'results' ? 'Your match is ready' : 'Guided car match'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {session && (
            <button
              onClick={talkToHuman}
              disabled={escalating}
              className="hidden items-center gap-1.5 rounded-full border border-line px-3 py-2 text-detail font-medium text-ink-soft transition-colors hover:border-accent/40 hover:bg-accent-050/50 disabled:opacity-50 sm:inline-flex"
            >
              <Icon name="headset" size={15} className="text-accent-600" />
              {escalating ? 'Connecting…' : 'Talk to a real person'}
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-10 w-10 place-items-center rounded-xl text-muted transition-colors hover:bg-panel hover:text-ink"
          >
            <Icon name="x" size={20} />
          </button>
        </div>
      </div>

      {step !== 'results' && <StepDots current={answeredCount} total={QUIZ_STEPS.length} />}

      <div className="relative flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-2 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          {/* Welcome — always the first message, even once questions are
              answered, so the transcript reads like a real conversation
              from the top rather than resetting per step. */}
          <AssistantBubble>
            Hi, I&apos;m your CX Concierge. Answer a few quick questions and I&apos;ll match you with the right car from the fleet.
            {hasPersonalData && (
              <span className="mt-1.5 block text-muted">I&apos;ll also factor in your saved cars and rental history.</span>
            )}
          </AssistantBubble>

          {/* Mobile-only escalation link — the header button above is
              hidden below sm:, this is its equivalent, kept out of the
              way of the quiz itself. */}
          {session && (
            <button
              onClick={talkToHuman}
              disabled={escalating}
              className="inline-flex items-center gap-1.5 self-start pl-[42px] text-detail font-medium text-muted transition-colors hover:text-accent-600 disabled:opacity-50 sm:hidden"
            >
              <Icon name="headset" size={14} />
              {escalating ? 'Connecting…' : 'Prefer a real person? Message our team'}
            </button>
          )}

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

              <div className="pl-[42px]">
                {quizIndex > 0 && <BackLink onClick={back} />}

                {step === 'drive' && (
                  <div className="flex flex-wrap gap-2">
                    {DRIVE_TYPES.map((d) => (
                      <QuickReply
                        key={d.id}
                        active={prefs.driveType === d.id}
                        icon={<Icon name={d.icon} size={17} />}
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
                    <div className="flex flex-wrap gap-2">
                      {BUDGET_BANDS.map((b) => (
                        <QuickReply
                          key={b.id}
                          active={prefs.budget === b.id}
                          icon={<Icon name="wallet" size={17} />}
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
                    <div className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-white py-1.5 pl-4 pr-1.5 transition-colors focus-within:border-accent/50">
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

                  <div className="pl-[42px]">
                    <TopMatch scored={top} prefs={prefs} onRent={rentNow} onClose={onClose} favToggle={toggleFavorite} isFav={isFavorite} onCompare={toggleCompare} />
                  </div>

                  {alternates.length > 0 && (
                    <div className="mt-8 pl-[42px]">
                      <AssistantBubble delay={80}>A few more options you might like:</AssistantBubble>
                      <div className="mt-4 grid grid-cols-1 gap-4 pl-[42px] sm:grid-cols-2">
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
                  <div className="pl-[42px]">
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
    <div className="mt-3 overflow-hidden rounded-[1.75rem] border border-line bg-white shadow-[0_10px_36px_-12px_rgba(22,22,26,0.14)]">
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
        <img src={unsplash(car.images[0], 700)} alt={`${car.make} ${car.model}`} className="h-full w-full object-cover" />
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
