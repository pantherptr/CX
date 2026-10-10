import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { SignalS } from './SignalLogo';
import type { ReactNode } from 'react';

/** The look every main menu shares (site header drawer, dashboard sidebar, app drawer): each row has
 *  its icon on a small rounded tile, the active row is quietly filled and its tile turns solid. */
export function navRowClass(active: boolean) {
  return `group flex items-center gap-3 rounded-2xl px-2 py-1.5 text-[15px] transition-colors active:bg-panel ${
    active ? 'bg-panel font-semibold text-ink' : 'font-medium text-ink-soft hover:bg-panel/70 hover:text-ink'
  }`;
}

export function NavIconTile({ icon, active, accent = false }: { icon: IconName; active?: boolean; accent?: boolean }) {
  return (
    <span
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors ${
        active ? 'bg-ink text-white' : accent ? 'bg-accent-050 text-accent-700' : 'bg-panel text-ink-soft group-hover:bg-surface'
      }`}
    >
      <Icon name={icon} size={18} strokeWidth={active ? 2.1 : 1.8} />
    </span>
  );
}

/** SIGNAL as the one dark, featured entry: the S, the name and what it is, on a soft green glow. */
export function SignalNavCard({ onClick, subtitle = 'Community & news' }: { onClick?: () => void; subtitle?: ReactNode }) {
  return (
    <NavLink
      to="/signal"
      onClick={onClick}
      className="group relative mb-4 flex items-center gap-3 overflow-hidden rounded-2xl bg-noir px-3.5 py-3 text-on-noir shadow-[0_10px_30px_-16px_rgba(0,0,0,0.6)] transition-transform active:scale-[0.99]"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-6 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full opacity-90 blur-2xl"
        style={{ background: 'radial-gradient(closest-side, rgba(0,212,71,0.55), transparent)' }}
      />
      <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/[0.06] ring-1 ring-white/10">
        <SignalS size={26} className="transition-transform duration-300 group-hover:scale-110" />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-[15px] font-bold leading-tight tracking-[0.12em]">SIGNAL</span>
        <span className="mt-0.5 block text-caption leading-tight text-on-noir-muted">{subtitle}</span>
      </span>
      <Icon name="arrowUpRight" size={17} className="relative text-accent-bright transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </NavLink>
  );
}
