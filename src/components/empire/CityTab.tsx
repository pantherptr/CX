import { useState } from 'react';
import type { PlayerState, InventoryCar, BusinessTier } from '../../lib/data/empire';
import type { District, DistrictDemand, CityEvent } from '../../lib/data/districts';
import type { RentalRecord, CustomerRequest, PriceTier } from '../../lib/data/rentals';
import type { CorporateContract, ContractCommitment } from '../../lib/data/contracts';
import type { MissionTemplate, DailyProgress, MissionClaim } from '../../lib/data/missions';
import type { ActivityItem } from '../../lib/data/activity';
import { ActivityFeed } from './ActivityFeed';
import { EventDecisionBanner } from './EventDecisionBanner';
import { CityEventsStrip } from './CityEventsStrip';
import { DistrictCard } from './DistrictCard';
import { CustomerRequestCard } from './CustomerRequestCard';
import { ContractCard } from './ContractCard';
import { ContractModal } from './ContractModal';
import { AssignRentalModal, type AssignTarget } from './AssignRentalModal';
import { ActiveRentalRow } from './ActiveRentalRow';
import { MissionsList } from './MissionsList';

export function CityTab({
  districts, demand, events, activityFeed, rentals, customerRequests, contracts, commitments,
  ownedCars, missions, playerState, dailyProgress, missionClaims, businessTiers,
  busyId, onAssignToDistrict, onAcceptRequest, onDeclineRequest, onCancelRental,
  onAcceptContract, onCancelContract, onClaimMission,
}: {
  districts: District[];
  demand: DistrictDemand[];
  events: CityEvent[];
  activityFeed: ActivityItem[];
  rentals: RentalRecord[];
  customerRequests: CustomerRequest[];
  contracts: CorporateContract[];
  commitments: ContractCommitment[];
  ownedCars: InventoryCar[];
  missions: MissionTemplate[];
  playerState: PlayerState | null;
  dailyProgress: DailyProgress | null;
  missionClaims: MissionClaim[];
  businessTiers: BusinessTier[];
  busyId: string | null;
  onAssignToDistrict: (inventoryId: string, districtKey: District['districtKey'], durationDays: 1 | 3 | 7, priceTier: PriceTier) => void;
  onAcceptRequest: (requestId: string, inventoryId: string) => void;
  onDeclineRequest: (requestId: string) => void;
  onCancelRental: (rentalId: string) => void;
  onAcceptContract: (contractId: string, inventoryIds: string[]) => void;
  onCancelContract: (commitmentId: string) => void;
  onClaimMission: (missionId: string) => void;
}) {
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [contractModalId, setContractModalId] = useState<string | null>(null);
  const [dismissedEventIds, setDismissedEventIds] = useState<Set<string>>(new Set());

  const activeRentals = rentals.filter((r) => r.status === 'active');
  const activeCommitmentByContract = new Map(commitments.filter((c) => c.status === 'active').map((c) => [c.contractId, c]));
  const businessTier = playerState?.businessTier ?? 1;
  const tierName = (tier: number) => businessTiers.find((t) => t.tier === tier)?.name ?? `Tier ${tier}`;

  return (
    <div>
      <ActivityFeed feed={activityFeed} />

      <div className="mt-6">
        <CityEventsStrip events={events} districts={districts} />
      </div>

      <EventDecisionBanner
        events={events}
        districts={districts}
        ownedCars={ownedCars}
        playerState={playerState}
        dismissed={dismissedEventIds}
        onDismiss={(id) => setDismissedEventIds((prev) => new Set(prev).add(id))}
        onAssign={(district) => setAssignTarget({ mode: 'district', district })}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {districts.map((d) => {
          const locked = businessTier < d.minBusinessTier;
          return (
            <DistrictCard
              key={d.districtKey}
              district={d}
              demand={demand.filter((x) => x.districtKey === d.districtKey)}
              events={events}
              locked={locked}
              requiredTierName={locked ? tierName(d.minBusinessTier) : undefined}
              onAssign={() => setAssignTarget({ mode: 'district', district: d })}
            />
          );
        })}
      </div>

      {customerRequests.length > 0 && (
        <div className="mt-8">
          <p className="eyebrow">Customer Requests</p>
          <div className="mt-2 flex flex-col gap-3">
            {customerRequests.map((r) => (
              <CustomerRequestCard
                key={r.id}
                request={r}
                districts={districts}
                busy={busyId === r.id}
                onOpenAssign={() =>
                  setAssignTarget({
                    mode: 'request',
                    request: r,
                    districtName: districts.find((d) => d.districtKey === r.districtKey)?.name ?? r.districtKey,
                  })
                }
                onDecline={() => onDeclineRequest(r.id)}
              />
            ))}
          </div>
        </div>
      )}

      {contracts.length > 0 && (
        <div className="mt-8">
          <p className="eyebrow">Corporate Contracts</p>
          <div className="mt-2 flex flex-col gap-3">
            {contracts.map((c) => (
              <ContractCard
                key={c.id}
                contract={c}
                commitment={activeCommitmentByContract.get(c.id) ?? null}
                canAccept={(playerState?.businessTier ?? 1) >= c.minBusinessTier}
                busy={busyId === c.id}
                onOpenModal={() => setContractModalId(c.id)}
                onCancel={() => {
                  const commitment = activeCommitmentByContract.get(c.id);
                  if (commitment) onCancelContract(commitment.id);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {activeRentals.length > 0 && (
        <div className="mt-8">
          <p className="eyebrow">Active Rentals</p>
          <div className="mt-2 flex flex-col gap-3">
            {activeRentals.map((r) => (
              <ActiveRentalRow key={r.id} rental={r} districts={districts} busy={busyId} onCancel={onCancelRental} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        <p className="eyebrow">Missions</p>
        <div className="mt-2">
          <MissionsList
            missions={missions}
            playerState={playerState}
            dailyProgress={dailyProgress}
            claims={missionClaims}
            busyMissionId={busyId}
            onClaim={onClaimMission}
          />
        </div>
      </div>

      {assignTarget && (
        <AssignRentalModal
          target={assignTarget}
          ownedCars={ownedCars}
          demand={demand}
          events={events}
          busy={busyId !== null}
          onClose={() => setAssignTarget(null)}
          onSubmit={(inventoryId, durationDays, priceTier) => {
            if (assignTarget.mode === 'district') {
              onAssignToDistrict(inventoryId, assignTarget.district.districtKey, durationDays, priceTier);
            } else {
              onAcceptRequest(assignTarget.request.id, inventoryId);
            }
            setAssignTarget(null);
          }}
        />
      )}

      {contractModalId && (
        <ContractModal
          contract={contracts.find((c) => c.id === contractModalId)!}
          ownedCars={ownedCars}
          busy={busyId !== null}
          onClose={() => setContractModalId(null)}
          onSubmit={(inventoryIds) => {
            onAcceptContract(contractModalId, inventoryIds);
            setContractModalId(null);
          }}
        />
      )}
    </div>
  );
}
