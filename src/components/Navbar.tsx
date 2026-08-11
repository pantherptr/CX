import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { Logo } from './primitives';
import { useAuth } from '../lib/auth';

const links = [
  { to: '/browse', label: 'Browse Cars' },
  { to: '/list-your-car', label: 'List Your Car' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/about', label: 'About' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const acctRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { session, profile, signOut } = useAuth();

  const displayName = profile?.full_name || session?.user.email?.split('@')[0] || 'Account';

  const handleSignOut = async () => {
    setAcctOpen(false);
    setMenuOpen(false);
    await signOut();
    navigate('/');
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setAcctOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAcctOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => void (document.body.style.overflow = '');
  }, [menuOpen]);

  // Primary destinations — on mobile these are covered by the bottom tab
  // bar (BottomNav), so only the desktop dropdown shows them.
  const primaryLinks = [
    { to: '/dashboard', label: 'Customer dashboard', icon: 'grid' as const },
    { to: '/host', label: 'Host dashboard', icon: 'chart' as const },
  ];

  // Secondary destinations — shown in both the desktop dropdown and the
  // mobile drawer, matching the split the design calls for.
  const secondaryLinks = [
    { to: '/messages', label: 'Messages', icon: 'message' as const },
    { to: '/notifications', label: 'Notifications', icon: 'bell' as const },
    { to: '/settings#payments', label: 'Payments', icon: 'card' as const },
    { to: '/settings', label: 'Settings', icon: 'settings' as const },
    { to: '/help', label: 'Help & Support', icon: 'headset' as const },
    { to: '/list-your-car', label: 'Become a host', icon: 'key' as const },
  ];

  return (
    <>
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-line bg-bg/85 backdrop-blur-xl'
          : 'border-b border-transparent bg-bg/60 backdrop-blur-md'
      }`}
    >
      <nav className="container-page flex h-[68px] items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Logo />
          <ul className="hidden items-center gap-1 lg:flex">
            {links.map((l) => (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-[14.5px] font-medium transition-colors ${
                      isActive ? 'text-ink' : 'text-muted hover:text-ink'
                    }`
                  }
                >
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-2">
          <div ref={acctRef} className="relative hidden sm:block">
            {session ? (
              <>
                <button
                  onClick={() => setAcctOpen((o) => !o)}
                  className="flex items-center gap-2 rounded-full border border-line-strong bg-surface py-1 pl-1 pr-3 shadow-hair transition-colors hover:border-[#c9c8bf]"
                  aria-haspopup="menu"
                  aria-expanded={acctOpen}
                >
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-accent-050 text-accent">
                      <Icon name="user" size={14} />
                    </span>
                  )}
                  <span className="max-w-[120px] truncate text-[13.5px] font-medium text-ink">
                    {displayName}
                  </span>
                  <Icon name="chevronDown" size={14} className="text-muted" />
                </button>
                {acctOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-[calc(100%+10px)] w-60 animate-scale-in overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-pop"
                  >
                    <div className="px-3 py-2.5">
                      <p className="truncate text-sm font-medium text-ink">{displayName}</p>
                      <p className="truncate text-[13px] text-muted">{session.user.email}</p>
                    </div>
                    <div className="hairline mx-2 mb-1" />
                    {primaryLinks.map((a) => (
                      <Link
                        key={a.to}
                        to={a.to}
                        role="menuitem"
                        onClick={() => setAcctOpen(false)}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] text-ink-soft transition-colors hover:bg-panel"
                      >
                        <Icon name={a.icon} size={17} className="text-muted" />
                        {a.label}
                      </Link>
                    ))}
                    <div className="hairline mx-2 my-1" />
                    {secondaryLinks.map((a) => (
                      <Link
                        key={a.to}
                        to={a.to}
                        role="menuitem"
                        onClick={() => setAcctOpen(false)}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] text-ink-soft transition-colors hover:bg-panel"
                      >
                        <Icon name={a.icon} size={17} className="text-muted" />
                        {a.label}
                      </Link>
                    ))}
                    <div className="hairline mx-2 my-1" />
                    <button
                      onClick={handleSignOut}
                      role="menuitem"
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] text-danger transition-colors hover:bg-panel"
                    >
                      <Icon name="logout" size={17} />
                      Sign out
                    </button>
                  </div>
                )}
              </>
            ) : (
              <Link to="/login" className="btn btn-secondary btn-sm">
                Sign in
              </Link>
            )}
          </div>

          <Link to="/list-your-car" className="btn btn-primary btn-sm hidden sm:inline-flex">
            List Your Car
          </Link>

          <button
            onClick={() => setMenuOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-xl text-ink transition-colors hover:bg-panel lg:hidden"
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
          <div className="absolute inset-0 bg-ink/40 animate-fade-in" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-0 flex h-full w-[84%] max-w-sm animate-[slide-in-right_0.35s_var(--ease-out-expo)] flex-col bg-bg shadow-pop">
            <div className="flex items-center justify-between border-b border-line px-5 h-[68px]">
              <Logo />
              <button
                onClick={() => setMenuOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-xl hover:bg-panel"
                aria-label="Close menu"
              >
                <Icon name="x" size={22} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <ul className="flex flex-col gap-1">
                {links.map((l) => (
                  <li key={l.to}>
                    <NavLink
                      to={l.to}
                      className="flex items-center justify-between rounded-xl px-3 py-3 text-[17px] font-medium text-ink hover:bg-panel"
                    >
                      {l.label}
                      <Icon name="chevronRight" size={18} className="text-faint" />
                    </NavLink>
                  </li>
                ))}
              </ul>
              <div className="hairline my-5" />
              <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Your account
              </p>
              {session ? (
                <>
                  <ul className="flex flex-col gap-1">
                    {secondaryLinks.map((a) => (
                      <li key={a.to}>
                        <Link
                          to={a.to}
                          className="flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] text-ink-soft hover:bg-panel"
                        >
                          <Icon name={a.icon} size={19} className="text-muted" />
                          {a.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={handleSignOut}
                    className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] text-danger hover:bg-panel"
                  >
                    <Icon name="logout" size={19} />
                    Sign out
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-2 px-1">
                  <Link to="/login" className="btn btn-secondary btn-block">
                    Sign in
                  </Link>
                  <Link to="/signup" className="btn btn-primary btn-block">
                    Create an account
                  </Link>
                </div>
              )}
            </div>
            <div className="border-t border-line p-5">
              <button
                onClick={() => navigate('/list-your-car')}
                className="btn btn-primary btn-block btn-lg"
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
