import { useState } from 'react';
import { Icon } from '../Icon';
import { RARITY_META, type InventoryCar } from '../../lib/data/empire';
import type { District } from '../../lib/data/districts';
import type { CustomerRequest } from '../../lib/data/rentals';

export type AssignTarget =
  | { mode: 'district'; district: District }
  | { mode: 'request'; request: CustomerRequest; districtName: string };

const DURATIONS: (1 | 3 | 7)[] = [1, 3, 7];

/** Assign an owned car to a rental — two modes: free district assignment
 *  (car + duration picker) or fulfilling a customer request (duration
 *  pre-locked, car list pre-filtered to the requested category). */
export function AssignRentalModal({
  target, ownedCars, busy, onClose, onSubmit,
}: {
  target: AssignTarget;
  ownedCars: InventoryCar[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (inventoryId: string, durationDays: 1 | 3 | 7) => void;
}) {
  const requiredCategory = target.mode === 'request' ? target.request.category : null;
  const eligible = requiredCategory ? ownedCars.filter((c) => c.category === requiredCategory) : ownedCars;

  const [selectedCar, setSelectedCar] = useState<string | null>(null);
  const [duration, setDuration] = useState<1 | 3 | 7>(target.mode === 'request' ? (target.request.durationDays as 1 | 3) : 1);

  const title = target.mode === 'district' ? `Assign a Car — ${target.district.name}` : `Fulfill Request — ${target.request.customerName}`;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-noir-2 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <p className="font-display text-lead font-semibold text-on-noir">{title}</p>
          <button onClick={onClose} className="text-on-noir-muted hover:text-on-noir">
            <Icon name="x" size={18} />
          </button>
        </div>
        {target.mode === 'request' && (
          <p className="mt-1 text-caption text-on-noir-muted">
            Needs a {target.request.category} in {target.districtName} · {target.request.durationDays}d · +{target.request.bonusPct}% bonus rate
          </p>
        )}

        <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
          {eligible.length === 0 && (
            <p className="text-detail text-on-noir-muted">
              {requiredCategory ? `No owned ${requiredCategory} available.` : 'No owned cars available — buy one from the Market first.'}
            </p>
          )}
          {eligible.map((car) => {
            const isChecked = selectedCar === car.id;
            const meta = RARITY_META[car.rarity];
            return (
              <button
                key={car.id}
                onClick={() => setSelectedCar(car.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  isChecked ? 'border-accent-bright bg-accent-bright/10' : 'border-white/10 hover:border-white/25'
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-detail font-semibold text-on-noir">{car.customName ?? car.name}</p>
                  <p className="text-caption" style={{ color: meta.color }}>{meta.label} · {car.category}</p>
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

        {target.mode === 'district' && (
          <div className="mt-4">
            <p className="text-caption text-on-noir-muted">Duration</p>
            <div className="mt-1.5 flex gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`flex-1 rounded-lg border py-2 text-detail font-semibold transition-colors ${
                    duration === d ? 'border-accent-bright bg-accent-bright/10 text-accent-bright' : 'border-white/10 text-on-noir-muted hover:border-white/25'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end border-t border-white/8 pt-4">
          <button
            disabled={busy || !selectedCar}
            onClick={() => selectedCar && onSubmit(selectedCar, duration)}
            className="btn btn-accent-bright btn-sm disabled:opacity-40"
          >
            {busy ? 'Assigning…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
