import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { Img } from './motion';
import { useAuth } from '../lib/auth';
import { useCars } from '../lib/data/cars';
import { findOrCreateCxConversation, sendMessage, useConversation } from '../lib/data/messages';
import { supabase } from '../lib/supabase';
import { localReply, type LocalReply } from '../lib/assistantLocal';
import { apiUrl } from '../lib/api';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import { useLocale } from '../lib/i18n';
import { XCar } from './XCar';

// The glow around the composer (21st "border beam") is fetched only when the chat opens.
const BorderBeam = lazy(() => import('border-beam').then((m) => ({ default: m.BorderBeam })));
import type { Car } from '../data/types';

/**
 * X — the CX assistant. A plain chat: you write what you need (a car for a trip, a problem with a
 * booking, how verification works) and X answers, showing real cars when it recommends some. It can
 * hand you to a person from the team: the conversation moves to a real CX chat *in the same panel*, with
 * what you said to X already in it, and the team's replies appear right there.
 *
 * The answers come from /api/notify-message (type "assistant"): only the FAQ and the published cars are
 * ever shown to the model — never private bookings, messages or documents.
 */
export const ASSISTANT_NAME = 'X';
// X is free: answers are computed in the browser. The AI service only runs when this exact switch is set
// at build time. (It used to be VITE_ASSISTANT_AI; that old name is deliberately ignored now, so a leftover
// value in the hosting settings can no longer turn on a paid service by accident.)
const AI_ENABLED = import.meta.env.VITE_KAI_USE_AI === '1';

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant' | 'note';
  text: string;
  cars?: string[];
  offerHuman?: boolean;
  /** What X did to get there (the "think" trail) and how long it took. */
  steps?: string[];
  seconds?: number;
}

/** The trail shown for a local answer. Every line is something X really did or found for this question. */
function thoughtSteps(
  r: LocalReply,
  cars: Car[],
  t: (s: string, v?: Record<string, string | number>) => string,
): string[] {
  const tr = r.trace;
  const clip = (x: string, n = 46) => (x.length > n ? `${x.slice(0, n - 1).trimEnd()}…` : x);
  if (!tr || tr.kind === 'greeting') return [t('Reading your message…'), t('Saying hello')];
  if (tr.kind === 'person') return [t('Reading your message…'), t('Preparing the hand-over to the team')];
  if (tr.kind === 'faq') {
    return [
      t('Reading your question…'),
      t('Searching {n} help topics…', { n: tr.faqTopics ?? 0 }),
      t('Closest topic: {topic}', { topic: clip(t(tr.topic ?? '')) }),
      t('Answer ready'),
    ];
  }
  if (tr.kind === 'unknown') {
    return [
      t('Reading your question…'),
      t('Searching {n} help topics…', { n: tr.faqTopics ?? 0 }),
      t('No close answer found'),
      t('Offering a person from the team'),
    ];
  }
  const styles: Record<string, string> = {
    weekend: 'Weekend', luxury: 'Luxury', performance: 'Performance', business: 'Business',
    'road-trip': 'Road trip', city: 'City', occasion: 'Special occasion',
  };
  const steps = [
    t('Reading your request…'),
    t('Comparing {n} cars in {c} cities…', { n: tr.carsConsidered ?? 0, c: tr.citiesConsidered ?? 0 }),
  ];
  const wants: string[] = [];
  if (tr.city) wants.push(t('City: {city}', { city: tr.city }));
  if (tr.maxPrice) wants.push(t('Budget: up to {price}/day', { price: eur(tr.maxPrice) }));
  if (tr.people) wants.push(t('For {n} people', { n: tr.people }));
  if (tr.driveType) wants.push(t('Trip style: {style}', { style: t(styles[tr.driveType] ?? tr.driveType) }));
  if (wants.length === 0) steps.push(t('No filters given — ranking by overall fit'));
  else steps.push(...wants.slice(0, 2));
  steps.push(tr.budgetRelaxed ? t('Nothing fits that budget — widening the search') : t('{n} matches found', { n: tr.matches ?? r.cars?.length ?? 0 }));
  const best = r.cars?.[0] ? cars.find((c) => c.slug === r.cars?.[0]) : null;
  if (best) steps.push(t('Best match: {car} · {price}/day', { car: `${best.make} ${best.model}`, price: eur(best.pricePerDay) }));
  return steps;
}

/** The steps on a vertical rail, a tick sitting on the line for each finished one (the 21st thinking-prompt look). */
function ThoughtTrail({ steps, activeIndex = null }: { steps: string[]; activeIndex?: number | null }) {
  return (
    <ol className="relative ml-[7px] border-l border-line pl-5">
      {steps.map((step, i) => (
        <li
          key={step}
          className="kai-step-in relative flex min-h-9 items-center gap-3 py-2 text-xs leading-5"
          style={{ animationDelay: `${i * 45}ms` }}
        >
          <span className="absolute -left-[26px] flex size-[11px] items-center justify-center rounded-full bg-bg ring-4 ring-bg">
            {i === activeIndex ? (
              <span className="size-1.5 animate-pulse rounded-full bg-accent-700" aria-label="In progress" />
            ) : (
              <Icon name="check" size={12} className="text-ink" />
            )}
          </span>
          <span className={i === activeIndex ? 'text-ink' : 'text-muted'}>{step}</span>
        </li>
      ))}
    </ol>
  );
}

let nextId = 0;
const newId = () => `m${++nextId}`;

/** The assistant's face — X's mascot: a little CX sports car with eyes in the windscreen and the X on its bonnet. */
export function ConciergeMark({ size = 30, live = false, active = false, className = '' }: { size?: number; live?: boolean; active?: boolean; className?: string }) {
  return <XCar size={size} live={live} active={active} className={className} />;
}

/** The trigger button — pass whatever styling the placement wants via `className`. */
export function ConciergeLauncher({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children' | 'onClick'>) {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <button
        onClick={(e) => {
          // The chat opens out of the button you pressed (keyboard presses: from its centre).
          const r = e.currentTarget.getBoundingClientRect();
          const fromPointer = e.clientX !== 0 || e.clientY !== 0;
          setOrigin({ x: fromPointer ? e.clientX : r.left + r.width / 2, y: fromPointer ? e.clientY : r.top + r.height / 2 });
          setOpen(true);
        }}
        className={className}
        {...rest}
      >
        {children}
      </button>
      {open && <AssistantChat origin={origin} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Keeps the chat glued to the part of the screen you can actually see. On iPhone, Safari pans the page and
 * shrinks the visual viewport while the keyboard comes up; the panel is therefore moved/resized straight
 * from each visualViewport event (written to the element, no re-render, no transition, no delay), so it
 * never lags behind the pan and never flashes. `kb` is true while the keyboard covers the bottom.
 */
function useVisibleBox(ref: RefObject<HTMLDivElement | null>) {
  const [info, setInfo] = useState({ kb: false, height: typeof window !== 'undefined' ? window.innerHeight : 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    const v = window.visualViewport;
    if (!el) return;
    const place = () => {
      const full = window.innerHeight;
      const h = Math.round(v?.height ?? full);
      const top = Math.max(0, Math.round(v?.offsetTop ?? 0));
      el.style.top = `${top}px`;
      el.style.height = `${h}px`;
      const kb = full - h > 120;
      setInfo((cur) => (cur.kb === kb && Math.abs(cur.height - h) < 3 ? cur : { kb, height: h }));
    };
    place();
    v?.addEventListener('resize', place);
    v?.addEventListener('scroll', place);
    window.addEventListener('orientationchange', place);
    const prev = document.body.style.overflow;
    const prevOb = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    return () => {
      v?.removeEventListener('resize', place);
      v?.removeEventListener('scroll', place);
      window.removeEventListener('orientationchange', place);
      document.body.style.overflow = prev;
      document.documentElement.style.overscrollBehavior = prevOb;
    };
  }, [ref]);
  return info;
}

function AssistantChat({ onClose, origin }: { onClose: () => void; origin: { x: number; y: number } | null }) {
  const { t } = useLocale();
  const { session } = useAuth();
  const userId = session?.user.id;
  const { cars } = useCars();
  const boxRef = useRef<HTMLDivElement>(null);
  const box = useVisibleBox(boxRef);
  const [closing, setClosing] = useState(false);
  // Once the opening circle has finished its clip is dropped (so it can never cut the screen when Safari's
  // toolbar changes the viewport), and the page behind is hidden so nothing of it can show through.
  const [revealed, setRevealed] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const id = window.setTimeout(() => setRevealed(true), 900);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    if (!revealed || closing) return;
    const root = document.getElementById('root');
    if (!root) return;
    const prev = root.style.visibility;
    root.style.visibility = 'hidden';
    return () => {
      root.style.visibility = prev;
    };
  }, [revealed, closing]);
  /** Closes with a soft exit (the panel eases down and fades) instead of vanishing. */
  const requestClose = useCallback(() => {
    if (closing) return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { onClose(); return; }
    setClosing(true);
    window.setTimeout(onClose, 240);
  }, [closing, onClose]);
  const [msgs, setMsgs] = useState<ChatMsg[]>(() => [
    {
      id: newId(),
      role: 'assistant',
      text: t("Hi, I'm {name}. I can help you find the right car, or sort out a problem. What do you need?", { name: ASSISTANT_NAME }),
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [handing, setHanding] = useState(false);
  const [think, setThink] = useState(true);
  const [pending, setPending] = useState<{ steps: string[]; shown: number; seconds: number; live?: boolean } | null>(null);
  const [streaming, setStreaming] = useState<{ id: string; shown: number } | null>(null);
  const [openThoughts, setOpenThoughts] = useState<Set<string>>(() => new Set());
  const runRef = useRef<{ cancel: () => void } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const live = useConversation(convId);
  const human = convId !== null;

  const carBySlug = useMemo(() => new Map((cars ?? []).map((c) => [c.slug, c])), [cars]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [msgs, live.messages, busy, pending, streaming]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [box.height]);

  useEffect(() => () => runRef.current?.cancel(), []);

  // The composer grows with what is typed (up to ~5 lines), like the 21st thinking prompt.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [requestClose]);

  const ask = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean || busy) return;
      const userMsg: ChatMsg = { id: newId(), role: 'user', text: clean };
      const next: ChatMsg[] = [...msgs, userMsg];
      setMsgs(next);
      setInput('');
      setBusy(true);
      const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const started = Date.now();
      const timers: number[] = [];
      let interval = 0;
      let cancelled = false;
      const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
      const clearAll = () => {
        timers.forEach((id) => window.clearTimeout(id));
        window.clearInterval(interval);
      };
      // The answer appears as a flow of text, then the cars / "talk to a person" button.
      const deliver = (reply: { text: string; cars?: string[]; offerHuman?: boolean }, steps?: string[]) => {
        const id = newId();
        const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
        setPending(null);
        setMsgs((cur) => [...cur, { id, role: 'assistant', text: reply.text, cars: reply.cars, offerHuman: reply.offerHuman, steps, seconds: steps ? seconds : undefined }]);
        const done = () => {
          window.clearInterval(interval);
          setStreaming(null);
          setBusy(false);
          runRef.current = null;
        };
        if (reduced) { done(); return; }
        setStreaming({ id, shown: 0 });
        runRef.current = { cancel: done };
        let n = 0;
        interval = window.setInterval(() => {
          n += 5;
          if (n >= reply.text.length) done();
          else setStreaming({ id, shown: n });
        }, 28);
      };
      // Stop while thinking: nothing is answered, and what you wrote goes back in the box.
      runRef.current = {
        cancel: () => {
          cancelled = true;
          clearAll();
          runRef.current = null;
          setPending(null);
          setBusy(false);
          setMsgs((cur) => cur.filter((m) => m.id !== userMsg.id));
          setInput(clean);
        },
      };

      // No AI service by default (no cost): X answers from the site's FAQ and the car matcher, in the
      // browser. Set VITE_KAI_USE_AI=1 (and a key on the server) to use the AI instead.
      if (!AI_ENABLED) {
        const r = localReply(clean, cars ?? [], t);
        const steps = thoughtSteps(r, cars ?? [], t);
        if (think && !reduced) {
          setPending({ steps, shown: 0, seconds: 0 });
          steps.forEach((_, i) => later(400 * (i + 1), () => setPending((p) => (p ? { ...p, shown: i + 1 } : p))));
          interval = window.setInterval(() => setPending((p) => (p ? { ...p, seconds: p.seconds + 1 } : p)), 1000);
          later(400 * steps.length + 300, () => { window.clearInterval(interval); deliver(r, steps); });
        } else {
          later(think ? 0 : 250, () => deliver(r, think ? steps : undefined));
        }
        return;
      }

      // With the AI service on, the trail shows the real stages of getting an answer from it.
      const stages = [t('Reading your request…'), t('Looking through the help articles and the cars on CX…'), t('Writing the answer…')];
      if (think && !reduced) {
        setPending({ steps: stages, shown: 1, seconds: 0, live: true });
        later(700, () => setPending((p) => (p ? { ...p, shown: 2 } : p)));
        later(1500, () => setPending((p) => (p ? { ...p, shown: 3 } : p)));
        interval = window.setInterval(() => setPending((p) => (p ? { ...p, seconds: p.seconds + 1 } : p)), 1000);
      }
      const fallback = t('I had trouble answering that. You can try again, or talk to a person from the team.');
      try {
        const history = next.filter((m) => m.role !== 'note').map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const res = await fetch(apiUrl('/api/notify-message'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ type: 'assistant', messages: history, signedIn: Boolean(session) }),
        });
        const j = (await res.json().catch(() => null)) as { reply?: string; cars?: string[]; human?: boolean; error?: string } | null;
        if (cancelled) return;
        clearAll();
        const reply = j?.reply || j?.error || fallback;
        deliver({ text: reply, cars: j?.cars, offerHuman: Boolean(j?.human) || !j?.reply }, think && !reduced ? stages : undefined);
      } catch {
        if (cancelled) return;
        clearAll();
        deliver({ text: fallback, offerHuman: true });
      }
    },
    [busy, cars, msgs, session, t, think],
  );

  /** Move the conversation to a real CX chat, in this same panel, carrying what was said so far. */
  const handOff = useCallback(async () => {
    if (handing || human) return;
    if (!userId) {
      setMsgs((cur) => [...cur, { id: newId(), role: 'note', text: t('Sign in to talk to a person from the team — it takes a few seconds.') }]);
      return;
    }
    setHanding(true);
    const id = await findOrCreateCxConversation(null, userId);
    if (!id) {
      setHanding(false);
      setMsgs((cur) => [...cur, { id: newId(), role: 'note', text: t('The team is not reachable right now. Please try again in a moment.') }]);
      return;
    }
    const transcript = msgs
      .filter((m) => m.role !== 'note')
      .slice(-8)
      .map((m) => `${m.role === 'user' ? 'Me' : ASSISTANT_NAME}: ${m.text}`)
      .join('\n');
    await sendMessage(id, userId, `[Chat with ${ASSISTANT_NAME} → CX team]\n${transcript}`);
    setConvId(id);
    setHanding(false);
  }, [handing, human, msgs, t, userId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    if (human && userId && convId) {
      setInput('');
      const { message } = await sendMessage(convId, userId, text);
      if (message) live.append(message);
      return;
    }
    void ask(text);
  };

  const chips = msgs.length === 1 && !human
    ? [t('Find me a car for a weekend'), t('I have a problem with my booking'), t('How does verification work?')]
    : [];

  // The circle grows from the tap point to just past the farthest corner — no wasted travel, so the
  // whole easing is seen. The floor is taller than the screen (`pad` above and below), so its circle
  // centre is lower by `pad` in its own coordinates.
  const { revealVars, floorStyle } = useMemo(() => {
    const w = window.innerWidth;
    const h = Math.max(window.innerHeight, window.screen?.height ?? 0);
    const pad = Math.round(window.innerHeight * 0.6);
    const x = origin?.x ?? w / 2;
    const y = origin?.y ?? window.innerHeight;
    const r = Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) + 6;
    const base = { '--kai-x': `${Math.round(x)}px`, '--kai-y': `${Math.round(y)}px`, '--kai-r': `${Math.ceil(r)}px` };
    return {
      revealVars: base as React.CSSProperties,
      floorStyle: { ...base, '--kai-y': `${Math.round(y) + pad}px`, top: -pad, bottom: -pad } as React.CSSProperties,
    };
  }, [origin]);

  const composerCard = (
          <div className="w-full rounded-3xl border border-line-strong bg-surface p-2 pl-4 shadow-sm transition-colors focus-within:border-accent/50">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              rows={1}
              aria-label={human ? t('Write to the team…') : t('Ask {name} anything…', { name: ASSISTANT_NAME })}
              placeholder={human ? t('Write to the team…') : t('Ask {name} anything…', { name: ASSISTANT_NAME })}
              maxLength={800}
              enterKeyHint="send"
              className="block max-h-[120px] min-h-[2.5rem] w-full resize-none bg-transparent py-2 pr-2 text-[16px] leading-6 text-ink placeholder:text-muted focus:outline-none"
            />
            <div className="mt-1 flex items-center justify-between pr-0.5">
              {!human ? (
                <button
                  type="button"
                  aria-pressed={think}
                  disabled={busy}
                  onClick={() => setThink((v) => !v)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-detail font-semibold transition-colors disabled:opacity-50 ${
                    think ? 'border-ink/15 bg-ink/5 text-ink' : 'border-line bg-surface text-muted'
                  }`}
                >
                  <Icon name="sparkles" size={14} />
                  {t('Think')}
                  {think && <Icon name="check" size={12} />}
                </button>
              ) : (
                <span />
              )}
              {busy && !human ? (
                <button
                  key="stop"
                  type="button"
                  onClick={(e) => { e.preventDefault(); runRef.current?.cancel(); }}
                  disabled={!runRef.current}
                  aria-label={t('Stop')}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-white disabled:opacity-30"
                >
                  <span className="h-3 w-3 rounded-[3px] bg-white" />
                </button>
              ) : (
                <button
                  key="send"
                  type="submit"
                  disabled={!input.trim()}
                  aria-label={t('Send')}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-white transition-opacity disabled:opacity-30"
                >
                  <Icon name="arrowRight" size={18} className="-rotate-90" />
                </button>
              )}
            </div>
          </div>
  );

  return createPortal(
    <>
      {/* Opaque floor, taller than the screen on purpose: the page behind never shows through the gap the
          keyboard (or Safari's toolbar) leaves. */}
      <div
        aria-hidden
        className={`fixed inset-x-0 z-[309] bg-bg ${closing ? 'kai-reveal-out' : revealed ? '' : 'kai-reveal-in'}`}
        style={floorStyle}
      />
      <div
        ref={boxRef}
        data-no-pull
        onAnimationEnd={(e) => { if (e.target === e.currentTarget && !closing) setRevealed(true); }}
        className={`fixed inset-x-0 top-0 z-[310] flex h-[100dvh] flex-col overflow-hidden overscroll-none ${
          closing ? 'kai-reveal-out' : revealed ? '' : 'kai-reveal-in'
        }`}
        style={revealVars}
      >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ASSISTANT_NAME}
        data-kb={box.kb ? '1' : undefined}
        className="relative flex h-full w-full flex-col overflow-hidden bg-bg"
      >
        <header className="border-b border-line bg-surface pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 pb-3">
          <ConciergeMark size={40} live />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-body font-semibold text-ink">{human ? t('CX team') : ASSISTANT_NAME}</p>
            <p className="truncate text-caption text-muted">
              {human ? t('A team member will join this chat') : t('CX assistant · usually answers in seconds')}
            </p>
          </div>
          {!human && (
            <button
              type="button"
              onClick={() => void handOff()}
              disabled={handing}
              className="shrink-0 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-detail font-semibold text-ink disabled:opacity-60"
            >
              {handing ? t('Connecting…') : t('Talk to a person')}
            </button>
          )}
          <button type="button" onClick={requestClose} aria-label={t('Close')} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-panel">
            <Icon name="x" size={19} />
          </button>
          </div>
        </header>

        <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-4">
          {!human &&
            msgs.map((m) => (
              <div key={m.id}>
                {m.role === 'note' ? (
                  <p className="mx-auto max-w-[88%] rounded-2xl bg-panel px-3.5 py-2 text-center text-detail text-ink-soft">
                    {m.text}{' '}
                    {!userId && <Link to="/login" onClick={onClose} className="font-semibold text-accent-700 underline">{t('Sign in')}</Link>}
                  </p>
                ) : m.role === 'user' ? (
                  <div className="flex justify-end">
                    <p className="max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-panel px-3.5 py-2.5 text-body text-ink">{m.text}</p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5">
                    <ConciergeMark size={30} />
                    <div className="min-w-0 max-w-[84%] space-y-2">
                      {m.steps && m.steps.length > 0 && (
                        <div>
                          <button
                            type="button"
                            aria-expanded={openThoughts.has(m.id)}
                            onClick={() =>
                              setOpenThoughts((cur) => {
                                const nextSet = new Set(cur);
                                if (nextSet.has(m.id)) nextSet.delete(m.id);
                                else nextSet.add(m.id);
                                return nextSet;
                              })
                            }
                            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel/60 px-2.5 py-1 text-caption text-muted transition-colors hover:bg-panel hover:text-ink"
                          >
                            <Icon name="sparkles" size={13} />
                            {t('Thought for {n}s', { n: m.seconds ?? 1 })}
                            <Icon name="chevronRight" size={13} className={`transition-transform ${openThoughts.has(m.id) ? 'rotate-90' : ''}`} />
                          </button>
                          {openThoughts.has(m.id) && (
                            <div className="mt-2">
                              <ThoughtTrail steps={m.steps} />
                            </div>
                          )}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap px-0.5 pt-1 text-body leading-6 text-ink">
                        {streaming?.id === m.id ? m.text.slice(0, streaming.shown) : m.text}
                        {streaming?.id === m.id && <span aria-hidden="true" className="ml-1 inline-block h-3.5 w-1 translate-y-0.5 animate-pulse rounded-full bg-accent-700" />}
                      </p>
                      {streaming?.id !== m.id && m.cars && m.cars.length > 0 && (
                        <div className="space-y-2">
                          {m.cars.map((slug) => {
                            const c = carBySlug.get(slug);
                            if (!c) return null;
                            return (
                              <Link
                                key={slug}
                                to={`/cars/${slug}`}
                                onClick={onClose}
                                className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2 pr-3 transition-colors hover:bg-panel/50"
                              >
                                <Img src={unsplash(c.images[0], 240)} alt="" className="h-14 w-20 shrink-0 rounded-xl bg-panel object-cover" />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-detail font-semibold text-ink">{c.make} {c.model}</span>
                                  <span className="block truncate text-caption text-muted">{c.city} · {eur(c.pricePerDay)}/{t('day')}</span>
                                </span>
                                <Icon name="chevronRight" size={16} className="shrink-0 text-faint" />
                              </Link>
                            );
                          })}
                        </div>
                      )}
                      {streaming?.id !== m.id && m.offerHuman && (
                        <button type="button" onClick={() => void handOff()} disabled={handing} className="rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-detail font-semibold text-ink disabled:opacity-60">
                          {handing ? t('Connecting…') : t('Talk to a person')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

          {human &&
            (live.loading ? (
              <p className="text-center text-detail text-muted">{t('Connecting…')}</p>
            ) : (
              (live.messages ?? []).map((m) => {
                const mine = m.senderId === userId;
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <p className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-body ${mine ? 'rounded-br-sm bg-panel text-ink' : 'rounded-tl-md border border-line bg-surface text-ink'}`}>
                      {m.deleted ? t('Message deleted') : m.body}
                    </p>
                  </div>
                );
              })
            ))}

          {pending && !human && (
            <div className="flex items-start gap-2.5" role="status">
              <ConciergeMark size={36} active />
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex h-7 items-center gap-2 text-xs">
                  <Icon name="sparkles" size={14} className="shrink-0 text-muted" />
                  <span className="kai-thinking font-medium">{t('Thinking it through')}</span>
                  <span className="ml-auto font-mono text-[11px] tabular-nums text-muted">{pending.seconds}s</span>
                </div>
                <div className="mt-2">
                  <ThoughtTrail
                    steps={pending.steps.slice(0, pending.shown)}
                    activeIndex={pending.shown < pending.steps.length || pending.live ? pending.shown - 1 : null}
                  />
                </div>
              </div>
            </div>
          )}
          {busy && !human && !pending && !streaming && (
            <div className="flex items-center gap-2.5" role="status">
              <ConciergeMark size={30} />
              <span className="flex items-center gap-1.5 text-detail">
                <Icon name="sparkles" size={14} className="text-muted" />
                <span className="kai-thinking font-medium">{t('Thinking it through')}</span>
              </span>
            </div>
          )}

          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {chips.map((c) => (
                <button key={c} type="button" onClick={() => void ask(c)} className="rounded-full border border-line-strong bg-surface px-3.5 py-2 text-detail font-semibold text-ink">
                  {c}
                </button>
              ))}
            </div>
          )}
          </div>
        </div>

        <form onSubmit={submit} className={`border-t border-line bg-bg px-3 pt-3 ${box.kb ? 'pb-3' : 'pb-[max(0.75rem,env(safe-area-inset-bottom))]'}`}>
          <Suspense fallback={<div className="mx-auto w-full max-w-3xl">{composerCard}</div>}>
            <BorderBeam
              size="md"
              colorVariant="forest"
              theme="dark"
              borderRadius={24}
              duration={2.6}
              strength={1}
              saturation={1.4}
              brightness={1.2}
              glowSize={1.15}
              active={!closing}
              className="mx-auto block w-full max-w-3xl"
            >
              {composerCard}
            </BorderBeam>
          </Suspense>
        </form>
      </div>
      </div>
    </>,
    document.body,
  );
}
