import { Icon } from '../Icon';
import { eur } from '../../lib/format';
import { RARITY_META } from '../../lib/data/empire';
import type { CorporateContract, ContractCommitment } from '../../lib/data/contracts';

function timeRemainingLabel(resolvesAt: string): string {
  const ms = new Date(resolvesAt).getTime() - Date.now();
  if (ms <= 0) return 'Resolving…';
  const hours = Math.ceil(ms / 3600000);
  if (hours < 24) return `${hours}h left`;
  return `${Math.ceil(hours / 24)}d left`;
}

/** The one flagship corporate contract for this first slice — either
 *  its requirements (accept flow) or the active commitment's progress. */
export function ContractCard({
  contract, commitment, canAccept, busy, onOpenModal, onCancel,
}: {
  contract: CorporateContract;
  commitment: ContractCommitment | null;
  canAccept: boolean;
  busy: boolean;
  onOpenModal: () => void;
  onCancel: () => void;
}) {
  const rarityMeta = RARITY_META[contract.requiredMinRarity];

  return (
    <div className="rounded-2xl border border-white/10 bg-noir-2 p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent-bright/10 text-accent-bright">
          <Icon name="handshake" size={22} />
        </span>
        <div className="min-w-0">
          <p className="font-display text-lead font-semibold text-on-noir">{contract.title}</p>
          <p className="mt-0.5 text-caption text-on-noir-muted">{contract.description}</p>
        </div>
      </div>

      {commitment && commitment.status === 'active' ? (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/8 pt-4">
          <div>
            <p className="text-caption text-on-noir-muted">In progress · {timeRemainingLabel(commitment.resolvesAt)}</p>
            <p className="mt-0.5 font-display text-lg font-semibold text-accent-bright">{eur(commitment.payout)} on completion</p>
          </div>
          <button disabled={busy} onClick={onCancel} className="btn btn-secondary btn-sm disabled:opacity-40">
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/8 pt-4">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-on-noir-muted">
            <span>{contract.requiredVehicleCount} vehicles</span>
            <span style={{ color: rarityMeta.color }}>{rarityMeta.label}+</span>
            <span>{contract.durationDays} days</span>
            <span className="font-semibold text-accent-bright">{eur(contract.lumpSumPayout)}</span>
          </div>
          <button disabled={!canAccept || busy} onClick={onOpenModal} className="btn btn-accent-bright btn-sm shrink-0 disabled:opacity-40">
            Accept
          </button>
        </div>
      )}
    </div>
  );
}
