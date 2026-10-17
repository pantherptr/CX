import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../Icon';
import { SignalS } from '../SignalLogo';
import { Reveal } from '../motion';
import { CxWordmark } from '../CxWordmark';
import { HostEarnings } from './HostEarnings';
import { useLocale } from '../../lib/i18n';

/** Home → owners: a bento with the earnings calculator in the middle. Different from the owners page's bento on purpose. */
function Tile({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <Reveal delay={delay} className={`h-full ${className}`}>
      <div className="relative h-full overflow-hidden rounded-[1.75rem] border border-line bg-surface">{children}</div>
    </Reveal>
  );
}

function Point({ icon, text }: { icon: IconName; text: string }) {
  return (
    <div className="flex h-full flex-col justify-between gap-6 p-6">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent-050 text-accent-700"><Icon name={icon} size={21} /></span>
      <p className="font-display text-[1.2rem] font-semibold leading-snug text-ink">{text}</p>
    </div>
  );
}

export function OwnersBento() {
  const { t } = useLocale();
  return (
    <div className="grid auto-rows-[minmax(10.5rem,auto)] grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
      {/* the calculator comes first on a phone: it is the hook */}
      <Tile className="md:col-start-2 md:row-span-2 md:row-start-1" delay={0}>
        <div className="flex h-full items-center p-3"><div className="w-full"><HostEarnings /></div></div>
      </Tile>

      <Tile className="md:col-start-1 md:row-start-1" delay={60}>
        <div className="flex h-full flex-col justify-between bg-[#050806] p-6 text-white">
          <CxWordmark className="h-14 w-auto text-white" />
          <p className="font-display text-[1.2rem] font-semibold leading-snug">{t('Your car, on CX.')}</p>
        </div>
      </Tile>

      <Tile className="md:col-start-1 md:row-start-2" delay={140}>
        <Point icon="euro" text={t('You set the daily rate — and receive it in full')} />
      </Tile>

      <Tile className="md:col-start-3 md:row-span-2 md:row-start-1 min-h-[18rem]" delay={100}>
        <img src="/home/delivery-800.webp" alt="" loading="lazy" draggable={false} className="absolute inset-0 h-full w-full object-cover object-[50%_38%]" />
        <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 text-white">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 backdrop-blur"><Icon name="car" size={21} /></span>
          <p className="mt-4 font-display text-[1.3rem] font-semibold leading-snug">{t('Offer pickup, delivery, or both')}</p>
        </div>
      </Tile>

      <Tile className="md:col-start-2 md:row-start-3" delay={220}>
        <div className="flex h-full flex-col justify-between bg-[#eaf7ef] p-6">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/15 text-accent-700"><Icon name="shield" size={21} /></span>
          <p className="font-display text-[1.2rem] font-semibold leading-snug text-ink">{t('Verified renters, protection on every trip')}</p>
        </div>
      </Tile>

      <Tile className="md:col-start-1 md:row-start-3" delay={180}>
        <div className="flex h-full flex-col justify-between bg-gradient-to-br from-[#06120d] to-[#0e3322] p-6 text-white">
          <SignalS size={34} animated />
          <p className="font-display text-[1.2rem] font-semibold leading-snug">{t('Show your car to the CX community on SIGNAL')}</p>
        </div>
      </Tile>

      <Tile className="md:col-start-3 md:row-start-3" delay={260}>
        <div className="flex h-full flex-col justify-between gap-5 p-6">
          <p className="font-display text-[1.2rem] font-semibold leading-snug text-ink">{t('Ready when you are.')}</p>
          <div className="flex flex-wrap gap-2.5">
            <Link to="/list-your-car" className="btn btn-primary">{t('List your car')} <Icon name="arrowRight" size={16} /></Link>
            <Link to="/how-it-works" className="btn btn-secondary">{t('How hosting works')}</Link>
          </div>
        </div>
      </Tile>
    </div>
  );
}
