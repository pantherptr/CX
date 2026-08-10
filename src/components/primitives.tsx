import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';

/* ------------------------------- Logo ------------------------------- */
export function Logo({
  mono = false,
  className = '',
}: {
  mono?: boolean;
  className?: string;
}) {
  return (
    <Link
      to="/"
      className={`group inline-flex items-center gap-2.5 ${className}`}
      aria-label="Velora home"
    >
      <span
        className={`grid h-8 w-8 place-items-center rounded-[10px] transition-transform duration-300 group-hover:-rotate-6 ${
          mono ? 'bg-white text-ink' : 'bg-accent text-white'
        }`}
      >
        <svg width="19" height="19" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path
            d="M8 21l3.4-9.5A2 2 0 0 1 13.3 10h5.4a2 2 0 0 1 1.9 1.5L24 21"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="16" cy="16.5" r="2.2" fill="currentColor" />
        </svg>
      </span>
      <span
        className={`font-display text-[1.35rem] font-semibold tracking-[-0.01em] ${
          mono ? 'text-white' : 'text-ink'
        }`}
        style={{ letterSpacing: '0.02em' }}
      >
        VELORA
      </span>
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
