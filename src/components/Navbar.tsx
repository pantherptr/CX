import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { Img } from './motion';
import { Logo } from './primitives';
import { SignalLogo } from './SignalLogo';
import { useAuth } from '../lib/auth';

const PublicMobileDrawer = lazy(() => import('./PublicMobileDrawer'));
const AppMobileDrawer = lazy(() => import('./AppMobileDrawer').then((m) => ({ default: m.AppMobileDrawer })));

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
  const [menuEverOpened, setMenuEverOpened] = useState(false);
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
              onClick={() => {
                setMenuEverOpened(true);
                setMenuOpen(true);
              }}
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

      {/* Loaded on first open — keeps the animation library out of the
          main bundle every visitor downloads. */}
      {menuEverOpened && (
        <Suspense fallback={null}>
          <PublicMobileDrawer open={menuOpen} onClose={() => setMenuOpen(false)} links={links} />
        </Suspense>
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
  const [drawerEverOpened, setDrawerEverOpened] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { profile } = useAuth();
  const displayAvatar = profile?.avatar_url ?? null;

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
            onClick={() => {
              setDrawerEverOpened(true);
              setDrawerOpen(true);
            }}
            className="grid h-10 w-10 place-items-center rounded-xl text-ink hover:bg-panel"
            aria-label="Open menu"
          >
            <Icon name="menu" size={20} />
          </button>
        </div>
      </header>

      {drawerEverOpened && (
        <Suspense fallback={null}>
          <AppMobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        </Suspense>
      )}
    </>
  );
}

export function Navbar() {
  const { session } = useAuth();
  return session ? <AppNavbar /> : <PublicNavbar />;
}
