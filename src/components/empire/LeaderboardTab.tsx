import { Icon } from '../Icon';
import { eur } from '../../lib/format';
import type { LeaderboardEntry } from '../../lib/data/leaderboard';

/** Ranked list — avatar, name, business tier, net worth. */
export function LeaderboardTab({ entries, currentUserId }: { entries: LeaderboardEntry[] | null; currentUserId: string | undefined }) {
  if (entries === null) {
    return <p className="text-detail text-on-noir-muted">Loading leaderboard…</p>;
  }
  if (entries.length === 0) {
    return <p className="text-detail text-on-noir-muted">No players yet — be the first to build an empire.</p>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-noir-2">
      {entries.map((e, i) => {
        const isMe = e.userId === currentUserId;
        return (
          <div
            key={e.userId}
            className={`flex items-center gap-3 border-b border-white/6 px-4 py-3 last:border-b-0 ${isMe ? 'bg-accent-bright/8' : ''}`}
          >
            <span className="w-6 shrink-0 text-center font-display text-detail font-bold text-on-noir-muted tabular-nums">{i + 1}</span>
            {e.avatarUrl ? (
              <img src={e.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-on-noir">
                <Icon name="user" size={16} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-detail font-semibold text-on-noir">{e.fullName}{isMe ? ' (You)' : ''}</p>
              <p className="text-caption text-on-noir-muted">Business Tier {e.businessTier}</p>
            </div>
            <span className="shrink-0 font-display text-detail font-semibold text-on-noir tabular-nums">{eur(e.netWorth)}</span>
          </div>
        );
      })}
    </div>
  );
}
