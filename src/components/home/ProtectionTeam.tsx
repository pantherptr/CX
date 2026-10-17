import { ProtectionIcon, type ProtectionKind } from './ProtectionIcon';
import { InvestigationsMark } from '../InvestigationsMark';
import { Reveal } from '../motion';
import { useLocale } from '../../lib/i18n';

/** Home → "How we protect you", on the page's own light background. On a phone: the title centred, then the four promises on the
 *  left and the two CX Investigative agents, small, on the right. From md up: the agents on the left, the text and promises on the right. */
export function ProtectionTeam() {
  const { t } = useLocale();
  const items: { icon: ProtectionKind; t: string }[] = [
    { icon: 'shield', t: 'Damage protection included' },
    { icon: 'headset', t: '24/7 roadside help' },
    { icon: 'seal', t: 'Verified hosts' },
    { icon: 'lock', t: 'Payments stay inside CX' },
  ];
  const agents = (
    <>
      <span aria-hidden className="absolute inset-x-[8%] bottom-7 h-5 rounded-[50%] bg-black/25 blur-xl" />
      <img
        src="/home/duo-cut-820.webp"
        alt={t('Two CX Investigative agents, back to back')}
        loading="lazy"
        draggable={false}
        className="relative block w-full drop-shadow-[0_14px_16px_rgba(0,0,0,0.18)]"
      />
      <div className="relative mt-2 flex justify-center"><InvestigationsMark size="md" className="scale-75 md:scale-100" /></div>
    </>
  );
  const title = (
    <>
      <p className="eyebrow">{t('How we protect you')}</p>
      <h2 className="mt-3 font-display text-[2.15rem] font-semibold leading-[1.04] tracking-[-0.028em] text-ink text-balance sm:text-[3rem]">{t('Real people behind every trip.')}</h2>
      <p className="mt-3 text-detail font-semibold uppercase tracking-[0.2em] text-muted">CX Investigative</p>
    </>
  );
  return (
    <section className="container-page section-tight">
      <Reveal>
        {/* phone */}
        <div className="md:hidden">
          <div className="text-center">{title}</div>
          <div className="mt-7 flex items-center gap-3">
            <ul className="flex min-w-0 flex-1 flex-col gap-3.5">
              {items.map((r) => (
                <li key={r.t} className="flex items-center gap-3">
                  <ProtectionIcon kind={r.icon} size="sm" />
                  <span className="text-detail font-semibold leading-snug text-ink">{t(r.t)}</span>
                </li>
              ))}
            </ul>
            <div className="relative w-[38%] max-w-[9.5rem] shrink-0">{agents}</div>
          </div>
        </div>

        {/* tablet and desktop */}
        <div className="hidden items-center gap-10 md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="relative mx-auto w-full max-w-[26rem]">{agents}</div>
          <div>
            {title}
            <ul className="mt-6 grid grid-cols-2 gap-3">
              {items.map((r) => (
                <li key={r.t} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
                  <ProtectionIcon kind={r.icon} />
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
