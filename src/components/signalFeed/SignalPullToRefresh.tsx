import { useRef, useState, type ReactNode } from 'react';
import { CxsLogo } from '../CxsLogo';

const PULL_THRESHOLD = 64; // px of (resisted) pull before releasing triggers a refresh
const MAX_PULL = 96; // px — the indicator never grows past this, however far the finger travels
const RESISTANCE = 0.5; // rubber-band feel: the indicator moves slower than the finger
const SETTLE_HEIGHT = 56; // px the indicator holds at while actually refreshing

/** Pull-to-refresh for SIGNAL's feed (Official and Community both — this
 *  wraps whatever `children` the page passes, so mounting it once in
 *  Signal.tsx covers both spaces). The one visual idea: cxs.png's "S" —
 *  SIGNAL's own nav mark, not a generic spinner — rotates with the pull
 *  itself (1:1 with the finger, no CSS animation involved yet) and only
 *  switches to a continuous spin once released past the threshold,
 *  settling at a fixed height until the refresh promise resolves.
 *
 *  Only engages when the page is already scrolled to the very top and
 *  the drag is downward — anything else (scrolling, tapping a button, a
 *  post's own horizontal interactions) never sets `dragging`, so this
 *  never competes with them. Deliberately does not call
 *  `preventDefault()` on the touch move (React's synthetic touch
 *  handlers are passive by default, and doing this properly needs a
 *  manual non-passive listener) — on iOS this means the browser's own
 *  rubber-band bounce can show alongside this indicator while pulling,
 *  a minor visual overlap rather than a broken interaction, not worth
 *  the extra native-listener plumbing for. */
export function SignalPullToRefresh({ onRefresh, children }: { onRefresh: () => void | Promise<void>; children: ReactNode }) {
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const movedRef = useRef(false);

  const runRefresh = async () => {
    setRefreshing(true);
    setDragging(false);
    setPull(SETTLE_HEIGHT);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setPull(0);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (refreshing || window.scrollY > 0) {
      startYRef.current = null;
      return;
    }
    startYRef.current = e.touches[0].clientY;
    movedRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startYRef.current === null || refreshing) return;
    if (window.scrollY > 0) {
      // scrolled away from the top mid-gesture — abandon the pull
      startYRef.current = null;
      setDragging(false);
      setPull(0);
      return;
    }
    const dy = e.touches[0].clientY - startYRef.current;
    if (dy <= 0) return;
    movedRef.current = true;
    setDragging(true);
    setPull(Math.min(MAX_PULL, dy * RESISTANCE));
  };

  const handleTouchEnd = () => {
    startYRef.current = null;
    if (!movedRef.current) return;
    movedRef.current = false;
    setDragging(false);
    if (pull >= PULL_THRESHOLD) {
      void runRefresh();
    } else {
      setPull(0);
    }
  };

  return (
    <div onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <div
        aria-hidden={!refreshing}
        className="flex items-center justify-center overflow-hidden"
        style={{
          height: pull,
          transition: dragging ? 'none' : `height 320ms var(--ease-out-expo)`,
        }}
      >
        <button
          onClick={() => { if (!refreshing) void runRefresh(); }}
          aria-label="Refresh"
          className="grid place-items-center rounded-full p-2 transition-opacity"
          style={{ opacity: refreshing ? 1 : Math.min(1, pull / PULL_THRESHOLD) }}
        >
          <span
            className={refreshing ? 'animate-signal-refresh-spin' : undefined}
            style={{
              display: 'inline-block',
              // While actively pulling (not yet released), the S rotates
              // 1:1 with the finger instead of running the CSS keyframe —
              // direct manipulation feels more responsive than a canned
              // animation for this part, same reasoning the Story
              // viewer's own swipe-to-close drag already uses.
              transform: !refreshing ? `rotate(${pull * 3}deg)` : undefined,
            }}
          >
            <CxsLogo size={26} />
          </span>
        </button>
      </div>
      {children}
    </div>
  );
}
