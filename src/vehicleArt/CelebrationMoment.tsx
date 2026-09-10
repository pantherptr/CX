import { useEffect } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { eur } from '../lib/format';
import { RARITY_META, type Rarity } from '../lib/data/empire';

export interface CelebrationData {
  icon: IconName;
  eyebrow: string;
  title: string;
  subtitle?: string;
  cashAwarded?: number;
  cxAwarded?: number;
  rarity?: Rarity;
}

/**
 * The generic "big reward" moment — same full-screen shell as
 * SoldMoment.tsx, reused for rental payouts, mission claims, achievement
 * unlocks, and contract completions rather than four bespoke overlays.
 * Auto-dismisses after ~3.5s, plus a manual close. Driven by a queue in
 * Empire.tsx so several rewards landing in the same poll show one at a
 * time rather than stacking.
 */
export function CelebrationMoment({ data, onDone }: { data: CelebrationData; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);

  const meta = data.rarity ? RARITY_META[data.rarity] : null;
  const ringColor = meta?.color ?? 'var(--color-accent-bright)';

  return (
    <div className="animate-page fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onDone}>
      <div className="relative w-full max-w-sm px-6 text-center" onClick={(e) => e.stopPropagation()}>
        <p className="text-caption font-bold uppercase tracking-[0.2em] text-accent-bright">{data.eyebrow}</p>

        <div
          className="mx-auto mt-5 grid h-20 w-20 place-items-center rounded-full"
          style={{ background: `${ringColor}1a`, boxShadow: `0 0 32px ${ringColor}55` }}
        >
          <Icon name={data.icon} size={34} style={{ color: ringColor }} />
        </div>

        <h2 className="mt-4 font-display text-2xl font-semibold text-on-noir">{data.title}</h2>
        {data.subtitle && <p className="mt-1 text-detail text-on-noir-muted">{data.subtitle}</p>}

        {(data.cashAwarded || data.cxAwarded) && (
          <div className="mt-5 flex items-center justify-center gap-8">
            {!!data.cashAwarded && (
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wide text-on-noir-muted">Cash</p>
                <p className="font-display text-2xl font-semibold text-accent-bright tabular-nums">+{eur(data.cashAwarded)}</p>
              </div>
            )}
            {!!data.cxAwarded && (
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wide text-on-noir-muted">CX Score</p>
                <p className="font-display text-2xl font-semibold text-on-noir tabular-nums">+{data.cxAwarded}</p>
              </div>
            )}
          </div>
        )}

        <button onClick={onDone} className="mx-auto mt-6 flex items-center gap-1.5 text-detail text-on-noir-muted hover:text-on-noir">
          Dismiss <Icon name="x" size={13} />
        </button>
      </div>
    </div>
  );
}
