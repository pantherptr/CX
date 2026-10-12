import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { IS_APP } from '../lib/appMode';
import { haptics } from '../lib/native';

const EDGE = 22; // px from the left edge where a back-swipe may begin
const COMMIT = 80; // px of travel that goes back
const BLOCK =
  '[data-no-pull], [data-no-edge-back], [role="dialog"], input, textarea, select, canvas, video, .maplibregl-map, [contenteditable="true"]';

/** iOS-style back swipe for the installed app (Home Screen / `?app=1`), where Safari's own edge swipe does
 *  not exist: drag from the left edge and a round chevron follows the finger; past the threshold it ticks,
 *  and letting go goes back one page. Stays out of dialogs, fields, maps, videos and anything marked
 *  `data-no-edge-back` (the chat thread and Reels have their own gestures). Not used inside the native
 *  Capacitor shell, whose web view owns that gesture. */
export function EdgeSwipeBack() {
  const navigate = useNavigate();
  const nav = useRef(navigate);
  nav.current = navigate;
  const bubble = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!IS_APP || Capacitor.isNativePlatform()) return;
    const st = { x: 0, y: 0, active: false, armed: false };
    const show = (dx: number) => {
      const el = bubble.current;
      if (!el) return;
      const p = Math.min(1, Math.max(0, dx / COMMIT));
      el.style.opacity = String(p ? 0.35 + p * 0.65 : 0);
      el.style.transform = `translate(${Math.min(dx, 120) * 0.55 - 36}px, -50%) scale(${0.7 + p * 0.3})`;
      el.dataset.armed = p >= 1 ? '1' : '';
    };
    const hide = () => {
      const el = bubble.current;
      if (!el) return;
      el.style.transition = 'opacity 180ms ease, transform 220ms cubic-bezier(.2,.8,.2,1)';
      el.style.opacity = '0';
      el.style.transform = 'translate(-36px, -50%) scale(0.7)';
      window.setTimeout(() => { if (el) el.style.transition = 'none'; }, 240);
    };
    const onStart = (e: TouchEvent) => {
      st.active = false;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const target = e.target instanceof Element ? e.target : null;
      if (t.clientX > EDGE || target?.closest(BLOCK)) return;
      if ((window.history.state as { idx?: number } | null)?.idx === 0) return; // nothing to go back to
      st.x = t.clientX;
      st.y = t.clientY;
      st.active = true;
      st.armed = false;
    };
    const onMove = (e: TouchEvent) => {
      if (!st.active) return;
      const t = e.touches[0];
      const dx = t.clientX - st.x;
      const dy = Math.abs(t.clientY - st.y);
      if (dy > 70 && dy > dx) { st.active = false; hide(); return; }
      if (dx <= 6) return;
      show(dx);
      if (dx >= COMMIT && !st.armed) { st.armed = true; haptics.tick(); }
      if (dx < COMMIT) st.armed = false;
    };
    const onEnd = () => {
      if (!st.active) return;
      st.active = false;
      const go = st.armed;
      st.armed = false;
      hide();
      if (go) nav.current(-1);
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  if (!IS_APP || Capacitor.isNativePlatform()) return null;
  return (
    <div
      ref={bubble}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-1/2 z-[300] grid h-10 w-10 place-items-center rounded-full bg-ink text-white shadow-lg data-[armed='1']:bg-accent"
      style={{ opacity: 0, transform: 'translate(-36px, -50%) scale(0.7)' }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
    </div>
  );
}
