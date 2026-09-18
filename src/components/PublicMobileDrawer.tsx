import { Link, NavLink } from 'react-router-dom';
import { Icon } from './Icon';
import { Logo } from './primitives';
import { SignalLogo } from './SignalLogo';
import { ConciergeLauncher } from './Concierge';
import { useViewportBottomGap } from '../lib/useViewportGap';
import { motion, AnimatePresence, useReducedMotion, SPRING_SMOOTH } from './motionKit';

/** Logged-out mobile menu. Split out of Navbar so it (and the animation
 *  library it needs) loads on first open instead of with every page. */
export default function PublicMobileDrawer({
  open,
  onClose,
  links,
}: {
  open: boolean;
  onClose: () => void;
  links: { to: string; label: string }[];
}) {
  const reduceMotion = !!useReducedMotion();
  const gap = useViewportBottomGap();
  return (
    <AnimatePresence>
        {open && (
          <div className="fixed inset-x-0 top-0 z-[60] lg:hidden" style={{ bottom: gap }}>
            <motion.div
              className="absolute inset-0 bg-ink/45 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.22 }}
              onClick={() => onClose()}
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
                  onClick={() => onClose()}
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
  );
}
