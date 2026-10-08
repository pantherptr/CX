import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { haptics } from '../../lib/native';

const PULL_THRESHOLD = 64; // px of (resisted) pull before releasing triggers a refresh
const MAX_PULL = 92; // the indicator never grows past this, however far the finger travels
const RESISTANCE = 0.5; // rubber-band feel: the indicator moves slower than the finger
const SETTLE_HEIGHT = 56; // px the indicator holds at while refreshing
const MIN_REFRESH_MS = 700; // so a fast refresh doesn't flash the indicator away

/** Pull-to-refresh for SIGNAL's feed, with the black bat: it hangs from a thin
 *  thread and follows your finger down; past the threshold you feel a tick,
 *  and on release the thread lets go and the bat flaps its wings while the
 *  feed refreshes — then it flies up and away behind the header.
 *
 *  The touch handlers are real, non-passive listeners: while a pull that
 *  started at the very top is in progress the browser's own overscroll /
 *  rubber-band is cancelled (`preventDefault`), so the page doesn't bounce
 *  and drag the indicator along with it. Anything that isn't a downward drag
 *  from the top is left completely alone. */
export function SignalPullToRefresh({ onRefresh, children }: { onRefresh: () => void | Promise<void>; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [leaving, setLeaving] = useState(false);
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
          st.pull = 0;
          setLeaving(true);
          setPull(0);
          // let the flight finish before the next pull can start
          window.setTimeout(() => {
            st.refreshing = false;
            setRefreshing(false);
            setLeaving(false);
          }, 560);
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

  const progress = Math.min(1, pull / PULL_THRESHOLD);
  const BAT_W = 68;
  // The bat hangs at the bottom edge of the pull zone, so it follows the
  // finger down. Released and refreshing, it flaps in place; once done it
  // flies up and out behind the header.
  const batY = Math.max(0, pull - 30);
  const flying = leaving;
  const batStyle: CSSProperties = flying
    ? { top: -60, opacity: 0, transform: `translateX(-50%) scale(0.55) rotate(0deg)`, transition: 'top 520ms cubic-bezier(0.5, 0, 0.8, 0.2), opacity 420ms ease-in 100ms, transform 520ms ease-in' }
    : {
        top: batY,
        opacity: refreshing ? 1 : Math.min(1, pull / 24),
        transform: `translateX(-50%) scale(${refreshing ? 1 : 0.62 + 0.38 * progress}) rotate(${refreshing ? 0 : (progress - 0.5) * 6}deg)`,
        transition: dragging ? 'none' : 'top 320ms var(--ease-out-expo), opacity 200ms, transform 320ms var(--ease-out-expo)',
      };

  return (
    <div ref={rootRef}>
      <div
        aria-hidden={!refreshing}
        className="relative z-0"
        style={{ height: flying ? 0 : pull, transition: dragging ? 'none' : `height ${flying ? 520 : 320}ms var(--ease-out-expo)` }}
      >
        {/* the thread the bat hangs from — only while a finger holds it */}
        {dragging && pull > 4 && (
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-0 w-px -translate-x-1/2 bg-ink/25"
            style={{ height: Math.max(0, batY + 4) }}
          />
        )}
        <span className="absolute left-1/2 block" style={{ width: BAT_W, ...batStyle }}>
          <img
            src="/brand/cx-bat.webp"
            alt=""
            draggable={false}
            className={`block w-full select-none ${refreshing && !flying ? 'bat-flap' : ''}`}
          />
        </span>
      </div>
      {children}
    </div>
  );
}
