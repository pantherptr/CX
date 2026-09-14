import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';
import {
  motion,
  AnimatePresence,
  useDragControls,
  useReducedMotion,
  type HTMLMotionProps,
  type Transition,
} from 'motion/react';

/**
 * Motion for React ("motion/react") — the project's one JS-driven motion
 * library, added specifically for gesture-based and shared-layout
 * interactions that CSS transitions/keyframes genuinely can't do well
 * (spring physics with real velocity, drag-to-dismiss, one element
 * smoothly sliding/resizing into another's position). It does NOT replace
 * the existing CSS animation system in index.css (`.animate-page`,
 * `.animate-fade-in/-up/-scale-in`, `.animate-sheet-in`, `.pressable`,
 * the like/respect/save "pop" keyframes) or the native View Transitions
 * API already used for Signal's post/profile overlay crossfades
 * (`viewTransition` on react-router `<Link>`s) — both of those already
 * work well, are cheap (pure CSS, no JS animation loop), and are already
 * wired everywhere. Reach for this kit only for the specific things it's
 * actually better at; keep using the CSS system for plain fades/entrances.
 *
 * Every export below is reduced-motion-safe on its own — nothing here
 * needs a caller to remember to check `prefers-reduced-motion` itself.
 */

/** Bezier-for-bezier the same curve as `--ease-out-expo` in index.css —
 *  one shared "premium ease" vocabulary between the CSS and JS animation
 *  systems, not two different curves that read as two different products. */
export const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Durations mirror index.css's own `--dur-*` scale (micro/button/nav/
 *  page/story) — reused here as numbers (seconds) since Motion's
 *  `transition` prop can't read CSS custom properties directly. */
export const DUR = {
  micro: 0.15,
  button: 0.16,
  nav: 0.22,
  page: 0.26,
  story: 0.3,
} as const;

/** Snappy, slightly-underdamped spring for small interactive elements —
 *  tab pills, press feedback, anything that should feel alive but settle
 *  fast. Motion's springs are physical (mass/stiffness/damping), not
 *  duration-based, so there's no exact CSS equivalent — this is the one
 *  case Motion is doing something the existing system structurally can't. */
export const SPRING_SNAPPY: Transition = { type: 'spring', stiffness: 500, damping: 32, mass: 0.9 };

/** Softer settle for larger surfaces — sheets, drag-released panels —
 *  where a bouncier spring would read as toy-like rather than premium. */
export const SPRING_SMOOTH: Transition = { type: 'spring', stiffness: 380, damping: 38, mass: 1 };

// ---------------------------------------------------------------------
// Named tokens — one small, closed vocabulary, reused everywhere in
// SIGNAL rather than every surface picking its own numbers. Each name
// below maps onto one of the two physical springs or a plain tween; pick
// by *what kind of interaction this is*, not by copying a number.
// ---------------------------------------------------------------------

/** The default spring — reach for this one unless a specific reason
 *  (see `TRANSITION_SHEET`) calls for the softer variant. */
export const SPRING: Transition = SPRING_SNAPPY;

/** A tap, an icon toggling, a badge appearing — anything that should
 *  register as instantaneous. Spring, not a tween: a button press is a
 *  physical gesture, and a spring's overshoot-then-settle is what reads
 *  as "it responded to me" rather than "it faded in." */
export const TRANSITION_FAST: Transition = SPRING_SNAPPY;

/** The general-purpose tween for state changes that aren't a direct
 *  press response — a color swap, a row reordering, anything driven by
 *  data rather than a finger. Plain eased tween (not a spring): these
 *  changes aren't a physical gesture, so an overshoot would read as
 *  noise rather than feedback. Same curve as `--ease-out-expo`. */
export const TRANSITION_STANDARD: Transition = { duration: DUR.nav, ease: EASE_OUT_EXPO };

/** Whole-page/route-level movement — deliberately the slowest token
 *  here, and still short (`DUR.page` = 260ms) — anything slower reads as
 *  the app being slow, not premium. */
export const TRANSITION_PAGE: Transition = { duration: DUR.page, ease: EASE_OUT_EXPO };

/** Bottom sheets and other large drag-released surfaces — see
 *  `SPRING_SMOOTH`'s own comment for why this is softer than the default. */
export const TRANSITION_SHEET: Transition = SPRING_SMOOTH;

/** Centered dialogs (not bottom sheets) — a quick fade+scale, tween
 *  rather than spring since a modal opens/closes on command, not by
 *  being dragged, so there's no velocity to carry into an overshoot. */
export const TRANSITION_MODAL: Transition = { duration: DUR.button, ease: EASE_OUT_EXPO };

/** `layoutId` shared-element moves (see `SharedAvatar` below) — soft
 *  enough to read as one continuous object traveling, not a snap. */
export const TRANSITION_SHARED_ELEMENT: Transition = SPRING_SMOOTH;

/** Alias of `SPRING_SNAPPY` under the name callers actually think in —
 *  "the spring under a press," not "the snappy one." Identical value;
 *  exported separately so `<Tap>`'s own default reads self-documenting
 *  at the call site. */
export const PRESS_FEEDBACK: Transition = SPRING_SNAPPY;

export { motion, AnimatePresence, useReducedMotion };

/**
 * Polymorphic press-feedback wrapper — the spring-physics counterpart to
 * the CSS `.pressable` class (`transform: scale(0.97)` on `:active`,
 * fine for most buttons). Use `<Tap>` instead specifically where a real
 * spring "settle" on release reads better than a linear scale-back: a
 * Respect/Save/Follow action, a Story tile, anything that just confirmed
 * something happened. Renders a plain `motion.button` by default; pass
 * `as="div"` for a non-button pressable (e.g. a card).
 *
 * Falls back to a static wrapper with no scale/hover motion at all under
 * `prefers-reduced-motion` — never merely a faster version of the same
 * animation.
 */
export function Tap({
  as = 'button',
  scale = 0.94,
  lift = false,
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  /** How far it shrinks on press — 0.94 (default) is a confident but
   *  still subtle press for a small icon button; use 0.97 for anything
   *  larger than ~44px so the motion doesn't read as exaggerated. */
  scale?: number;
  /** Adds a barely-there hover lift (desktop pointer only, via Motion's
   *  own hover gesture, which already no-ops on touch) — off by default
   *  since most CX Rent buttons don't want any hover motion. */
  lift?: boolean;
  className?: string;
  children?: ReactNode;
} & HTMLMotionProps<'button'>) {
  const reduceMotion = useReducedMotion();
  const MotionTag = motion.create(as);
  // Reduced motion drops the press/hover *gestures* (purely decorative)
  // but keeps rendering a real motion component rather than falling back
  // to a plain tag — a caller-supplied `animate` (FollowButton's "just
  // followed" confirmation bump, for instance) is real state, not
  // decoration, and should still take effect, just as an instant cut
  // (zero-duration transition) instead of an animated spring.
  return (
    <MotionTag
      className={className}
      whileTap={reduceMotion ? undefined : { scale }}
      whileHover={!reduceMotion && lift ? { scale: 1.02 } : undefined}
      transition={reduceMotion ? { duration: 0 } : SPRING_SNAPPY}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

/**
 * A single shared "pill" background that slides/resizes between sibling
 * buttons in a segmented control (SignalCategoryFilter's chips, any
 * future tab-like row) — Motion's `layoutId` tracks this one span across
 * re-renders and animates its position/size automatically as `active`
 * moves from one caller to the next, instead of each button owning its
 * own independent background color transition. Render one `<ActivePill>`
 * INSIDE whichever button is currently active (conditionally), absolutely
 * positioned by the parent (`className="absolute inset-0 ..."` is applied
 * here; the parent button just needs `position: relative`).
 */
export function ActivePill({ layoutId, className }: { layoutId: string; className?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      layoutId={layoutId}
      className={`absolute inset-0 ${className ?? ''}`}
      transition={reduceMotion ? { duration: 0 } : SPRING_SNAPPY}
    />
  );
}

/**
 * A shared-element wrapper — give the "from" instance and the "to"
 * instance the same `id` and `active={true}`, and Motion morphs
 * position *and size* between them the moment the second one mounts
 * (its own `layout`/FLIP mechanism, no manual measuring). Built for
 * SIGNAL's Story avatar: a ~44px ring-avatar in the Stories row morphing
 * into the ~32px plain avatar in the fullscreen viewer's header.
 *
 * SIGNAL's overlays deliberately never unmount what's underneath (see
 * Signal.tsx's own comment on `pageKey`) — so a plain, always-on
 * `layoutId` would leave BOTH instances mounted at once, which Motion
 * doesn't resolve into a clean morph (undefined behavior, not a crash).
 * `active` is the caller's job to keep mutually exclusive: exactly one
 * of the two current instances should be `active` at a time — set it
 * `false` on whichever one currently has a visible counterpart
 * elsewhere, so Motion always has a single unambiguous owner of `id`.
 * Passing `active={false}` (or reduced motion) renders a plain
 * non-shared wrapper — no morph, no layoutId registered at all.
 */
export function SharedAvatar({
  id,
  active,
  as = 'span',
  className,
  style,
  children,
}: {
  id: string;
  active: boolean;
  /** `'span'` (default) for small inline things like an avatar circle;
   *  `'div'` for a block-level box — a post's image container, which
   *  carries its own `style` (aspect-ratio) and needs real block layout,
   *  not an inline wrapper trying to enclose it. */
  as?: 'span' | 'div';
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const MotionTag = as === 'div' ? motion.div : motion.span;
  return (
    <MotionTag
      layoutId={!reduceMotion && active ? id : undefined}
      className={className}
      style={style}
      transition={TRANSITION_SHARED_ELEMENT}
    >
      {children}
    </MotionTag>
  );
}

/**
 * A bottom sheet with real drag-to-dismiss physics — the Motion-powered
 * evolution of `useSheetDrag` (motion.tsx) for sheets that want velocity-
 * aware release (a fast flick dismisses even short of the distance
 * threshold, matching how a native sheet actually feels) rather than a
 * fixed pixel threshold. `useSheetDrag` still exists and is still correct
 * for every sheet already built on it — this isn't a required migration,
 * just the better primitive for new bottom sheets going forward.
 *
 * The drag gesture is deliberately scoped to the small handle bar this
 * component renders itself (via `useDragControls`), never the whole
 * panel — `children` (which may itself scroll, e.g. a long list) is never
 * fought over touches the way attaching `drag` to the whole sheet would.
 *
 * `open`/`onClose` mirror `useSheetDrag`'s own contract (`onClose` is a
 * *request* to close — from a backdrop tap or a released drag past the
 * threshold — not a notice that it already has), so the same
 * `{open && <Sheet/>}` mount pattern most existing sheets already use
 * still works here unchanged. The one difference: since Motion needs the
 * component to stay mounted for the length of its own exit animation
 * (`AnimatePresence` handles that internally, but only for content
 * *inside* this component — it can't animate its own removal from the
 * caller's tree), a caller whose `open` is itself driven by conditional
 * mounting (rather than a real boolean prop staying mounted) should keep
 * a short local `closing` flag exactly like `useSheetDrag` already does,
 * and use `onExitComplete` to fire the real unmount once the slide-down
 * has actually finished rather than a fixed `setTimeout` guess.
 */
export function MotionSheet({
  open,
  onClose,
  onExitComplete = onClose,
  children,
  panelClassName = 'w-full rounded-t-2xl bg-surface sm:max-w-md sm:rounded-2xl',
}: {
  open: boolean;
  onClose: () => void;
  /** Fires once the exit animation has genuinely finished playing —
   *  defaults to `onClose` (fine for a caller that stays mounted and
   *  just toggles `open`). */
  onExitComplete?: () => void;
  children: ReactNode;
  panelClassName?: string;
}) {
  const reduceMotion = useReducedMotion();
  const dragControls = useDragControls();

  // Locks the page behind the sheet — same convention App.tsx's own
  // `useSplash` already established for a full-screen overlay. Without
  // this, content taller than the viewport underneath a `fixed` sheet can
  // still be dragged/scrolled on touch (iOS in particular lets a touch
  // that starts over a fixed element scroll the page behind it), and a
  // mobile keyboard opening while an input inside the sheet is focused
  // can shift the background layout — locking `overflow` on `<body>`
  // for exactly as long as the sheet is open rules both out.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <AnimatePresence onExitComplete={onExitComplete}>
      {open && (
        <motion.div
          className="fixed inset-0 z-[300] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center"
          role="dialog"
          aria-modal="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : DUR.page }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            className={`flex max-h-[88vh] flex-col overflow-hidden ${panelClassName}`}
            initial={{ y: reduceMotion ? 0 : '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={reduceMotion ? { duration: 0 } : SPRING_SMOOTH}
            drag={reduceMotion ? false : 'y'}
            dragListener={false}
            dragControls={dragControls}
            dragDirectionLock
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_e, info) => {
              if (info.velocity.y > 500 || info.offset.y > 120) onClose();
            }}
          >
            {!reduceMotion && (
              <div
                onPointerDown={(e) => dragControls.start(e)}
                className="flex shrink-0 cursor-grab touch-none flex-col items-center pt-2 active:cursor-grabbing sm:hidden"
              >
                <span className="h-1 w-9 rounded-full bg-line" aria-hidden="true" />
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * "Hide, don't unmount" for an overlay whose own local state (a Story's
 * current slide, a search query and its results, scroll position) would
 * be lost if opening something on top of it (a profile) forced it to
 * unmount. Originally solved once inline for SignalStoryViewer's own
 * Story -> Profile -> Story flow; factored out here so every overlay in
 * SIGNAL that opens a profile on top of itself gets the same "come back
 * to exactly where you were" behavior for free, not a copy of the same
 * state machine per file.
 *
 * Usage: call `hideForNavigation()` in the same handler that navigates
 * to the nested overlay (right before, or via a `<Link>`'s own `onClick`
 * — either works, since this only needs to run before the route
 * commits). Pass the CURRENT `pathname` (from the caller's own
 * `useLocation()`) on every render. Check `hidden` and `return null`
 * early in the caller's render while it's true.
 *
 * The two-phase guard (`hasLeftRef`) exists because `navigate()` and the
 * `hideForNavigation` state update don't always land in the same render
 * — without it, an effect run that still sees the OLD pathname would
 * look identical to "we're back" and instantly undo the hide.
 */
export function useHideForNavigation(pathname: string) {
  const [hidden, setHidden] = useState(false);
  const resumePathnameRef = useRef(pathname);
  const hasLeftRef = useRef(false);

  useEffect(() => {
    if (!hidden) return;
    if (pathname !== resumePathnameRef.current) {
      hasLeftRef.current = true;
      return;
    }
    if (hasLeftRef.current) setHidden(false);
  }, [pathname, hidden]);

  const hideForNavigation = () => {
    resumePathnameRef.current = pathname;
    hasLeftRef.current = false;
    setHidden(true);
  };

  return { hidden, hideForNavigation };
}
