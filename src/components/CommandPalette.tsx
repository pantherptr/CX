import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { useAuth } from '../lib/auth';
import { useCars } from '../lib/data/cars';
import { useLocale } from '../lib/i18n';
import { toggleTheme } from '../lib/theme';
import { eur } from '../lib/format';

/**
 * Command palette (⌘K / Ctrl+K), after 21st.dev's "Command": one place to jump to a page, a car, a city
 * or an action. Keyboard first (↑ ↓ Enter Esc), nothing is loaded until it opens, no extra dependency.
 */
interface Entry {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: IconName;
  keywords?: string;
  run: () => void;
}

function Panel({ onClose }: { onClose: () => void }) {
  const { t } = useLocale();
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const { cars } = useCars();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const go = useCallback((to: string) => () => navigate(to), [navigate]);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    const page = (id: string, label: string, to: string, icon: IconName, keywords = '') =>
      out.push({ id, group: t('Go to'), label: t(label), icon, keywords, run: go(to) });
    page('browse', 'Browse cars', '/browse', 'cars', 'rent garage fleet');
    page('how', 'How it works', '/how-it-works', 'route', 'steps');
    page('list', 'List your car', '/list-your-car', 'plus', 'host earn');
    page('signal', 'SIGNAL', '/signal', 'sparkles', 'feed community social');
    page('reels', 'Reels', '/signal/reels', 'play', 'video');
    page('about', 'About CX', '/about', 'info');
    page('help', 'Help centre', '/help', 'headset', 'support faq');
    if (session) {
      page('dashboard', 'Dashboard', '/dashboard', 'grid', 'account trips');
      page('messages', 'Messages', '/messages', 'message', 'chat');
      page('notifications', 'Notifications', '/notifications', 'bell', 'updates');
      page('settings', 'Settings', '/settings', 'settings', 'profile security language');
    } else {
      page('login', 'Sign in', '/login', 'user');
      page('signup', 'Create account', '/signup', 'plus', 'register');
    }
    const actions: Entry[] = [
      { id: 'theme', group: t('Actions'), label: t('Switch light / dark'), icon: 'sun', keywords: 'theme dark light mode', run: () => toggleTheme() },
    ];
    if (session) actions.push({ id: 'signout', group: t('Actions'), label: t('Sign out'), icon: 'logout', keywords: 'logout', run: () => { void signOut(); } });
    out.push(...actions);

    const list = cars ?? [];
    const cities = Array.from(new Set(list.map((c) => c.city).filter(Boolean))).sort();
    for (const city of cities) {
      out.push({ id: `city-${city}`, group: t('Cities'), label: city, hint: t('Cars in this city'), icon: 'pin', run: go(`/browse?city=${encodeURIComponent(city)}`) });
    }
    for (const c of list) {
      out.push({
        id: `car-${c.id}`,
        group: t('Cars'),
        label: `${c.make} ${c.model}`,
        hint: `${c.city} · ${eur(c.pricePerDay)}`,
        icon: 'car',
        keywords: `${c.make} ${c.model} ${c.city} ${c.year ?? ''}`,
        run: go(`/cars/${c.slug}`),
      });
    }
    return out;
  }, [t, session, cars, go, signOut]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // empty query: pages + actions only (a short, calm list); cars and cities appear when you type
      return entries.filter((e) => e.group === t('Go to') || e.group === t('Actions'));
    }
    const words = q.split(/\s+/);
    const hit = entries.filter((e) => {
      const hay = `${e.label} ${e.hint ?? ''} ${e.keywords ?? ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    // cars cap at 6 so they never bury the pages
    let cars6 = 0;
    return hit.filter((e) => (e.group === t('Cars') ? ++cars6 <= 6 : true));
  }, [entries, query, t]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (e: Entry | undefined) => {
    if (!e) return;
    onClose();
    e.run();
  };

  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive((i) => Math.min(shown.length - 1, i + 1)); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (ev.key === 'Enter') { ev.preventDefault(); choose(shown[active]); }
    else if (ev.key === 'Escape') { ev.preventDefault(); onClose(); }
  };

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[400] flex items-start justify-center p-4 pt-[14vh]" onKeyDown={onKeyDown}>
      <button type="button" aria-label={t('Close')} tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-[2px] animate-fade-in" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('Command menu')}
        className="relative w-full max-w-[560px] overflow-hidden rounded-[22px] border border-line bg-surface shadow-[0_30px_80px_-30px_rgba(0,0,0,0.55)] animate-fade-in"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Icon name="search" size={17} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            role="combobox"
            aria-expanded="true"
            aria-controls="cx-cmd-list"
            aria-activedescendant={shown[active] ? `cx-cmd-${shown[active].id}` : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder={t('Search pages, cars, cities…')}
            className="h-14 w-full min-w-0 bg-transparent text-copy text-ink outline-none placeholder:text-muted"
          />
          <kbd className="hidden shrink-0 rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted sm:block">esc</kbd>
        </div>

        <div ref={listRef} id="cx-cmd-list" role="listbox" className="max-h-[22rem] overflow-y-auto overscroll-contain p-2">
          {shown.length === 0 ? (
            <p role="status" className="px-3 py-10 text-center text-detail text-muted">{t('No results found.')}</p>
          ) : (
            shown.map((e, i) => {
              const heading = e.group !== lastGroup ? e.group : null;
              lastGroup = e.group;
              return (
                <div key={e.id}>
                  {heading && <p className="px-3 pb-1 pt-3 text-label font-semibold uppercase tracking-[0.08em] text-muted first:pt-1">{heading}</p>}
                  <button
                    type="button"
                    id={`cx-cmd-${e.id}`}
                    role="option"
                    aria-selected={i === active}
                    data-idx={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => choose(e)}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${i === active ? 'bg-accent-bright/12 text-ink' : 'text-ink'}`}
                  >
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${i === active ? 'bg-accent-bright/20 text-accent-700' : 'bg-panel text-muted'}`}>
                      <Icon name={e.icon} size={16} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-detail font-medium">{e.label}</span>
                    {e.hint && <span className="shrink-0 truncate text-label text-muted">{e.hint}</span>}
                    {i === active && <Icon name="arrowRight" size={14} className="shrink-0 text-muted" />}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-label text-muted">
          <span><kbd className="font-mono">↑ ↓</kbd> {t('Navigate')}</span>
          <span><kbd className="font-mono">↵</kbd> {t('Select')}</span>
        </div>
      </div>
    </div>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // keep the page from scrolling behind the palette
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(<Panel onClose={() => setOpen(false)} />, document.body);
}

export default CommandPalette;
