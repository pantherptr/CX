import { Icon } from '../Icon';
import type { CustomerRequest } from '../../lib/data/rentals';
import type { District } from '../../lib/data/districts';

function timeLeftLabel(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expiring…';
  const mins = Math.ceil(ms / 60000);
  return `${mins} min left`;
}

/** An urgent, time-limited rental offer — accept fast for a bonus rate,
 *  or let it expire. */
export function CustomerRequestCard({
  request, districts, busy, onOpenAssign, onDecline,
}: {
  request: CustomerRequest;
  districts: District[];
  busy: boolean;
  onOpenAssign: () => void;
  onDecline: () => void;
}) {
  const districtName = districts.find((d) => d.districtKey === request.districtKey)?.name ?? request.districtKey;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-noir-2 p-4 sm:flex-row sm:items-center">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-bright/10 text-accent-bright">
        <Icon name="target" size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-lead font-semibold text-on-noir">{request.customerName}</p>
        <p className="mt-0.5 text-caption text-on-noir-muted">
          Needs a <span className="text-on-noir">{request.category}</span> in {districtName} · {request.durationDays}d · {timeLeftLabel(request.expiresAt)}
        </p>
        <p className="mt-1 text-detail font-semibold text-accent-bright">+{request.bonusPct}% bonus rate</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button disabled={busy} onClick={onDecline} className="btn btn-secondary btn-sm disabled:opacity-40">
          Decline
        </button>
        <button disabled={busy} onClick={onOpenAssign} className="btn btn-accent-bright btn-sm disabled:opacity-40">
          Accept
        </button>
      </div>
    </div>
  );
}
