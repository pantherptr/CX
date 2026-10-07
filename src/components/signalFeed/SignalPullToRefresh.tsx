import { useEffect, useRef, useState, type ReactNode } from 'react';
import { haptics } from '../../lib/native';

const PULL_THRESHOLD = 64; // px of (resisted) pull before releasing triggers a refresh
const MAX_PULL = 92; // the indicator never grows past this, however far the finger travels
const RESISTANCE = 0.5; // rubber-band feel: the indicator moves slower than the finger
const SETTLE_HEIGHT = 56; // px the indicator holds at while refreshing
const MIN_REFRESH_MS = 700; // so a fast refresh doesn't flash the indicator away
const RING_R = 16;
const RING_C = 2 * Math.PI * RING_R;

/** Pull-to-refresh for SIGNAL's feed. The indicator is the SIGNAL "S" inside a
 *  ring that fills as you pull; past the threshold it ticks (haptic), and on
 *  release the ring spins until the refresh is done.
 *
 *  The touch handlers are real, non-passive listeners: while a pull that
 *  started at the very top is in progress the browser's own overscroll /
 *  rubber-band is cancelled (`preventDefault`), so the page doesn't bounce
 *  and drag the indicator along with it — that double motion was what made
 *  the old version feel broken inside the iOS app. Anything that isn't a
 *  downward drag from the top is left completely alone. */
export function SignalPullToRefresh({ onRefresh, children }: { onRefresh: () => void | Promise<void>; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const stateRef = useRef({ startY: null as number | null, pull: 0, refreshing: false, armed: false });
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const st = stateRef.current;

    const atTop = () => window.scrollY <= 0;

    const runRefresh = async () => {
      st.refreshing = true;
      setRefreshing(true);
      setDragging(false);
      setPull(SETTLE_HEIGHT);
      st.pull = SETTLE_HEIGHT;
      const started = performance.now();
      try {
        await onRefreshRef.current();
      } finally {
        const rest = Math.max(0, MIN_REFRESH_MS - (performance.now() - started));
        window.setTimeout(() => {
          st.refreshing = false;
          st.pull = 0;
          setRefreshing(false);
          setPull(0);
        }, rest);
      }
    };

    const onStart = (e: TouchEvent) => {
      if (st.refreshing || !atTop()) {
        st.startY = null;
        return;
      }
      st.startY = e.touches[0].clientY;
      st.armed = false;
    };

    const onMove = (e: TouchEvent) => {
      if (st.startY === null || st.refreshing) return;
      if (!atTop()) {
        st.startY = null;
        setDragging(false);
        setPull(0);
        st.pull = 0;
        return;
      }
      const dy = e.touches[0].clientY - st.startY;
      if (dy <= 0) return;
      if (e.cancelable) e.preventDefault(); // no page bounce while pulling
      const next = Math.min(MAX_PULL, dy * RESISTANCE);
      st.pull = next;
      setDragging(true);
      setPull(next);
      const armed = next >= PULL_THRESHOLD;
      if (armed && !st.armed) haptics.tick();
      st.armed = armed;
    };

    const onEnd = () => {
      if (st.startY === null) return;
      st.startY = null;
      setDragging(false);
      if (st.pull >= PULL_THRESHOLD) void runRefresh();
      else {
        st.pull = 0;
        setPull(0);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const progress = refreshing ? 0.28 : Math.min(1, pull / PULL_THRESHOLD);

  return (
    <div ref={rootRef}>
      <div
        aria-hidden={!refreshing}
        className="flex items-center justify-center overflow-hidden"
        style={{ height: pull, transition: dragging ? 'none' : 'height 320ms var(--ease-out-expo)' }}
      >
        <div
          className="relative grid h-10 w-10 place-items-center rounded-full bg-surface shadow-soft ring-1 ring-line"
          style={{ opacity: refreshing ? 1 : Math.min(1, pull / 28), transform: `scale(${refreshing ? 1 : 0.7 + 0.3 * progress})` }}
        >
          <svg
            className={`absolute inset-0 -rotate-90 ${refreshing ? 'animate-spin' : ''}`}
            style={refreshing ? { animationDuration: '0.9s' } : undefined}
            viewBox="0 0 40 40"
            aria-hidden="true"
          >
            <circle cx="20" cy="20" r={RING_R} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="2.5" />
            <circle
              cx="20" cy="20" r={RING_R} fill="none" stroke="#00d447" strokeWidth="2.5" strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - progress)}
            />
          </svg>
          <img src="/brand/signal-s.webp" alt="" draggable={false} className="relative h-[13px] w-auto select-none" />
        </div>
      </div>
      {children}
    </div>
  );
}
