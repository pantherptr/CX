import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type TouchEvent as ReactTouchEvent } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { Img } from './motion';
import { useAuth } from '../lib/auth';
import { haptics } from '../lib/native';

/* --------------------------- Google sign-in ---------------------------
 * The real Supabase-hosted Google OAuth flow — `signInWithGoogle` (see
 * lib/auth.tsx) redirects the whole page to Google's actual consent
 * screen, no mock/demo path. This only fails client-side if the Google
 * provider hasn't been switched on in the Supabase dashboard yet, which
 * is a one-time setup step outside this codebase (see the Google Cloud
 * Console + Supabase Dashboard steps in the project README). */
function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.68-3.87 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.03l3.05-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .9 4.97l3.05 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
    </svg>
  );
}

export function GoogleSignInButton({ label = 'Continue with Google' }: { label?: string }) {
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setError(null);
    setLoading(true);
    const { error } = await signInWithGoogle();
    // On the web, a success here doesn't actually resolve in practice —
    // the whole page navigates to Google before this promise settles, so
    // this component is gone by the time it would matter. On native,
    // though, this resolves as soon as the system browser sheet is
    // presented — the sign-in itself hasn't happened yet — so loading
    // must always be cleared here, not just on error, or cancelling out
    // of that sheet would leave the button stuck.
    setLoading(false);
    if (error) setError(error);
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="btn btn-secondary btn-block btn-lg gap-2.5 disabled:opacity-60"
      >
        {loading ? (
          'Redirecting to Google…'
        ) : (
          <>
            <GoogleGlyph /> {label}
          </>
        )}
      </button>
      {error && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2.5 text-detail text-danger">{error}</p>}
    </div>
  );
}

export function AuthDivider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <div className="h-px flex-1 bg-line" />
      <span className="text-caption text-faint">or</span>
      <div className="h-px flex-1 bg-line" />
    </div>
  );
}

/* ------------------------------- Logo -------------------------------
 * Renders the CX key mark exactly as provided (trimmed of surrounding
 * transparent margin and resized — never recolored, redistorted, or
 * redrawn). Two crops of the same source artwork: `symbol` is the square
 * icon alone (compact slots — nav bars, sidebars, favicon), `full`/
 * `wordmark` keep the key's extending tail (roomier slots — drawers,
 * footer, signup, the home header). */
export const LOGO_SRC = {
  full: '/cx-logo-full.png',
  symbol: '/cx-logo-symbol.png',
  wordmark: '/cx-logo-full.png',
} as const;

export function Logo({
  variant = 'full',
  className = '',
  size = 'default',
}: {
  variant?: 'full' | 'symbol' | 'wordmark' | 'auto';
  className?: string;
  // 'lg' only bumps the *mobile* height (desktop is unchanged) — for the
  // wide full/wordmark lockup, the default mobile height reads thin next
  // to its own width, unlike the square `symbol` it shares that height
  // with. Used by Home's header, which keeps the key's green-outlined
  // tail on mobile instead of swapping to the compact symbol there.
  size?: 'default' | 'lg';
}) {
  // Authenticated users can't land on "/" (PublicOnlyRoute bounces them
  // straight back), so the logo should point at the dashboard directly
  // rather than round-trip through a redirect.
  const { session } = useAuth();
  const imgClass = `${size === 'lg' ? 'h-12' : 'h-11'} w-auto shrink-0 object-contain transition-transform duration-300 group-hover:-rotate-3 sm:h-10`;
  const fallback = (
    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-panel text-sm font-semibold text-ink-soft sm:h-10 sm:w-10`}>
      CX
    </span>
  );
  return (
    <Link to={session ? '/dashboard' : '/'} className={`group inline-flex items-center ${className}`} aria-label="CX home">
      {variant === 'auto' ? (
        <>
          <Img src={LOGO_SRC.full} alt="CX" className={`hidden sm:block ${imgClass}`} fallback={fallback} />
          <Img src={LOGO_SRC.symbol} alt="CX" className={`sm:hidden ${imgClass}`} fallback={fallback} />
        </>
      ) : (
        <Img src={LOGO_SRC[variant]} alt="CX" className={imgClass} fallback={fallback} />
      )}
    </Link>
  );
}

/* ------------------------------ Rating ------------------------------ */
export function Rating({
  value,
  trips,
  size = 15,
  className = '',
}: {
  value: number;
  trips?: number;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <Icon name="star" size={size} className="text-star" />
      <span className="font-medium text-ink tabular-nums">{value.toFixed(2)}</span>
      {trips !== undefined && (
        <span className="text-muted">
          ({trips} {trips === 1 ? 'trip' : 'trips'})
        </span>
      )}
    </span>
  );
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-star" aria-label={`${value} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Icon
          key={i}
          name="star"
          size={size}
          className={i < Math.round(value) ? 'text-star' : 'text-line-strong'}
        />
      ))}
    </span>
  );
}

/* ------------------------------ Switch ------------------------------
 * The one on/off control for the whole app — Settings and the admin SIGNAL
 * demo panel each used to hand-roll their own copy (24px-tall tap target,
 * linear easing, and no `type="button"`, so one dropped inside a <form>
 * would have submitted it). Built to feel physical: the thumb stretches
 * toward its destination while held, the way a real switch resists before
 * it flips, then springs across on the same expo curve as the rest of the
 * app. The visual track stays a compact 46x26, but an invisible ring
 * around it brings the actual touch target to 44px tall. */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Accessible name — required unless a visible <label> already wraps it. */
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        haptics.tick();
        onChange(!checked);
      }}
      className={`group/switch relative inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full p-[3px] transition-colors duration-200 ease-out before:absolute before:-inset-[9px] before:content-[''] disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-accent' : 'bg-line-strong'
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(22,22,26,0.28),0_1px_1px_rgba(22,22,26,0.08)] transition-[width,transform] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-active/switch:w-[26px] ${
          checked ? 'translate-x-5 group-active/switch:translate-x-[14px]' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

/* ------------------------------ Modal -------------------------------
 * Phone: a real bottom sheet — slides up, flat bottom edge flush with the
 * screen, extends its own surface under the home indicator, and a grab
 * handle that can be dragged down to dismiss (the handle strip only, so a
 * drag can never fight the sheet's own scrolling content). Desktop: the
 * same centered card it always was. Either way focus moves into the
 * dialog on open and back to whatever opened it on close, and dragging on
 * the backdrop no longer scrolls the page behind it on iOS (where body
 * `overflow: hidden` alone doesn't stop touch scrolling). */
const SHEET_CLOSE_THRESHOLD = 90;

/** Open modals, oldest first. Every open Modal listens for Escape, so
 *  without this one keypress closed every stacked modal at once (a
 *  date-picker sheet opened from inside the booking sheet took the
 *  booking sheet down with it) — now only the topmost one answers. */
const openModalStack: symbol[] = [];

export function Modal({
  open,
  onClose,
  children,
  className = '',
  labelledBy,
  safeArea = true,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
  /** Pad the sheet's bottom past the iPhone home indicator. Turn off only
   *  for a modal whose own content already does it (e.g. a pinned
   *  composer footer), or the gap doubles. */
  safeArea?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Kept in a ref so the open/close effect below depends on `open` alone —
  // most callers pass an inline `onClose`, and re-running the focus logic
  // on every parent re-render would yank focus out of a text field inside
  // the dialog on each keystroke.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const [closing, setClosing] = useState(false);
  const startYRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setDragY(0);
    setDragging(false);
    setSettling(false);
    setClosing(false);

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const stackId = Symbol('modal');
    openModalStack.push(stackId);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openModalStack[openModalStack.length - 1] === stackId) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // After paint, so a child with its own autoFocus wins.
    const raf = requestAnimationFrame(() => {
      const el = dialogRef.current;
      if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      openModalStack.splice(openModalStack.indexOf(stackId), 1);
      document.body.style.overflow = prevOverflow;
      // Only if it's still in the page — the opener can unmount with
      // whatever closed this (a parent sheet, a route change).
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  const requestClose = () => {
    setDragging(false);
    setClosing(true);
    window.setTimeout(() => onCloseRef.current(), 200);
  };

  const onHandleTouchStart = (e: ReactTouchEvent) => {
    startYRef.current = e.touches[0].clientY;
  };
  const onHandleTouchMove = (e: ReactTouchEvent) => {
    if (startYRef.current === null) return;
    const dy = e.touches[0].clientY - startYRef.current;
    setDragging(true);
    // Resistance past the top instead of a hard stop — the sheet gives a
    // little under an upward pull, the way a native sheet does.
    setDragY(dy > 0 ? dy : dy / 6);
  };
  const onHandleTouchEnd = () => {
    startYRef.current = null;
    if (!dragging) return;
    setDragging(false);
    if (dragY > SHEET_CLOSE_THRESHOLD) {
      requestClose();
    } else {
      setDragY(0);
      setSettling(true);
      window.setTimeout(() => setSettling(false), 240);
    }
  };

  // Only ever set while a drag/close is in flight: a permanent inline
  // transform would turn this panel into a containing block for any
  // `position: fixed` child (see `.animate-page`'s note in index.css).
  const panelStyle: CSSProperties | undefined =
    dragging || settling || closing
      ? {
          transform: closing ? 'translateY(110%)' : `translateY(${dragY}px)`,
          transition: dragging ? 'none' : 'transform 220ms var(--ease-out-expo)',
        }
      : undefined;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 touch-none bg-ink/45 backdrop-blur-[3px] animate-fade-in transition-opacity duration-200"
        style={closing ? { opacity: 0 } : undefined}
        onClick={() => onCloseRef.current()}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        style={panelStyle}
        className={`modal-panel relative z-10 w-full overscroll-contain bg-surface shadow-pop focus:outline-none max-sm:rounded-t-[1.75rem] max-sm:rounded-b-none ${className}`}
      >
        <div
          className="absolute left-1/2 top-0 z-20 flex h-7 w-28 -translate-x-1/2 touch-none justify-center pt-2 sm:hidden"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          onTouchCancel={onHandleTouchEnd}
          aria-hidden="true"
        >
          <span className="h-1 w-9 rounded-full bg-faint/60" />
        </div>
        {children}
        {safeArea && <div aria-hidden="true" className="h-[env(safe-area-inset-bottom,0px)] shrink-0 sm:hidden" />}
      </div>
    </div>
  );
}

/* ---------------------------- Empty state ----------------------------
 * The one "nothing to show yet" treatment for the whole app — before
 * this, Notifications, Browse (no-results/error), the dashboards'
 * trips/messages/saved sections, Messages' conversation list and
 * HostDashboard's reviews each hand-rolled their own version of the same
 * icon-circle-plus-message layout, with sizes and type scale drifting a
 * little further apart each time a new one got copy-pasted. One
 * component now, sized per context rather than reinvented per page. */
/* --------------------------- Verified badge ---------------------------
 * One badge system for every tier that can appear in a conversation, a
 * SIGNAL post/comment/Story, a Host listing, or anywhere else identity
 * matters — small and consistent rather than reinvented per screen.
 * Redesigned as a flat, original CX Rent mark (no borrowed silhouette
 * from any other platform's badge, no crown/shield/headphone/logo, no
 * 3D) built from exactly one geometry — a plain circle and one checkmark
 * path, both plain SVG so they stay crisp at 12–24px — differentiated
 * only by material per tier, using just the brand's four colors:
 *
 *   Owner              premium black base, a green→gold gradient ring
 *                       and checkmark — the one tier that combines all
 *                       three accent colors, deliberately the most
 *                       visually complex of the five and therefore the
 *                       most exclusive-reading at a glance.
 *   Owner Assistant     solid gold, black check — gold alone, no black
 *                       base, so it never reads as "Owner but dimmer."
 *   Admin               black base, green check — black paired with
 *                       green (not gold) keeps it clearly distinct from
 *                       both Owner and Assistant.
 *   Host                solid CX green, white check — the brand's own
 *                       accent color, unmixed.
 *   Verified Client     solid neutral grey, white check — deliberately
 *                       the plainest mark, the least exclusive tier.
 */
// 'assistant' is SIGNAL's AI voice specifically — kept distinct from the
// pre-existing 'owner_assistant' (a real human tier, still gold, used
// elsewhere for conversation-participant labeling) so recoloring one
// never touches the other.
export type VerifiedRole = 'owner' | 'owner_assistant' | 'admin' | 'host' | 'client' | 'assistant';

const VERIFIED_ROLE_META: Record<VerifiedRole, { fg: string; bg: string; label: string }> = {
  owner: { fg: 'text-[#8a6d1f]', bg: 'bg-noir/5', label: 'Owner' },
  owner_assistant: { fg: 'text-[#8a6d1f]', bg: 'bg-[#c9971c]/15', label: 'Owner Assistant' },
  admin: { fg: 'text-accent-700', bg: 'bg-accent-050', label: 'Admin' },
  host: { fg: 'text-accent-600', bg: 'bg-accent-050', label: 'Host' },
  client: { fg: 'text-muted', bg: 'bg-panel-2', label: 'Verified' },
  assistant: { fg: 'text-accent-700', bg: 'bg-accent-050', label: 'Assistant' },
};

// One checkmark, hand-drawn to sit slightly off-center-low in a 24x24
// box (a plain centered tick reads as clipped once the ring's own
// stroke is added) — shared by every tier so the only thing that ever
// changes between them is color, never shape.
const CHECK_PATH = 'M7.4 12.6 L10.6 15.8 L16.7 9.2';

// A 14-lobe scalloped "seal" outline (radius oscillating gently around a
// circle) instead of a plain disc — the one shape choice that reads as a
// verification SEAL rather than a borrowed platform check-bubble, per the
// explicit "don't copy Instagram/X" brief. Generated once as a fixed point
// path (112 line segments on a smooth cosine radius) rather than computed
// at render time — it never needs to change, and a literal path costs
// nothing to render at 12-24px.
const SEAL_PATH =
  'M 12.00 1.35 L 12.58 1.67 L 13.07 2.46 L 13.48 3.27 L 13.90 3.66 L 14.45 3.49 L 15.17 2.94 L 15.96 2.44 L 16.62 2.40 L 17.00 2.95 L 17.11 3.87 L 17.13 4.78 L 17.33 5.32 L 17.90 5.40 L 18.79 5.21 L 19.71 5.11 L 20.33 5.36 L 20.43 6.02 L 20.13 6.89 L 19.75 7.72 L 19.70 8.29 L 20.18 8.61 L 21.06 8.83 L 21.94 9.14 L 22.38 9.63 L 22.20 10.27 L 21.54 10.93 L 20.84 11.50 L 20.55 12.00 L 20.84 12.50 L 21.54 13.07 L 22.20 13.73 L 22.38 14.37 L 21.94 14.86 L 21.06 15.17 L 20.18 15.39 L 19.70 15.71 L 19.75 16.28 L 20.13 17.11 L 20.43 17.98 L 20.33 18.64 L 19.71 18.89 L 18.79 18.79 L 17.90 18.60 L 17.33 18.68 L 17.13 19.22 L 17.11 20.13 L 17.00 21.05 L 16.62 21.60 L 15.96 21.56 L 15.17 21.06 L 14.45 20.51 L 13.90 20.34 L 13.48 20.73 L 13.07 21.54 L 12.58 22.33 L 12.00 22.65 L 11.42 22.33 L 10.93 21.54 L 10.52 20.73 L 10.10 20.34 L 9.55 20.51 L 8.83 21.06 L 8.04 21.56 L 7.38 21.60 L 7.00 21.05 L 6.89 20.13 L 6.87 19.22 L 6.67 18.68 L 6.10 18.60 L 5.21 18.79 L 4.29 18.89 L 3.67 18.64 L 3.57 17.98 L 3.87 17.11 L 4.25 16.28 L 4.30 15.71 L 3.82 15.39 L 2.94 15.17 L 2.06 14.86 L 1.62 14.37 L 1.80 13.73 L 2.46 13.07 L 3.16 12.50 L 3.45 12.00 L 3.16 11.50 L 2.46 10.93 L 1.80 10.27 L 1.62 9.63 L 2.06 9.14 L 2.94 8.83 L 3.82 8.61 L 4.30 8.29 L 4.25 7.72 L 3.87 6.89 L 3.57 6.02 L 3.67 5.36 L 4.29 5.11 L 5.21 5.21 L 6.10 5.40 L 6.67 5.32 L 6.87 4.78 L 6.89 3.87 L 7.00 2.95 L 7.38 2.40 L 8.04 2.44 L 8.83 2.94 L 9.55 3.49 L 10.10 3.66 L 10.52 3.27 L 10.93 2.46 L 11.42 1.67 Z';

/** Owner alone uses a real raster medallion (the gold-and-green shield
 *  crest, `/owner-verified.png`) instead of the shared flat seal — a
 *  deliberate one-off to make Owner visibly the most premium tier, per
 *  direct request. Source art is a full ornate crest (crown, laurel,
 *  "VERIFIED" banner) that turns to mud below ~40px, so this uses a
 *  pre-cropped, circle-masked medallion of just its shield+check core
 *  (see /tmp asset prep) rather than the full crest at inline sizes. */
// If the raster crest genuinely fails to load, this is the same flat seal
// construction every other tier already falls back on visually — gold to
// keep reading as Owner's tier, never a swapped-in generic/borrowed mark.
function OwnerBadgeFallback({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path d={SEAL_PATH} fill="#c9971c" stroke="none" />
      <path d={CHECK_PATH} fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OwnerBadgeMark({ size }: { size: number }) {
  return (
    <Img
      src="/owner-verified.png"
      alt="Owner"
      width={size}
      height={size}
      className="shrink-0 rounded-full object-cover"
      fallback={<OwnerBadgeFallback size={size} />}
    />
  );
}

const BADGE_FILL: Record<Exclude<VerifiedRole, 'owner'>, string> = {
  owner_assistant: '#c9971c',
  admin: 'var(--color-noir)',
  host: 'var(--color-accent-bright)',
  client: 'var(--color-muted)',
  assistant: 'var(--color-accent-bright)',
};
const BADGE_CHECK: Record<Exclude<VerifiedRole, 'owner'>, string> = {
  owner_assistant: 'var(--color-noir)',
  admin: 'var(--color-accent-bright)',
  host: '#ffffff',
  client: '#ffffff',
  assistant: '#ffffff',
};
// Admin is the only non-Owner tier with its own ring color (green on
// black, mirroring Owner's black-plus-ring construction one step down in
// exclusivity); the others read fine as a flat seal with no separate ring.
const BADGE_RING: Partial<Record<Exclude<VerifiedRole, 'owner'>, string>> = {
  admin: 'var(--color-accent-bright)',
};

function BadgeMark({ role, size }: { role: VerifiedRole; size: number }) {
  if (role === 'owner') return <OwnerBadgeMark size={size} />;
  const ring = BADGE_RING[role];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path d={SEAL_PATH} fill={BADGE_FILL[role]} stroke={ring} strokeWidth={ring ? 1.3 : 0} strokeLinejoin="round" />
      <path d={CHECK_PATH} fill="none" stroke={BADGE_CHECK[role]} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function VerifiedBadge({
  role,
  showLabel = false,
  size = 14,
}: {
  role: VerifiedRole;
  /** Full pill with text — used in the role switcher and search results.
   *  Off by default: most places (message bubbles, avatars) just need
   *  the small icon-only mark. */
  showLabel?: boolean;
  size?: number;
}) {
  const meta = VERIFIED_ROLE_META[role];
  if (showLabel) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.bg} ${meta.fg}`}>
        <BadgeMark role={role} size={12} />
        {meta.label}
      </span>
    );
  }
  return (
    <span title={meta.label}>
      <BadgeMark role={role} size={size} />
    </span>
  );
}

/** The explicit "who sent this" text treatment for chat — used above a
 *  message bubble whenever the sender's identity isn't already obvious
 *  from context (chiefly the Owner, who can send as one of two
 *  identities in the same thread). Icon + name, not just a color, so
 *  there's no ambiguity about which one sent a given message. */
export function RoleLabel({ role, align = 'left' }: { role: VerifiedRole; align?: 'left' | 'right' }) {
  const meta = VERIFIED_ROLE_META[role];
  return (
    <span className={`mb-1 flex items-center gap-1 px-1 text-[11px] font-semibold uppercase tracking-wide ${meta.fg} ${align === 'right' ? 'justify-end' : ''}`}>
      <VerifiedBadge role={role} size={13} /> {meta.label}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'md',
  tone = 'muted',
  className = '',
}: {
  icon: IconName;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** `lg` — a screen's entire content area (Notifications, Browse).
   *  `md` — a dashboard card/section (Saved cars, Reviews).
   *  `sm` — a compact list row inside an already-boxed container
   *  (a dashboard's Messages preview, Messages' conversation list). */
  size?: 'sm' | 'md' | 'lg';
  tone?: 'muted' | 'danger';
  className?: string;
}) {
  const iconBox = size === 'lg' ? 'h-14 w-14' : size === 'md' ? 'h-12 w-12' : 'h-11 w-11';
  const iconSize = size === 'lg' ? 26 : size === 'md' ? 22 : 20;
  return (
    <div className={`flex flex-col items-center gap-2 text-center ${className}`}>
      <span
        className={`grid place-items-center rounded-full bg-panel ${iconBox} ${
          tone === 'danger' ? 'text-danger' : 'text-muted'
        }`}
      >
        <Icon name={icon} size={iconSize} />
      </span>
      {size === 'lg' ? (
        <h3 className="mt-2 font-display text-xl font-semibold text-ink">{title}</h3>
      ) : (
        <p className="mt-1 font-medium text-ink">{title}</p>
      )}
      {description && (
        <p className={size === 'lg' ? 'max-w-sm text-body text-muted' : 'max-w-xs text-detail text-muted'}>
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/* --------------------------- Section head --------------------------- */
export function SectionHead({
  eyebrow,
  title,
  desc,
  action,
  center = false,
}: {
  eyebrow?: string;
  title: ReactNode;
  desc?: string;
  action?: ReactNode;
  center?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${
        center ? 'items-center text-center sm:flex-col sm:items-center' : ''
      }`}
    >
      <div className={center ? 'max-w-2xl' : 'max-w-xl'}>
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h2 className="font-display text-[1.75rem] font-semibold leading-[1.1] text-ink sm:text-4xl text-balance">
          {title}
        </h2>
        {desc && <p className="mt-3 text-copy leading-relaxed text-muted text-pretty">{desc}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
