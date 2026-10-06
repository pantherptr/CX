import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { CxsLogo } from './CxsLogo';
import { useAuth } from '../lib/auth';
import { useMediaQuery } from './motion';
import { useUnreadMessageCount } from '../lib/data/messages';
// The Signal feed's data layer keeps its original `empire*` names — see
// src/lib/data/empireFeed.ts's own header comment for why: it mirrors the
// still-unrenamed backend tables/RPCs 1:1, so relabeling it here would
// describe a rename that never actually happened underneath.
import { useEmpireUnreadCount } from '../lib/data/empireFeed';
import { useViewportBottomGap } from '../lib/useViewportGap';
import { haptics } from '../lib/native';

/** Re-tapping the tab you're already on scrolls that screen back to the
 *  top — the convention every native tab bar follows (and the fastest way
 *  back up a long SIGNAL feed). A fresh tab switch just gets a light tick. */
function onTabClick(e: React.MouseEvent, active: boolean) {
  if (active) {
    e.preventDefault();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    return;
  }
  haptics.tick();
}

interface Item {
  label: string;
  to: string;
  icon: IconName;
  match: (pathname: string, hash: string) => boolean;
}

// Messages sits here rather than Saved Cars — a two-way, time-sensitive
// channel with a real business need (coordinating a pickup) earns a
// primary tab more than a passive wishlist does; Saved Cars is still one
// tap away via Profile's menu, same as My Trips, Rewards and Payments.
const items: Item[] = [
  { label: 'Home', to: '/dashboard', icon: 'grid', match: (p, h) => p === '/dashboard' && h === '' },
  { label: 'Explore', to: '/browse', icon: 'search', match: (p) => p === '/browse' },
  { label: 'Signal', to: '/signal', icon: 'trophy', match: (p) => p === '/signal' },
  { label: 'Messages', to: '/messages', icon: 'message', match: (p) => p === '/messages' },
  { label: 'Profile', to: '/settings', icon: 'user', match: (p) => p === '/settings' },
];

// Signal is the one tab that isn't a normal list item — it's a raised
// section of the bar itself the other four deliberately are not, so its
// index is pulled out once here rather than re-derived inline below.
const SIGNAL_INDEX = items.findIndex((it) => it.label === 'Signal');
const EASE = 'cubic-bezier(0.16,1,0.3,1)';

// Signal's raised section is a real shaped piece of the bar's own surface —
// not an icon floating on a separate blob, and (see below) not a separate
// glass panel floating over the flat bar either. Geometry lives in a
// narrow band centered on Signal's column; everything left/right of it is
// the bar's own untouched flat top edge and border. Deliberately a small
// architectural lift, not a hill — HILL_RISE/HILL_WIDTH_FRACTION were both
// cut roughly in half from an earlier, much taller/wider pass that read as
// an oversized bump rather than an integrated part of the bar.
const HILL_RISE = 18; // px the plateau sits above the bar's flat top edge — just enough for
// the logo (see the Link below) to clear it with a small, deliberate gap, not the large
// clearance a bigger hill needed.
const HILL_WIDTH_FRACTION = 0.24; // 24% of the bar's own width — narrow enough to read as "a
// small bump around the logo", not a shape bulging into the neighboring Explore/Messages columns.
const HILL_LEFT = (1 - HILL_WIDTH_FRACTION) / 2; // 0.38 — centers the bump on the bar
const HILL_RIGHT = HILL_LEFT + HILL_WIDTH_FRACTION; // 0.62
// The four x-breakpoints from the original small-hill curve (0, 0.175,
// 0.265, 0.3275, 0.3875, 0.6125, 0.6725, 0.735, 0.825, 1 — fractions
// *within the bump's own span*) remapped into fractions of the FULL bar
// width, so the exact same curve shape now sits inside one single surface
// instead of a separately-clipped panel. `t` -> `HILL_LEFT + t * HILL_WIDTH_FRACTION`.
const X = {
  left: HILL_LEFT,
  upStart: HILL_LEFT + 0.175 * HILL_WIDTH_FRACTION,
  upCp1: HILL_LEFT + 0.265 * HILL_WIDTH_FRACTION,
  upCp2: HILL_LEFT + 0.3275 * HILL_WIDTH_FRACTION,
  peakStart: HILL_LEFT + 0.3875 * HILL_WIDTH_FRACTION,
  peakEnd: HILL_LEFT + 0.6125 * HILL_WIDTH_FRACTION,
  downCp1: HILL_LEFT + 0.6725 * HILL_WIDTH_FRACTION,
  downCp2: HILL_LEFT + 0.735 * HILL_WIDTH_FRACTION,
  downEnd: HILL_RIGHT,
};
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** The whole bar's one and only background fill — a fully rounded
 *  "stadium" capsule (flat top/bottom, semicircular ends) with the same
 *  smooth S-curve rise over the Signal column cut into its flat top — as a
 *  single objectBoundingBox clip-path on ONE element the full height of
 *  the bar plus `HILL_RISE`. This used to be two separately-clipped
 *  `.glass` panels (the flat bar, and a small independently-blurred hill
 *  panel floating above it): each one individually looked right, but two
 *  distinct backdrop-blur regions never actually compose into one
 *  continuous surface — the hill panel sampled slightly different page
 *  content behind it than the flat bar did, so it rendered visibly
 *  brighter/whiter with a hard seam at its edge, reading as a separate
 *  white button glued on top rather than part of the bar. One shared
 *  element with one shared blur instance can't have that seam by
 *  construction. `flatY`/`rx`/`ry` (the flat top's height fraction and the
 *  end caps' per-axis corner radius fractions) depend on the bar's real
 *  rendered width/height, which vary with the safe-area inset and viewport
 *  width — measured live via `useMeasuredSize` below rather than assumed,
 *  so both the bump's and the end caps' proportions stay correct on every
 *  device instead of guessing fixed numbers. The hill's own curve
 *  (`X.upCp1`…`X.downEnd`) is untouched from the original flat-sided bar —
 *  only the two ends gained rounding either side of it. */
const BEZIER_CIRCLE_K = 0.5522847498; // standard cubic-bezier quarter-circle approximation constant

function buildNavClipPath(flatY: number, rx: number, ry: number): string {
  const f = round4(flatY);
  const k = BEZIER_CIRCLE_K;
  // rx/ry are chosen (see the component body) so the flat side's full
  // height exactly equals 2*ry — i.e. the top and bottom corner arcs at
  // each end meet with no straight segment between them, forming a true
  // semicircular cap rather than a rounded-rectangle corner. midY is that
  // meeting point, equal to both `f + ry` and `1 - ry`.
  const midY = round4(f + ry);
  const rxIn = round4(rx * (1 - k));
  const ryIn = round4(ry * k);
  return (
    `M0,${midY} ` +
    `C0,${round4(midY - ryIn)} ${rxIn},${f} ${round4(rx)},${f} ` +
    `L${round4(X.left)},${f} ` +
    `C${round4(X.upCp1)},${f} ${round4(X.upCp2)},0 ${round4(X.peakStart)},0 ` +
    `L${round4(X.peakEnd)},0 ` +
    `C${round4(X.downCp1)},0 ${round4(X.downCp2)},${f} ${round4(X.downEnd)},${f} ` +
    `L${round4(1 - rx)},${f} ` +
    `C${round4(1 - rxIn)},${f} 1,${round4(midY - ryIn)} 1,${midY} ` +
    `C1,${round4(midY + ryIn)} ${round4(1 - rxIn)},1 ${round4(1 - rx)},1 ` +
    `L${round4(rx)},1 ` +
    `C${rxIn},1 0,${round4(midY + ryIn)} 0,${midY} ` +
    `Z`
  );
}

// The visible rim (stroke) traces the identical curve, scaled ×100 for its
// own 0-100 viewBox — unaffected by the fill's unification above, since it
// was always drawn as its own thin decorative line over the same geometry,
// never the source of the white-panel seam.
const HILL_STROKE_FY = 66.7; // (HILL_RISE / the rim's own fixed 27px box) × 100 — a fixed
// decorative line height independent of the bar's real height, unlike the fill.
const HILL_STROKE_PATH =
  `M0,${HILL_STROKE_FY} L17.5,${HILL_STROKE_FY} C26.5,${HILL_STROKE_FY} 32.75,0 38.75,0 ` +
  `L61.25,0 C67.25,0 73.5,${HILL_STROKE_FY} 82.5,${HILL_STROKE_FY} L100,${HILL_STROKE_FY}`;

/** Measures an element's rendered width+height live (initial mount + any
 *  resize — orientation change, a browser chrome bar showing/hiding,
 *  etc.), used to compute the fill's exact bump and end-cap proportions
 *  above (the end caps' corner radius is a fraction of each axis, so both
 *  dimensions matter, not just height). */
function useMeasuredSize(ref: React.RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ width: r.width, height: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

// Reasonable guesses for the very first paint, before useMeasuredSize's
// ResizeObserver reports the bar's real size — close enough that the
// bump/end-cap proportions never visibly jump once the real measurement
// lands.
const FALLBACK_NAV_HEIGHT = 68;
const FALLBACK_NAV_WIDTH = 360;

// The bar floats as a capsule: inset from both sides and lifted off the
// bottom edge by the home-indicator safe area plus this extra gap, instead
// of docking flush to the screen's bottom with a background bled down
// behind the home indicator. Nothing is painted below the capsule.
const BAR_SIDE_GAP = 12; // px between the capsule and each screen edge
const BAR_BOTTOM_GAP = 12; // px between the capsule and the safe-area edge

// Some mobile browsers (iOS Safari especially, with its floating/compact
// toolbar) shrink the VISUAL viewport without changing `env(safe-area-
// inset-bottom)` at all — that constant only ever covers the home
// indicator, never the browser's own floating chrome on top of it. A
// `position: fixed` element still anchors to the LAYOUT viewport's edge,
// so `visualViewport` (via `useViewportBottomGap`) is the live signal for
// how much of the screen that chrome is covering; the bar is lifted by
// exactly that much, up to this cap (anything larger is a keyboard, which
// the bar deliberately ignores).
const MAX_CHROME_GAP = 120;

/** Routes that already own a bottom sticky action bar — the tab bar would
    stack awkwardly on top of them, so it stays hidden there instead.
    `/messages` is the other case: a real chat composer needs the entire
    bottom edge of the screen to itself (its own safe-area padding, no
    tab bar between it and the keyboard) the same way Messages/WhatsApp/
    Telegram hide their own tab chrome inside a conversation. `/signal`
    (formerly `/empire`, the old City Empire tycoon game) used to be here
    too, back when that game supplied its own full bottom nav — SIGNAL is
    a single feed with no nav of its own, so the site's tab bar is the
    only way back on mobile and must stay visible there. */
const OWNS_BOTTOM_BAR = [/^\/cars\//, /^\/book\//, /^\/messages/];

/** Single source of truth for "is the bottom tab bar showing right now" —
    shared with App.tsx so it can reserve matching scroll padding. */
export function useBottomNavVisible() {
  const { session } = useAuth();
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const { pathname } = useLocation();
  const suppressed = OWNS_BOTTOM_BAR.some((re) => re.test(pathname));
  return Boolean(session) && isMobile && !suppressed;
}

// SIGNAL's feed is media-heavy (video/image posts) and wants every extra
// bit of vertical space while scrolling — the rest of the app's screens
// weren't asked for this and keep the nav permanently visible, so the
// scroll listener below only ever attaches on these routes.
const SIGNAL_ROUTE = /^\/signal(\/|$)/;

// Direction-aware, threshold-gated hide/show — small jitters (a few px,
// a momentum-scroll wobble) never flip state; only a clear, sustained
// scroll in one direction does. Passive listener + rAF throttle keeps
// this off the main thread's critical path (no React re-render happens
// on most scroll events — only the rare ones that actually cross the
// threshold or re-enter the top guard call setHidden at all).
const HIDE_THRESHOLD = 24; // px of sustained one-direction movement before flipping
const TOP_GUARD = 64; // always show near the very top, regardless of direction

function useSignalScrollHide(active: boolean): boolean {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const accum = useRef(0);
  const dir = useRef<1 | -1 | 0>(0);
  const ticking = useRef(false);

  useEffect(() => {
    if (!active) {
      setHidden(false);
      return;
    }
    lastY.current = window.scrollY;
    accum.current = 0;
    dir.current = 0;

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        ticking.current = false;
        const y = window.scrollY;
        const delta = y - lastY.current;
        lastY.current = y;
        if (y <= TOP_GUARD) {
          accum.current = 0;
          dir.current = 0;
          setHidden(false);
          return;
        }
        if (Math.abs(delta) < 1) return;
        const nextDir = delta > 0 ? 1 : -1;
        if (nextDir !== dir.current) {
          dir.current = nextDir;
          accum.current = 0;
        }
        accum.current += Math.abs(delta);
        if (accum.current < HIDE_THRESHOLD) return;
        setHidden(nextDir === 1);
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [active]);

  return hidden;
}

export function BottomNav() {
  const visible = useBottomNavVisible();
  const { pathname, hash } = useLocation();
  const scrollHidden = useSignalScrollHide(visible && SIGNAL_ROUTE.test(pathname));
  const { session } = useAuth();
  const unreadCount = useUnreadMessageCount(session?.user.id);
  const signalUnread = useEmpireUnreadCount(session?.user.id);

  // Signal.tsx marks the feed seen server-side on mount; clear the badge
  // here too the moment the pathname lands on /signal, rather than
  // waiting on a cross-component refresh mechanism for a single badge.
  useEffect(() => {
    if (pathname === '/signal') signalUnread.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const activeIndex = useMemo(
    () => items.findIndex((it) => it.match(pathname, hash)),
    [pathname, hash],
  );
  const signalActive = activeIndex === SIGNAL_INDEX;
  const normalActiveIndex = signalActive ? -1 : activeIndex;

  const navRef = useRef<HTMLElement>(null);
  const { width: measuredNavWidth, height: measuredNavHeight } = useMeasuredSize(navRef);
  const navHeight = measuredNavHeight || FALLBACK_NAV_HEIGHT;
  const navWidth = measuredNavWidth || FALLBACK_NAV_WIDTH;
  const backdropHeight = navHeight + HILL_RISE;
  const viewportGap = useViewportBottomGap();
  // Lift the bar above browser chrome that covers the layout viewport's
  // bottom. A gap this big is a keyboard, not browser chrome, so the bar
  // stays put for those.
  const lift = viewportGap > 0 && viewportGap <= MAX_CHROME_GAP ? viewportGap : 0;
  // End caps are true semicircles: radius = half the flat bar's height, so
  // the glass is a stadium capsule. Per-axis fractions because the clip-path
  // is in objectBoundingBox units over a non-square box.
  const capRadius = navHeight / 2;
  const navFlatY = HILL_RISE / backdropHeight;
  const navClipPath = useMemo(
    () => buildNavClipPath(navFlatY, capRadius / navWidth, capRadius / backdropHeight),
    [navFlatY, capRadius, navWidth, backdropHeight],
  );

  if (!visible) return null;

  return (
    <nav
      ref={navRef}
      className="fixed z-50 shadow-[0_8px_24px_-8px_rgba(22,22,26,0.22)] lg:hidden"
      style={{
        left: BAR_SIDE_GAP,
        right: BAR_SIDE_GAP,
        bottom: `calc(env(safe-area-inset-bottom, 0px) + ${BAR_BOTTOM_GAP}px)`,
        // Gives the box-shadow above the same capsule outline as the glass.
        borderRadius: capRadius,
        // Pure transform/opacity — never touches layout or the page's
        // own reserved bottom padding, so nothing about the feed's
        // content reflows or jumps as this slides away; the bar's own
        // height plus the safe-area inset and floating gap it sits above
        // clears it completely on every device without a hardcoded value.
        transform: scrollHidden
          ? `translateY(calc(100% + env(safe-area-inset-bottom, 0px) + ${BAR_BOTTOM_GAP + 8}px))`
          : `translateY(${-lift}px)`,
        opacity: scrollHidden ? 0 : 1,
        pointerEvents: scrollHidden ? 'none' : 'auto',
        transition: `transform 220ms ${EASE}, opacity 220ms ${EASE}`,
      }}
      aria-hidden={scrollHidden || undefined}
      aria-label="Primary"
    >
      {/* Reusable shape definition for the whole bar's one fill — see
          buildNavClipPath's own comment for why this is a single shape
          instead of the bar's flat rectangle plus a separately-clipped
          hill panel. objectBoundingBox units so it scales to this
          specific bar's real measured width/height. */}
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <clipPath id="signal-nav-clip" clipPathUnits="objectBoundingBox">
            <path d={navClipPath} />
          </clipPath>
        </defs>
      </svg>

      {/* The bar's ONLY background surface — one `.glass` panel, one blur
          instance, shaped to be flat everywhere except the smooth rise
          over Signal's column. Sits behind the content grid below (that
          grid's own items are `relative z-10`; this needs no explicit
          z-index of its own, only to come first in DOM order) and pokes
          `HILL_RISE`px above the bar's own flat top edge — visible
          because `<nav>` has no `overflow` set (initial value: visible).
          Deliberately no `filter` here: a `drop-shadow` is computed from
          this element's own rendered silhouette, which is now the WHOLE
          bar, not just the bump — putting the bump's old glow filter here
          would cast it around the bar's entire outline (left/right/bottom
          edges too), a real regression. The bump's own glow lives purely
          on the rim stroke below, which already traces just the bump's
          own contour; the bar's ordinary drop shadow is the separate
          `shadow-[...]` utility on `<nav>` itself. */}
      <div
        className="glass pointer-events-none absolute inset-x-0 bottom-0"
        style={{ height: backdropHeight, clipPath: 'url(#signal-nav-clip)' }}
      />

      {/* The visible rim of that same raised section — traces the identical
          top contour (see HILL_STROKE_PATH), so it reads as the edge of the
          shape itself rather than a decoration floating above it. A quiet
          neutral line at rest gives the elevation a readable edge at all
          times; it turns into the bright green active indicator on Signal.
          A comfortable, deliberate gap (never touching the logo) is built
          into HILL_RISE/the logo's own translateY below. */}
      <svg
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 overflow-visible"
        style={{ top: -HILL_RISE, width: `${HILL_WIDTH_FRACTION * 100}%`, height: HILL_RISE }}
        viewBox={`0 0 100 ${HILL_STROKE_FY}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d={HILL_STROKE_PATH}
          fill="none"
          stroke={signalActive ? 'var(--color-accent-bright)' : 'var(--color-line-strong)'}
          strokeWidth={signalActive ? 1.8 : 1.1}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{
            // Proportionally smaller glow to match the smaller line/shape —
            // the original 5px blur was sized for a hill roughly twice as
            // tall as this one.
            filter: signalActive ? 'drop-shadow(0 0 3px rgba(0,212,71,0.75))' : 'none',
            transition: `stroke 0.3s ${EASE}, stroke-width 0.3s ${EASE}, filter 0.3s ${EASE}`,
          }}
        />
      </svg>

      {/* Sliding active indicator for the four normal tabs — a small
          solid pill baseline-underline. Signal never uses this: its own
          indicator is the raised section's rim above (drawn separately, not
          on this shared baseline), so this one fades out under Signal. */}
      {/* No `pb-safe` — the whole capsule is already lifted clear of the
          home indicator by `<nav>`'s own `bottom` offset, so padding the
          content as well would only add dead space under the icons. */}
      <div className="relative grid grid-cols-5">
        <span
          className="pointer-events-none absolute top-1.5 h-1 w-6 -translate-x-1/2 rounded-full bg-accent transition-all duration-300"
          style={{
            left: normalActiveIndex >= 0 ? `${(normalActiveIndex + 0.5) * (100 / items.length)}%` : '-100%',
            opacity: normalActiveIndex >= 0 ? 1 : 0,
            transitionTimingFunction: EASE,
          }}
        />

        {items.map((it, i) => {
          const active = i === activeIndex;
          const isSignal = i === SIGNAL_INDEX;

          if (isSignal) {
            return (
              <Link
                key={it.label}
                to={it.to}
                onClick={(e) => onTabClick(e, active)}
                className="pressable relative z-10 flex flex-col items-center justify-center gap-1.5 py-3"
                aria-current={active ? 'page' : undefined}
              >
                <span
                  className="relative transition-all duration-300"
                  style={{
                    // Fixed at the same 23px the normal icons reserve, so
                    // Signal's own label sits on the identical baseline as
                    // Home/Explore/Messages/Profile's — the logo is visibly
                    // larger and already escapes this box (see the
                    // absolutely-centered inner span below), so it
                    // overflows it symmetrically without this slot needing
                    // to grow (which would otherwise stretch the whole
                    // shared grid row and nudge every other label).
                    // The lift (-9/-13) is tuned against HILL_RISE above to
                    // clear the raised section's rim with a small,
                    // deliberate gap — scaled down together with the hill
                    // itself (both cut to roughly 45% of an earlier, much
                    // taller pass) so the logo sits close to the small bump
                    // rather than floating high above it. No X offset here —
                    // unlike the old SignalLogo icon crop, CxsLogo already
                    // crops to cxs.png's own visible bounding box (see its
                    // own header comment), so the rendered mark is already
                    // centered in this slot without a manual nudge.
                    width: 23,
                    height: 23,
                    transform: active ? 'translate(0, -13px) scale(1.08)' : 'translate(0, -9px)',
                    transitionTimingFunction: EASE,
                  }}
                >
                  {/* Deliberately NOTHING else lives in this box besides
                      CxsLogo itself. An earlier pass put a green radial-
                      gradient "ambient glow" span behind the mark for the
                      active state, reasoning it was strictly BEHIND the
                      artwork so cxs.png's own pixels were never touched —
                      true in isolation, but it was permanently present
                      the entire time the tab was active, not a brief
                      effect, so the logo still visibly read as "a
                      different, greener asset" whenever active vs.
                      inactive. Removed outright: active vs. inactive here
                      differ ONLY in size/position (scale 1.08 + a few px
                      of lift, set above), never in color, tint, glow, or
                      any layer touching the mark's own appearance. The
                      one effect that remains is CxsLogo's own internal
                      glint sweep (`.cxs-glint-a/b` in index.css) — a
                      separate, non-blocking overlay that sits at
                      opacity:0 (i.e. contributes nothing at all) well
                      over 95% of the time and briefly passes a highlight
                      across the mark the rest, always fully reverting —
                      not a permanent recolor, and identical in every
                      nav state since it isn't parameterized by `active`. */}
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <CxsLogo size={active ? 32 : 27} />
                  </span>
                  {signalUnread.count > 0 && (
                    <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full border-2 border-surface bg-accent-bright px-0.5 text-[9px] font-bold leading-none text-noir">
                      {signalUnread.count > 9 ? '9+' : signalUnread.count}
                    </span>
                  )}
                </span>
                <span
                  className="text-micro font-bold transition-all duration-300"
                  style={{
                    letterSpacing: '0.12em',
                    color: active ? 'var(--color-accent-bright)' : 'var(--color-accent-700)',
                    textShadow: active ? '0 0 12px rgba(0,212,71,0.45)' : 'none',
                  }}
                >
                  SIGNAL
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={it.label}
              to={it.to}
              onClick={(e) => onTabClick(e, active)}
              className="pressable relative z-10 flex flex-col items-center justify-center gap-1.5 py-3"
              aria-current={active ? 'page' : undefined}
            >
              <span className="relative">
                <Icon
                  name={it.icon}
                  size={23}
                  className={`transition-all duration-300 ease-out ${
                    active ? 'scale-110 text-accent' : 'text-ink-soft'
                  }`}
                  strokeWidth={active ? 2.1 : 1.75}
                />
                {it.label === 'Messages' && unreadCount > 0 && (
                  <span className="absolute -right-1.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full border-2 border-surface bg-accent px-0.5 text-[9px] font-bold leading-none text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </span>
              <span
                className={`text-micro font-bold tracking-wide transition-colors duration-300 ${
                  active ? 'text-accent' : 'text-ink-soft'
                }`}
              >
                {it.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
