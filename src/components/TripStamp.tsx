import { Icon } from './Icon';
import { useLocale } from '../lib/i18n';
import { stampPlace } from '../lib/cityCountry';
import { formatTripPeriod, type TripStampData } from '../lib/data/tripMemories';

// Passport inks: muted, a little different for each stamp, never bright.
const INKS = ['#1a1a1c', '#0f5b57', '#27415f', '#7a2f3b'];

function hashOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** One travel stamp — a key for one trip. Only the general place, the car and
 *  the dates; nothing else. */
export function TripStamp({ stamp }: { stamp: TripStampData }) {
  const { t, lang } = useLocale();
  const h = hashOf(stamp.id);
  const ink = INKS[h % INKS.length];
  const tilt = ((h >> 3) % 5 - 2) * 0.7;
  const place = stampPlace(stamp.city, lang);
  return (
    <div
      className="relative aspect-[4/3.1] w-full select-none rounded-[22px] bg-surface p-[7px] shadow-[0_14px_30px_-22px_rgba(0,0,0,0.45)]"
      style={{ color: ink, transform: `rotate(${tilt}deg)`, border: `2.5px solid ${ink}` }}
    >
      <div className="flex h-full flex-col items-center justify-center rounded-[15px] px-3 text-center" style={{ border: `1px solid ${ink}55` }}>
        <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.24em]">
          <Icon name="key" size={11} strokeWidth={2.2} /> CX Keychain
        </p>
        <span aria-hidden="true" className="my-2 block h-px w-10" style={{ background: `${ink}55` }} />
        <p className="font-display text-[12.5px] font-bold uppercase leading-tight tracking-[0.08em] text-balance sm:text-[14.5px] sm:tracking-[0.1em]">
          {place.city}{place.country ? ` · ${place.country}` : ''}
        </p>
        <p className="mt-1.5 line-clamp-2 text-[13px] font-semibold leading-tight">{stamp.car.make} {stamp.car.model}</p>
        <p className="mt-1.5 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.1em] sm:text-[10.5px] sm:tracking-[0.14em]">{formatTripPeriod(stamp.startDate, stamp.endDate, lang)}</p>
        <p className="mt-2 flex items-center gap-1 whitespace-nowrap text-[8.5px] font-semibold uppercase tracking-[0.1em] opacity-70 sm:text-[9px] sm:tracking-[0.16em]">
          <Icon name="check" size={9} strokeWidth={3.2} /> {t('Verified trip')}
        </p>
      </div>
    </div>
  );
}

/** The stamps in a calm grid. A single stamp sits centred, a little larger, so
 *  it still looks deliberate. `onToggle` (own profile only) adds the
 *  public/private switch under each one. */
export function TripStampGrid({ stamps, onToggle }: { stamps: TripStampData[]; onToggle?: (stamp: TripStampData) => void }) {
  const { t } = useLocale();
  const single = stamps.length === 1;
  return (
    <div className={single ? 'mx-auto w-full max-w-[19rem]' : 'grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3'}>
      {stamps.map((s) => (
        <div key={s.id} className="flex flex-col items-center">
          <TripStamp stamp={s} />
          {onToggle && (
            <button
              type="button"
              onClick={() => onToggle(s)}
              aria-pressed={s.visibility === 'public'}
              className="pressable mt-3 inline-flex items-center gap-1.5 rounded-full bg-panel px-3 py-1.5 text-caption font-semibold text-ink-soft"
            >
              <Icon name={s.visibility === 'public' ? 'globe' : 'eyeOff'} size={12} />
              {s.visibility === 'public' ? t('Public') : t('Private')}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
