import { type ReactNode } from 'react';
import { EmpireWorldBackdrop } from './EmpireWorldBackdrop';
import { EmpireHUD, type EmpireHudData } from './EmpireHUD';
import { EmpireNavigation, type EmpireNavItem } from './EmpireNavigation';

export type EmpireShellMode = 'title' | 'loading' | 'game';

/** The Empire game shell — Empire's entire chrome. Rendered directly by
 *  the `/empire` route (a sibling of the site's MarketingLayout, not a
 *  child of it, see App.tsx), so there is no site Navbar/Footer/BottomNav
 *  anywhere in this tree to begin with; this component supplies its own
 *  in place of them. `mode` controls how much of the chrome makes sense
 *  to show: `title` (signed out — no player state), `loading` (signed in,
 *  data not ready), `game` (the full HUD + navigation). */
export function EmpireGameShell<T extends string>({
  mode,
  activeTab,
  navItems,
  onTabChange,
  onExit,
  exiting = false,
  hud,
  children,
}: {
  mode: EmpireShellMode;
  activeTab?: T;
  navItems?: EmpireNavItem<T>[];
  onTabChange?: (tab: T) => void;
  onExit: () => void;
  /** True for the brief moment after "Exit Empire" is pressed, before the
   *  route actually changes — fades to noir so leaving the game reads as
   *  a deliberate transition rather than an abrupt cut. */
  exiting?: boolean;
  hud?: EmpireHudData;
  children: ReactNode;
}) {
  const showNav = mode === 'game' && activeTab !== undefined && navItems && onTabChange;
  return (
    <div className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-noir text-on-noir">
      <EmpireWorldBackdrop activeTab={mode === 'game' && activeTab ? activeTab : null} />
      <EmpireHUD mode={mode} data={hud} onExit={onExit} />
      <main className={`relative z-10 flex-1 overflow-y-auto px-4 pt-6 sm:px-6 lg:px-10 ${showNav ? 'pb-24 lg:pb-10' : 'pb-10'}`}>
        <div className="container-page !px-0">{children}</div>
      </main>
      {showNav && <EmpireNavigation items={navItems} active={activeTab as T} onChange={onTabChange!} />}
      {exiting && (
        <div className="pointer-events-none fixed inset-0 z-[300] bg-noir opacity-0" style={{ animation: 'fade-in 200ms ease forwards' }} />
      )}
    </div>
  );
}
