import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';

/**
 * A deck of cards you swipe: right keeps, left skips, with undo and arrow-key support (the 21st "swipe deck",
 * restyled with the site's tokens). The logic lives in useSwipeDeck; SwipeDeck is the finished component.
 */

const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
const DISCLOSE = { type: 'spring', stiffness: 150, damping: 27, mass: 1 } as const;
const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
const LEAVE = [0.4, 0, 1, 1] as const;

export type SwipeChoice = 'left' | 'right';
export type SwipeIntent = { dir: -1 | 0 | 1; step: number };
export type SwipeDeckFlow = { dir: -1 | 1; kind: 'decide' | 'undo' };

const BLANK: SwipeIntent = { dir: 0, step: 0 };
const spent = (out: boolean) => (out ? 'opacity-0' : '');

export type UseSwipeDeckOptions = {
  count: number;
  threshold?: number;
  steps?: number;
  flick?: number;
  onDecide?: (index: number, choice: SwipeChoice) => void;
  onUndo?: (index: number) => void;
  disabled?: boolean;
};

export function useSwipeDeck({ count, threshold = 92, steps = 6, flick = 520, onDecide, onUndo, disabled = false }: UseSwipeDeckOptions) {
  const total = Math.max(0, Math.floor(count));
  const grain = Math.max(1, Math.floor(steps));
  const reach = Math.max(1, threshold);

  const [decisions, setDecisions] = useState<SwipeChoice[]>([]);
  const [flow, setFlow] = useState<SwipeDeckFlow>({ dir: 1, kind: 'decide' });
  const [intent, setIntent] = useState<SwipeIntent>(BLANK);

  const index = Math.min(decisions.length, total);

  const len = useRef(decisions.length);
  len.current = decisions.length;
  const size = useRef(total);
  size.current = total;
  const made = useRef(decisions);
  made.current = decisions;
  const decided = useRef(onDecide);
  decided.current = onDecide;
  const reverted = useRef(onUndo);
  reverted.current = onUndo;

  const clear = useCallback(() => {
    setIntent((prev) => (prev.step === 0 && prev.dir === 0 ? prev : BLANK));
  }, []);

  const decide = useCallback(
    (choice: SwipeChoice) => {
      if (disabled) return;
      const at = len.current;
      if (at >= size.current) return;
      len.current = at + 1;
      setDecisions((prev) => [...prev, choice]);
      setFlow({ dir: choice === 'right' ? 1 : -1, kind: 'decide' });
      setIntent(BLANK);
      decided.current?.(at, choice);
    },
    [disabled],
  );

  const undo = useCallback(() => {
    if (disabled) return;
    const at = len.current;
    if (at === 0) return;
    const last = made.current[at - 1];
    len.current = at - 1;
    setDecisions((prev) => prev.slice(0, prev.length - 1));
    setFlow({ dir: last === 'right' ? 1 : -1, kind: 'undo' });
    setIntent(BLANK);
    reverted.current?.(at - 1);
  }, [disabled]);

  const report = useCallback(
    (dx: number) => {
      const step = Math.min(grain, Math.round((Math.abs(dx) / reach) * grain));
      const dir: -1 | 0 | 1 = step === 0 ? 0 : dx > 0 ? 1 : -1;
      setIntent((prev) => (prev.dir === dir && prev.step === step ? prev : { dir, step }));
    },
    [grain, reach],
  );

  const release = useCallback(
    (dx: number, vx: number) => {
      const far = Math.abs(dx) >= reach;
      const fast = Math.abs(vx) >= flick && Math.abs(dx) >= reach * 0.35;
      if (!far && !fast) {
        clear();
        return;
      }
      decide((far ? dx : vx) > 0 ? 'right' : 'left');
    },
    [reach, flick, clear, decide],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        decide('left');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        decide('right');
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        undo();
      } else if (event.key === 'Escape') {
        clear();
      }
    },
    [decide, undo, clear],
  );

  useEffect(() => {
    const bail = () => clear();
    const hidden = () => document.hidden && clear();
    window.addEventListener('blur', bail);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', bail);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [clear]);

  return {
    index,
    count: total,
    remaining: total - index,
    done: index >= total,
    decisions,
    flow,
    intent,
    steps: grain,
    threshold: reach,
    armed: intent.step >= grain,
    canUndo: decisions.length > 0,
    decide,
    undo,
    clear,
    report,
    release,
    deckProps: { role: 'group' as const, 'aria-roledescription': 'card deck', tabIndex: 0, onKeyDown },
  };
}

const ICON_LEFT = (
  <svg width="14" height="14" viewBox="0 0 256 256" fill="none" aria-hidden="true">
    <line x1="200" y1="56" x2="56" y2="200" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
    <line x1="200" y1="200" x2="56" y2="56" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
  </svg>
);
const ICON_RIGHT = (
  <svg width="14" height="14" viewBox="0 0 256 256" fill="none" aria-hidden="true">
    <polyline points="216 72 104 184 48 128" stroke="currentColor" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ICON_UNDO = (
  <svg width="13" height="13" viewBox="0 0 256 256" fill="none" aria-hidden="true">
    <polyline points="72 104 24 104 24 56" stroke="currentColor" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M67.6,192.1a88,88,0,1,0,0-128.2L24,104" stroke="currentColor" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

type DeckCardProps = {
  depth: number;
  height: number;
  entryX: number;
  active: boolean;
  reduced: boolean;
  label: string;
  leftLabel: string;
  rightLabel: string;
  intent: SwipeIntent;
  steps: number;
  onMove: (dx: number) => void;
  onRelease: (dx: number, vx: number) => void;
  children: React.ReactNode;
};

function DeckCard({ depth, height, entryX, active, reduced, label, leftLabel, rightLabel, intent, steps, onMove, onRelease, children }: DeckCardProps) {
  const x = useMotionValue(entryX);
  const rotate = useTransform(x, [-200, 0, 200], [-8, 0, 8], { clamp: false });
  const fade = useTransform(x, [-340, -150, 0, 150, 340], [0, 1, 1, 1, 0]);

  const skip = useRef(reduced);
  skip.current = reduced;

  useEffect(() => {
    if (x.get() === 0) return;
    const controls = animate(x, 0, skip.current ? { duration: 0 } : DISCLOSE);
    return () => controls.stop();
  }, [x, entryX]);

  const commit = active ? 0 : depth === 1 ? intent.step / steps : 0;
  const y = depth * 10 - commit * 10;
  const scale = 1 - depth * 0.045 + commit * 0.045;

  const badge = (side: -1 | 1, text: string, place: string) => {
    const on = intent.dir === side;
    return (
      <motion.span
        aria-hidden
        initial={false}
        animate={{ opacity: on ? intent.step / steps : 0, scale: on ? 1 : 0.94 }}
        transition={reduced ? { duration: 0 } : CELL}
        className={`pointer-events-none absolute top-3 z-10 whitespace-nowrap rounded-full border bg-surface px-3 py-1.5 text-label font-semibold uppercase tracking-[0.1em] shadow-hair transition-colors duration-150 ${
          on && intent.step >= steps ? 'border-accent bg-accent text-white' : 'border-line-strong text-ink-soft'
        } ${place}`}
      >
        {text}
      </motion.span>
    );
  };

  return (
    <motion.div
      role="group"
      aria-label={label}
      aria-hidden={!active}
      inert={!active}
      variants={{
        exit: (dir: number) => ({
          x: dir * 560,
          zIndex: 12,
          borderColor: 'rgba(0,0,0,0)',
          transition: reduced ? { duration: 0 } : { x: { duration: 0.3, ease: LEAVE }, borderColor: { duration: 0.1, ease: 'linear' } },
        }),
      }}
      initial={{ y, scale }}
      animate={{ y, scale }}
      exit="exit"
      transition={reduced ? { duration: 0 } : active ? { ...CROSSFADE, delay: 0.1 } : CROSSFADE}
      drag={active ? 'x' : false}
      dragDirectionLock
      dragMomentum={false}
      dragElastic={1}
      dragConstraints={{ left: 0, right: 0 }}
      dragTransition={{ bounceStiffness: 260, bounceDamping: 34 }}
      whileDrag={reduced ? undefined : { scale: 1.03 }}
      onDrag={(_event, info) => onMove(info.offset.x)}
      onDragEnd={(_event, info) => onRelease(info.offset.x, info.velocity.x)}
      style={{ x, rotate, opacity: fade, height, zIndex: 10 - depth, transformOrigin: '50% 100%', touchAction: 'pan-y' }}
      className={`absolute inset-x-5 top-0 select-none overflow-hidden rounded-3xl border border-line bg-surface ${
        active
          ? 'cursor-grab shadow-[0_2px_4px_rgba(20,25,22,0.06),0_22px_40px_-20px_rgba(10,40,20,0.5)] active:cursor-grabbing'
          : 'shadow-[0_1px_2px_rgba(20,25,22,0.05),0_8px_16px_-12px_rgba(10,40,20,0.4)]'
      }`}
    >
      {children}
      {active ? badge(-1, leftLabel, 'left-3') : null}
      {active ? badge(1, rightLabel, 'right-3') : null}
    </motion.div>
  );
}

export type SwipeDeckProps<T> = {
  items: readonly T[];
  itemKey: (item: T) => string;
  itemLabel: (item: T) => string;
  children: (item: T) => React.ReactNode;
  onDecide?: (item: T, choice: SwipeChoice) => void;
  onUndo?: (item: T) => void;
  label?: string;
  leftLabel?: string;
  rightLabel?: string;
  undoLabel?: string;
  emptyLabel?: string;
  /** What the empty box shows instead of the plain sentence (a teaser, a button…). */
  emptyContent?: React.ReactNode;
  /** Text next to the counter, e.g. "3 left". */
  remainingText?: (remaining: number) => string;
  /** Screen-reader announcement for the top card, e.g. "BMW M4. Card 2 of 8." */
  positionText?: (item: string, index: number, total: number) => string;
  hint?: string;
  height?: number;
  threshold?: number;
  steps?: number;
  peek?: number;
  className?: string;
};

export function SwipeDeck<T>({
  items,
  itemKey,
  itemLabel,
  children,
  onDecide,
  onUndo,
  label = 'Card deck',
  leftLabel = 'Skip',
  rightLabel = 'Keep',
  undoLabel = 'Undo',
  emptyLabel = 'Deck cleared',
  emptyContent,
  remainingText = (n) => `${n} left`,
  positionText = (item, i, n) => `${item}. Card ${i + 1} of ${n}.`,
  hint = 'Left and right arrow keys decide the top card. Backspace brings the last one back.',
  height = 180,
  threshold = 92,
  steps = 6,
  peek = 3,
  className = '',
}: SwipeDeckProps<T>) {
  const hintId = useId();
  const reduced = useReducedMotion() === true;

  const deck = useSwipeDeck({
    count: items.length,
    threshold,
    steps,
    onDecide: (at, choice) => {
      const item = items[at];
      if (item !== undefined) onDecide?.(item, choice);
    },
    onUndo: (at) => {
      const item = items[at];
      if (item !== undefined) onUndo?.(item);
    },
  });

  const stack = items.slice(deck.index, deck.index + Math.max(1, peek));
  const current = items[deck.index];

  const control =
    'hit-44 inline-flex h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-detail font-semibold text-ink outline-none transition-[background-color,border-color,opacity] duration-150 hover:bg-panel focus-visible:border-accent';

  return (
    <div className={`w-full ${className}`}>
      <div
        aria-label={label}
        aria-describedby={hintId}
        style={{ height: height + 26 }}
        className="relative w-full overflow-hidden rounded-3xl outline-none focus-visible:shadow-[0_0_0_2px_var(--color-accent)]"
        {...deck.deckProps}
      >
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            aria-hidden={!deck.done}
            initial={false}
            animate={{ opacity: deck.done ? 1 : 0 }}
            transition={reduced ? { duration: 0 } : CROSSFADE}
            style={{ height }}
            className="absolute inset-x-5 top-0 z-0 grid place-items-center rounded-3xl bg-gradient-to-b from-accent-050 to-panel px-5 text-center text-body text-muted"
          >
            {emptyContent ?? emptyLabel}
          </motion.div>
          <AnimatePresence initial={false} custom={deck.flow.dir}>
            {stack.map((item, depth) => (
              <DeckCard
                key={itemKey(item)}
                depth={depth}
                height={height}
                entryX={depth === 0 && deck.flow.kind === 'undo' ? deck.flow.dir * 560 : 0}
                active={depth === 0}
                reduced={reduced}
                label={itemLabel(item)}
                leftLabel={leftLabel}
                rightLabel={rightLabel}
                intent={deck.intent}
                steps={deck.steps}
                onMove={deck.report}
                onRelease={deck.release}
              >
                {children(item)}
              </DeckCard>
            ))}
          </AnimatePresence>
        </div>
      </div>
      <div className="mt-3 grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3">
        <button type="button" onClick={() => deck.decide('left')} inert={deck.done} className={`${control} justify-self-start ${spent(deck.done)}`}>
          {ICON_LEFT}
          <span>{leftLabel}</span>
        </button>
        <span className="flex min-w-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap font-mono text-caption tabular-nums text-muted">
          <span aria-hidden>{remainingText(deck.remaining)}</span>
          <button
            type="button"
            onClick={deck.undo}
            inert={!deck.canUndo}
            className={`hit-44 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-ink-soft outline-none transition-[background-color,opacity] duration-150 hover:bg-panel focus-visible:shadow-[inset_0_0_0_1px_var(--color-accent)] ${spent(!deck.canUndo)}`}
          >
            {ICON_UNDO}
            <span>{undoLabel}</span>
          </button>
        </span>
        <button type="button" onClick={() => deck.decide('right')} inert={deck.done} className={`${control} justify-self-end border-accent/40 bg-accent-050 text-accent-700 ${spent(deck.done)}`}>
          <span>{rightLabel}</span>
          {ICON_RIGHT}
        </button>
      </div>
      <p aria-live="polite" aria-atomic className="sr-only">
        {deck.done || current === undefined ? emptyLabel : positionText(itemLabel(current), deck.index, items.length)}
      </p>
      <span id={hintId} className="sr-only">
        {hint}
      </span>
    </div>
  );
}

export default SwipeDeck;
