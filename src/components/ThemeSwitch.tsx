import { toggleTheme, useTheme } from '../lib/theme';

const Sun = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
  </svg>
);
const Moon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />
  </svg>
);

function flip(e: React.MouseEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  toggleTheme({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
}

/** Light / dark switch. `row` is a full-width menu line; `icon` is a compact round button. */
export default function ThemeSwitch({ variant = 'row', className = '' }: { variant?: 'row' | 'icon'; className?: string }) {
  const theme = useTheme();
  const dark = theme === 'dark';
  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={flip}
        aria-label="Dark mode"
        aria-pressed={dark}
        className={`grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-panel hover:text-ink ${className}`}
      >
        {dark ? <Sun /> : <Moon />}
      </button>
    );
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      onClick={flip}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-body text-ink-soft hover:bg-panel ${className}`}
    >
      {dark ? <Moon /> : <Sun />}
      <span className="flex-1">Dark mode</span>
      <span
        aria-hidden="true"
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${dark ? 'bg-accent' : 'bg-line-strong'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${dark ? 'left-[18px]' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}
