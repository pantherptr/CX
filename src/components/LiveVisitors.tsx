import { useVisitors } from '../lib/visitors';
import { Icon } from './Icon';

/**
 * A live "people browsing now" pill. The number drifts up and down and the
 * little arrow flashes the direction of the last change.
 *
 * `tone` exists because this sits on both the light page surfaces and the
 * dark footer — the default stays `light`, so every existing call site is
 * untouched, while `dark` swaps to the on-noir palette (the light tone's
 * `text-ink` is near-black and disappears entirely against `bg-noir`).
 */
export function LiveVisitors({
  variant = 'inline',
  tone = 'light',
  className = '',
}: {
  variant?: 'inline' | 'pill';
  tone?: 'light' | 'dark';
  className?: string;
}) {
  const { count, dir } = useVisitors();
  const formatted = count.toLocaleString('en-US');

  const dark = tone === 'dark';
  const labelCls = dark ? 'text-on-noir-muted' : 'text-muted';
  const valueCls = dark ? 'text-on-noir' : 'text-ink';
  const dotCls = dark ? 'bg-accent-bright' : 'bg-accent';
  const dotPingCls = dark ? 'bg-accent-bright/60' : 'bg-accent/60';
  const upCls = dark ? 'text-accent-bright' : 'text-accent';

  const dot = (
    <span className="relative flex h-2 w-2">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${dotPingCls}`} />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${dotCls}`} />
    </span>
  );

  const label = (
    <span className={`text-detail ${labelCls}`}>
      <span key={count} className={`inline-block animate-scale-in font-semibold tabular-nums ${valueCls}`}>
        {formatted}
      </span>{' '}
      browsing now
    </span>
  );

  const arrowCls = dir === 'up' ? upCls : dir === 'down' ? 'text-danger' : 'text-transparent';

  if (variant === 'pill') {
    return (
      <div
        className={`inline-flex items-center gap-2.5 rounded-full border px-3.5 py-2 ${
          dark ? 'border-white/12 bg-white/[0.04]' : 'border-line bg-surface shadow-hair'
        } ${className}`}
      >
        {dot}
        {label}
        <span className={`inline-flex transition-colors ${arrowCls}`} aria-hidden="true">
          <Icon name={dir === 'down' ? 'chevronDown' : 'trending'} size={14} />
        </span>
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {dot}
      {label}
      <span className={`transition-colors ${arrowCls}`} aria-hidden="true">
        <Icon name={dir === 'down' ? 'chevronDown' : 'trending'} size={13} />
      </span>
    </span>
  );
}
