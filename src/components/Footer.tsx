import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { Logo } from './primitives';
import { LiveVisitors } from './LiveVisitors';

const columns: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Browse cars', to: '/browse' },
      { label: 'List your car', to: '/list-your-car' },
      { label: 'How it works', to: '/how-it-works' },
      { label: 'Gift cards', to: '/browse' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About us', to: '/about' },
      { label: 'Careers', to: '/about' },
      { label: 'Press', to: '/about' },
      { label: 'Cities', to: '/browse' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'Help center', to: '/about' },
      { label: 'Trust & safety', to: '/about' },
      { label: 'Insurance', to: '/about' },
      { label: 'Contact', to: '/about' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms', to: '/about' },
      { label: 'Privacy', to: '/about' },
      { label: 'Cookies', to: '/about' },
      { label: 'Licenses', to: '/about' },
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
    <footer className="mt-24 border-t border-line bg-bg">
      <div className="container-page py-16">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-[14px] leading-relaxed text-muted text-pretty">
              The premium marketplace for car rental across Europe. Rent the car. Own the journey.
            </p>
            <div className="mt-6 flex gap-2.5">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  aria-label={s.label}
                  className="grid h-10 w-10 place-items-center rounded-full border border-line-strong bg-surface text-muted transition-colors hover:border-ink hover:text-ink"
                >
                  <Icon name={s.icon} size={18} />
                </a>
              ))}
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-[13px] font-semibold uppercase tracking-wide text-ink">
                {col.title}
              </h4>
              <ul className="mt-4 flex flex-col gap-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link to={l.to} className="link-quiet text-[14px]">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex items-center justify-between border-t border-line pt-7">
          <LiveVisitors />
          <span className="hidden text-[13px] text-muted sm:inline">Rent the car. Own the journey.</span>
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-muted">
            © {new Date().getFullYear()} CX Mobility S.r.l. — Milan, Italy. All rights reserved.
          </p>
          <div className="flex items-center gap-5 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="globe" size={15} /> English (EU)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="euro" size={15} /> EUR
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
