import { Icon } from '../Icon';
import type { District, DistrictDemand, CityEvent } from '../../lib/data/districts';
import { DEMAND_META } from '../../lib/data/districts';

const DEMAND_RANK: Record<string, number> = { low: 0, normal: 1, high: 2, hot: 3, iconic: 4 };

/**
 * One district card — the same dark-card visual language as Empire.tsx's
 * MarketCard (bg-noir-2 panel, hover lift, glow driven by data rather
 * than a static rarity here). This is the "city map" for the first
 * slice: a stylized, fully data-driven grid rather than illustrated map
 * art, upgradeable later without touching any game logic.
 */
export function DistrictCard({
  district, demand, events, locked, requiredTierName, onAssign,
}: {
  district: District;
  demand: DistrictDemand[];
  events: CityEvent[];
  locked?: boolean;
  requiredTierName?: string;
  onAssign: () => void;
}) {
  const topDemand = [...demand].sort((a, b) => (DEMAND_RANK[b.demandTier] ?? 0) - (DEMAND_RANK[a.demandTier] ?? 0)).slice(0, 3);
  const hottest = topDemand[0];
  const glowColor = locked ? '#3f4a42' : hottest ? DEMAND_META[hottest.demandTier].color : '#3f4a42';
  const activeEvent = events.find((e) => e.districtKey === district.districtKey);

  const Wrapper = locked ? 'div' : 'button';

  return (
    <Wrapper
      onClick={locked ? undefined : onAssign}
      className={`group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-noir-2 p-4 text-left transition-all duration-500 ease-out-expo ${
        locked ? 'opacity-60' : 'hover:-translate-y-1.5 hover:border-white/25'
      }`}
      style={{ boxShadow: `0 0 20px ${glowColor}33` }}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
          style={{ background: `${glowColor}1f`, color: glowColor }}
        >
          <Icon name={locked ? 'lock' : district.icon} size={20} />
        </span>
        {!locked && activeEvent && (
          <span className="inline-flex items-center gap-1 rounded-full border border-accent-bright/30 bg-accent-bright/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-accent-bright">
            <Icon name="bolt" size={11} /> Event
          </span>
        )}
      </div>

      <p className="mt-3 font-display text-lead font-semibold text-on-noir">{district.name}</p>
      <p className="mt-0.5 text-caption text-on-noir-muted">{district.description}</p>

      {!locked && topDemand.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {topDemand.map((d) => (
            <span
              key={d.category}
              className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
              style={{ borderColor: `${DEMAND_META[d.demandTier].color}40`, color: DEMAND_META[d.demandTier].color }}
            >
              {d.category} · {DEMAND_META[d.demandTier].label}
            </span>
          ))}
        </div>
      )}

      {locked ? (
        <span className="mt-4 inline-flex w-fit items-center gap-1 text-detail font-semibold text-on-noir-muted">
          Unlocks at {requiredTierName}
        </span>
      ) : (
        <span className="mt-4 inline-flex w-fit items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-detail font-semibold text-on-noir transition-colors duration-300 group-hover:bg-accent-bright group-hover:text-noir">
          Assign a Car <Icon name="arrowRight" size={12} />
        </span>
      )}
    </Wrapper>
  );
}
