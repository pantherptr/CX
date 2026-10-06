import { lazy, Suspense, useState } from 'react';
import { Logo } from '../components/primitives';
import { Icon } from '../components/Icon';
import { COUNTRIES, globePlaces } from '../lib/i18n/countries';
import { useLocale } from '../lib/i18n';

const CityGlobe = lazy(() => import('../components/home/CityGlobe').then((m) => ({ default: m.CityGlobe })));

/** The very first screen a new visitor sees: pick a country, and the whole
 *  site opens in that country's language. Only countries with a finished
 *  language are selectable — the rest are visible but locked. */
export default function CountryGateway() {
  const { chooseCountry } = useLocale();
  // Gateway copy is shown in every live language at once (the visitor hasn't
  // picked one yet), so it is written out here rather than going through t().
  const [focus, setFocus] = useState<string | null>(null);

  return (
    <div className="relative flex min-h-dvh flex-col bg-bg px-5 pb-10 pt-safe sm:px-8">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: 'radial-gradient(50% 45% at 50% 28%, rgba(0,212,71,0.10), transparent 70%)' }}
      />

      <header className="relative flex items-center justify-center pb-2 pt-6">
        <Logo variant="wordmark" />
      </header>

      <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-8 lg:flex-row lg:gap-14">
        <div className="w-full max-w-[22rem] shrink-0 sm:max-w-[26rem] lg:max-w-[30rem]">
          <Suspense fallback={<div className="mx-auto aspect-square w-full rounded-full skeleton" />}>
            <CityGlobe places={globePlaces} focus={focus} tour={false} />
          </Suspense>
        </div>

        <div className="w-full">
          <h1 className="text-center font-display text-3xl font-semibold text-ink text-balance sm:text-4xl lg:text-left">
            Choose your country
          </h1>
          <p className="mt-2 text-center text-copy text-muted lg:text-left">
            Scegli il tuo paese · Alege țara ta · Elige tu país
          </p>

          <ul className="mt-7 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
            {COUNTRIES.map((c) => {
              const live = !!c.lang;
              return (
                <li key={c.code}>
                  <button
                    type="button"
                    disabled={!live}
                    onClick={() => chooseCountry(c.code)}
                    onMouseEnter={() => setFocus(c.name)}
                    onFocus={() => setFocus(c.name)}
                    onMouseLeave={() => setFocus(null)}
                    onBlur={() => setFocus(null)}
                    className={`group flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-[border-color,box-shadow,transform] duration-200 ${
                      live
                        ? 'border-line bg-surface shadow-hair hover:-translate-y-0.5 hover:border-accent-bright/60 hover:shadow-soft'
                        : 'cursor-not-allowed border-line/70 bg-panel/60 opacity-60'
                    }`}
                  >
                    <span className="text-2xl leading-none" aria-hidden="true">{c.flag}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-semibold text-ink">{c.name}</span>
                      {!live && <span className="block text-caption text-faint">Coming soon</span>}
                    </span>
                    {live && (
                      <Icon name="arrowRight" size={15} className="text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-accent" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </main>
    </div>
  );
}
