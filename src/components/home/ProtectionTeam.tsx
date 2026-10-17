import { Icon, type IconName } from '../Icon';
import { Reveal } from '../motion';
import { useLocale } from '../../lib/i18n';

/** Home → "How we protect you": the CX Investigations team in one picture, and the four promises under it. */
export function ProtectionTeam() {
  const { t } = useLocale();
  const items: { icon: IconName; t: string }[] = [
    { icon: 'shield', t: 'Damage protection included' },
    { icon: 'headset', t: '24/7 roadside help' },
    { icon: 'verified', t: 'Verified hosts' },
    { icon: 'lock', t: 'Payments stay inside CX' },
  ];
  return (
    <section className="container-page section-tight">
      <Reveal>
        <div data-theme="dark" className="relative isolate overflow-hidden rounded-[1.75rem] bg-[#06120d] px-5 pb-6 pt-8 text-white sm:px-10 sm:pt-10">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-3/4 bg-[radial-gradient(60%_80%_at_50%_100%,rgba(0,224,96,0.38),transparent_70%)]" />
          <p className="text-caption font-semibold uppercase tracking-[0.14em] text-[#7dffa8]">{t('How we protect you')}</p>
          <h2 className="mt-2 max-w-xl font-display text-[1.9rem] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[2.6rem]">{t('Real people behind every trip.')}</h2>

          {/* the team: one photo, fading into the stage at the bottom */}
          <div className="relative -mx-5 mt-6 sm:-mx-10">
            <img src="/home/team-1400.webp" alt={t('The CX Investigations team')} loading="lazy" draggable={false} className="block w-full" />
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#06120d] to-transparent" />
            <p className="absolute inset-x-0 bottom-2 text-center text-caption font-semibold uppercase tracking-[0.22em] text-white/70">CX Investigations</p>
          </div>

          {/* the four promises */}
          <ul className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {items.map((r) => (
              <li key={r.t} className="flex items-center gap-3 rounded-2xl bg-white/[0.07] p-3.5 ring-1 ring-white/10">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#18e56b]/15 text-[#7dffa8]"><Icon name={r.icon} size={18} /></span>
                <span className="text-detail font-semibold leading-snug text-white">{t(r.t)}</span>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  );
}
