import { useMemo } from 'react';
import type { IconName } from '../Icon';
import type { PlayerState, InventoryCar } from '../../lib/data/empire';
import type { District, CityEvent, DistrictInfluence, DistrictMilestoneClaim, DistrictMilestone } from '../../lib/data/districts';
import { nextUnclaimedMilestone } from '../../lib/data/districts';
import type { CustomerRequest } from '../../lib/data/rentals';
import type { CorporateContract, ContractCommitment } from '../../lib/data/contracts';
import type { MissionTemplate, DailyProgress, MissionClaim, WeeklyProgress } from '../../lib/data/missions';
import { missionProgress, isMissionClaimed } from '../../lib/data/missions';
import { actionableCityEvents } from '../../lib/empireActions';
import { LiveActionCard } from './LiveActionCard';

interface LiveAction {
  key: string;
  icon: IconName;
  categoryLabel: string;
  title: string;
  detail?: string;
  rewardLabel?: string;
  countdownEndsAt?: string;
  urgencyMs: number;
  actionLabel: string;
  onAction: () => void;
}

/** The top-of-tab digest — pulls the most urgent/actionable things
 *  across every City system into one prioritized list, capped at 5.
 *  Pure aggregation over data CityTab already fetched; every action
 *  routes into an existing modal or handler, no new mutation logic. */
export function LiveActionCenter({
  customerRequests, events, districts, ownedCars, playerState, contracts, commitments,
  missions, dailyProgress, weeklyProgress, missionClaims, districtInfluence, districtMilestoneClaims,
  dismissedEventIds,
  onOpenAssignRequest, onOpenAssignEvent, onOpenContract, onClaimMission, onClaimDistrictMilestone,
}: {
  customerRequests: CustomerRequest[];
  events: CityEvent[];
  districts: District[];
  ownedCars: InventoryCar[];
  playerState: PlayerState | null;
  contracts: CorporateContract[];
  commitments: ContractCommitment[];
  missions: MissionTemplate[];
  dailyProgress: DailyProgress | null;
  weeklyProgress: WeeklyProgress | null;
  missionClaims: MissionClaim[];
  districtInfluence: DistrictInfluence[];
  districtMilestoneClaims: DistrictMilestoneClaim[];
  dismissedEventIds: Set<string>;
  onOpenAssignRequest: (request: CustomerRequest) => void;
  onOpenAssignEvent: (district: District) => void;
  onOpenContract: (contractId: string) => void;
  onClaimMission: (missionId: string) => void;
  onClaimDistrictMilestone: (districtKey: District['districtKey'], milestone: DistrictMilestone) => void;
}) {
  const businessTier = playerState?.businessTier ?? 1;
  const today = new Date().toISOString().slice(0, 10);

  const actions = useMemo(() => {
    const items: LiveAction[] = [];

    for (const r of customerRequests) {
      const msLeft = new Date(r.expiresAt).getTime() - Date.now();
      items.push({
        key: `request-${r.id}`,
        icon: r.isVip ? 'star' : 'target',
        categoryLabel: r.isVip ? 'VIP Request' : 'Customer Request',
        title: r.customerName,
        detail: `${r.category} · ${districts.find((d) => d.districtKey === r.districtKey)?.name ?? r.districtKey}`,
        rewardLabel: `+${r.bonusPct}% bonus`,
        countdownEndsAt: r.expiresAt,
        urgencyMs: r.isVip ? msLeft - 100_000_000 : msLeft,
        actionLabel: 'Assign',
        onAction: () => onOpenAssignRequest(r),
      });
    }

    for (const { event, district } of actionableCityEvents(events, districts, ownedCars, businessTier, dismissedEventIds)) {
      const msLeft = new Date(event.endsAt).getTime() - Date.now();
      items.push({
        key: `event-${event.id}`,
        icon: 'bolt',
        categoryLabel: 'District Event',
        title: `${event.title} — ${district.name}`,
        detail: `+${event.effectPct}% demand`,
        countdownEndsAt: event.endsAt,
        urgencyMs: msLeft,
        actionLabel: 'Assign Now',
        onAction: () => onOpenAssignEvent(district),
      });
    }

    const activeContractIds = new Set(commitments.filter((c) => c.status === 'active').map((c) => c.contractId));
    for (const c of contracts) {
      if (activeContractIds.has(c.id)) continue;
      if (businessTier < c.minBusinessTier) continue;
      const msLeft = c.isFlash && c.expiresAt ? new Date(c.expiresAt).getTime() - Date.now() : Infinity;
      items.push({
        key: `contract-${c.id}`,
        icon: 'handshake',
        categoryLabel: c.isFlash ? 'Flash Contract' : 'Contract Opportunity',
        title: c.title,
        detail: `${c.requiredVehicleCount} vehicles · ${c.requiredMinRarity}+`,
        rewardLabel: `+€${c.lumpSumPayout.toLocaleString('en-GB')}`,
        countdownEndsAt: c.isFlash && c.expiresAt ? c.expiresAt : undefined,
        urgencyMs: msLeft,
        actionLabel: 'View',
        onAction: () => onOpenContract(c.id),
      });
    }

    for (const m of missions) {
      const progress = missionProgress(m, playerState, dailyProgress, weeklyProgress);
      if (progress < m.target) continue;
      if (isMissionClaimed(m, missionClaims, today, weeklyProgress?.weekStart)) continue;
      items.push({
        key: `mission-${m.id}`,
        icon: m.icon,
        categoryLabel: 'Mission Ready',
        title: m.title,
        detail: m.description,
        rewardLabel: `+€${m.rewardCash.toLocaleString('en-GB')} · +${m.rewardCxPoints} CX`,
        urgencyMs: Infinity,
        actionLabel: 'Claim',
        onAction: () => onClaimMission(m.id),
      });
    }

    for (const d of districts) {
      const inf = districtInfluence.find((i) => i.districtKey === d.districtKey);
      if (!inf) continue;
      const milestone = nextUnclaimedMilestone(inf.influencePct, districtMilestoneClaims, d.districtKey);
      if (milestone === null) continue;
      items.push({
        key: `milestone-${d.districtKey}-${milestone}`,
        icon: milestone === 90 ? 'trophy' : 'gauge',
        categoryLabel: 'Reward Ready',
        title: `${d.name} — ${milestone}% influence`,
        detail: milestone === 90 ? 'District Dominated' : undefined,
        urgencyMs: Infinity,
        actionLabel: 'Claim',
        onAction: () => onClaimDistrictMilestone(d.districtKey, milestone),
      });
    }

    return items.sort((a, b) => a.urgencyMs - b.urgencyMs).slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    customerRequests, events, districts, ownedCars, businessTier, dismissedEventIds,
    contracts, commitments, missions, dailyProgress, weeklyProgress, missionClaims, today,
    districtInfluence, districtMilestoneClaims,
  ]);

  if (actions.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="eyebrow">Live Actions</p>
      <div className="mt-2 flex flex-col gap-2">
        {actions.map((a) => (
          <LiveActionCard
            key={a.key}
            icon={a.icon}
            categoryLabel={a.categoryLabel}
            title={a.title}
            detail={a.detail}
            rewardLabel={a.rewardLabel}
            countdownEndsAt={a.countdownEndsAt}
            actionLabel={a.actionLabel}
            onAction={a.onAction}
          />
        ))}
      </div>
    </div>
  );
}
