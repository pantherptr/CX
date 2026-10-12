import { Link } from 'react-router-dom';
import { Logo } from './primitives';
import { useLocale } from '../lib/i18n';

/** Short, quiet footer: the brand and its few useful links on one line, the small print under it.
 *  Every link resolves to a real route (see App.tsx). */
const links: { label: string; to: string }[] = [
  { label: 'Browse cars', to: '/browse' },
  { label: 'How it works', to: '/how-it-works' },
  { label: 'List your car', to: '/list-your-car' },
  { label: 'About CX', to: '/about' },
  { label: 'Help centre', to: '/help' },
  { label: 'Terms of Service', to: '/terms' },
  { label: 'Privacy Policy', to: '/privacy' },
];

export function Footer() {
  const { t, lang, resetCountry } = useLocale();
  const langLabel = { en: 'English', it: 'Italiano', ro: 'Română', es: 'Español' }[lang];
  return (
    <footer className="mt-20 border-t border-line">
      <div className="container-page py-8 sm:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <Logo variant="wordmark" />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-1">
            {links.map((l) => (
              <Link key={l.to} to={l.to} className="inline-flex min-h-11 items-center text-detail text-muted transition-colors hover:text-ink sm:min-h-0 sm:py-1.5">
                {t(l.label)}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-5 flex flex-col gap-2 border-t border-line pt-5 text-detail text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>{t('© {year} CX. All rights reserved.', { year: new Date().getFullYear() })}</p>
          <p className="flex items-center gap-4">
            <span>{langLabel}</span>
            <button type="button" onClick={resetCountry} className="underline-offset-2 transition-colors hover:text-ink hover:underline">
              {t('Change country')}
            </button>
          </p>
        </div>
      </div>
    </footer>
  );
}
