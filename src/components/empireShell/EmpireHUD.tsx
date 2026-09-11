import { Icon, type IconName } from '../Icon';
import { EmpireLogo } from '../EmpireLogo';
import { eur } from '../../lib/format';
import type { EmpireShellMode } from './EmpireGameShell';

export interface EmpireHudData {
  levelLabel: string;
  /** 0-100 progress toward the next level, or null when there isn't one
   *  (maxed out) or it can't be computed yet. */
  levelProgress: number | null;
  cash: number;
  reputation: number;
  score: number;
  claimableCount: number;
}

function HudChip({ icon, label, value, progress }: { icon: IconName; label: string; value: string; progress?: number | null }) {
  return (
    <div className="flex shrink-0 flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 sm:px-3">
      <div className="flex items-center gap-1.5">
        <Icon name={icon} size={13} className="shrink-0 text-accent-bright" />
        <span className="font-display text-detail font-semibold tabular-nums text-on-noir">{value}</span>
      </div>
      <div className="hidden items-center gap-1.5 sm:flex">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-on-noir-muted/70">{label}</span>
      </div>
      {typeof progress === 'number' && (
        <div className="hidden h-[3px] w-full overflow-hidden rounded-full bg-white/10 sm:block">
          <div className="h-full rounded-full bg-accent-bright transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
    </div>
  );
}

/** Empire's own slim top bar — replaces the site's Navbar entirely on
 *  this route. Not a SaaS header: compact stat chips instead of a big
 *  hero, a claimable-missions badge, and one always-present, non-
 *  destructive way out ("Exit Empire"). Stat chips only render in
 *  `game` mode — the title/loading screens have no player state yet. */
export function EmpireHUD({
  mode,
  data,
  onExit,
}: {
  mode: EmpireShellMode;
  data?: EmpireHudData;
  onExit: () => void;
}) {
  return (
    <header className="relative z-20 flex h-16 shrink-0 items-center gap-3 border-b border-white/10 bg-noir/85 px-4 pt-safe backdrop-blur-xl sm:px-6">
      <div className="empire-hud-scroll flex min-w-0 flex-1 items-center gap-3 overflow-x-auto">
        <EmpireLogo size={26} />
        <span className="hidden shrink-0 font-display text-lead font-semibold tracking-wide text-on-noir sm:inline">CX CITY EMPIRE</span>

        {mode === 'game' && data && (
          <div className="ml-1 flex items-center gap-2 pr-4">
            <HudChip icon="trophy" label={data.levelLabel} value={`${data.score.toLocaleString('en-GB')} CX`} progress={data.levelProgress} />
            <HudChip icon="wallet" label="Cash" value={eur(data.cash)} />
            <HudChip icon="shield" label="Reputation" value={`${data.reputation}/100`} />
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {mode === 'game' && data && data.claimableCount > 0 && (
          <span className="relative grid h-9 w-9 place-items-center rounded-full border border-white/15 text-on-noir-muted" aria-label={`${data.claimableCount} claimable`}>
            <Icon name="bell" size={16} />
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent-bright px-1 text-[10px] font-bold text-noir">
              {data.claimableCount}
            </span>
          </span>
        )}
        <button
          onClick={onExit}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-2 text-detail font-semibold text-on-noir-muted transition-colors duration-200 hover:border-white/30 hover:text-on-noir"
        >
          <Icon name="logout" size={15} />
          <span className="hidden sm:inline">Exit Empire</span>
        </button>
      </div>
    </header>
  );
}
