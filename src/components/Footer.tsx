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
    title: 'Legal',
    links: [
      { label: 'Terms of Service', to: '/terms' },
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Cancellation Policy', to: '/cancellation-policy' },
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

/** Was a full `bg-noir` block — the same near-black as the homepage's own
 *  "Why CX" panel, stacked right underneath it on every visit. Two solid
 *  black sections back to back reads as repetitive rather than premium
 *  ("black used strategically for specific sections", not the default
 *  canvas), so this now sits on the site's ordinary light `panel` surface
 *  instead — the CX accent still carries the brand moment (top hairline,
 *  column headers, hover states), it just doesn't need a black backdrop
 *  to do it. */
export function Footer() {
  return (
    <footer className="relative mt-24 overflow-hidden border-t border-line bg-panel">
      {/* One quiet green wash, bookending the hero's own lighting so the
          page closes in the same register it opened in — much lower
          opacity than the old dark version needed, since a light surface
          needs far less tint to read as "a touch of brand color" rather
          than "smudged". */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: 'radial-gradient(45% 60% at 12% 0%, rgba(0,212,71,0.08), transparent 62%)' }}
      />
      {/* Hairline CX accent along the top edge. */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-accent-bright/60 via-accent-bright/15 to-transparent" />

      <div className="container-page relative py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.5fr_repeat(5,1fr)] lg:gap-10">
          <div className="max-w-xs">
            <Logo variant="wordmark" />
            <p className="mt-5 text-body leading-relaxed text-muted text-pretty">
              The premium marketplace for car rental across Europe.
            </p>
            <p className="mt-4 font-display text-copy font-semibold text-ink">
              Rent. Drive. Experience.
            </p>
            <div className="mt-6 flex gap-2.5">
              {socials.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  aria-label={`CX on ${s.label}`}
                  className="grid h-11 w-11 place-items-center rounded-full border border-line-strong bg-surface text-muted transition-colors hover:border-accent-bright/50 hover:text-accent-700"
                >
                  <Icon name={s.icon} size={18} />
                </button>
              ))}
            </div>
          </div>

          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h4 className="text-label font-semibold uppercase tracking-[0.16em] text-accent-700">{col.title}</h4>
              <ul className="mt-4 flex flex-col gap-1">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {/* py-1.5 keeps the tap target comfortably past 32px
                        without visually loosening the list. */}
                    <Link
                      to={l.to}
                      className="inline-block py-1.5 text-body text-muted transition-colors hover:text-ink"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-5 border-t border-line pt-7 sm:flex-row sm:items-center sm:justify-between">
          <LiveVisitors tone="light" />
          <div className="flex items-center gap-5 text-detail text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="globe" size={15} /> English (EU)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="euro" size={15} /> EUR
            </span>
          </div>
        </div>

        <p className="mt-6 text-detail text-faint">
          © {new Date().getFullYear()} CX Mobility S.r.l. — Milan, Italy. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
