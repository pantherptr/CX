import { Icon } from '../Icon';
import { eur } from '../../lib/format';
import { RARITY_META } from '../../lib/data/empire';
import type { RentalRecord } from '../../lib/data/rentals';
import type { District } from '../../lib/data/districts';
import { VehicleArtwork } from '../../vehicleArt/VehicleArtwork';

function timeRemainingLabel(resolvesAt: string): string {
  const ms = new Date(resolvesAt).getTime() - Date.now();
  if (ms <= 0) return 'Resolving…';
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `${mins} min left`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m left`;
}

/** One active rental — same row template as Empire.tsx's
 *  ActiveListingCard, swapped to rental fields. */
export function ActiveRentalRow({
  rental, districts, busy, onCancel,
}: {
  rental: RentalRecord;
  districts: District[];
  busy: string | null;
  onCancel: (id: string) => void;
}) {
  const meta = RARITY_META[rental.rarity];
  const districtName = districts.find((d) => d.districtKey === rental.districtKey)?.name ?? rental.districtKey;
  const isBusy = busy === rental.id;

  return (
    <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center" style={{ boxShadow: meta.glow }}>
      <div className="h-24 w-32 shrink-0 overflow-hidden rounded-xl">
        <VehicleArtwork config={{ name: rental.name, rarity: rental.rarity, customization: rental.customization }} className="h-full w-full" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-display text-lead font-semibold text-ink">
          {rental.name}{rental.customName ? <span className="text-accent-700"> — "{rental.customName}"</span> : ''}
          {rental.source === 'customer_request' && (
            <span className="rounded-full bg-accent-050 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-700">VIP</span>
          )}
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-caption text-muted">
          <Icon name="pin" size={12} className="inline" /> {districtName} · {rental.durationDays}d · {timeRemainingLabel(rental.resolvesAt)}
        </p>
        <p className="mt-1 text-detail text-ink-soft">
          Payout <span className="font-semibold text-ink">{eur(rental.payout)}</span>
        </p>
      </div>
      <button
        disabled={isBusy}
        onClick={() => onCancel(rental.id)}
        className="btn btn-secondary btn-sm shrink-0 disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}
