import { Icon, type IconName } from '../Icon';

function timeLeftLabel(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return 'ending soon';
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m left`;
}

/** One row in the Live Action Center — presentational only, no state or
 *  RPC calls of its own. */
export function LiveActionCard({
  icon, categoryLabel, title, detail, rewardLabel, countdownEndsAt, actionLabel, onAction,
}: {
  icon: IconName;
  categoryLabel: string;
  title: string;
  detail?: string;
  rewardLabel?: string;
  countdownEndsAt?: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-noir-2 p-3.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-bright/10 text-accent-bright">
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-on-noir-muted/70">{categoryLabel}</p>
        <p className="truncate text-detail font-semibold text-on-noir">{title}</p>
        {detail && <p className="truncate text-caption text-on-noir-muted">{detail}</p>}
        <div className="mt-1 flex items-center gap-2 text-caption">
          {rewardLabel && <span className="font-semibold text-accent-bright">{rewardLabel}</span>}
          {countdownEndsAt && <span className="text-on-noir-muted">{timeLeftLabel(countdownEndsAt)}</span>}
        </div>
      </div>
      <button onClick={onAction} className="btn btn-accent-bright btn-sm shrink-0">
        {actionLabel}
      </button>
    </div>
  );
}
