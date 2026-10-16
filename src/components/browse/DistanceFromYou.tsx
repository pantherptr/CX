import { useState } from 'react';
import { Icon } from '../Icon';
import { distanceKm } from '../../lib/geocode';
import { CITY_COORDS } from '../../data/cityCoords';
import { useLocale } from '../../lib/i18n';

/** "How far is it from me?": asked on a tap (so the phone's location prompt never appears by surprise), answered with
 *  an estimate — the straight line stretched to a road distance, at an average city speed. No routing service, no cost. */
export function DistanceFromYou({ city, point }: { city: string; point: { lat: number; lng: number } | null }) {
  const { t } = useLocale();
  const [state, setState] = useState<'idle' | 'asking' | 'done' | 'denied'>('idle');
  const [result, setResult] = useState<{ km: number; min: number } | null>(null);
  const target = point ?? (CITY_COORDS[city] ? { lat: CITY_COORDS[city][1], lng: CITY_COORDS[city][0] } : null);
  if (!target || typeof navigator === 'undefined' || !navigator.geolocation) return null;

  const ask = () => {
    setState('asking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const road = distanceKm({ lat: pos.coords.latitude, lng: pos.coords.longitude }, target) * 1.3;
        const speed = road > 25 ? 55 : 28; // km/h: city streets, or a longer run on faster roads
        const raw = (road / speed) * 60;
        const min = Math.max(2, raw < 20 ? Math.round(raw) : Math.round(raw / 5) * 5);
        setResult({ km: road, min });
        setState('done');
      },
      () => setState('denied'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 },
    );
  };

  const km = result ? (result.km < 10 ? result.km.toFixed(1) : String(Math.round(result.km))) : '';
  const hours = result && result.min >= 90 ? `${Math.floor(result.min / 60)} h ${String(result.min % 60).padStart(2, '0')} min` : null;
  return (
    <div className="mt-2.5 flex items-center gap-2.5 rounded-2xl bg-panel px-3.5 py-2.5 text-detail">
      <Icon name="compass" size={17} className="shrink-0 text-muted" />
      {state === 'done' && result ? (
        <p className="min-w-0 flex-1 text-ink">
          <span className="font-semibold">{t('About {t} by car · {km} km', { t: hours ?? `${result.min} min`, km })}</span>
          <span className="ml-1.5 text-caption text-muted">{point ? t('to the pick-up spot') : t('to the city centre')}</span>
        </p>
      ) : state === 'denied' ? (
        <p className="min-w-0 flex-1 text-muted">{t('Allow your location to see how far it is.')}</p>
      ) : (
        <button type="button" onClick={ask} disabled={state === 'asking'} className="pressable min-w-0 flex-1 text-left font-semibold text-ink disabled:opacity-60">
          {state === 'asking' ? t('Finding you…') : t('How far is it from me?')}
        </button>
      )}
    </div>
  );
}
