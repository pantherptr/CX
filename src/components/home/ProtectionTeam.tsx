import { Icon, type IconName } from '../Icon';
import { Reveal } from '../motion';
import { useLocale } from '../../lib/i18n';

/**
 * Home → "How we protect you". Two CX Investigations agents, back to back, are not set in a picture frame: the photo has
 * no box, it fades into the dark green stage on every side and its top steps out over the panel's edge, so the pair stands
 * on the page. Title and the four promises sit beside them (under them on a phone).
 */
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
        <div data-theme="dark" className="relative mt-20 sm:mt-24">
          {/* the stage */}
          <div aria-hidden className="absolute inset-0 overflow-hidden rounded-[1.75rem] bg-[#06120d]">
            <div className="absolute inset-x-0 bottom-0 h-3/4 bg-[radial-gradient(60%_80%_at_30%_100%,rgba(0,224,96,0.34),transparent_70%)]" />
          </div>

          <div className="relative grid items-end gap-2 px-5 pb-7 sm:px-10 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-6 md:pb-10">
            {/* the pair: no frame, fading out, taller than the stage */}
            <div className="relative -mt-16 mx-auto w-[88%] max-w-[26rem] md:-mt-24 md:w-full md:max-w-none">
              <img
                src="/home/duo-900.webp"
                alt={t('Two CX Investigations agents, back to back')}
                loading="lazy"
                draggable={false}
                className="block w-full"
                style={{
                  WebkitMaskImage: 'radial-gradient(ellipse 52% 62% at 50% 40%, #000 40%, transparent 100%)',
                  maskImage: 'radial-gradient(ellipse 52% 62% at 50% 40%, #000 40%, transparent 100%)',
                }}
              />
            </div>

            <div className="pb-1 md:pb-4">
              <p className="text-caption font-semibold uppercase tracking-[0.14em] text-[#7dffa8]">{t('How we protect you')}</p>
              <h2 className="mt-2 font-display text-[1.9rem] font-semibold leading-[1.06] tracking-[-0.02em] text-white sm:text-[2.6rem]">{t('Real people behind every trip.')}</h2>
              <p className="mt-2 text-detail font-semibold uppercase tracking-[0.2em] text-white/55">CX Investigations</p>
              <ul className="mt-6 grid grid-cols-2 gap-2.5">
                {items.map((r) => (
                  <li key={r.t} className="flex items-center gap-3 rounded-2xl bg-white/[0.07] p-3.5 ring-1 ring-white/10">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#18e56b]/15 text-[#7dffa8]"><Icon name={r.icon} size={18} /></span>
                    <span className="text-detail font-semibold leading-snug text-white">{t(r.t)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
