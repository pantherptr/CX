import { Icon, type IconName } from '../Icon';
import { Reveal } from '../motion';
import { InvestigationsMark } from '../InvestigationsMark';
import { useLocale } from '../../lib/i18n';

/** Home → "How we protect you", on the page's own light background: two CX Investigations agents, cut out and standing
 *  on a soft shadow, with the title and the four promises beside them (under them on a phone). */
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
        <div className="grid items-center gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-10">
          <div className="relative mx-auto w-[70%] max-w-[22rem] md:w-full md:max-w-[26rem]">
            <span aria-hidden className="absolute inset-x-[8%] bottom-0 h-6 rounded-[50%] bg-black/25 blur-xl" />
            <img
              src="/home/duo-cut-820.webp"
              alt={t('Two CX Investigations agents, back to back')}
              loading="lazy"
              draggable={false}
              className="relative block w-full drop-shadow-[0_18px_22px_rgba(0,0,0,0.18)]"
            />
            <div className="relative mt-4 flex justify-center"><InvestigationsMark size="md" /></div>
          </div>

          <div>
            <p className="eyebrow">{t('How we protect you')}</p>
            <h2 className="mt-3 font-display text-[2.15rem] font-semibold leading-[1.04] tracking-[-0.028em] text-ink text-balance sm:text-[3rem]">{t('Real people behind every trip.')}</h2>
            <p className="mt-3 text-detail font-semibold uppercase tracking-[0.2em] text-muted">CX Investigations</p>
            <ul className="mt-6 grid grid-cols-2 gap-3">
              {items.map((r) => (
                <li key={r.t} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-050 text-accent-700"><Icon name={r.icon} size={19} /></span>
                  <span className="text-body font-semibold leading-snug text-ink">{t(r.t)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
