import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { useAuth } from '../lib/auth';

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
 * Renders one of the three official CX logo lockups exactly as provided
 * (trimmed of surrounding transparent margin and resized — never
 * recolored, redistorted, or redrawn):
 *   - full     — symbol + wordmark. Primary brand mark: homepage,
 *                desktop headers, auth pages, footer, splash screens.
 *   - symbol   — the mark alone. Compact contexts: mobile headers/nav,
 *                dashboard sidebar, favicon.
 *   - wordmark — text only. Secondary/lighter brand moments where the
 *                full lockup would feel heavy.
 *   - auto     — full lockup at `sm:` and up, symbol below it. Used by
 *                the one header that has to double as both. */
const LOGO_SRC = {
  full: '/cx-logo-full.png',
  symbol: '/cx-logo-symbol.png',
  wordmark: '/cx-logo-wordmark.png',
} as const;

export function Logo({
  variant = 'full',
  className = '',
}: {
  variant?: 'full' | 'symbol' | 'wordmark' | 'auto';
  className?: string;
}) {
  // Authenticated users can't land on "/" (PublicOnlyRoute bounces them
  // straight back), so the logo should point at the dashboard directly
  // rather than round-trip through a redirect.
  const { session } = useAuth();
  const imgClass =
    'h-9 w-auto shrink-0 object-contain transition-transform duration-300 group-hover:-rotate-3 sm:h-10';
  return (
    <Link to={session ? '/dashboard' : '/'} className={`group inline-flex items-center ${className}`} aria-label="CX home">
      {variant === 'auto' ? (
        <>
          <img src={LOGO_SRC.full} alt="CX" className={`hidden sm:block ${imgClass}`} />
          <img src={LOGO_SRC.symbol} alt="CX" className={`sm:hidden ${imgClass}`} />
        </>
      ) : (
        <img src={LOGO_SRC[variant]} alt="CX" className={imgClass} />
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

/* ------------------------------ Modal ------------------------------- */
export function Modal({
  open,
  onClose,
  children,
  className = '',
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-ink/45 backdrop-blur-[3px] animate-fade-in"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative z-10 w-full animate-scale-in bg-surface shadow-pop ${className}`}
      >
        {children}
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
 * One badge system for every tier that can appear in a conversation or
 * anywhere else identity matters — small and consistent rather than
 * reinvented per screen. Colors are deliberate, not decorative: Owner is
 * red (the one account with full authority), Owner Assistant/Admin are
 * gold — explicitly never purple — Host and Client are both the app's
 * own green, matching the brand accent already used for "verified"
 * elsewhere (Rating, Stars).
 *
 * The mark itself is a solid-filled circle with a plain white check —
 * the same construction Instagram/X use for their own verified badges —
 * rather than a tinted circle with a colored icon, which read closer to
 * a status pill than an actual verification mark. */
export type VerifiedRole = 'owner' | 'owner_assistant' | 'admin' | 'host' | 'client';

const VERIFIED_ROLE_META: Record<VerifiedRole, { solid: string; fg: string; bg: string; label: string }> = {
  owner: { solid: 'bg-danger', fg: 'text-danger', bg: 'bg-danger/10', label: 'Owner' },
  owner_assistant: { solid: 'bg-[#c9971c]', fg: 'text-[#8a6d1f]', bg: 'bg-[#c9971c]/15', label: 'Owner Assistant' },
  admin: { solid: 'bg-[#c9971c]', fg: 'text-[#8a6d1f]', bg: 'bg-[#c9971c]/15', label: 'Admin' },
  host: { solid: 'bg-accent', fg: 'text-accent-600', bg: 'bg-accent-050', label: 'Host' },
  client: { solid: 'bg-accent', fg: 'text-accent-600', bg: 'bg-accent-050', label: 'Verified' },
};

/** The Owner's mark: the plain red verified checkmark every tier's badge
 *  is built from, plus the red-glow knight emblem (public/owner-badge.png,
 *  its black backing keyed out to transparent — see the asset's own
 *  history for why only the glow survives that) right next to it at the
 *  exact same size. */
function BadgeMark({ role, size }: { role: VerifiedRole; size: number }) {
  const meta = VERIFIED_ROLE_META[role];
  if (role === 'owner') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1">
        <span className="inline-grid place-items-center rounded-full bg-danger text-white shadow-sm" style={{ width: size, height: size }}>
          <Icon name="check" size={Math.round(size * 0.6)} strokeWidth={3.2} />
        </span>
        <img src="/owner-badge.png" alt="" className="inline-block object-contain" style={{ width: size, height: size }} />
      </span>
    );
  }
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full shadow-sm ${meta.solid} text-white`}
      style={{ width: size, height: size }}
    >
      <Icon name="check" size={Math.round(size * 0.6)} strokeWidth={3.2} />
    </span>
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
