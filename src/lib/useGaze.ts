import { useEffect, type RefObject } from 'react';

// One shared pointer + idle-gaze driver for every pair of eyes on the page.
type Gaze = { x: number; y: number };
const listeners = new Set<(g: Gaze | null) => void>();
let pointer: { x: number; y: number } | null = null;
let idleTimer = 0;
let started = false;

function startDriver() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const onMove = (x: number, y: number) => {
    pointer = { x, y };
    window.clearTimeout(idleTimer);
    listeners.forEach((l) => l(null));
    idleTimer = window.setTimeout(wander, 3500);
  };
  const wander = () => {
    pointer = null;
    const g = { x: Math.random() * 2 - 1, y: Math.random() * 1.4 - 0.7 };
    listeners.forEach((l) => l(g));
    idleTimer = window.setTimeout(wander, 1400 + Math.random() * 2200);
  };
  window.addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY), { passive: true });
  window.addEventListener('pointerdown', (e) => onMove(e.clientX, e.clientY), { passive: true });
  window.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) onMove(t.clientX, t.clientY); }, { passive: true });
  idleTimer = window.setTimeout(wander, 1200);
}


/** Makes the pupils inside `pupils` follow the pointer (or wander when nobody is around). `root` is the logo. */
export function useGaze(root: RefObject<HTMLElement | null>, pupils: RefObject<SVGGElement | null>, reach = { x: 2.1, y: 1.7 }) {
  useEffect(() => {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    startDriver();
    const move = (g: Gaze) => {
      const el = pupils.current;
      if (el) el.style.transform = `translate(${(g.x * reach.x).toFixed(2)}px, ${(g.y * reach.y).toFixed(2)}px)`;
    };
    const onGaze = (idle: Gaze | null) => {
      if (idle) { move(idle); return; }
      const r = root.current?.getBoundingClientRect();
      if (!r || !pointer) return;
      const dx = pointer.x - (r.left + r.width / 2);
      const dy = pointer.y - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 120);
      move({ x: (dx / d) * k, y: (dy / d) * k });
    };
    listeners.add(onGaze);
    onGaze(null);
    const onMoveHere = () => onGaze(null);
    window.addEventListener('pointermove', onMoveHere, { passive: true });
    return () => {
      listeners.delete(onGaze);
      window.removeEventListener('pointermove', onMoveHere);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
