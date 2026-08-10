import type { Host } from '../data/types';
import { Icon } from './Icon';
import { useApp } from '../lib/store';

export function HostCard({ host }: { host: Host }) {
  const { toast } = useApp();
  return (
    <div className="card p-6">
      <div className="flex items-center gap-4">
        <div className="relative">
          <img src={host.avatar} alt={host.name} className="h-16 w-16 rounded-full object-cover" />
          {host.verified && (
            <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border-2 border-surface bg-accent text-white">
              <Icon name="check" size={13} strokeWidth={3} />
            </span>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-semibold text-ink">{host.name}</h3>
            {host.isSuperhost && <span className="badge badge-accent">Superhost</span>}
          </div>
          <p className="text-[13.5px] text-muted">Host since {host.joined}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 divide-x divide-line rounded-xl border border-line">
        {[
          { v: host.rating.toFixed(2), l: 'Rating', icon: 'star' as const },
          { v: host.trips, l: 'Trips', icon: 'route' as const },
          { v: `${host.responseRate}%`, l: 'Response', icon: 'message' as const },
        ].map((s) => (
          <div key={s.l} className="px-2 py-3 text-center">
            <p className="text-[17px] font-semibold text-ink">{s.v}</p>
            <p className="text-[12px] text-muted">{s.l}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[13.5px] text-muted">
        <Icon name="clock" size={15} className="text-accent" /> Typically responds {host.responseTime}
      </p>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-soft text-pretty">{host.bio}</p>

      <button
        onClick={() => toast({ title: `Message sent to ${host.name.split(' ')[0]}`, icon: 'message' })}
        className="btn btn-secondary btn-block mt-5"
      >
        <Icon name="message" size={16} /> Contact {host.name.split(' ')[0]}
      </button>
    </div>
  );
}
