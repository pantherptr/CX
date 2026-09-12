import { useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { SignalLogo } from './SignalLogo';
import { useAuth } from '../lib/auth';
import { useMediaQuery } from './motion';
import { useUnreadMessageCount } from '../lib/data/messages';
// The Signal feed's data layer keeps its original `empire*` names — see
// src/lib/data/empireFeed.ts's own header comment for why: it mirrors the
// still-unrenamed backend tables/RPCs 1:1, so relabeling it here would
// describe a rename that never actually happened underneath.
import { useEmpireUnreadCount } from '../lib/data/empireFeed';

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

// Signal's raised section is a real shaped piece of the bar's own surface
// (clip-path on a solid glass layer), not an icon floating on a separate
// blob — this is what makes it read as "the navbar rises here" rather than
// a button glued on top. Geometry lives in a 40%-wide, 34px-tall box
// centered on Signal's column; everything left/right of it is the bar's
// own untouched flat top edge and border.
const HILL_RISE = 40; // px the plateau sits above the bar's flat top edge — tall enough that
// the logo (see the Link below) clears it with real, visible margin in both states, not just
// technically-non-overlapping.
const HILL_BOX_HEIGHT = 54; // px — extends 14px back down into the bar for a seamless join
const HILL_FLAT_Y = HILL_RISE / HILL_BOX_HEIGHT; // fraction: where the flat sides sit (≈0.708)

// Flat -> smooth S-curve up -> flat plateau (where the logo sits) -> S-curve down -> flat.
// The same top contour is authored twice at two scales so the visible rim (stroke) lines up
// exactly with the fill's own edge — the "line" the user sees really is the edge of the raised
// section, not a separate floating shape. Fill uses objectBoundingBox fractions (0-1) closed
// down to the box's bottom; the stroke is the open top contour only, scaled ×100 for its
// viewBox, so both trace the identical curve.
const HILL_CLIP_PATH =
  `M0,${HILL_FLAT_Y} L0.175,${HILL_FLAT_Y} C0.265,${HILL_FLAT_Y} 0.3275,0 0.3875,0 ` +
  `L0.6125,0 C0.6725,0 0.735,${HILL_FLAT_Y} 0.825,${HILL_FLAT_Y} L1,${HILL_FLAT_Y} L1,1 L0,1 Z`;
const FY = Math.round(HILL_FLAT_Y * 1000) / 10; // same fraction, ×100 for the 0-100 viewBox
const HILL_STROKE_PATH = `M0,${FY} L17.5,${FY} C26.5,${FY} 32.75,0 38.75,0 L61.25,0 C67.25,0 73.5,${FY} 82.5,${FY} L100,${FY}`;

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

export function BottomNav() {
  const visible = useBottomNavVisible();
  const { pathname, hash } = useLocation();
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

  if (!visible) return null;

  return (
    <nav
      className="glass fixed inset-x-0 bottom-0 z-50 border-t border-line pb-safe shadow-[0_-6px_20px_-12px_rgba(22,22,26,0.18)] lg:hidden"
      aria-label="Primary"
    >
      {/* Reusable shape definition for Signal's raised section — referenced
          by clip-path below. objectBoundingBox units so the same silhouette
          scales to whatever width the hill box actually renders at. */}
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <clipPath id="signal-hill-clip" clipPathUnits="objectBoundingBox">
            <path d={HILL_CLIP_PATH} />
          </clipPath>
        </defs>
      </svg>

      {/* The raised section itself — a piece of the bar's own glass surface,
          clipped to a smooth plateau, sitting centered over Signal's column.
          Present at rest (Signal is permanently shaped differently from the
          other four) and just deepens in glow when Signal is active. */}
      <div
        className="glass pointer-events-none absolute left-1/2 -translate-x-1/2 transition-[filter] duration-300"
        style={{
          top: -HILL_RISE,
          height: HILL_BOX_HEIGHT,
          width: '40%',
          clipPath: 'url(#signal-hill-clip)',
          filter: signalActive
            ? 'drop-shadow(0 -3px 12px rgba(0,212,71,0.35)) drop-shadow(0 3px 8px rgba(22,22,26,0.12))'
            : 'drop-shadow(0 2px 6px rgba(22,22,26,0.10))',
          transitionTimingFunction: EASE,
        }}
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
        style={{ top: -HILL_RISE, width: '40%', height: HILL_RISE }}
        viewBox={`0 0 100 ${FY}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d={HILL_STROKE_PATH}
          fill="none"
          stroke={signalActive ? 'var(--color-accent-bright)' : 'var(--color-line-strong)'}
          strokeWidth={signalActive ? 2.4 : 1.4}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{
            filter: signalActive ? 'drop-shadow(0 0 5px rgba(0,212,71,0.8))' : 'none',
            transition: `stroke 0.3s ${EASE}, stroke-width 0.3s ${EASE}, filter 0.3s ${EASE}`,
          }}
        />
      </svg>

      {/* Sliding active indicator for the four normal tabs — a small
          solid pill baseline-underline. Signal never uses this: its own
          indicator is the raised section's rim above (drawn separately, not
          on this shared baseline), so this one fades out under Signal. */}
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
                    // The lift (-19/-28) is tuned against HILL_RISE above
                    // to always clear the raised section's rim with real
                    // visible margin — never flush with it, let alone
                    // behind it. The small translateX/extra translateY are
                    // a deliberate optical correction, not arbitrary: the
                    // artwork's own visual weight (the solid glyph vs. the
                    // sparser radiating arcs) sits measurably right-and-
                    // down of the image's geometric center (~5%/~9% of its
                    // own size), so centering the bounding box alone reads
                    // as faintly off-balance — this nudges the actual mass
                    // back onto the column's true center.
                    width: 23,
                    height: 23,
                    transform: active ? 'translate(-3px, -28px) scale(1.08)' : 'translate(-2.5px, -19px)',
                    filter: active
                      ? 'drop-shadow(0 0 10px rgba(0,212,71,0.55)) drop-shadow(0 2px 5px rgba(0,0,0,0.22))'
                      : 'drop-shadow(0 1px 3px rgba(0,0,0,0.16))',
                    transitionTimingFunction: EASE,
                  }}
                >
                  {/* Absolute + translate(-50%,-50%), not CSS Grid's
                      place-items:center — Grid's auto-centering of an
                      oversized item turns out to only behave reliably for
                      genuine replaced elements (a bare <img>); SignalLogo's
                      own root is a plain span, and place-items-center
                      silently left it start-aligned instead of centered.
                      Absolute positioning centers unambiguously regardless
                      of the child's type or size. The live sweep effect is
                      built into SignalLogo itself now (always on, every
                      instance app-wide), not re-declared per call site. */}
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <SignalLogo size={active ? 36 : 30} />
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
