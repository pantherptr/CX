import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { Logo } from './primitives';
import { LiveVisitors } from './LiveVisitors';

/**
 * Every link here resolves to a route that actually exists (see App.tsx).
 * The previous footer pointed ten different labels — Careers, Press,
 * Terms, Privacy, Insurance… — at `/about`, and Gift cards/Cities at
 * `/browse`, which reads as a full site map but dead-ends the visitor.
 * Labels without a real destination were removed rather than re-pointed:
 * a legal/marketing page has to exist before it can be linked.
 */
const columns: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: 'Rent',
    links: [
      { label: 'Browse cars', to: '/browse' },
      { label: 'Compare cars', to: '/compare' },
      { label: 'CX Garage', to: '/garage' },
      { label: 'How it works', to: '/how-it-works' },
    ],
  },
  {
    title: 'Explore',
    links: [
      { label: 'About CX', to: '/about' },
      { label: 'List your car', to: '/list-your-car' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'Help centre', to: '/help' },
      { label: 'Contact us', to: '/help' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Sign in', to: '/login' },
      { label: 'Create account', to: '/signup' },
    ],
  },
];

const socials: { icon: IconName; label: string }[] = [
  { icon: 'twitter', label: 'X' },
  { icon: 'instagram', label: 'Instagram' },
  { icon: 'linkedin', label: 'LinkedIn' },
];

export function Footer() {
  return (
    <footer className="relative mt-24 overflow-hidden bg-noir">
      {/* One quiet green wash, bookending the hero's own lighting so the
          page closes in the same register it opened in. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: 'radial-gradient(45% 60% at 12% 0%, rgba(0,212,71,0.14), transparent 62%)' }}
      />
      {/* Hairline CX accent along the top edge. */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-accent-bright/50 via-accent-bright/10 to-transparent" />

      <div className="container-page relative py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.5fr_repeat(4,1fr)] lg:gap-10">
          <div className="max-w-xs">
            <Logo variant="wordmark" />
            <p className="mt-5 text-body leading-relaxed text-on-noir-muted text-pretty">
              The premium marketplace for car rental across Europe.
            </p>
            <p className="mt-4 font-display text-copy font-semibold text-on-noir">
              Rent. Drive. Experience.
            </p>
            <div className="mt-6 flex gap-2.5">
              {socials.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  aria-label={`CX on ${s.label}`}
                  className="grid h-11 w-11 place-items-center rounded-full border border-white/12 bg-white/[0.04] text-on-noir-muted transition-colors hover:border-accent-bright/40 hover:text-accent-bright"
                >
                  <Icon name={s.icon} size={18} />
                </button>
              ))}
            </div>
          </div>

          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h4 className="text-label font-semibold uppercase tracking-[0.16em] text-accent-bright">{col.title}</h4>
              <ul className="mt-4 flex flex-col gap-1">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {/* py-1.5 keeps the tap target comfortably past 32px
                        without visually loosening the list. */}
                    <Link
                      to={l.to}
                      className="inline-block py-1.5 text-body text-on-noir-muted transition-colors hover:text-on-noir"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-5 border-t border-white/10 pt-7 sm:flex-row sm:items-center sm:justify-between">
          <LiveVisitors tone="dark" />
          <div className="flex items-center gap-5 text-detail text-on-noir-muted">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="globe" size={15} /> English (EU)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="euro" size={15} /> EUR
            </span>
          </div>
        </div>

        <p className="mt-6 text-detail text-on-noir-muted/70">
          © {new Date().getFullYear()} CX Mobility S.r.l. — Milan, Italy. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
