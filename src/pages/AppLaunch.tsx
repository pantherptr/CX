import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FlyingMark } from '../components/FlyingMark';
import { Icon } from '../components/Icon';
import { useLocale } from '../lib/i18n';
import { COUNTRIES } from '../lib/i18n/countries';

const LANGS = ['IT', 'GB', 'RO', 'ES'] as const;
const LANG_LABEL: Record<string, string> = { IT: 'IT', GB: 'EN', RO: 'RO', ES: 'ES' };

function guessCountry(): string {
  const l = (navigator.languages?.[0] ?? navigator.language ?? 'en').toLowerCase();
  if (l.startsWith('it')) return 'IT';
  if (l.startsWith('ro')) return 'RO';
  if (l.startsWith('es')) return 'ES';
  return 'GB';
}

/** What the installed app opens on when signed out: no map, no marketing page — the car, the
 *  promise, and the two ways in. Everything else lives behind the sign-in. */
export default function AppLaunch() {
  const { t, country, chooseCountry } = useLocale();

  // The installed app never shows the country map: pick from the phone's language, changeable below.
  useEffect(() => {
    if (!country) chooseCountry(guessCountry());
  }, [country, chooseCountry]);

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-bg px-6 pb-safe pt-safe">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[55%]"
        style={{ background: 'radial-gradient(60% 55% at 50% 30%, color-mix(in oklab, var(--color-ink) 7%, transparent), transparent 72%)' }}
      />

      <div className="relative flex flex-1 flex-col items-center justify-center text-center">
        <FlyingMark src="/brand/cx-bat.webp" width={220} height={79} className="h-14" />
        <h1 className="mt-8 font-display text-[2.6rem] font-black uppercase leading-[0.9] tracking-[-0.03em] text-ink">
          {t('I own')}
          <br />
          {t('the keys')}
        </h1>
        <img
          src="/hero-car.webp?v=3"
          alt=""
          width={859}
          height={386}
          draggable={false}
          className="mt-8 w-[92%] max-w-[420px] drop-shadow-[0_26px_22px_rgba(0,0,0,0.35)]"
        />
        <p className="mt-6 max-w-[17rem] text-body text-muted">{t('Premium cars. Verified hosts.')}</p>
      </div>

      <div className="relative mb-4 flex flex-col gap-2.5">
        <Link to="/login" className="btn btn-primary btn-lg btn-block">
          {t('Sign in')}
        </Link>
        <Link to="/signup" className="btn btn-secondary btn-lg btn-block">
          {t('Create account')}
        </Link>
        <Link to="/browse" className="mt-1 inline-flex items-center justify-center gap-1.5 py-2 text-detail font-semibold text-ink-soft">
          {t('Browse cars')} <Icon name="arrowRight" size={15} />
        </Link>
        <div className="mt-1 flex items-center justify-center gap-1">
          {LANGS.map((code) => {
            const c = COUNTRIES.find((x) => x.code === code);
            if (!c) return null;
            const on = country?.code === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => chooseCountry(code)}
                className={`rounded-full px-3 py-1.5 text-label font-semibold tracking-wide transition-colors ${on ? 'bg-ink text-white dark:text-[#0a0b0a]' : 'text-faint'}`}
              >
                {LANG_LABEL[code]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
