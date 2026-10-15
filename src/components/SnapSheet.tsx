import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { animate, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { motion } from './motionKit';
import { Icon } from './Icon';
import { useLocale } from '../lib/i18n';

/**
 * A bottom sheet with snap points (half, then almost full): it follows the finger by its handle and header,
 * lets go on the nearest height (a quick flick goes further), and closes when pulled well below the lowest one.
 * Dragging is never the only way: a tap on the handle switches between the heights, the arrow keys do the same,
 * Escape and the ✕ close it.
 */
export function SnapSheet({
  open,
  onClose,
  title,
  footer,
  children,
  snaps = [0.56, 0.9],
  labelledBy = 'snap-sheet-title',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  footer?: ReactNode;
  children: ReactNode;
  /** visible heights as fractions of the screen, lowest first */
  snaps?: number[];
  labelledBy?: string;
}) {
  const { t } = useLocale();
  const reduced = useReducedMotion() === true;
  const h = useMotionValue(0);
  const dim = useTransform(h, (v) => Math.min(0.5, (v / Math.max(1, window.innerHeight * 0.9)) * 0.5));
  const px = useCallback(() => snaps.map((f) => Math.round(window.innerHeight * f)), [snaps]);
  const idx = useRef(0);
  const drag = useRef<{ y: number; h: number; t: number; v: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const goTo = useCallback((target: number, then?: () => void) => {
    if (reduced) { h.set(target); then?.(); return; }
    animate(h, target, { type: 'spring', stiffness: 360, damping: 38, mass: 0.9, onComplete: then });
  }, [h, reduced]);

  const close = useCallback(() => goTo(0, () => onCloseRef.current()), [goTo]);

  // open: rise to the lowest height; lock the page behind (pin the body, give the scroll position back after)
  useEffect(() => {
    if (!open) return;
    idx.current = 0;
    h.set(0);
    goTo(px()[0]);
    const y = window.scrollY;
    const bs = document.body.style;
    const prev = { overflow: bs.overflow, position: bs.position, top: bs.top, width: bs.width };
    bs.overflow = 'hidden';
    bs.position = 'fixed';
    bs.top = `-${y}px`;
    bs.width = '100%';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      bs.overflow = prev.overflow;
      bs.position = prev.position;
      bs.top = prev.top;
      bs.width = prev.width;
      if (!prev.position) {
        const root = document.documentElement;
        const behavior = root.style.scrollBehavior;
        root.style.scrollBehavior = 'auto';
        window.scrollTo(0, y);
        root.style.scrollBehavior = behavior;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cycle = (dir: 1 | -1 | 0) => {
    const p = px();
    const next = dir === 0 ? (idx.current + 1) % p.length : Math.min(p.length - 1, Math.max(0, idx.current + dir));
    idx.current = next;
    goTo(p[next]);
  };

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, h: h.get(), t: performance.now(), v: 0 };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const max = px()[px().length - 1];
    const next = Math.min(max + 24, Math.max(0, d.h + (d.y - e.clientY)));
    const now = performance.now();
    d.v = ((h.get() - next) / Math.max(1, now - d.t)) * -1; // px per ms, + is upwards
    d.t = now;
    h.set(next);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const p = px();
    const moved = Math.abs(h.get() - d.h) > 6;
    if (!moved) return;
    const projected = h.get() + d.v * 140;
    if (projected < p[0] * 0.62) { close(); return; }
    let best = 0;
    p.forEach((v, i) => { if (Math.abs(v - projected) < Math.abs(p[best] - projected)) best = i; });
    idx.current = best;
    goTo(p[best]);
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[300]" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <motion.button
        type="button"
        aria-label={t('Close')}
        onClick={close}
        style={{ opacity: dim }}
        className="absolute inset-0 h-full w-full cursor-default bg-black"
      />
      <motion.div
        style={{ height: h }}
        className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-[0_-20px_50px_-20px_rgba(0,0,0,0.55)]"
      >
        <div
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="shrink-0 touch-none select-none"
        >
          <button
            type="button"
            data-no-drag
            aria-label={t('Resize')}
            onClick={() => cycle(0)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') { e.preventDefault(); cycle(1); }
              if (e.key === 'ArrowDown') { e.preventDefault(); cycle(-1); }
            }}
            className="mx-auto flex h-7 w-24 items-center justify-center"
          >
            <span className="h-1 w-10 rounded-full bg-line-strong" />
          </button>
          <div className="flex items-center justify-between border-b border-line px-5 pb-3">
            <h2 id={labelledBy} className="font-display text-lg font-semibold text-ink">{title}</h2>
            <button
              type="button"
              data-no-drag
              onClick={close}
              aria-label={t('Close')}
              className="grid h-11 w-11 place-items-center rounded-full hover:bg-panel active:bg-panel"
            >
              <Icon name="x" size={20} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3">{children}</div>
        {footer && <div className="shrink-0 border-t border-line p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">{footer}</div>}
      </motion.div>
    </div>,
    document.body,
  );
}
