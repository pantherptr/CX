import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { POLICY_INFO, type CancellationPolicy } from '../lib/cancellationPolicy';

const ORDER: CancellationPolicy[] = ['flexible', 'moderate', 'strict'];

/** Host-facing chooser used when listing a car. */
export function CancellationPolicyPicker({
  value,
  onChange,
}: {
  value: CancellationPolicy;
  onChange: (p: CancellationPolicy) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Cancellation policy" className="mt-5 grid gap-3">
      {ORDER.map((p) => {
        const info = POLICY_INFO[p];
        const selected = value === p;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(p)}
            className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
              selected ? 'border-ink bg-panel' : 'border-line hover:border-line-strong'
            }`}
          >
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                selected ? 'border-ink bg-ink text-white' : 'border-line-strong'
              }`}
            >
              {selected && <Icon name="check" size={12} strokeWidth={3} />}
            </span>
            <span className="min-w-0">
              <span className="block font-medium text-ink">
                {info.label}
                {p === 'moderate' && <span className="ml-2 text-caption font-medium text-accent-700">Popular</span>}
              </span>
              <span className="mt-0.5 block text-detail text-muted">{info.tagline}</span>
              {selected && (
                <ul className="mt-2 space-y-1 text-caption text-ink-soft">
                  {info.rules.map((r) => (
                    <li key={r} className="flex gap-2">
                      <span aria-hidden="true">•</span>
                      {r}
                    </li>
                  ))}
                </ul>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Renter-facing summary, shown on the car page and at checkout. */
export function CancellationPolicyCard({ policy, className = '' }: { policy: CancellationPolicy; className?: string }) {
  const info = POLICY_INFO[policy];
  return (
    <div className={`rounded-2xl border border-line bg-surface p-5 ${className}`}>
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-050 text-accent-700">
          <Icon name="calendar" size={19} />
        </span>
        <div>
          <p className="text-label font-semibold uppercase tracking-[0.14em] text-faint">Cancellation policy</p>
          <p className="font-display text-lg font-semibold text-ink">{info.label}</p>
        </div>
      </div>
      <ul className="mt-4 space-y-2 text-detail text-ink-soft">
        {info.rules.map((r) => (
          <li key={r} className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent-050 text-accent-700">
              <Icon name="check" size={10} strokeWidth={3} />
            </span>
            {r}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-caption text-muted">
        If the host cancels, you always get a full refund.{' '}
        <Link to="/cancellation-policy" className="font-medium text-accent-700 hover:underline">
          Read the full policy
        </Link>
      </p>
    </div>
  );
}
