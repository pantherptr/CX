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

// Two plain inks: the CX green and graphite. Nothing shiny, nothing gold.
const INKS = ['#0c7a38', '#23272a'];

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

/** The round postmark: a ring with the words running around it, the CX mark in the middle. Pressed slightly crooked. */
function Postmark({ ink, label, rotate }: { ink: string; label: string; rotate: number }) {
  return (
    <svg viewBox="0 0 80 80" width={74} height={74} aria-hidden="true" style={{ transform: `rotate(${rotate}deg)`, filter: 'url(#cx-stamp-ink)', color: ink }}>
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

/** One trip, as a small clean card with a postmark pressed in the corner. */
export function TripStamp({ stamp, tilted = true }: { stamp: TripStampData; tilted?: boolean }) {
  const { t, lang } = useLocale();
  const h = hashOf(stamp.id);
  const ink = INKS[h % INKS.length];
  const tilt = tilted ? ((h >> 3) % 3 - 1) * 0.5 : 0;
  const mark = -14 + ((h >> 5) % 9);
  const place = stampPlace(stamp.city, lang);
  const coords = cityCoords(stamp.city);
  return (
    <div
      className="relative w-full select-none overflow-hidden rounded-3xl border border-line bg-surface"
      style={{ transform: `rotate(${tilt}deg)`, boxShadow: '0 14px 30px -22px rgba(20,30,24,0.5)' }}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: ink }} />
      <div className="relative px-6 pb-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted"><Icon name="key" size={13} strokeWidth={2} /> {t('CX Keychain')}</p>
            {coords && <p className="mt-0.5 text-[10px] font-medium tracking-[0.08em] text-faint">{coords}</p>}
          </div>
          <span className="-mr-1 -mt-1 shrink-0 opacity-[0.78]">
            <Postmark ink={ink} label={`${t('Verified trip').toUpperCase()} · CX KEYCHAIN · `} rotate={mark} />
          </span>
        </div>

        <p className="mt-3 font-display text-[2rem] font-semibold leading-[1] tracking-[-0.025em] text-ink text-balance">{place.city}</p>
        {place.country && <p className="mt-1 text-detail text-muted">{place.country}</p>}

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate font-display text-[1.05rem] font-medium text-ink">{stamp.car.make} {stamp.car.model}</p>
          <span className="shrink-0 rounded-full bg-panel px-2.5 py-1 text-[11px] font-semibold text-ink-soft">{stamp.car.year}</span>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3 text-[11.5px] font-medium text-muted">
          <span>{formatTripPeriod(stamp.startDate, stamp.endDate, lang)}</span>
          <span className="flex items-center gap-1 font-semibold" style={{ color: ink }}>
            <CxMark tier="verified" size={11} /> {t('Verified trip')}
          </span>
        </div>
      </div>
      {stamp.visibility === 'private' && (
        <span className="absolute bottom-3.5 left-5 text-faint" title={t('Private')}><Icon name="eyeOff" size={11} /></span>
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
