import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { EmpireLogo } from '../EmpireLogo';

/** EMPIRE's entire chrome — a sticky minimal header, nothing else. A
 *  single feed doesn't need the old game's HUD/multi-tab nav, so this
 *  replaces that whole shell stack with just: the crest, the wordmark,
 *  and a clear way back to CX Rent. `onExit`'s destination is fixed
 *  (`/dashboard` signed-in, `/` signed-out), not `navigate(-1)` — same
 *  predictable-exit convention the old game shell used, regardless of
 *  how the visitor arrived at `/empire`. */
export function EmpireFeedHeader({ signedIn }: { signedIn: boolean }) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2.5 border-b border-line bg-surface/90 px-4 pt-safe backdrop-blur-xl sm:px-6">
      <EmpireLogo size={26} />
      <span className="font-display text-lead font-bold tracking-[0.04em] text-ink">EMPIRE</span>
      <button
        onClick={() => navigate(signedIn ? '/dashboard' : '/')}
        aria-label="Exit Empire"
        className="pressable ml-auto grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel hover:text-ink"
      >
        <Icon name="x" size={19} />
      </button>
    </header>
  );
}
