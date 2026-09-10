import { Icon } from '../Icon';
import { eur } from '../../lib/format';
import type { ActivityCategory, ActivityItem } from '../../lib/data/activity';

const CATEGORY_COLOR: Record<ActivityCategory, string> = {
  booking: '#4fb2ff',
  contract: '#b06bff',
  event: '#00d447',
  finance: '#3ecf8e',
  competition: '#ff9f40',
  mission: '#ff5fd1',
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ActivityFeedItem({ item }: { item: ActivityItem }) {
  const color = CATEGORY_COLOR[item.category];

  return (
    <div className="flex gap-3 border-l-2 py-2.5 pl-3" style={{ borderColor: color }}>
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: `${color}1f`, color }}>
        <Icon name={item.icon} size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-detail font-semibold text-on-noir">{item.title}</p>
        {item.body && <p className="mt-0.5 text-caption text-on-noir-muted">{item.body}</p>}
        <p className="mt-1 text-[10px] uppercase tracking-wide text-on-noir-muted/60">{timeAgo(item.createdAt)}</p>
      </div>
      {(item.amount !== null || item.cxPoints !== null) && (
        <div className="shrink-0 text-right">
          {item.amount !== null && (
            <p className={`text-detail font-semibold tabular-nums ${item.amount >= 0 ? 'text-accent-bright' : 'text-danger'}`}>
              {item.amount >= 0 ? '+' : ''}{eur(item.amount)}
            </p>
          )}
          {item.cxPoints !== null && <p className="text-[10px] text-on-noir-muted tabular-nums">+{item.cxPoints} CX</p>}
        </div>
      )}
    </div>
  );
}
