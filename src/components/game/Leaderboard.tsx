import { useState } from 'react';
import { Icon } from '../Icon';
import { useLeaderboard, type LeaderboardPeriod } from '../../lib/data/rewards';

const MEDALS = ['🥇', '🥈', '🥉'];

const TABS: { id: LeaderboardPeriod; label: string }[] = [
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'all', label: 'All-Time' },
];

/** Renders nothing if `enabled` is false — the "optional/configurable"
 *  leaderboard, driven by `game_config.leaderboard_enabled`. */
export function Leaderboard({ enabled, currentUserId }: { enabled: boolean; currentUserId?: string }) {
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const entries = useLeaderboard(period, enabled);

  if (!enabled) return null;

  return (
    <div className="w-full max-w-sm">
      <p className="flex items-center justify-center gap-2 text-center text-[12px] font-semibold uppercase tracking-wide text-white/60">
        <img src="/cx-drive-challenge-icon.png" alt="" className="h-5 w-5 rounded object-cover" style={{ objectPosition: '50% 12%' }} />
        <Icon name="trophy" size={14} /> CX Drivers
      </p>
      <div className="mt-3 flex justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setPeriod(t.id)}
            className={`flex-1 rounded-lg py-1.5 text-[12.5px] font-medium transition-colors ${
              period === t.id ? 'bg-white text-noir' : 'text-white/55 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div key={period} className="mt-3 animate-fade-in space-y-1.5">
        {entries === null &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-12 rounded-xl" />
          ))}
        {entries?.length === 0 && (
          <p className="py-6 text-center text-[13px] text-white/45">No runs yet — be the first.</p>
        )}
        {entries?.map((e, i) => {
          const isMe = !!currentUserId && e.userId === currentUserId;
          return (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors ${
                isMe ? 'border-accent-bright/40 bg-accent-bright/[0.08]' : 'border-white/10 bg-white/[0.04]'
              }`}
            >
              <span className="w-6 shrink-0 text-center text-[15px]">
                {MEDALS[i] ?? <span className="text-[12.5px] font-semibold text-white/45">#{i + 1}</span>}
              </span>
              {e.avatar ? (
                <img src={e.avatar} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-white/60">
                  <Icon name="user" size={14} />
                </span>
              )}
              <span className={`min-w-0 flex-1 truncate text-[13.5px] font-medium ${isMe ? 'text-accent-bright' : 'text-white'}`}>
                {isMe ? 'You' : e.name}
              </span>
              <span className="shrink-0 text-[13.5px] font-semibold tabular-nums text-accent-bright">
                {e.score.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
