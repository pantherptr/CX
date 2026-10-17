import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { SignalS } from './SignalLogo';
import { Reveal } from './motion';
import { HowPoster } from './home/HowPoster';
import { useLocale } from '../lib/i18n';

/**
 * The owners' reasons to host, as a bento: six tiles of different sizes (a tall photo in the middle, a tall green stat on
 * the right). One column on a phone, three columns from `md`. The tiles come in with a short stagger.
 */
function Tile({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <Reveal delay={delay} className={`h-full ${className}`}>
      <div className="relative h-full overflow-hidden rounded-[1.75rem] border border-line bg-surface">{children}</div>
    </Reveal>
  );
}

function Text({ icon, title, desc, tone = 'ink' }: { icon: IconName; title: string; desc: string; tone?: 'ink' | 'light' }) {
  const light = tone === 'light';
  return (
    <div className="flex h-full flex-col p-6">
      <span className={`grid h-11 w-11 place-items-center rounded-2xl ${light ? 'bg-white/15 text-white' : 'bg-accent-050 text-accent-700'}`}><Icon name={icon} size={21} /></span>
      <h3 className={`mt-5 font-display text-[1.25rem] font-semibold leading-tight ${light ? 'text-white' : 'text-ink'}`}>{title}</h3>
      <p className={`mt-1.5 text-detail leading-relaxed ${light ? 'text-white/80' : 'text-muted'}`}>{desc}</p>
    </div>
  );
}

export function HostBento() {
  const { t } = useLocale();
  return (
    <div className="grid auto-rows-[minmax(11.5rem,auto)] grid-cols-1 gap-4 md:grid-cols-3 md:grid-rows-3 md:gap-5">
      {/* 1 · rate */}
      <Tile className="md:col-span-1 md:row-span-1">
        <Text icon="euro" title={t('You set the rate')} desc={t('Choose your daily price. Renters pay the service fee on top — you receive the rate you set.')} />
      </Tile>

      {/* 2 · the tall photo: protected trips */}
      <Tile className="min-h-[24rem] md:col-span-1 md:row-span-3" delay={80}>
        <HowPoster className="absolute inset-0 h-full w-full" />
        <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 text-white">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 backdrop-blur"><Icon name="shield" size={21} /></span>
          <h3 className="mt-4 font-display text-[1.6rem] font-semibold leading-tight">{t('Protected trips')}</h3>
          <p className="mt-1.5 text-detail leading-relaxed text-white/85">{t('Protection is included on every trip, and support is there when you need it.')}</p>
        </div>
      </Tile>

      {/* 3 · pickup or delivery */}
      <Tile className="md:col-span-1 md:row-span-1" delay={40}>
        <Text icon="pin" title={t('Pickup or delivery')} desc={t('Offer pickup, delivery with your own fee, or both. You decide how it works for you.')} />
      </Tile>

      {/* 4 · SIGNAL */}
      <Tile className="md:col-span-1 md:row-span-1" delay={120}>
        <div className="flex h-full flex-col justify-between p-6">
          <SignalS size={34} animated />
          <div>
            <h3 className="font-display text-[1.25rem] font-semibold leading-tight text-ink">{t('A stage on SIGNAL')}</h3>
            <p className="mt-1.5 text-detail leading-relaxed text-muted">{t('Verified hosts can show their car to the CX community and reach renters who care.')}</p>
          </div>
        </div>
      </Tile>

      {/* 5 · tall stat: four steps */}
      <Tile className="min-h-[14rem] md:col-span-1 md:row-span-2" delay={160}>
        <div className="flex h-full flex-col justify-between bg-[#eaf7ef] p-6">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/15 text-accent-700"><Icon name="checkCircle" size={21} /></span>
          <div>
            <p className="font-display text-[5.5rem] font-semibold leading-[0.9] tracking-tight text-accent-700">4</p>
            <p className="mt-3 text-body font-semibold text-ink">{t('short steps to list your car')}</p>
            <p className="mt-1 text-detail text-muted">{t('Car, photos, price, review. Publish when you are ready.')}</p>
          </div>
        </div>
      </Tile>

      {/* 6 · verified renters */}
      <Tile className="md:col-span-1 md:row-span-1" delay={200}>
        <Text icon="verified" title={t('Verified renters')} desc={t('Drivers show their ID and licence before they can book your car.')} />
      </Tile>
    </div>
  );
}
