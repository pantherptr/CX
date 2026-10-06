import { lazy, Suspense } from 'react';
import { Logo } from '../components/primitives';
import { useLocale } from '../lib/i18n';

const CountryGlobe = lazy(() => import('../components/home/CountryGlobe').then((m) => ({ default: m.CountryGlobe })));

/** The very first screen a new visitor sees: pick a country *on the map*,
 *  and the whole site opens in that country's language. Only countries
 *  with a finished language are selectable — the rest are drawn but locked. */
export default function CountryGateway() {
  const { chooseCountry } = useLocale();
  // The visitor hasn't picked a language yet, so the prompt is shown in
  // every live language at once rather than going through t().

  return (
    <div className="relative flex min-h-dvh flex-col items-center bg-bg px-5 pb-8 pt-safe sm:px-8">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: 'radial-gradient(55% 50% at 50% 55%, rgba(0,212,71,0.10), transparent 70%)' }}
      />

      <header className="relative pt-6">
        <Logo variant="wordmark" />
      </header>

      <div className="relative mt-6 text-center">
        <h1 className="font-display text-3xl font-semibold text-ink text-balance sm:text-5xl">Choose your country</h1>
        <p className="mt-2 text-copy text-muted sm:text-lead">Scegli il tuo paese · Alege țara ta · Elige tu país</p>
      </div>

      <main className="relative mt-4 flex w-full flex-1 items-center justify-center">
        <div className="w-full max-w-[min(92vw,calc(100dvh-15rem),34rem)]">
          <Suspense fallback={<div className="mx-auto aspect-square w-full rounded-full skeleton" />}>
            <CountryGlobe onChoose={chooseCountry} />
          </Suspense>
        </div>
      </main>

      <p className="relative text-center text-detail text-faint">
        Click a country on the map · Tocca un paese · Atinge o țară · Toca un país
      </p>
    </div>
  );
}
