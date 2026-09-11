import { Icon, type IconName } from '../Icon';

export interface EmpireNavItem<T extends string = string> {
  key: T;
  label: string;
  icon: IconName;
}

/** Empire's own in-game navigation — deliberately not styled like the
 *  site's Navbar/BottomNav pill conventions, so it reads as a different
 *  product's menu. One component covers both layouts: a slim bar in
 *  normal flow under the HUD on desktop, and a fixed bottom bar (safe-
 *  area aware, like the site's own BottomNav) on mobile — so Empire
 *  never stacks its nav on top of the site's, and never squeezes a
 *  desktop layout onto a phone screen. */
export function EmpireNavigation<T extends string>({
  items,
  active,
  onChange,
}: {
  items: EmpireNavItem<T>[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-around border-t border-white/10 bg-noir/95 px-1 pb-safe pt-2 backdrop-blur-xl lg:static lg:justify-start lg:gap-2 lg:overflow-x-auto lg:border-b lg:border-t-0 lg:bg-transparent lg:px-6 lg:py-2.5 lg:backdrop-blur-none"
      aria-label="Empire"
    >
      {items.map((it) => {
        const isActive = it.key === active;
        return (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            aria-current={isActive ? 'page' : undefined}
            aria-label={it.label}
            className={`flex flex-1 shrink-0 flex-col items-center gap-1 rounded-xl py-1.5 transition-all duration-300 lg:flex-none lg:flex-row lg:gap-2 lg:rounded-full lg:px-4 lg:py-2 ${
              isActive
                ? 'text-accent-bright lg:bg-accent-bright/15 lg:text-accent-bright'
                : 'text-on-noir-muted/70 hover:text-on-noir lg:hover:bg-white/5'
            }`}
          >
            <span
              className={`grid h-8 w-8 place-items-center rounded-full transition-all duration-300 lg:h-auto lg:w-auto lg:rounded-none ${isActive ? 'bg-accent-bright/15' : ''}`}
              style={isActive ? { filter: 'drop-shadow(0 0 6px rgba(0,212,71,0.55))' } : undefined}
            >
              <Icon name={it.icon} size={19} className="lg:hidden" />
              <Icon name={it.icon} size={15} className="hidden lg:inline" />
            </span>
            <span className="sr-only text-nano font-semibold uppercase tracking-wide lg:not-sr-only lg:text-detail lg:normal-case lg:tracking-normal">
              {it.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
