import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { haptics } from '../lib/native';

const PULL_THRESHOLD = 64; // px of (resisted) pull before releasing refreshes
const MAX_PULL = 96;
const RESISTANCE = 0.5; // the bat moves slower than the finger
const MIN_REFRESH_MS = 800; // the bat always gets a few wing-beats
const BAT_W = 64;

/** Anything that owns its own touch gestures, or that a refresh would wreck. */
const NO_PULL_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [data-no-pull], canvas, video, .maplibregl-map, [role="dialog"]';

/** A pull that starts on content that can still scroll up belongs to that
 *  content, not to refresh. */
function insideScrolledContainer(start: Element | null): boolean {
  for (let el = start; el && el !== document.body; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1 && el.scrollTop > 0) return true;
  }
  return false;
}

/** The site-wide pull-to-refresh: pull down from the top of a page and a black
 *  bat hangs from a thread under your finger; let go and it flaps its wings
 *  while the page reloads its data, then flies up and away behind the header.
 *
 *  It listens on the whole document, only starts for a downward, mostly
 *  vertical drag that begins at the very top of the page (and of whatever
 *  scrollable area the finger is on), and stays out of the way of inputs,
 *  maps, dialogs, videos and anything marked `data-no-pull`. While a pull is
 *  in progress the browser's own rubber-band is cancelled so the page doesn't
 *  bounce under the bat. `enabled` turns it off per route. */
export function BatPullToRefresh({ onRefresh, enabled }: { onRefresh: () => void | Promise<void>; enabled: boolean }) {
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;
    const st = { x: 0, y: 0, active: false, committed: false, pull: 0, busy: false, armed: false };

    const onStart = (e: TouchEvent) => {
      st.active = false;
      st.committed = false;
      if (st.busy || e.touches.length !== 1) return;
      const target = e.target instanceof Element ? e.target : null;
      if ((document.scrollingElement?.scrollTop ?? window.scrollY) > 0) return;
      if (target?.closest(NO_PULL_SELECTOR)) return;
      if (insideScrolledContainer(target)) return;
      st.x = e.touches[0].clientX;
      st.y = e.touches[0].clientY;
      st.active = true;
      st.armed = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!st.active || st.busy) return;
      const dy = e.touches[0].clientY - st.y;
      const dx = e.touches[0].clientX - st.x;
      if (!st.committed) {
        if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
        if (dy <= 0 || Math.abs(dx) > dy * 0.7) {
          st.active = false;
          return;
        }
        st.committed = true;
        setDragging(true);
      }
      if ((document.scrollingElement?.scrollTop ?? window.scrollY) > 0) {
        st.active = false;
        st.committed = false;
        st.pull = 0;
        setDragging(false);
        setPull(0);
        return;
      }
      if (e.cancelable) e.preventDefault(); // no page bounce under the bat
      const next = Math.min(MAX_PULL, dy * RESISTANCE);
      st.pull = next;
      setPull(next);
      const armed = next >= PULL_THRESHOLD;
      if (armed && !st.armed) haptics.tick();
      st.armed = armed;
    };

    const finish = async () => {
      st.busy = true;
      setDragging(false);
      setRefreshing(true);
      setPull(52);
      const started = performance.now();
      try {
        await refresh.current();
      } finally {
        const rest = Math.max(0, MIN_REFRESH_MS - (performance.now() - started));
        window.setTimeout(() => {
          setLeaving(true);
          window.setTimeout(() => {
            setRefreshing(false);
            setLeaving(false);
            setPull(0);
            st.pull = 0;
            st.busy = false;
          }, 560);
        }, rest);
      }
    };

    const onEnd = () => {
      if (!st.active || !st.committed) {
        st.active = false;
        return;
      }
      st.active = false;
      st.committed = false;
      if (st.pull >= PULL_THRESHOLD) void finish();
      else {
        setDragging(false);
        setPull(0);
        st.pull = 0;
      }
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled]);

  if (!enabled || (pull === 0 && !refreshing && !dragging)) return null;

  const progress = Math.min(1, pull / PULL_THRESHOLD);
  const y = Math.max(0, pull - 30);
  const batStyle: CSSProperties = leaving
    ? { top: -70, opacity: 0, transform: 'translateX(-50%) scale(0.55)', transition: 'top 520ms cubic-bezier(0.5, 0, 0.8, 0.2), opacity 420ms ease-in 100ms, transform 520ms ease-in' }
    : {
        top: y,
        opacity: refreshing ? 1 : Math.min(1, pull / 24),
        transform: `translateX(-50%) scale(${refreshing ? 1 : 0.62 + 0.38 * progress}) rotate(${refreshing ? 0 : (progress - 0.5) * 6}deg)`,
        transition: dragging ? 'none' : 'top 320ms var(--ease-out-expo), opacity 200ms, transform 320ms var(--ease-out-expo)',
      };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 z-40"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 60px)' }}
    >
      {dragging && pull > 4 && <span className="absolute left-1/2 top-0 w-px -translate-x-1/2 bg-ink/25" style={{ height: y + 4 }} />}
      <span className="absolute left-1/2 block" style={{ width: BAT_W, ...batStyle }}>
        <img src="/brand/cx-bat.webp" alt="" draggable={false} className={`block w-full select-none ${refreshing && !leaving ? 'bat-flap' : ''}`} />
      </span>
    </div>
  );
}
