import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { Logo } from './primitives';
import { useAuth } from '../lib/auth';
import { customerNav, hostNav } from '../lib/nav';
import { useUnreadMessageCount } from '../lib/data/messages';
import { ConciergeLauncher } from './Concierge';

const links = [
  { to: '/browse', label: 'Cars' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/list-your-car', label: 'List Your Car' },
  { to: '/about', label: 'About' },
];

/** Marketing header — logged-out visitors only. Full nav, sign in / create
 *  account. Never rendered for an authenticated session (see `AppNavbar`). */
function PublicNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // PublicNavbar only ever renders for a logged-out session (see `Navbar`
  // below), but the auth-button slot still branches on it directly rather
  // than assuming — correct if that routing rule ever changes, free
  // otherwise.
  const { session, profile } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => void (document.body.style.overflow = '');
  }, [menuOpen]);

  // Only the homepage has a hero worth floating a transparent bar over —
  // every other public page keeps the normal solid, in-flow header. The
  // instant the visitor scrolls even 8px, it snaps to the same solid/glass
  // treatment those pages already use, so there's exactly one "scrolled"
  // look across the whole site, not two to keep in sync.
  const transparent = pathname === '/' && !scrolled;
  const homeLogo = pathname === '/' ? 'wordmark' : 'auto';

  return (
    <>
      <header
        className={`z-50 border-b backdrop-blur-xl transition-all duration-300 ${
          transparent
            ? 'fixed inset-x-0 top-0 border-transparent bg-transparent'
            : `sticky top-0 ${scrolled ? 'border-line bg-surface/90 shadow-[0_1px_0_rgba(22,22,26,0.04)]' : 'border-transparent bg-surface/70'}`
        }`}
      >
        <nav
          className={`container-page flex items-center justify-between gap-4 transition-[height] duration-300 ${
            scrolled ? 'h-14' : 'h-16'
          }`}
        >
          <div className="flex items-center gap-10">
            <Logo variant={homeLogo} />
            <ul className="hidden items-center gap-0.5 lg:flex">
              {links.map((l) => (
                <li key={l.to}>
                  <NavLink
                    to={l.to}
                    className={({ isActive }) =>
                      `group relative rounded-lg px-3.5 py-2 text-detail font-medium transition-colors ${
                        transparent
                          ? isActive
                            ? 'text-ink'
                            : 'text-ink-soft hover:text-ink'
                          : isActive
                            ? 'text-ink'
                            : 'text-muted hover:text-ink'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {l.label}
                        <span
                          className={`absolute inset-x-3.5 -bottom-0.5 h-px rounded-full bg-accent-bright transition-all duration-300 ${
                            isActive
                              ? 'scale-x-100 opacity-100'
                              : 'scale-x-0 opacity-0 group-hover:scale-x-50 group-hover:opacity-40'
                          }`}
                        />
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
            <Link
              to="/empire"
              className={`group relative hidden items-center gap-2 rounded-lg px-3 py-2 text-detail font-semibold transition-colors lg:inline-flex ${
                transparent ? 'text-accent-700' : 'text-accent-700'
              }`}
            >
              <span
                className="pointer-events-none absolute inset-0 -z-10 rounded-lg opacity-0 blur-[10px] transition-opacity duration-300 group-hover:opacity-100"
                style={{ background: 'radial-gradient(closest-side, rgba(0,212,71,0.32), transparent 75%)' }}
              />
              <Icon name="trophy" size={17} className="transition-transform duration-300 group-hover:scale-110" />
              <span className="tracking-wide">EMPIRE</span>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/signup" className="btn btn-accent-bright btn-sm hidden sm:inline-flex">
              Create account
            </Link>

            {session ? (
              <Link
                to="/dashboard"
                aria-label="Your account"
                className={`pressable grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border transition-colors ${
                  transparent
                    ? 'border-ink/15 bg-white/50 text-ink hover:border-ink/35'
                    : 'border-line-strong bg-panel text-ink-soft hover:border-ink'
                }`}
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Icon name="user" size={16} />
                )}
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className={`pressable hidden text-detail font-medium transition-colors min-[420px]:inline-flex ${
                    transparent ? 'text-ink-soft hover:text-ink' : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  Log in
                </Link>
                <Link
                  to="/login"
                  className={`pressable inline-flex h-9 items-center rounded-full border px-4 text-detail font-semibold transition-colors duration-200 ${
                    transparent
                      ? 'border-ink/15 bg-white/55 text-ink backdrop-blur-md hover:border-ink/35 hover:bg-white/75'
                      : 'border-line-strong bg-surface text-ink shadow-hair hover:border-ink hover:bg-panel'
                  }`}
                >
                  Sign in
                </Link>
              </>
            )}

            <button
              onClick={() => setMenuOpen(true)}
              className={`grid h-10 w-10 place-items-center rounded-xl transition-colors lg:hidden ${
                transparent ? 'text-ink hover:bg-white/45' : 'text-ink hover:bg-panel'
              }`}
              aria-label="Open menu"
            >
              <Icon name="menu" size={22} />
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile drawer — rendered OUTSIDE <header> so the header's
          backdrop-filter doesn't trap this fixed element in a 68px box. */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-0 flex h-full w-[88%] max-w-sm animate-[slide-in-right_0.35s_var(--ease-out-expo)] flex-col overflow-hidden bg-noir text-white shadow-pop">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-56 opacity-70" style={{ background: 'radial-gradient(70% 75% at 85% 0%, rgba(0,212,71,0.2), transparent 70%)' }} />
            <div className="relative flex h-[68px] items-center justify-between border-b border-white/10 px-5">
              <Logo variant="wordmark" />
              <button
                onClick={() => setMenuOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Close menu"
              >
                <Icon name="x" size={22} />
              </button>
            </div>
            <div className="relative flex-1 overflow-y-auto p-5">
              <div className="mb-6 pr-4">
                <p className="text-caption font-semibold uppercase tracking-[0.2em] text-accent-bright">CX Automotive Experience</p>
                <p className="mt-2 font-display text-2xl font-semibold leading-tight text-white">Choose your next drive.</p>
              </div>
              <ConciergeLauncher className="group relative mb-5 flex w-full items-center justify-between overflow-hidden rounded-2xl border border-accent-bright/30 bg-accent-bright px-4 py-4 text-left text-noir shadow-[0_10px_30px_rgba(0,212,71,0.18)] transition-transform duration-200 active:scale-[0.98]">
                <span>
                  <span className="block text-caption font-bold uppercase tracking-[0.16em] text-noir/65">Find your CX</span>
                  <span className="mt-1 block text-lead font-semibold">Tell us how you want to drive</span>
                </span>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-noir text-accent-bright transition-transform duration-300 group-hover:translate-x-0.5">
                  <Icon name="arrowRight" size={18} />
                </span>
              </ConciergeLauncher>
              <p className="mb-2 px-1 text-caption font-semibold uppercase tracking-[0.18em] text-white/40">Explore CX</p>
              <ul className="flex flex-col gap-1">
                {links.map((l) => (
                  <li key={l.to}>
                    <NavLink
                      to={l.to}
                      className={({ isActive }) =>
                        `flex items-center justify-between rounded-xl px-3 py-3 text-lead font-medium transition-colors ${
                          isActive ? 'bg-white/10 text-white' : 'text-white/78 hover:bg-white/[0.07] hover:text-white'
                        }`
                      }
                    >
                      {l.label}
                      <Icon name="chevronRight" size={18} className="text-white/35" />
                    </NavLink>
                  </li>
                ))}
                <li onClick={() => setMenuOpen(false)}>
                  <Link to="/empire" className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.06] px-3 py-3 text-lead font-bold text-white transition-colors hover:bg-white/10">
                    <span className="flex items-center gap-3">
                      <Icon name="trophy" size={22} className="text-accent-bright" />
                      <span className="tracking-wide">CAR EMPIRE</span>
                    </span>
                    <Icon name="chevronRight" size={18} className="text-accent-bright" />
                  </Link>
                </li>
              </ul>
              <div className="my-5 h-px bg-white/10" />
              <div className="flex flex-col gap-2 px-1">
                <Link to="/login" className="btn btn-block border border-white/20 bg-white/[0.06] text-white hover:border-white/35 hover:bg-white/10">
                  Sign in
                </Link>
                <Link to="/signup" className="btn btn-accent-bright btn-block">
                  Create an account
                </Link>
              </div>
            </div>
            <div className="relative border-t border-white/10 p-5">
              <button
                onClick={() => navigate('/list-your-car')}
                className="btn btn-accent-bright btn-block btn-lg"
              >
                List Your Car
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** App header — authenticated sessions only. No marketing links, no "Sign
 *  in": logo, search, notifications, profile, and a menu drawer carrying
 *  the same driver/host nav as the dashboard sidebar (`src/lib/nav.ts`).
 *  This is what makes the product feel like a private platform rather
 *  than "the homepage with a logged-in user" on pages that have no
 *  sidebar of their own (Browse, car details, help, booking, list-a-car). */
function AppNavbar() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mode, setMode] = useState<'customer' | 'host'>('customer');
  const [query, setQuery] = useState('');
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { session, profile, signOut } = useAuth();
  const isHost = !!profile?.is_host;
  const unreadCount = useUnreadMessageCount(session?.user.id);
  const nav = mode === 'host' && isHost ? hostNav(unreadCount) : customerNav(unreadCount);

  const displayName = profile?.full_name || session?.user.email?.split('@')[0] || 'Your account';
  const displayAvatar = profile?.avatar_url ?? null;

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => void (document.body.style.overflow = '');
  }, [drawerOpen]);

  const handleSignOut = async () => {
    setDrawerOpen(false);
    await signOut();
    // Hard navigation — see DashboardShell's handleSignOut for why a plain
    // navigate('/') here races ProtectedRoute's own redirect and can lose.
    window.location.assign('/');
  };

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    navigate(query.trim() ? `/browse?city=${encodeURIComponent(query.trim())}` : '/browse');
  };

  return (
    <>
      <header className="sticky top-0 z-50 flex h-[64px] items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur-xl sm:px-6">
        <Logo variant="symbol" />
        <form onSubmit={submitSearch} className="relative ml-2 hidden max-w-sm flex-1 sm:block">
          <Icon name="search" size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cars, cities…"
            className="input !py-2.5 !pl-10 bg-panel/60"
          />
        </form>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            to="/browse"
            className="grid h-10 w-10 place-items-center rounded-xl text-ink hover:bg-panel sm:hidden"
            aria-label="Browse cars"
          >
            <Icon name="search" size={19} />
          </Link>
          <Link
            to="/notifications"
            className="grid h-10 w-10 place-items-center rounded-xl text-ink hover:bg-panel"
            aria-label="Notifications"
          >
            <Icon name="bell" size={19} />
          </Link>
          <Link to="/settings" aria-label="Profile">
            {displayAvatar ? (
              <img src={displayAvatar} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-050 text-accent">
                <Icon name="user" size={16} />
              </span>
            )}
          </Link>
          <button
            onClick={() => setDrawerOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-xl text-ink hover:bg-panel"
            aria-label="Open menu"
          >
            <Icon name="menu" size={20} />
          </button>
        </div>
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-[70]">
          <div className="absolute inset-0 bg-ink/40 animate-fade-in" onClick={() => setDrawerOpen(false)} />
          <div className="absolute right-0 top-0 flex h-full w-[84%] max-w-xs animate-[slide-in-right_0.35s_var(--ease-out-expo)] flex-col bg-surface shadow-pop">
            <div className="flex h-[64px] items-center justify-between border-b border-line px-5">
              <Logo variant="wordmark" />
              <button
                onClick={() => setDrawerOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-xl hover:bg-panel"
                aria-label="Close menu"
              >
                <Icon name="x" size={20} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-3">
              {isHost && (
                <div className="mb-3 flex gap-1 rounded-xl border border-line bg-panel/60 p-1">
                  <button
                    onClick={() => setMode('customer')}
                    className={`flex-1 rounded-lg py-2 text-center text-detail font-medium transition-colors ${
                      mode === 'customer' ? 'bg-ink text-white' : 'text-ink-soft hover:bg-panel'
                    }`}
                  >
                    Driver
                  </button>
                  <button
                    onClick={() => setMode('host')}
                    className={`flex-1 rounded-lg py-2 text-center text-detail font-medium transition-colors ${
                      mode === 'host' ? 'bg-ink text-white' : 'text-ink-soft hover:bg-panel'
                    }`}
                  >
                    Host
                  </button>
                </div>
              )}
              {profile?.is_owner ? (
                <NavLink
                  to="/owner"
                  onClick={() => setDrawerOpen(false)}
                  className="mb-3 flex items-center gap-3 rounded-xl border border-line bg-noir px-3 py-2.5 text-body font-medium text-white transition-colors hover:bg-noir-2"
                >
                  <Icon name="verified" size={19} className="text-accent-bright" />
                  Owner Control Center
                </NavLink>
              ) : profile?.is_admin ? (
                <NavLink
                  to="/admin"
                  onClick={() => setDrawerOpen(false)}
                  className="mb-3 flex items-center gap-3 rounded-xl border border-line bg-panel/60 px-3 py-2.5 text-body font-medium text-ink-soft transition-colors hover:bg-panel"
                >
                  <Icon name="shield" size={19} className="text-muted" />
                  Admin panel
                </NavLink>
              ) : null}
              <ul className="flex flex-col gap-0.5">
                {nav.map((n) => {
                  return (
                    <li key={n.label}>
                      <NavLink
                        to={n.to}
                        onClick={() => setDrawerOpen(false)}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-body font-medium text-ink-soft transition-colors hover:bg-panel"
                      >
                        <Icon name={n.icon} size={19} className="text-muted" />
                        <span className="flex-1">{n.label}</span>
                        {n.badge && (
                          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-label font-semibold text-white">
                            {n.badge}
                          </span>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
              <div className="hairline my-3" />
              <Link
                to="/help"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-body font-medium text-ink-soft transition-colors hover:bg-panel"
              >
                <Icon name="headset" size={19} className="text-muted" />
                Help &amp; Support
              </Link>
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
                  <p className="truncate text-detail font-medium text-ink">{displayName}</p>
                  <p className="truncate text-caption text-muted">{session?.user.email}</p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-body text-danger hover:bg-panel"
              >
                <Icon name="logout" size={19} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Navbar() {
  const { session } = useAuth();
  return session ? <AppNavbar /> : <PublicNavbar />;
}
