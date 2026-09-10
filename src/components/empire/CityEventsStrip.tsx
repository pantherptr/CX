import { Icon } from '../Icon';
import type { CityEvent, District } from '../../lib/data/districts';

function timeLeftLabel(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return 'Ending…';
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m left`;
}

/** Live city events ticker — same chip-strip template as Empire.tsx's
 *  HotCarsStrip. */
export function CityEventsStrip({ events, districts }: { events: CityEvent[]; districts: District[] }) {
  if (events.length === 0) return null;
  const districtName = (key: string) => districts.find((d) => d.districtKey === key)?.name ?? key;

  return (
    <div className="mb-6">
      <p className="eyebrow">City Events</p>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {events.map((e) => (
          <div key={e.id} className="flex shrink-0 items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3.5 py-2">
            <Icon name="bolt" size={13} className="text-accent-bright" />
            <span className="text-detail font-semibold text-on-noir">{e.title}</span>
            <span className="text-caption text-on-noir-muted">
              {districtName(e.districtKey)}
              {e.category ? ` · ${e.category}` : ''} · +{e.effectPct}% · {timeLeftLabel(e.endsAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
