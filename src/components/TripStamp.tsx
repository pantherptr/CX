import { useState } from 'react';
import { Icon } from './Icon';
import { Modal } from './primitives';
import { CxMark } from './CxBadge';
import { KeysCta } from './signalFeed/KeysCta';
import { useLocale } from '../lib/i18n';
import { stampPlace } from '../lib/cityCountry';
import { CITY_COORDS } from '../data/cityCoords';
import { formatTripPeriod, type TripStampData } from '../lib/data/tripMemories';
import { uiLocale } from '../lib/i18n/uiLocale';

// Two inks only: CX green and graphite (they lighten on the dark theme, see .stamp-ink-* in index.css).
const INKS = ['stamp-ink-g', 'stamp-ink-k'];

function hashOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** The general centre of a known city as degrees and minutes — never a
 *  position of the trip itself. `null` for cities CX has no centre for. */
function cityCoords(city: string): string | null {
  const key = Object.keys(CITY_COORDS).find((k) => k.toLowerCase() === city.trim().toLowerCase());
  if (!key) return null;
  const [lon, lat] = CITY_COORDS[key];
  const dm = (v: number, pos: string, neg: string) => {
    const a = Math.abs(v);
    const d = Math.floor(a);
    const m = Math.round((a - d) * 60);
    return `${d}°${String(m).padStart(2, '0')}′${v >= 0 ? pos : neg}`;
  };
  return `${dm(lat, 'N', 'S')} ${dm(lon, 'E', 'W')}`;
}

/** Rubber-stamp ink: edges that wobble a little and a worn, uneven coat (a few specks of paper showing through). Rendered once. */
export function StampInkFilter() {
  return (
    <svg aria-hidden="true" width="0" height="0" className="pointer-events-none absolute">
      <filter id="cx-stamp-ink" x="-6%" y="-6%" width="112%" height="112%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="warp" />
        <feDisplacementMap in="SourceGraphic" in2="warp" scale="2.4" result="shape" />
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="9" result="grain" />
        <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  7 0 0 0 -1.72" result="coat" />
        <feComposite in="shape" in2="coat" operator="in" />
      </filter>
    </svg>
  );
}

/** The round postmark: a ring with the words running around it, the CX mark in the middle. Pressed slightly crooked. */
function Postmark({ label, rotate }: { label: string; rotate: number }) {
  return (
    <svg viewBox="0 0 80 80" width={74} height={74} aria-hidden="true" style={{ transform: `rotate(${rotate}deg)` }}>
      <defs><path id="pm-ring" d="M40 40 m-29 0 a29 29 0 1 1 58 0 a29 29 0 1 1 -58 0" /></defs>
      <circle cx="40" cy="40" r="37" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="40" cy="40" r="21" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.7" />
      <text fontSize="7.4" fontWeight="700" letterSpacing="2.1" fill="currentColor" fontFamily="inherit">
        <textPath href="#pm-ring" startOffset="0">{label}</textPath>
      </text>
      <text x="40" y="44.5" textAnchor="middle" fontSize="13" fontWeight="800" fill="currentColor" fontFamily="inherit" letterSpacing="0.5">CX</text>
    </svg>
  );
}

/** One trip, pressed straight onto the page: no card, no background: only ink. */
export function TripStamp({ stamp, tilted = true }: { stamp: TripStampData; tilted?: boolean }) {
  const { t, lang } = useLocale();
  const h = hashOf(stamp.id);
  const ink = INKS[h % INKS.length];
  const tilt = tilted ? ((h >> 3) % 7 - 3) * 0.9 : 0;
  const mark = -16 + ((h >> 5) % 13);
  const place = stampPlace(stamp.city, lang);
  const coords = cityCoords(stamp.city);
  return (
    <div className={`relative w-full select-none ${ink}`} style={{ transform: `rotate(${tilt}deg)` }}>
      <div className="relative opacity-[0.92]" style={{ filter: 'url(#cx-stamp-ink)' }}>
        {/* the frame: a thick line, a thin one inside it */}
        <div className="relative rounded-[18px] border-[3px] border-current p-[5px]">
          <div className="rounded-[12px] border border-current px-5 pb-4 pt-4">
            <div className="flex items-center justify-between gap-3 text-[10px] font-extrabold uppercase tracking-[0.3em]">
              <span className="flex items-center gap-1.5"><Icon name="key" size={12} strokeWidth={2.4} /> CX Keychain</span>
            </div>
            {coords && <p className="mt-1 text-[9px] font-bold tracking-[0.14em] opacity-75">{coords}</p>}
            <span aria-hidden="true" className="mt-2.5 block h-[2px] w-full bg-current" />

            <p className="mt-4 font-display text-[2.4rem] font-black uppercase leading-[0.92] tracking-[0.02em] text-balance">{place.city}</p>
            {place.country && <p className="mt-1.5 text-[11px] font-extrabold uppercase tracking-[0.36em]">{place.country}</p>}

            <div className="mt-5 flex items-end justify-between gap-3">
              <p className="min-w-0 font-display text-[1.05rem] font-bold uppercase tracking-[0.04em]">{stamp.car.make} {stamp.car.model}</p>
              <span className="shrink-0 rounded-[4px] border-2 border-current px-1.5 py-px text-[11px] font-extrabold tracking-[0.16em]">{stamp.car.year}</span>
            </div>
            <span aria-hidden="true" className="mt-3.5 block h-px w-full bg-current opacity-60" />
            <div className="mt-2 flex items-center justify-between gap-3 whitespace-nowrap text-[10px] font-extrabold uppercase tracking-[0.14em]">
              <span>{formatTripPeriod(stamp.startDate, stamp.endDate, lang)}</span>
              <span className="flex items-center gap-1"><CxMark tier="verified" size={10} /> {t('Verified trip')}</span>
            </div>
          </div>
        </div>
        {/* the postmark, pressed over the corner so the two inks overlap */}
        <span className="absolute -top-8 right-0"><Postmark label={`${t('Verified trip').toUpperCase()} · CX KEYCHAIN · `} rotate={mark} /></span>
      </div>
      {stamp.visibility === 'private' && (
        <span className="absolute -bottom-5 left-1 inline-flex items-center gap-1 text-[10px] font-medium text-faint" title={t('Private')}><Icon name="eyeOff" size={11} /> {t('Private')}</span>
      )}
    </div>
  );
}

/** The full record of one trip, opened from its stamp. */
function TravelRecord({ stamp, onClose, onToggle }: { stamp: TripStampData; onClose: () => void; onToggle?: (s: TripStampData) => void }) {
  const { t, lang } = useLocale();
  const place = stampPlace(stamp.city, lang);
  const loc = lang === 'en' ? uiLocale() : lang;
  const long = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' });
  const Row = ({ k, v }: { k: string; v: string }) => (
    <div className="flex items-baseline justify-between gap-6 border-b border-line py-3">
      <dt className="text-[11px] font-semibold text-faint">{k}</dt>
      <dd className="text-right text-detail font-medium text-ink">{v}</dd>
    </div>
  );
  return (
    <Modal open onClose={onClose} className="flex max-h-[92dvh] flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-3 pt-7">
        <p className="mb-5 text-center text-[11px] font-semibold text-faint">{t('Travel record')}</p>
        <div className="mx-auto max-w-[22rem]"><TripStamp stamp={stamp} tilted={false} /></div>
        <dl className="mx-auto mt-8 max-w-[22rem]">
          <Row k={t('Destination')} v={place.country ? `${place.city} · ${place.country}` : place.city} />
          <Row k={t('Car')} v={`${stamp.car.make} ${stamp.car.model}`} />
          <Row k={t('Year')} v={String(stamp.car.year)} />
          <Row k={t('Period')} v={`${long(stamp.startDate)} – ${long(stamp.endDate)}`} />
          <Row k={t('Status')} v={t('Verified trip')} />
          <Row k={t('Visibility')} v={stamp.visibility === 'public' ? t('Public') : t('Private')} />
        </dl>
      </div>
      <div className="flex shrink-0 flex-col gap-2.5 border-t border-line p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        {onToggle && (
          <button
            type="button"
            onClick={() => onToggle(stamp)}
            className="pressable btn btn-secondary btn-lg"
          >
            <Icon name={stamp.visibility === 'public' ? 'eyeOff' : 'globe'} size={15} />
            {stamp.visibility === 'public' ? t('Make private') : t('Make public')}
          </button>
        )}
        <KeysCta carId={stamp.car.id} carSlug={stamp.car.slug} className="w-full" />
      </div>
    </Modal>
  );
}

/** The collection: one stamp per row on a phone, an orderly grid on a wide
 *  screen. Opening a stamp shows its travel record. `onToggle` (own profile
 *  only) adds the public/private switch inside the record. */
export function TripStampGrid({ stamps, onToggle }: { stamps: TripStampData[]; onToggle?: (stamp: TripStampData) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = stamps.find((s) => s.id === openId) ?? null;
  const single = stamps.length === 1;
  return (
    <>
      <StampInkFilter />
      <div className={single ? 'mx-auto w-full max-w-[24rem] pt-6' : 'mx-auto grid max-w-[24rem] grid-cols-1 gap-y-16 pt-6 sm:max-w-none sm:grid-cols-2 sm:gap-x-10'}>
        {stamps.map((s) => (
          <button key={s.id} type="button" onClick={() => setOpenId(s.id)} className="pressable block w-full text-left" aria-label={`${s.car.make} ${s.car.model} · ${s.city}`}>
            <TripStamp stamp={s} />
          </button>
        ))}
      </div>
      {open && <TravelRecord stamp={open} onClose={() => setOpenId(null)} onToggle={onToggle} />}
    </>
  );
}
