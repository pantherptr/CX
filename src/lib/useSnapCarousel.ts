import { useCallback, useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react';
import type { KeyboardEvent as ReactKeyboardEvent, UIEvent as ReactUIEvent } from 'react';

/**
 * Snap carousel physics (after 21st.dev "Snap Carousel"): drag with a little elasticity, a flick moves at most
 * `maxFlick` slides, springs settle on the slide, the first/last slide bounce off a wall, arrow keys / Home / End work.
 * Headless: the caller renders the track (`motion.div {...trackProps}`) and its own page control.
 */
const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
const WALL = { type: 'spring', stiffness: 700, damping: 30, mass: 0.5 } as const;
const WALL_IMPULSE = 900;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

type DragInfo = { offset: { x: number; y: number }; velocity: { x: number; y: number } };

export function useSnapCarousel({
  count,
  defaultIndex = 0,
  onIndexChange,
  gap = 0,
  momentum = 0.14,
  maxFlick = 1,
  disabled = false,
}: {
  count: number;
  defaultIndex?: number;
  onIndexChange?: (index: number) => void;
  gap?: number;
  momentum?: number;
  maxFlick?: number;
  disabled?: boolean;
}) {
  const total = Math.max(1, Math.floor(count));
  const [index, setIndex] = useState(() => clamp(defaultIndex, 0, total - 1));
  const [slideWidth, setSlideWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [target, setTarget] = useState(index);
  const step = slideWidth + gap;

  const viewportRef = useRef<HTMLDivElement>(null);
  const anim = useRef<{ stop: () => void } | null>(null);
  const lastStep = useRef(0);
  const live = useRef(index);
  live.current = index;
  const metrics = useRef({ step, total, momentum, maxFlick });
  metrics.current = { step, total, momentum, maxFlick };
  const changed = useRef(onIndexChange);
  changed.current = onIndexChange;

  const x = useMotionValue(0);
  const reduced = useReducedMotion();

  const glide = useCallback(
    (to: number, velocity = 0) => {
      anim.current?.stop();
      anim.current = animate(x, to, reduced ? { duration: 0 } : { ...CROSSFADE, velocity });
    },
    [x, reduced],
  );

  const goTo = useCallback(
    (next: number, velocity = 0) => {
      const shelf = metrics.current;
      const to = clamp(Math.round(next), 0, shelf.total - 1);
      setTarget(to);
      if (to !== live.current) {
        live.current = to;
        setIndex(to);
        changed.current?.(to);
      }
      glide(-to * shelf.step, velocity);
    },
    [glide],
  );

  const bounce = useCallback(
    (dir: 1 | -1) => {
      const to = -live.current * metrics.current.step;
      anim.current?.stop();
      anim.current = animate(x, to, reduced ? { duration: 0 } : { ...WALL, velocity: -dir * WALL_IMPULSE });
    },
    [x, reduced],
  );

  const move = useCallback(
    (dir: 1 | -1) => {
      const to = live.current + dir;
      if (to < 0 || to > metrics.current.total - 1) bounce(dir);
      else goTo(to);
    },
    [bounce, goTo],
  );

  const next = useCallback(() => move(1), [move]);
  const prev = useCallback(() => move(-1), [move]);

  const pick = useCallback(
    (velocity: number) => {
      const m = metrics.current;
      if (m.step === 0) return live.current;
      const at = -x.get() / m.step;
      const anchor = clamp(Math.round(at), 0, m.total - 1);
      const projected = at - (velocity * m.momentum) / m.step;
      return clamp(clamp(Math.round(projected), anchor - m.maxFlick, anchor + m.maxFlick), 0, m.total - 1);
    },
    [x],
  );

  // the slide width = the viewport width; re-measure whenever it changes
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setSlideWidth((cur) => (Math.abs(cur - w) < 0.5 ? cur : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // keep the track on the current slide when the width changes (rotation, resize)
  useEffect(() => {
    if (step === 0) return;
    if (lastStep.current !== step) {
      lastStep.current = step;
      anim.current?.stop();
      x.set(-index * step);
    }
  }, [index, step, x]);

  useEffect(() => () => anim.current?.stop(), []);

  const onDragStart = useCallback(() => {
    anim.current?.stop();
    setDragging(true);
    setTarget(live.current);
  }, []);
  const onDrag = useCallback(
    (_e: unknown, info: DragInfo) => {
      const to = pick(info.velocity.x);
      setTarget((cur) => (cur === to ? cur : to));
    },
    [pick],
  );
  const onDragEnd = useCallback(
    (_e: unknown, info: DragInfo) => {
      setDragging(false);
      goTo(pick(info.velocity.x), info.velocity.x);
    },
    [goTo, pick],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
      else if (e.key === 'End') { e.preventDefault(); goTo(metrics.current.total - 1); }
    },
    [goTo, next, prev],
  );

  // a focused/overflow viewport must never scroll by itself — the track is moved by `x`
  const onScroll = useCallback((e: ReactUIEvent<HTMLElement>) => {
    e.currentTarget.scrollLeft = 0;
    e.currentTarget.scrollTop = 0;
  }, []);

  return {
    index,
    count: total,
    shown: dragging ? target : index,
    dragging,
    goTo,
    next,
    prev,
    viewportRef,
    viewportProps: { tabIndex: 0, role: 'group' as const, 'aria-roledescription': 'carousel', onKeyDown, onScroll },
    trackProps: {
      drag: (disabled || total < 2 ? false : 'x') as false | 'x',
      dragDirectionLock: true,
      dragMomentum: false,
      dragElastic: 0.14,
      dragConstraints: { left: -(total - 1) * step, right: 0 },
      onDragStart,
      onDrag,
      onDragEnd,
      style: { x, gap: `${gap}px`, touchAction: 'pan-y' as const },
    },
  };
}

export { motion };
