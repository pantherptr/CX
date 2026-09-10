import { Icon } from '../Icon';
import { RARITY_META, type PlayerState } from '../../lib/data/empire';
import { achievementProgress, type AchievementTemplate, type AchievementUnlock } from '../../lib/data/achievements';

/** Locked (dim) vs unlocked (rarity-glow) achievement badge grid. */
export function AchievementGrid({
  achievements, unlocks, playerState,
}: {
  achievements: AchievementTemplate[];
  unlocks: AchievementUnlock[];
  playerState: PlayerState | null;
}) {
  const unlockedIds = new Set(unlocks.map((u) => u.achievementId));

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {achievements.map((a) => {
        const isUnlocked = unlockedIds.has(a.id);
        const meta = RARITY_META[a.rarity];
        const progress = achievementProgress(a, playerState);
        const pct = Math.min(100, Math.round((progress / a.target) * 100));

        return (
          <div
            key={a.id}
            className={`rounded-2xl border p-4 text-center transition-opacity ${isUnlocked ? 'border-white/15' : 'border-white/8 opacity-45'}`}
            style={isUnlocked ? { boxShadow: meta.glow } : undefined}
          >
            <span
              className="mx-auto grid h-12 w-12 place-items-center rounded-full"
              style={{ background: isUnlocked ? `${meta.color}1f` : 'rgba(255,255,255,0.06)', color: isUnlocked ? meta.color : 'var(--color-on-noir-muted)' }}
            >
              <Icon name={a.icon} size={22} />
            </span>
            <p className="mt-2 text-detail font-semibold text-on-noir">{a.title}</p>
            <p className="mt-0.5 text-caption text-on-noir-muted">{a.description}</p>
            {!isUnlocked && (
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-white/30" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
