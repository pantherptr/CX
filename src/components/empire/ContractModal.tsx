import { useState } from 'react';
import { Icon } from '../Icon';
import { eur } from '../../lib/format';
import { RARITY_META, RARITY_RANK, type InventoryCar } from '../../lib/data/empire';
import type { CorporateContract } from '../../lib/data/contracts';

/** Checkbox picker over owned cars, filtered to the contract's minimum
 *  rarity — submit is gated on selecting exactly the required count. */
export function ContractModal({
  contract, ownedCars, busy, onClose, onSubmit,
}: {
  contract: CorporateContract;
  ownedCars: InventoryCar[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (inventoryIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const eligible = ownedCars.filter((c) => RARITY_RANK[c.rarity] >= RARITY_RANK[contract.requiredMinRarity]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < contract.requiredVehicleCount) next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-noir-2 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-lead font-semibold text-on-noir">{contract.title}</p>
            <p className="mt-0.5 text-caption text-on-noir-muted">
              Select {contract.requiredVehicleCount} {RARITY_META[contract.requiredMinRarity].label}+ vehicles
            </p>
          </div>
          <button onClick={onClose} className="text-on-noir-muted hover:text-on-noir">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
          {eligible.length === 0 && (
            <p className="text-detail text-on-noir-muted">
              No {RARITY_META[contract.requiredMinRarity].label}-or-better cars available — acquire more from the Market first.
            </p>
          )}
          {eligible.map((car) => {
            const isChecked = selected.has(car.id);
            const meta = RARITY_META[car.rarity];
            return (
              <button
                key={car.id}
                onClick={() => toggle(car.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  isChecked ? 'border-accent-bright bg-accent-bright/10' : 'border-white/10 hover:border-white/25'
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-detail font-semibold text-on-noir">{car.customName ?? car.name}</p>
                  <p className="text-caption" style={{ color: meta.color }}>{meta.label}</p>
                </div>
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                    isChecked ? 'border-accent-bright bg-accent-bright text-noir' : 'border-white/25'
                  }`}
                >
                  {isChecked && <Icon name="check" size={12} />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/8 pt-4">
          <p className="text-caption text-on-noir-muted">
            {selected.size} / {contract.requiredVehicleCount} selected · {eur(contract.lumpSumPayout)} payout
          </p>
          <button
            disabled={busy || selected.size !== contract.requiredVehicleCount}
            onClick={() => onSubmit(Array.from(selected))}
            className="btn btn-accent-bright btn-sm disabled:opacity-40"
          >
            {busy ? 'Committing…' : 'Commit Fleet'}
          </button>
        </div>
      </div>
    </div>
  );
}
