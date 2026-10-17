import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { FaqItem } from '../components/FaqItem';
import { ProtectionIcon, type ProtectionKind } from '../components/home/ProtectionIcon';
import { ConciergeLauncher, ConciergeMark } from '../components/Concierge';
import { Reveal } from '../components/motion';
import { useLocale } from '../lib/i18n';
import { CATEGORIES, faqs, type Category } from '../data/faqs';

const TOPIC_ICON: Record<Category, ProtectionKind> = {
  'Before you book': 'check',
  'Booking & changes': 'seal',
  Pickup: 'pin',
  'During your trip': 'car',
  'Returning & billing': 'coin',
  'Account & hosting': 'lock',
};

export default function Help() {
  const { t } = useLocale();
  const [category, setCategory] = useState<Category | null>(null);
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    const c = {} as Record<Category, number>;
    for (const cat of CATEGORIES) c[cat] = faqs.filter((f) => f.category === cat).length;
    return c;
  }, []);

  const visible = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    return faqs.filter((f) => {
      if (category && f.category !== category) return false;
      if (!words.length) return true;
      const hay = `${f.q} ${f.a}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [category, query]);

  const pick = (c: Category) => {
    setCategory((cur) => (cur === c ? null : c));
    window.setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  return (
    <div>
      {/* ---- Hero with the search ---- */}
      <section className="container-page pt-14">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow mb-3">Help & Support</p>
          <h1 className="font-display text-4xl font-semibold leading-[1.04] text-ink text-balance sm:text-5xl">How can we help?</h1>
          <div className="relative mt-8">
            <Icon name="search" size={18} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              enterKeyHint="search"
              placeholder={t('Search the help centre')}
              aria-label={t('Search the help centre')}
              className="h-14 w-full rounded-full border border-line bg-surface pl-12 pr-5 text-[16px] text-ink shadow-hair outline-none transition-colors placeholder:text-faint focus:border-ink"
            />
          </div>
        </div>
      </section>

      {/* ---- Topics ---- */}
      <section className="container-page mt-10">
        <div className="mx-auto max-w-3xl">
          <p className="eyebrow mb-4 text-center">{t('Browse by topic')}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => pick(c)}
                aria-pressed={category === c}
                className={`group flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${
                  category === c ? 'border-ink bg-panel' : 'border-line bg-surface hover:border-ink/40'
                }`}
              >
                <ProtectionIcon kind={TOPIC_ICON[c]} size="sm" />
                <span>
                  <span className="block text-[15px] font-semibold leading-tight text-ink">{t(c)}</span>
                  <span className="mt-0.5 block text-caption text-muted">{counts[c] === 1 ? t('1 answer') : t('{n} answers', { n: counts[c] })}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Answers ---- */}
      <section ref={listRef} className="container-page mt-12 scroll-mt-24">
        <div className="mx-auto max-w-2xl">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="font-display text-[1.5rem] font-semibold tracking-[-0.02em] text-ink">{category ? t(category) : t('Frequently asked questions')}</h2>
            {(category || query) && (
              <button onClick={() => { setCategory(null); setQuery(''); }} className="shrink-0 text-detail font-semibold text-accent-700 hover:underline">
                {t('Clear')}
              </button>
            )}
          </div>
          {visible.length > 0 ? (
            <div className="card p-4 sm:p-6">
              {visible.map((f) => (
                <FaqItem key={f.q} q={f.q} a={f.a} />
              ))}
            </div>
          ) : (
            <div className="card px-6 py-12 text-center">
              <p className="font-display text-xl font-semibold text-ink">{t('No answers found')}</p>
              <p className="mx-auto mt-2 max-w-xs text-body text-muted">{t('Try other words, or ask us directly.')}</p>
            </div>
          )}
        </div>
      </section>

      {/* ---- Still need help ---- */}
      <section className="container-page mb-24 mt-16">
        <Reveal>
          <div className="mx-auto max-w-2xl rounded-[1.75rem] border border-line bg-panel px-6 py-10 text-center sm:px-12">
            <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink">Still need help?</h2>
            <p className="mx-auto mt-2 max-w-sm text-body leading-relaxed text-muted">
              Ask X for a quick answer, or write to the team: every case is read by a real person.
            </p>
            <div className="mt-6 flex flex-col items-stretch gap-2.5 sm:flex-row sm:justify-center">
              <ConciergeLauncher className="btn btn-accent-bright btn-lg inline-flex items-center justify-center gap-2.5">
                <ConciergeMark size={24} /> {t('Ask X')}
              </ConciergeLauncher>
              <Link to="/messages" className="btn btn-secondary btn-lg">
                Message us <Icon name="arrowRight" size={17} />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
