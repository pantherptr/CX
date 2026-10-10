import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../Icon';
import { SignalSHero } from '../SignalLogo';
import { SpotlightLogo } from '../SpotlightLogo';
import { useLocale } from '../../lib/i18n';

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'shield', title: 'Official updates', body: 'News, announcements and new cars, straight from the CX team.' },
  { icon: 'users', title: 'A community on the road', body: 'Drivers and hosts sharing trips, cars and moments.' },
  { icon: 'sparkles', title: 'Spotlight', body: 'The most beautiful work, picked by CX.' },
];

/** What a signed-out visitor sees on /signal: a quiet, editorial landing page — the mark, one clear
 *  line, two actions, and three short reasons — instead of a bare sign-in wall. */
export function SignalGate() {
  const { t } = useLocale();
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-noir text-on-noir">
      {/* atmosphere: a green bloom behind the mark and a barely-there grid fading out downward */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(55% 40% at 50% 28%, rgba(0,212,71,0.22), transparent 70%), radial-gradient(40% 28% at 85% 95%, rgba(0,212,71,0.08), transparent 70%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(70% 55% at 50% 30%, #000, transparent 85%)',
          WebkitMaskImage: 'radial-gradient(70% 55% at 50% 30%, #000, transparent 85%)',
        }}
      />

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-10">
        <Link to="/" className="pressable inline-flex min-h-11 items-center gap-2 text-detail font-medium text-on-noir-muted transition-colors hover:text-on-noir">
          <Icon name="chevronLeft" size={16} /> {t('Back to CX Rent')}
        </Link>
        <span className="text-micro font-semibold uppercase tracking-[0.32em] text-on-noir-muted">CX · SIGNAL</span>
      </header>

      <main className="relative mx-auto grid w-full max-w-6xl flex-1 content-center gap-8 px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-4 sm:px-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-x-16 lg:gap-y-8 lg:py-10">
        {/* the message and the two actions */}
        <section className="order-2 text-center lg:order-1 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:self-center lg:text-left">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-micro font-semibold uppercase tracking-[0.26em] text-accent-bright">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-bright shadow-[0_0_10px_rgba(0,212,71,0.9)]" aria-hidden="true" />
            {t('CX Signal')}
          </p>
          <h1 className="mt-5 font-display text-[2.35rem] font-semibold leading-[1.04] tracking-[-0.02em] text-balance sm:text-5xl lg:text-[3.6rem]">
            {t('The official voice of CX Rent.')}
          </h1>
          <p className="mx-auto mt-5 max-w-md text-[1.0625rem] leading-relaxed text-on-noir-muted lg:mx-0">
            {t('News, announcements and new cars, straight from the team.')}
          </p>

          <div className="mx-auto mt-8 flex w-full max-w-sm flex-col gap-3 sm:max-w-md sm:flex-row lg:mx-0">
            <Link
              to="/login"
              state={{ from: { pathname: '/signal' } }}
              className="btn btn-accent-bright btn-lg min-h-14 flex-1 justify-center"
            >
              {t('Sign In')} <Icon name="arrowRight" size={17} />
            </Link>
            <Link
              to="/signup"
              state={{ from: { pathname: '/signal' } }}
              className="pressable inline-flex min-h-14 flex-1 items-center justify-center rounded-full border border-white/20 px-6 text-[15px] font-semibold text-on-noir transition-colors hover:border-white/40 hover:bg-white/[0.06]"
            >
              {t('Create account')}
            </Link>
          </div>
        </section>

        {/* the mark */}
        <section className="order-1 flex justify-center lg:order-2 lg:col-start-2 lg:row-start-1 lg:self-end">
          <div className="animate-scale-in">
            <SignalSHero height={92} />
          </div>
        </section>

        {/* three reasons */}
        <section className="order-3 flex justify-center lg:col-start-2 lg:row-start-2 lg:self-start">
          <ul className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur-sm">
            {FEATURES.map((f, i) => (
              <li key={f.title} className={`flex items-start gap-4 px-5 py-4 text-left ${i > 0 ? 'border-t border-white/10' : ''}`}>
                <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-bright/12 text-accent-bright ring-1 ring-accent-bright/25">
                  {f.title === 'Spotlight' ? <SpotlightLogo size={32} /> : <Icon name={f.icon} size={18} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold leading-snug text-on-noir">{t(f.title)}</span>
                  <span className="mt-0.5 block text-detail leading-relaxed text-on-noir-muted">{t(f.body)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
