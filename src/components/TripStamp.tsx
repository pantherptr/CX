import { useState } from 'react';
import { Icon } from './Icon';
import { Modal } from './primitives';
import { CxMark } from './CxBadge';
import { KeysCta } from './signalFeed/KeysCta';
import { useLocale } from '../lib/i18n';
import { stampPlace } from '../lib/cityCountry';
import { CITY_COORDS } from '../data/cityCoords';
import { formatTripPeriod, type TripStampData } from '../lib/data/tripMemories';

// Printed inks: warm black and three muted tones — never bright.
const INKS = ['#1b1a18', '#1d4a45', '#2a3f5c', '#6e2c37'];
const PAPER = '#f6f1e6';
const CHAMPAGNE = '#b7a06a';

// A whisper of paper grain, as an inline vector so nothing is downloaded.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .42 0 0 0 0 .35 0 0 0 0 .22 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

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

/** Slightly uneven edges, as if pressed by a real stamp. Rendered once. */
export function StampInkFilter() {
  return (
    <svg aria-hidden="true" width="0" height="0" className="pointer-events-none absolute">
      <filter id="cx-stamp-ink" x="-2%" y="-2%" width="104%" height="104%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="4" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="0.9" />
      </filter>
    </svg>
  );
}

/** One travel document: a small printed record of a single trip. */
export function TripStamp({ stamp, tilted = true }: { stamp: TripStampData; tilted?: boolean }) {
  const { t, lang } = useLocale();
  const h = hashOf(stamp.id);
  const ink = INKS[h % INKS.length];
  const tilt = tilted ? ((h >> 3) % 5 - 2) * 0.35 : 0;
  const place = stampPlace(stamp.city, lang);
  const coords = cityCoords(stamp.city);
  return (
    <div
      className="relative w-full select-none overflow-hidden rounded-[5px]"
      style={{ background: PAPER, color: ink, transform: `rotate(${tilt}deg)`, boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 10px 22px -18px rgba(40,30,10,0.5)' }}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.09] mix-blend-multiply" style={{ backgroundImage: GRAIN }} />
      <div className="relative m-[7px]" style={{ filter: 'url(#cx-stamp-ink)' }}>
        <div className="absolute inset-0 rounded-[3px]" style={{ border: `1px solid ${ink}`, opacity: 0.85 }} />
        <div className="absolute inset-[3px] rounded-[2px]" style={{ border: `0.5px solid ${ink}`, opacity: 0.45 }} />
        <div className="relative flex flex-col px-5 pb-4 pt-4 sm:px-5">
          <div className="flex items-center justify-between gap-3 text-[8.5px] font-bold uppercase tracking-[0.26em]">
            <span className="flex items-center gap-1.5"><Icon name="key" size={11} strokeWidth={2.2} /> CX Keychain</span>
            {coords && <span className="font-medium tracking-[0.14em] opacity-60">{coords}</span>}
          </div>
          <span aria-hidden="true" className="mt-2.5 block h-px w-full" style={{ background: CHAMPAGNE }} />

          <p className="mt-5 font-display text-[1.7rem] font-bold uppercase leading-[0.95] tracking-[0.05em] text-balance sm:text-[1.55rem]">
            {place.city}
          </p>
          {place.country && <p className="mt-1.5 text-[9.5px] font-bold uppercase tracking-[0.32em] opacity-70">{place.country}</p>}

          <div className="mt-5 flex items-end justify-between gap-3">
            <p className="min-w-0 font-display text-[1.02rem] font-medium leading-tight tracking-tight">
              {stamp.car.make} {stamp.car.model}
            </p>
            <span className="shrink-0 rounded-[2px] px-1.5 py-0.5 text-[9px] font-bold tracking-[0.18em]" style={{ border: `1px solid ${ink}` }}>
              {stamp.car.year}
            </span>
          </div>

          <span aria-hidden="true" className="mt-4 block h-px w-full opacity-30" style={{ background: ink }} />
          <div className="mt-2.5 flex items-center justify-between gap-3 whitespace-nowrap text-[8.5px] font-bold uppercase tracking-[0.14em]">
            <span>{formatTripPeriod(stamp.startDate, stamp.endDate, lang)}</span>
            <span className="flex items-center gap-1 opacity-75">
              <CxMark tier="verified" size={9} /> {t('Verified trip')}
            </span>
          </div>
        </div>
      </div>
      {stamp.visibility === 'private' && (
        <span className="absolute right-2 top-2 opacity-40" title={t('Private')}><Icon name="eyeOff" size={10} /></span>
      )}
    </div>
  );
}

/** The full record of one trip, opened from its stamp. */
function TravelRecord({ stamp, onClose, onToggle }: { stamp: TripStampData; onClose: () => void; onToggle?: (s: TripStampData) => void }) {
  const { t, lang } = useLocale();
  const place = stampPlace(stamp.city, lang);
  const loc = lang === 'en' ? 'en-GB' : lang;
  const long = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' });
  const Row = ({ k, v }: { k: string; v: string }) => (
    <div className="flex items-baseline justify-between gap-6 border-b border-line py-3">
      <dt className="text-[10px] font-bold uppercase tracking-[0.22em] text-faint">{k}</dt>
      <dd className="text-right text-detail font-medium text-ink">{v}</dd>
    </div>
  );
  return (
    <Modal open onClose={onClose} className="flex max-h-[92dvh] flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-3 pt-7">
        <p className="mb-5 text-center text-[10px] font-bold uppercase tracking-[0.34em] text-faint">{t('Travel record')}</p>
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
            className="pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-[6px] border border-ink/80 px-5 text-detail font-semibold text-ink"
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
      <div className={single ? 'mx-auto w-full max-w-[24rem]' : 'mx-auto grid max-w-[24rem] grid-cols-1 gap-y-9 sm:max-w-none sm:grid-cols-2 sm:gap-x-8'}>
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
