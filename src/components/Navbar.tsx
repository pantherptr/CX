import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { Img } from './motion';
import { Logo } from './primitives';
import { SignalLogo } from './SignalLogo';
import { useAuth } from '../lib/auth';
import { customerNav, hostNav } from '../lib/nav';
import { useUnreadMessageCount } from '../lib/data/messages';
import { ConciergeLauncher } from './Concierge';
import { motion, AnimatePresence, useReducedMotion, SPRING_SMOOTH } from './motionKit';

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
  const reduceMotion = !!useReducedMotion();
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
      {/* Always `sticky top-0`, never `fixed` — this used to switch
          positioning schemes (`fixed` while transparent-over-hero, `sticky`
          once scrolled/on any other page), and that switch is what caused
          the header to visibly jump: a `fixed` header reserves zero space
          in the document, so Home's hero already carries its own top
          padding to clear it; the instant the header became `sticky` it
          started reserving its own ~56–64px of real flow height too, and
          that got added ON TOP of the hero's existing padding — a sudden
          jump down by the header's height at the exact 8px scroll
          threshold. Positioning now never changes, only the background/
          border/blur do (a plain CSS transition, no layout impact), and
          Home's hero pulls itself up under the header's reserved space
          with a matching negative margin (see its own comment) to get the
          same "transparent bar floating over the photo" look with zero
          layout-jump risk. */}
      <header
        className={`sticky top-0 z-50 border-b backdrop-blur-xl transition-colors duration-300 ${
          transparent
            ? 'border-transparent bg-transparent'
            : scrolled
              ? 'border-line bg-surface/90 shadow-[0_1px_0_rgba(22,22,26,0.04)]'
              : 'border-transparent bg-surface/70'
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
            <NavLink
              to="/signal"
              className={({ isActive }) =>
                `group relative hidden items-center gap-2 overflow-hidden rounded-full border px-3.5 py-1.5 text-detail font-bold transition-all duration-300 lg:inline-flex ${
                  isActive
                    ? 'border-accent-bright bg-accent-bright text-noir shadow-[0_2px_10px_rgba(0,212,71,0.35)]'
                    : 'border-accent-bright/30 bg-accent-bright/10 text-accent-700 hover:-translate-y-px hover:border-accent-bright/60 hover:bg-accent-bright/15'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {!isActive && (
                    <span
                      className="pointer-events-none absolute inset-0 -z-10 opacity-0 blur-[10px] transition-opacity duration-300 group-hover:opacity-100"
                      style={{ background: 'radial-gradient(closest-side, rgba(0,212,71,0.32), transparent 75%)' }}
                    />
                  )}
                  <SignalLogo size={20} className="transition-transform duration-300 group-hover:scale-110" />
                  <span className="tracking-wide">SIGNAL</span>
                </>
              )}
            </NavLink>
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
                  <Img
                    src={profile.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                    fallback={<Icon name="user" size={16} />}
                  />
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
          backdrop-filter doesn't trap this fixed element in a 68px box.
          White/off-white now, not the old full-dark panel that read as a
          game menu — CX green stays reserved for the one primary CTA, the
          active-route state, and SIGNAL's own small accent, same
          discipline the redesigned Footer/"Why CX" panel already
          established: black used strategically, not as the default
          canvas. `AnimatePresence` gives it a real slide/fade on the way
          OUT too — the old version had an entrance keyframe but no exit
          at all, it just vanished the instant `menuOpen` went false. */}
      <AnimatePresence>
        {menuOpen && (
          <div className="fixed inset-0 z-[60] lg:hidden">
            <motion.div
              className="absolute inset-0 bg-ink/45 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.22 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              className="absolute right-0 top-0 flex h-full w-[85%] max-w-sm flex-col overflow-hidden bg-surface text-ink shadow-pop"
              initial={reduceMotion ? false : { x: '100%' }}
              animate={{ x: 0 }}
              exit={reduceMotion ? undefined : { x: '100%' }}
              transition={reduceMotion ? { duration: 0 } : SPRING_SMOOTH}
            >
              {/* -------- Compact header: logo + close, nothing else -------- */}
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5 pt-safe">
                <Logo variant="wordmark" />
                <button
                  onClick={() => setMenuOpen(false)}
                  className="grid h-10 w-10 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel hover:text-ink"
                  aria-label="Close menu"
                >
                  <Icon name="x" size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                {/* -------- The one primary CTA — compact, single line -------- */}
                <ConciergeLauncher className="btn btn-accent-bright btn-lg btn-block !justify-between mb-6">
                  Find your next drive <Icon name="arrowRight" size={17} />
                </ConciergeLauncher>

                {/* -------- Nav — plain rows + hairline dividers, no cards.
                    List Your Car gets a quiet green tint (an important
                    business action) without turning into its own block. -------- */}
                <nav className="flex flex-col">
                  {links.map((l) => {
                    const isListCar = l.to === '/list-your-car';
                    return (
                      <NavLink
                        key={l.to}
                        to={l.to}
                        className={({ isActive }) =>
                          `flex items-center justify-between border-b border-line py-3.5 text-body font-medium transition-colors ${
                            isActive ? 'text-ink' : isListCar ? 'text-accent-700 hover:text-accent' : 'text-ink-soft hover:text-ink'
                          }`
                        }
                      >
                        {l.label}
                        <Icon name="chevronRight" size={16} className={isListCar ? 'text-accent' : 'text-faint'} />
                      </NavLink>
                    );
                  })}

                  {/* SIGNAL — a distinct destination, not an ad: same row
                      rhythm as the links above it, just a two-line label
                      and the SIGNAL mark standing in for an icon. */}
                  <NavLink
                    to="/signal"
                    className={({ isActive }) =>
                      `flex items-center justify-between border-b border-line py-3.5 transition-colors ${
                        isActive ? 'text-ink' : 'text-ink-soft hover:text-ink'
                      }`
                    }
                  >
                    <span className="flex items-center gap-2.5">
                      <SignalLogo size={22} />
                      <span>
                        <span className="block text-body font-semibold leading-tight text-ink">SIGNAL</span>
                        <span className="block text-caption leading-tight text-muted">Community</span>
                      </span>
                    </span>
                    <Icon name="chevronRight" size={16} className="text-accent" />
                  </NavLink>
                </nav>
              </div>

              {/* -------- Account actions -------- */}
              <div className="flex shrink-0 flex-col gap-2.5 border-t border-line p-5 pb-safe">
                <Link to="/login" className="btn btn-block border border-line-strong bg-surface text-ink hover:bg-panel">
                  Sign in
                </Link>
                <Link to="/signup" className="btn btn-accent-bright btn-block">
                  Create an account
                </Link>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
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
              <Img
                src={displayAvatar}
                alt=""
                className="h-9 w-9 rounded-full object-cover"
                fallback={
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-050 text-accent">
                    <Icon name="user" size={16} />
                  </span>
                }
              />
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
              <NavLink
                to="/signal"
                onClick={() => setDrawerOpen(false)}
                className={({ isActive }) =>
                  `group relative mb-3 flex items-center justify-between overflow-hidden rounded-xl border px-3 py-2.5 text-body font-bold transition-all duration-300 ${
                    isActive
                      ? 'border-accent-bright bg-accent-bright/15 text-ink'
                      : 'border-accent-bright/30 bg-accent-bright/[0.06] text-ink hover:border-accent-bright/55 hover:bg-accent-bright/10'
                  }`
                }
              >
                <span
                  className="pointer-events-none absolute inset-0 -z-10 opacity-0 blur-[12px] transition-opacity duration-300 group-hover:opacity-100"
                  style={{ background: 'radial-gradient(closest-side, rgba(0,212,71,0.3), transparent 75%)' }}
                />
                <span className="flex items-center gap-3">
                  <SignalLogo size={24} className="transition-transform duration-300 group-hover:scale-110" />
                  <span className="tracking-wide">SIGNAL</span>
                </span>
                <Icon name="chevronRight" size={16} className="text-accent-700 transition-transform duration-300 group-hover:translate-x-0.5" />
              </NavLink>
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
                  <Img
                    src={displayAvatar}
                    alt=""
                    className="h-9 w-9 rounded-full object-cover"
                    fallback={
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-050 text-accent">
                        <Icon name="user" size={16} />
                      </span>
                    }
                  />
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
