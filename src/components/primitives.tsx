import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { useAuth } from '../lib/auth';

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
        {desc && <p className="mt-3 text-[15px] leading-relaxed text-muted text-pretty">{desc}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
