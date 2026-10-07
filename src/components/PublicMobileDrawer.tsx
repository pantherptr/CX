import { FlyingMark } from './FlyingMark';
import { useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Icon } from './Icon';
import { SignalS } from './SignalLogo';
import { ConciergeLauncher } from './Concierge';
import { useViewportBottomGap } from '../lib/useViewportGap';
import { useScramble } from '../lib/useScramble';
import { useLocale } from '../lib/i18n';
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
  const { t } = useLocale();
  const findDriveScramble = useScramble(t('Find your next drive'));
  const signInScramble = useScramble(t('Sign in'));
  const createAccountScramble = useScramble(t('Create an account'));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
              role="dialog"
              aria-modal="true"
              aria-label={t('Menu')}
              className="absolute inset-0 flex h-full w-full flex-col overflow-hidden bg-surface text-ink shadow-pop"
              initial={reduceMotion ? false : { x: '100%' }}
              animate={{ x: 0 }}
              exit={reduceMotion ? undefined : { x: '100%' }}
              transition={reduceMotion ? { duration: 0 } : SPRING_SMOOTH}
              // Swipe right to dismiss — see AppMobileDrawer for the
              // constraint/elastic reasoning; identical gesture on both menus.
              drag={reduceMotion ? false : 'x'}
              dragDirectionLock
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0.04, right: 1 }}
              onDragEnd={(_, info) => {
                if (info.offset.x > 90 || info.velocity.x > 500) onClose();
              }}
            >
              {/* -------- Compact header: logo + close, nothing else -------- */}
              <div className="flex h-[calc(4rem+env(safe-area-inset-top,0px))] shrink-0 items-center justify-between border-b border-line px-5 pt-safe">
                <Link to="/" onClick={() => onClose()} aria-label="CX home" className="inline-flex min-h-11 items-center"><FlyingMark src="/brand/cx-bat.webp" width={220} height={79} className="h-9" /></Link>
                <button
                  onClick={() => onClose()}
                  className="grid h-10 w-10 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel hover:text-ink"
                  aria-label={t('Close menu')}
                >
                  <Icon name="x" size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                {/* -------- The one primary CTA — compact, single line -------- */}
                <ConciergeLauncher className="btn btn-glint btn-accent-bright btn-lg btn-block !justify-between mb-6" {...findDriveScramble}>
                  <span className="btn-glint__sweep" aria-hidden="true" />
                  {findDriveScramble.display} <Icon name="arrowRight" size={17} />
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
                          `flex items-center justify-between border-b border-line py-3.5 text-body font-medium transition-[color,opacity] active:opacity-55 ${
                            isActive ? 'text-ink' : isListCar ? 'text-accent-700 hover:text-accent' : 'text-ink-soft hover:text-ink'
                          }`
                        }
                      >
                        {t(l.label)}
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
                      `flex items-center justify-between border-b border-line py-3.5 transition-[color,opacity] active:opacity-55 ${
                        isActive ? 'text-ink' : 'text-ink-soft hover:text-ink'
                      }`
                    }
                  >
                    <span className="flex items-center gap-2.5">
                      <SignalS size={26} />
                      <span>
                        <span className="block text-body font-semibold leading-tight text-ink">SIGNAL</span>
                        <span className="block text-caption leading-tight text-muted">{t('Community')}</span>
                      </span>
                    </span>
                    <Icon name="chevronRight" size={16} className="text-accent" />
                  </NavLink>
                </nav>
              </div>

              {/* -------- Account actions -------- */}
              <div className="flex shrink-0 flex-col gap-2.5 border-t border-line p-5 pb-safe">
                <Link to="/login" className="btn btn-glint btn-block border border-line-strong bg-surface text-ink hover:bg-panel" {...signInScramble}>
                  <span className="btn-glint__sweep" aria-hidden="true" />
                  {signInScramble.display}
                </Link>
                <Link to="/signup" className="btn btn-glint btn-accent-bright btn-block" {...createAccountScramble}>
                  <span className="btn-glint__sweep" aria-hidden="true" />
                  {createAccountScramble.display}
                </Link>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
  );
}
