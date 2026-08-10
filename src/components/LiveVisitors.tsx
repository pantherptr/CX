import { useVisitors } from '../lib/visitors';
import { Icon } from './Icon';

/**
 * A live "people browsing now" pill. The number drifts up and down and the
 * little arrow flashes the direction of the last change.
 */
export function LiveVisitors({
  variant = 'inline',
  className = '',
}: {
  variant?: 'inline' | 'pill';
  className?: string;
}) {
  const { count, dir } = useVisitors();
  const formatted = count.toLocaleString('en-US');

  if (variant === 'pill') {
    return (
      <div
        className={`inline-flex items-center gap-2.5 rounded-full border border-line bg-surface px-3.5 py-2 shadow-hair ${className}`}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        <span className="text-[13px] text-muted">
          <span key={count} className="inline-block animate-scale-in font-semibold tabular-nums text-ink">
            {formatted}
          </span>{' '}
          browsing now
        </span>
        <span
          className={`inline-flex transition-colors ${
            dir === 'up' ? 'text-accent' : dir === 'down' ? 'text-danger' : 'text-transparent'
          }`}
          aria-hidden="true"
        >
          <Icon name={dir === 'down' ? 'chevronDown' : 'trending'} size={14} />
        </span>
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      <span className="text-[13px] text-muted">
        <span key={count} className="inline-block animate-scale-in font-semibold tabular-nums text-ink">
          {formatted}
        </span>{' '}
        browsing now
      </span>
      <span
        className={`transition-colors ${
          dir === 'up' ? 'text-accent' : dir === 'down' ? 'text-danger' : 'text-transparent'
        }`}
        aria-hidden="true"
      >
        <Icon name={dir === 'down' ? 'chevronDown' : 'trending'} size={13} />
      </span>
    </span>
  );
}
