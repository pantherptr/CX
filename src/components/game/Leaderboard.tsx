import { useState } from 'react';
import { Icon } from '../Icon';
import { useLeaderboard, type LeaderboardPeriod } from '../../lib/data/rewards';

/** Rank 1–3 render as a small colored trophy badge instead of a medal
 *  emoji — same stroke-icon language as the rest of the app, just tinted
 *  gold / silver / bronze so the top of the board still reads instantly. */
const MEDAL_COLOR = ['#e0a52a', '#c7ccd6', '#c8814c'];

const TABS: { id: LeaderboardPeriod; label: string }[] = [
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'all', label: 'All-Time' },
];

/** Renders nothing if `enabled` is false — the "optional/configurable"
 *  leaderboard, driven by `game_config.leaderboard_enabled`. */
export function Leaderboard({
  enabled,
  currentUserId,
  eliteThreshold,
  highlightSelf,
}: {
  enabled: boolean;
  currentUserId?: string;
  /** Lowest reward-qualifying score — entries at or above this get a
   *  small "Top 1%" badge. Same real threshold the reward panel itself
   *  uses, just surfaced here too; undefined simply hides the badge. */
  eliteThreshold?: number;
  /** True right after the player's own run just set a new personal best
   *  or landed a qualifying score — gives their row a brief pulse so a
   *  fresh result is easy to spot without needing any new state of its
   *  own (the caller already knows whether the run that just finished
   *  was special). */
  highlightSelf?: boolean;
}) {
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
          const isElite = eliteThreshold !== undefined && e.score >= eliteThreshold;
          const isFirst = i === 0;
          // Ranks 2–3 get a quiet tint of their own medal color — enough
          // to read as "podium" at a glance without competing with #1's
          // heavier gold treatment.
          const isPodium = i === 1 || i === 2;
          return (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-xl border transition-colors ${
                isFirst
                  ? 'border-star/50 bg-star/[0.09] px-3.5 py-3 shadow-[0_0_18px_rgba(224,165,42,0.18)]'
                  : isMe
                    ? `border-accent-bright/40 bg-accent-bright/[0.08] px-3.5 py-2.5 ${highlightSelf ? 'drive-hud-record' : ''}`
                    : isPodium
                      ? 'px-3.5 py-2.5'
                      : 'border-white/10 bg-white/[0.04] px-3.5 py-2.5'
              }`}
              style={
                isPodium && !isMe && !isFirst
                  ? { borderColor: `${MEDAL_COLOR[i]}40`, background: `${MEDAL_COLOR[i]}14` }
                  : undefined
              }
            >
              <span className="grid w-6 shrink-0 place-items-center">
                {MEDAL_COLOR[i] ? (
                  <Icon
                    name="trophy"
                    size={isFirst ? 20 : 16}
                    fill
                    style={{ color: MEDAL_COLOR[i], filter: `drop-shadow(0 0 5px ${MEDAL_COLOR[i]}88)` }}
                  />
                ) : (
                  <span className="text-[12.5px] font-semibold text-white/45">#{i + 1}</span>
                )}
              </span>
              {e.avatar ? (
                <img
                  src={e.avatar}
                  alt=""
                  className={`shrink-0 rounded-full object-cover ${isFirst ? 'h-9 w-9 ring-2 ring-star/60' : isPodium ? 'h-8 w-8 ring-1' : 'h-8 w-8'}`}
                  style={isPodium && !isFirst ? { boxShadow: `0 0 0 1px ${MEDAL_COLOR[i]}88` } : undefined}
                />
              ) : (
                <span
                  className={`grid shrink-0 place-items-center rounded-full bg-white/10 text-white/60 ${isFirst ? 'h-9 w-9 ring-2 ring-star/60' : 'h-8 w-8'}`}
                  style={isPodium && !isFirst ? { boxShadow: `0 0 0 1px ${MEDAL_COLOR[i]}88` } : undefined}
                >
                  <Icon name="user" size={14} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[13.5px] font-medium ${isMe ? 'text-accent-bright' : 'text-white'}`}>
                  {isMe ? 'You' : e.name}
                </span>
                {isElite && (
                  <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-accent-bright/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent-bright">
                    <Icon name="sparkles" size={9} /> Top 1%
                  </span>
                )}
              </span>
              <span className={`shrink-0 font-semibold tabular-nums text-accent-bright ${isFirst ? 'text-[15px]' : 'text-[13.5px]'}`}>
                {e.score.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
