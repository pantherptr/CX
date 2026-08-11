import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { Logo } from './primitives';
import { useAuth } from '../lib/auth';

export interface NavItem {
  label: string;
  to: string;
  icon: IconName;
  badge?: number;
}

const customerNav: NavItem[] = [
  { label: 'Overview', to: '/dashboard', icon: 'grid' },
  { label: 'My Trips', to: '/dashboard#trips', icon: 'trips' },
  { label: 'Saved Cars', to: '/dashboard#saved', icon: 'heart' },
  { label: 'Messages', to: '/messages', icon: 'message', badge: 2 },
  { label: 'Profile', to: '/settings', icon: 'user' },
  { label: 'Payments', to: '/settings#payments', icon: 'card' },
  { label: 'Settings', to: '/settings', icon: 'settings' },
];

const hostNav: NavItem[] = [
  { label: 'Overview', to: '/host', icon: 'grid' },
  { label: 'My Cars', to: '/host#cars', icon: 'cars' },
  { label: 'Bookings', to: '/host#bookings', icon: 'trips' },
  { label: 'Calendar', to: '/host#calendar', icon: 'calendar' },
  { label: 'Earnings', to: '/host#earnings', icon: 'euro' },
  { label: 'Messages', to: '/messages', icon: 'message', badge: 2 },
  { label: 'Reviews', to: '/host#reviews', icon: 'reviews' },
  { label: 'Settings', to: '/settings', icon: 'settings' },
];

// Mobile-only drawer content: on mobile, Home/Explore/Trips/Saved/Profile
// already live in the bottom tab bar (see BottomNav.tsx), so the drawer
// here only needs what that bar doesn't cover — host-specific sections
// (for the host variant) plus the same secondary items the marketing
// Navbar's hamburger shows.
const hostOnlyMobileLinks: NavItem[] = [
  { label: 'My Cars', to: '/host#cars', icon: 'cars' },
  { label: 'Bookings', to: '/host#bookings', icon: 'trips' },
  { label: 'Calendar', to: '/host#calendar', icon: 'calendar' },
  { label: 'Earnings', to: '/host#earnings', icon: 'euro' },
  { label: 'Reviews', to: '/host#reviews', icon: 'reviews' },
];

const secondaryMobileLinks: NavItem[] = [
  { label: 'Messages', to: '/messages', icon: 'message', badge: 2 },
  { label: 'Notifications', to: '/notifications', icon: 'bell' },
  { label: 'Payments', to: '/settings#payments', icon: 'card' },
  { label: 'Settings', to: '/settings', icon: 'settings' },
  { label: 'Help & Support', to: '/help', icon: 'headset' },
];

export function DashboardShell({
  variant,
  active,
  children,
  fullHeight = false,
}: {
  variant: 'customer' | 'host';
  active: string;
  children: ReactNode;
  fullHeight?: boolean;
}) {
  const nav = variant === 'customer' ? customerNav : hostNav;
  const [open, setOpen] = useState(false);
  const { signOut, session, profile } = useAuth();
  const navigate = useNavigate();

  const displayName = profile?.full_name || session?.user.email?.split('@')[0] || 'Your account';
  const displayEmail = session?.user.email ?? '';
  const displayAvatar = profile?.avatar_url ?? null;

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => void (document.body.style.overflow = '');
  }, [open]);

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    navigate('/');
  };

  const SidebarInner = (
    <div className="flex h-full flex-col">
      <div className="flex h-[68px] items-center px-5">
        <Logo />
      </div>
      <div className="px-3">
        <div className="hairline" />
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
          {variant === 'customer' ? 'Traveller' : 'Hosting'}
        </p>
        <ul className="flex flex-col gap-0.5">
          {nav.map((n) => {
            const isActive = n.label === active;
            return (
              <li key={n.label}>
                <NavLink
                  to={n.to}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-medium transition-colors ${
                    isActive ? 'bg-ink text-white' : 'text-ink-soft hover:bg-panel'
                  }`}
                >
                  <Icon name={n.icon} size={19} className={isActive ? 'text-white' : 'text-muted'} />
                  <span className="flex-1">{n.label}</span>
                  {n.badge && (
                    <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-accent text-white'}`}>
                      {n.badge}
                    </span>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 px-1">
          <div className="rounded-2xl border border-line bg-panel/60 p-4">
            <p className="text-[13px] font-medium text-ink">
              {variant === 'customer' ? 'Earn with your car' : 'Grow your fleet'}
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              {variant === 'customer'
                ? 'List a car and start earning on the days you’re not driving.'
                : 'Add another vehicle and increase your monthly income.'}
            </p>
            <Link to="/list-your-car" className="btn btn-primary btn-sm mt-3 w-full">
              {variant === 'customer' ? 'Become a host' : 'Add a car'}
            </Link>
          </div>
        </div>
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
          {displayAvatar ? (
            <img src={displayAvatar} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-050 text-accent">
              <Icon name="user" size={16} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium text-ink">{displayName}</p>
            <p className="truncate text-[12px] text-muted">{displayEmail}</p>
          </div>
          <button onClick={handleSignOut} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-panel" aria-label="Sign out">
            <Icon name="logout" size={17} />
          </button>
        </div>
      </div>
    </div>
  );

  // Mobile drawer: Home/Explore/Trips/Saved/Profile already live in the
  // bottom tab bar on mobile (BottomNav.tsx) — this only needs what that
  // bar doesn't cover.
  const mobileLinks = variant === 'host' ? [...hostOnlyMobileLinks, ...secondaryMobileLinks] : secondaryMobileLinks;
  const MobileDrawerInner = (
    <div className="flex h-full flex-col">
      <div className="flex h-[68px] items-center justify-between px-5">
        <Logo />
        <button
          onClick={() => setOpen(false)}
          className="grid h-10 w-10 place-items-center rounded-xl hover:bg-panel"
          aria-label="Close menu"
        >
          <Icon name="x" size={22} />
        </button>
      </div>
      <div className="px-3">
        <div className="hairline" />
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="flex flex-col gap-0.5">
          {mobileLinks.map((n) => (
            <li key={n.label}>
              <NavLink
                to={n.to}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-medium text-ink-soft transition-colors hover:bg-panel"
              >
                <Icon name={n.icon} size={19} className="text-muted" />
                <span className="flex-1">{n.label}</span>
                {n.badge && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-semibold text-white">
                    {n.badge}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
          {displayAvatar ? (
            <img src={displayAvatar} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-050 text-accent">
              <Icon name="user" size={16} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium text-ink">{displayName}</p>
            <p className="truncate text-[12px] text-muted">{displayEmail}</p>
          </div>
        </div>
        <button onClick={handleSignOut} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14.5px] text-danger hover:bg-panel">
          <Icon name="logout" size={19} />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 border-r border-line bg-surface lg:block">
        {SidebarInner}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <div className="absolute inset-0 bg-ink/40 animate-fade-in" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[80%] max-w-xs animate-[fade-up_0.3s_ease] bg-surface shadow-pop">
            {MobileDrawerInner}
          </div>
        </div>
      )}

      <div className={`flex min-w-0 flex-1 flex-col ${fullHeight ? 'h-screen' : ''}`}>
        {/* Topbar */}
        <header className="sticky top-0 z-40 flex h-[64px] items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur-xl sm:px-6">
          <button onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl text-ink hover:bg-panel lg:hidden" aria-label="Open menu">
            <Icon name="menu" size={22} />
          </button>
          <div className="relative hidden max-w-sm flex-1 sm:block">
            <Icon name="search" size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input placeholder="Search trips, cars, hosts…" className="input !py-2.5 !pl-10 bg-surface" />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Link to="/browse" className="btn btn-secondary btn-sm hidden sm:inline-flex">Find a car</Link>
            <Link to="/notifications" className="grid h-10 w-10 place-items-center rounded-xl text-ink hover:bg-panel" aria-label="Notifications">
              <Icon name="bell" size={20} />
            </Link>
            <Link to="/settings">
              {displayAvatar ? (
                <img src={displayAvatar} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-050 text-accent">
                  <Icon name="user" size={16} />
                </span>
              )}
            </Link>
          </div>
        </header>

        <main className={`min-w-0 flex-1 ${fullHeight ? 'overflow-hidden' : ''}`}>{children}</main>
      </div>
    </div>
  );
}

export function StatCard({
  icon,
  label,
  value,
  trend,
  accent,
}: {
  icon: IconName;
  label: string;
  value: string;
  trend?: string;
  accent?: boolean;
}) {
  return (
    <div className={`card p-5 ${accent ? '!bg-ink text-white !border-ink' : ''}`}>
      <div className="flex items-center justify-between">
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${accent ? 'bg-white/10 text-white' : 'bg-panel text-ink-soft'}`}>
          <Icon name={icon} size={20} />
        </span>
        {trend && (
          <span className={`inline-flex items-center gap-1 text-[12.5px] font-medium ${accent ? 'text-accent-100' : 'text-accent'}`}>
            <Icon name="trending" size={14} /> {trend}
          </span>
        )}
      </div>
      <p className={`mt-4 font-display text-2xl font-semibold ${accent ? 'text-white' : 'text-ink'}`}>{value}</p>
      <p className={`mt-0.5 text-[13px] ${accent ? 'text-white/60' : 'text-muted'}`}>{label}</p>
    </div>
  );
}
