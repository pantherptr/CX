import { Icon } from '../Icon';
import { eur } from '../../lib/format';
import type { PlayerState } from '../../lib/data/empire';
import {
  missionProgress, isMissionClaimed,
  type MissionTemplate, type DailyProgress, type MissionClaim, type WeeklyProgress,
} from '../../lib/data/missions';

function MissionRow({
  mission, playerState, dailyProgress, weeklyProgress, claimed, busy, onClaim,
}: {
  mission: MissionTemplate;
  playerState: PlayerState | null;
  dailyProgress: DailyProgress | null;
  weeklyProgress: WeeklyProgress | null;
  claimed: boolean;
  busy: boolean;
  onClaim: () => void;
}) {
  const progress = missionProgress(mission, playerState, dailyProgress, weeklyProgress);
  const pct = Math.min(100, Math.round((progress / mission.target) * 100));
  const complete = progress >= mission.target;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/8 text-on-noir">
        <Icon name={mission.icon} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-detail font-semibold text-on-noir">{mission.title}</p>
        <p className="text-caption text-on-noir-muted">{mission.description}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 w-full max-w-32 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-accent-bright transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-[10px] text-on-noir-muted tabular-nums">{Math.min(progress, mission.target)}/{mission.target}</span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-caption text-on-noir-muted">{eur(mission.rewardCash)} · +{mission.rewardCxPoints} CX</p>
        {claimed ? (
          <span className="mt-1 inline-block text-[10px] font-semibold uppercase tracking-wide text-on-noir-muted">Claimed</span>
        ) : (
          <button
            disabled={!complete || busy}
            onClick={onClaim}
            className="btn btn-accent-bright btn-sm mt-1 disabled:opacity-40"
          >
            Claim
          </button>
        )}
      </div>
    </div>
  );
}

export function MissionsList({
  missions, playerState, dailyProgress, weeklyProgress, claims, busyMissionId, onClaim,
}: {
  missions: MissionTemplate[];
  playerState: PlayerState | null;
  dailyProgress: DailyProgress | null;
  weeklyProgress: WeeklyProgress | null;
  claims: MissionClaim[];
  busyMissionId: string | null;
  onClaim: (missionId: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const lifetime = missions.filter((m) => m.scope === 'lifetime');
  const daily = missions.filter((m) => m.scope === 'daily');
  const weekly = missions.filter((m) => m.scope === 'weekly');

  return (
    <div className="space-y-6">
      {daily.length > 0 && (
        <div>
          <p className="eyebrow">Today</p>
          <div className="mt-2 space-y-2">
            {daily.map((m) => (
              <MissionRow
                key={m.id}
                mission={m}
                playerState={playerState}
                dailyProgress={dailyProgress}
                weeklyProgress={weeklyProgress}
                claimed={isMissionClaimed(m, claims, today, weeklyProgress?.weekStart)}
                busy={busyMissionId === m.id}
                onClaim={() => onClaim(m.id)}
              />
            ))}
          </div>
        </div>
      )}
      {weekly.length > 0 && (
        <div>
          <p className="eyebrow">This Week</p>
          <div className="mt-2 space-y-2">
            {weekly.map((m) => (
              <MissionRow
                key={m.id}
                mission={m}
                playerState={playerState}
                dailyProgress={dailyProgress}
                weeklyProgress={weeklyProgress}
                claimed={isMissionClaimed(m, claims, today, weeklyProgress?.weekStart)}
                busy={busyMissionId === m.id}
                onClaim={() => onClaim(m.id)}
              />
            ))}
          </div>
        </div>
      )}
      {lifetime.length > 0 && (
        <div>
          <p className="eyebrow">Missions</p>
          <div className="mt-2 space-y-2">
            {lifetime.map((m) => (
              <MissionRow
                key={m.id}
                mission={m}
                playerState={playerState}
                dailyProgress={dailyProgress}
                weeklyProgress={weeklyProgress}
                claimed={isMissionClaimed(m, claims, today, weeklyProgress?.weekStart)}
                busy={busyMissionId === m.id}
                onClaim={() => onClaim(m.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
