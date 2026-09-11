import { Icon } from '../Icon';
import type { CityEvent, District } from '../../lib/data/districts';
import type { InventoryCar, PlayerState } from '../../lib/data/empire';
import { actionableCityEvents } from '../../lib/empireActions';

function timeLeftLabel(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return 'ending soon';
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m left`;
}

/** Turns a passive city event into an actionable decision — surfaced
 *  only when it's actually relevant: the district is unlocked and the
 *  player owns a car that matches. Pure client-side derivation over
 *  already-fetched data, no new RPC. */
export function EventDecisionBanner({
  events, districts, ownedCars, playerState, dismissed, onDismiss, onAssign,
}: {
  events: CityEvent[];
  districts: District[];
  ownedCars: InventoryCar[];
  playerState: PlayerState | null;
  dismissed: Set<string>;
  onDismiss: (eventId: string) => void;
  onAssign: (district: District) => void;
}) {
  const businessTier = playerState?.businessTier ?? 1;
  const actionable = actionableCityEvents(events, districts, ownedCars, businessTier, dismissed);

  if (actionable.length === 0) return null;

  return (
    <div className="mb-6 flex flex-col gap-2">
      {actionable.map(({ event, district }) => (
        <div key={event.id} className="flex items-center gap-3 rounded-2xl border border-accent-bright/25 bg-accent-bright/8 px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-bright/15 text-accent-bright">
            <Icon name="bolt" size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-detail font-semibold text-on-noir">
              {event.title} in {district.name} — +{event.effectPct}% demand
            </p>
            <p className="text-caption text-on-noir-muted">You have a matching car · {timeLeftLabel(event.endsAt)}</p>
          </div>
          <button onClick={() => onAssign(district)} className="btn btn-accent-bright btn-sm shrink-0">
            Assign Now
          </button>
          <button onClick={() => onDismiss(event.id)} className="shrink-0 text-on-noir-muted hover:text-on-noir">
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
