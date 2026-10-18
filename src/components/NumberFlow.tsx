import {
  AnimatePresence,
  animate,
  type MotionValue,
  motion,
  type Transition,
  type UseInViewOptions,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react';
import {
  type CSSProperties,
  type HTMLAttributes,
  type Ref,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/** Number Flow (21st.dev, @soralabs): each digit rolls like an odometer when the value changes. Adapted to this project:
 *  no shadcn `cn`, single-quote style. */
const cn = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

// --- formatting -------------------------------------------------------------

type NumberPartType = Exclude<Intl.NumberFormatPartTypes, 'minusSign' | 'plusSign'> | 'sign' | 'prefix' | 'suffix';

interface KeyedDigitPart {
  key: string;
  /** Digit place: 0 = ones, 1 = tens, ... for integer; -1, -2, ... for fraction. */
  pos: number;
  type: 'integer' | 'fraction';
  value: number;
}

interface KeyedSymbolPart {
  key: string;
  type: Exclude<NumberPartType, 'integer' | 'fraction'>;
  value: string;
}

type KeyedPart = KeyedDigitPart | KeyedSymbolPart;

interface FormattedNumber {
  parts: KeyedPart[];
  value: number;
  valueAsString: string;
}

function generateKeyFactory() {
  const counts: Partial<Record<NumberPartType, number>> = {};
  return (type: NumberPartType) => {
    const next = (counts[type] ?? -1) + 1;
    counts[type] = next;
    return { index: next, key: `${type}:${next}` };
  };
}

function formatToParts(value: number, formatter: Intl.NumberFormat, prefix?: string, suffix?: string): FormattedNumber {
  const rawParts: Array<{ type: Intl.NumberFormatPartTypes | 'prefix' | 'suffix'; value: string }> = formatter.formatToParts(value);
  if (prefix) rawParts.unshift({ type: 'prefix', value: prefix });
  if (suffix) rawParts.push({ type: 'suffix', value: suffix });

  const pre: KeyedPart[] = [];
  const integerDigits: Array<{ type: 'integer'; value: number } | { type: 'group'; value: string }> = [];
  const fraction: KeyedPart[] = [];
  const post: KeyedPart[] = [];
  const generateKey = generateKeyFactory();

  let valueAsString = '';
  let seenInteger = false;
  let seenDecimal = false;

  for (const part of rawParts) {
    valueAsString += part.value;
    const type: NumberPartType = part.type === 'minusSign' || part.type === 'plusSign' ? 'sign' : part.type;

    if (type === 'integer') {
      seenInteger = true;
      for (const digit of part.value) integerDigits.push({ type: 'integer', value: Number(digit) });
    } else if (type === 'group') {
      integerDigits.push({ type: 'group', value: part.value });
    } else if (type === 'decimal') {
      seenDecimal = true;
      fraction.push({ type: 'decimal', value: part.value, key: generateKey(type).key });
    } else if (type === 'fraction') {
      for (const digit of part.value) {
        const { index, key } = generateKey(type);
        fraction.push({ type: 'fraction', value: Number(digit), key, pos: -1 - index });
      }
    } else {
      (seenInteger || seenDecimal ? post : pre).push({ type, value: part.value, key: generateKey(type).key });
    }
  }

  // Integer parts are keyed right-to-left so adding/removing a leading digit does not reshuffle the others.
  const integer: KeyedPart[] = [...integerDigits]
    .reverse()
    .map((part) => {
      const { index, key } = generateKey(part.type);
      return part.type === 'integer' ? { ...part, key, pos: index } : { ...part, key };
    })
    .reverse();

  return { parts: [...pre, ...integer, ...fraction, ...post], valueAsString, value };
}

function isDigitPart(part: KeyedPart): part is KeyedDigitPart {
  return part.type === 'integer' || part.type === 'fraction';
}

// --- trend / digit delta -----------------------------------------------------

export type NumberFlowTrend = number | ((prevValue: number, value: number) => number);

function resolveTrend(trend: NumberFlowTrend, prevValue: number, value: number) {
  return typeof trend === 'function' ? trend(prevValue, value) : trend;
}

const DIGIT_LENGTH = 10;

function getDigitDelta(prevValue: number, value: number, trend: number) {
  const diff = value - prevValue;
  const t = trend || Math.sign(diff);
  if (t < 0 && value > prevValue) return value - DIGIT_LENGTH - prevValue;
  if (t > 0 && value < prevValue) return DIGIT_LENGTH - prevValue + value;
  return diff;
}

function mod(a: number, m: number) {
  return ((a % m) + m) % m;
}

/** The least-significant place where the previous and next number differ: digits at or before it spin a full loop. */
function computeStartingPos(prevParts: KeyedDigitPart[], parts: KeyedDigitPart[], trend: number): number | undefined {
  if (!trend) return;
  const firstChangedPrev = prevParts.find((pp) => !parts.some((p) => p.pos === pp.pos && p.value === pp.value));
  const firstChanged = parts.find((p) => !prevParts.some((pp) => p.pos === pp.pos && p.value === pp.value));
  const positions = [firstChangedPrev?.pos, firstChanged?.pos].filter((p): p is number => p != null);
  return positions.length ? Math.max(...positions) : undefined;
}

/** Fraction in [-1, 1] of one row that face `n` sits from centre. */
function digitFaceOffset(n: number, c: number) {
  const offsetRaw = mod(DIGIT_LENGTH + n - mod(c, DIGIT_LENGTH), DIGIT_LENGTH);
  const offset = offsetRaw - DIGIT_LENGTH * Math.floor(offsetRaw / (DIGIT_LENGTH / 2));
  return Math.max(-1, Math.min(1, offset));
}

// --- edge mask (vignette) -------------------------------------------------

const MASK_HEIGHT = '0.25em';
const MASK_WIDTH = '0.5em';
const MASK_CORNER = '#000 0, transparent 71%';

const numberMaskStyle: CSSProperties = {
  WebkitMaskImage: [
    `linear-gradient(to right, transparent 0, #000 ${MASK_WIDTH}, #000 calc(100% - ${MASK_WIDTH}), transparent)`,
    `linear-gradient(to bottom, transparent 0, #000 ${MASK_HEIGHT}, #000 calc(100% - ${MASK_HEIGHT}), transparent 100%)`,
    `radial-gradient(at bottom right, ${MASK_CORNER})`,
    `radial-gradient(at bottom left, ${MASK_CORNER})`,
    `radial-gradient(at top left, ${MASK_CORNER})`,
    `radial-gradient(at top right, ${MASK_CORNER})`,
  ].join(', '),
  WebkitMaskPosition: 'center, center, top left, top right, bottom right, bottom left',
  WebkitMaskRepeat: 'no-repeat',
  WebkitMaskSize: [
    `100% calc(100% - ${MASK_HEIGHT} * 2)`,
    `calc(100% - ${MASK_WIDTH} * 2) 100%`,
    `${MASK_WIDTH} ${MASK_HEIGHT}`,
    `${MASK_WIDTH} ${MASK_HEIGHT}`,
    `${MASK_WIDTH} ${MASK_HEIGHT}`,
    `${MASK_WIDTH} ${MASK_HEIGHT}`,
  ].join(', '),
  marginInline: `calc(-1 * ${MASK_WIDTH})`,
};

const numberMaskInnerStyle: CSSProperties = { padding: `calc(${MASK_HEIGHT} / 2) ${MASK_WIDTH}` };

const DIGIT_FACES = Array.from({ length: DIGIT_LENGTH }, (_, i) => i);

// --- Digit --------------------------------------------------------------

function DigitFace({ n, mv, willChange }: { mv: MotionValue<number>; n: number; willChange: boolean }) {
  const y = useTransform(mv, (c) => `${digitFaceOffset(n, c) * 100}%`);
  return (
    <motion.span aria-hidden="true" className={cn('absolute inset-0 flex items-center justify-center', willChange && 'will-change-transform')} style={{ y }}>
      {n}
    </motion.span>
  );
}

interface DigitProps {
  animateIn: boolean;
  layoutTransition: Transition;
  onAnimationEnd: () => void;
  onAnimationStart: () => void;
  pos: number;
  reduced: boolean;
  ref?: Ref<HTMLSpanElement>;
  startingPos: number | undefined;
  transition: Transition;
  trend: number;
  value: number;
  willChange: boolean;
}

function Digit({ value, trend, transition, layoutTransition, animateIn, reduced, pos, startingPos, willChange, onAnimationStart, onAnimationEnd, ref }: DigitProps) {
  const mv = useMotionValue(reduced || !animateIn ? value : 0);
  const isMountRef = useRef(true);

  useEffect(() => {
    const spin = (delta: number) => {
      onAnimationStart();
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        onAnimationEnd();
      };
      const controls = animate(mv, delta, transition);
      controls.then(settle, settle);
      return () => {
        controls.stop();
        settle();
      };
    };

    if (isMountRef.current) {
      isMountRef.current = false;
      if (!reduced && animateIn) return spin(getDigitDelta(0, value, trend));
      return;
    }
    if (reduced) {
      mv.set(value);
      return;
    }
    const current = mv.get();
    let delta = getDigitDelta(mod(current, DIGIT_LENGTH), value, trend);
    if (delta === 0) {
      if (trend && startingPos != null && startingPos >= pos) delta = DIGIT_LENGTH * trend;
      else return;
    }
    return spin(current + delta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, startingPos]);

  return (
    <motion.span
      animate={{ opacity: 1 }}
      className={cn('relative inline-block align-bottom tabular-nums', willChange && 'will-change-transform')}
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      layout
      ref={ref}
      transition={layoutTransition}
    >
      <span aria-hidden="true" className="invisible">0</span>
      {DIGIT_FACES.map((n) => (
        <DigitFace key={n} mv={mv} n={n} willChange={willChange} />
      ))}
    </motion.span>
  );
}

// --- NumberFlow -----------------------------------------------------------

const DEFAULT_TRANSITION: Transition = { duration: 0.9, ease: [0.16, 1, 0.3, 1] };
const DEFAULT_OPACITY_TRANSITION: Transition = { duration: 0.45, ease: 'easeOut' };
const REDUCED_TRANSITION: Transition = { duration: 0 };
const DEFAULT_VIEWPORT_MARGIN = '0px 0px -10% 0px';

export interface NumberFlowProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  format?: Intl.NumberFormatOptions;
  locales?: Intl.LocalesArgument;
  onAnimationsFinish?: () => void;
  onAnimationsStart?: () => void;
  once?: boolean;
  prefix?: string;
  respectMotionPreference?: boolean;
  scrollTrigger?: boolean;
  spinTransition?: Transition;
  suffix?: string;
  transition?: Transition;
  trend?: NumberFlowTrend;
  value: number;
  viewportMargin?: UseInViewOptions['margin'];
  willChange?: boolean;
}

function usePrevious<T>(value: T) {
  const ref = useRef(value);
  const prev = ref.current;
  ref.current = value;
  return prev;
}

function useIsFirstRender() {
  const ref = useRef(true);
  const isFirst = ref.current;
  ref.current = false;
  return isFirst;
}

function canAnimateElement(el: HTMLElement | null) {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
  return Boolean(el && el.offsetWidth > 0 && el.offsetHeight > 0);
}

export function NumberFlow({
  value,
  locales,
  format,
  prefix,
  suffix,
  trend = (prevValue, next) => Math.sign(next - prevValue),
  transition = DEFAULT_TRANSITION,
  spinTransition,
  respectMotionPreference = true,
  willChange = false,
  scrollTrigger = false,
  once = true,
  viewportMargin = DEFAULT_VIEWPORT_MARGIN,
  onAnimationsStart,
  onAnimationsFinish,
  className,
  style,
  ...props
}: NumberFlowProps) {
  const prefersReducedMotion = useReducedMotion();
  const isFirstRender = useIsFirstRender();
  const rootRef = useRef<HTMLSpanElement>(null);
  const isInView = useInView(rootRef, { margin: viewportMargin, once });
  const activeSpins = useRef(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const handleAnimationStart = () => {
    activeSpins.current += 1;
    if (activeSpins.current === 1) {
      onAnimationsStart?.();
      if (willChange) setIsAnimating(true);
    }
  };
  const handleAnimationEnd = () => {
    activeSpins.current -= 1;
    if (activeSpins.current === 0) {
      onAnimationsFinish?.();
      if (willChange) setIsAnimating(false);
    }
  };
  const activeWillChange = willChange && isAnimating;
  const reduced = Boolean(respectMotionPreference && prefersReducedMotion) || !(isFirstRender || canAnimateElement(rootRef.current));
  const effectiveValue = scrollTrigger && !reduced && !isInView ? 0 : value;

  const localesKey = JSON.stringify(locales ?? null);
  const formatKey = JSON.stringify(format ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const formatter = useMemo(() => new Intl.NumberFormat(locales, format), [localesKey, formatKey]);

  const data = useMemo(() => formatToParts(effectiveValue, formatter, prefix, suffix), [effectiveValue, formatter, prefix, suffix]);
  const prevData = usePrevious(data);
  const computedTrend = resolveTrend(trend, prevData.value, data.value);
  const startingPos = useMemo(
    () => computeStartingPos(prevData.parts.filter(isDigitPart), data.parts.filter(isDigitPart), computedTrend),
    [prevData, data, computedTrend],
  );

  const spinT = reduced ? REDUCED_TRANSITION : (spinTransition ?? transition);
  const layoutT = reduced ? REDUCED_TRANSITION : transition;
  const opacityT = reduced ? REDUCED_TRANSITION : DEFAULT_OPACITY_TRANSITION;

  return (
    <span aria-label={data.valueAsString} className={cn('inline-block tabular-nums', className)} dir="ltr" ref={rootRef} role="img" style={{ ...numberMaskStyle, ...style }} {...props}>
      <span aria-hidden="true" className={cn('isolate inline-flex', activeWillChange && 'will-change-transform')} style={numberMaskInnerStyle}>
        <AnimatePresence initial={false} mode="popLayout">
          {data.parts.map((part) =>
            isDigitPart(part) ? (
              <Digit
                animateIn={!isFirstRender}
                key={part.key}
                layoutTransition={layoutT}
                onAnimationEnd={handleAnimationEnd}
                onAnimationStart={handleAnimationStart}
                pos={part.pos}
                reduced={reduced}
                startingPos={startingPos}
                transition={spinT}
                trend={computedTrend}
                value={part.value}
                willChange={activeWillChange}
              />
            ) : (
              <motion.span
                animate={{ opacity: 1 }}
                className={cn('inline-block mix-blend-plus-lighter', activeWillChange && 'will-change-transform')}
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                key={part.key}
                layout
                transition={opacityT}
              >
                {part.value}
              </motion.span>
            ),
          )}
        </AnimatePresence>
      </span>
    </span>
  );
}

export default NumberFlow;
