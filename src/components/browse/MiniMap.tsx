import { cxFlagMarkup, CX_FLAG_TIP_X } from '../CxFlag';
import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { CITY_COORDS } from '../../data/cityCoords';
import { collapseAttribution } from '../../lib/mapAttribution';

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
}

/** A small map of a car's city. With `point` it centres precisely on the spot the host marked; with
 *  `extra` (e.g. a delivery address) both pins are shown and framed. Without a point it falls back to
 *  the city centre — never an address the viewer has no access to. */
export function MiniMap({
  city,
  point,
  extra,
  interactive = false,
  className = '',
}: {
  city: string;
  point?: MapPoint | null;
  extra?: MapPoint | null;
  interactive?: boolean;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  const key = `${city}|${point?.lat},${point?.lng}|${extra?.lat},${extra?.lng}|${interactive}`;

  useEffect(() => {
    const center: [number, number] | undefined = point ? [point.lng, point.lat] : CITY_COORDS[city];
    if (!box.current || !center) { setFailed(true); return; }
    let map: MapLibreMap | null = null;
    let cancelled = false;
    (async () => {
      try {
        const [maplibregl, worker] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'), import('maplibre-gl/dist/maplibre-gl.css')]);
        if (cancelled || !box.current) return;
        maplibregl.setWorkerUrl(worker.default);
        map = new maplibregl.Map({
          container: box.current,
          style: 'https://tiles.openfreemap.org/styles/positron',
          center,
          zoom: point ? 15.2 : 12.4,
          interactive,
          attributionControl: { compact: true },
          fadeDuration: 0,
        });
        if (interactive) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        collapseAttribution(map);
        const pin = (lngLat: [number, number], label: string | undefined, kind: 'car' | 'you') => {
          if (kind === 'car') {
            // the car's pick-up point: the CX flag planted on the spot (its spear tip is the exact position)
            const W = 30;
            const flag = document.createElement('div');
            flag.style.cssText = `width:${W}px;height:${Math.round(W * 1.26)}px;filter:drop-shadow(0 3px 3px rgba(0,0,0,0.35));pointer-events:none`;
            flag.innerHTML = cxFlagMarkup();
            new maplibregl.Marker({ element: flag, anchor: 'bottom', offset: [-(CX_FLAG_TIP_X - 0.5) * W, 0] }).setLngLat(lngLat).addTo(map!);
            return;
          }
          const el = document.createElement('div');
          el.className = 'fl-dest';
          if (kind === 'you') el.style.setProperty('--pin', '#00a63e');
          const pulse = document.createElement('span');
          pulse.className = 'fl-dest__pulse';
          const dot = document.createElement('span');
          dot.className = 'fl-dest__dot';
          if (kind === 'you') dot.style.background = '#008536';
          el.append(pulse, dot);
          if (label) {
            const tag = document.createElement('span');
            tag.className = 'fl-dest__label';
            tag.textContent = label;
            el.append(tag);
          }
          new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map!);
        };
        map.on('load', () => {
          if (cancelled || !map) return;
          // no flag unless the host marked a spot: the city centre is only where the map is looking, never a pin
          if (point) pin(center, point.label, 'car');
          if (extra) {
            pin([extra.lng, extra.lat], extra.label, 'you');
            const b = new maplibregl.LngLatBounds(center, center);
            b.extend([extra.lng, extra.lat]);
            map.fitBounds(b, { padding: 56, maxZoom: 15.5, duration: 0 });
          }
          setReady(true);
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; map?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className={`relative overflow-hidden bg-[#f2f4f7] ${className}`}>
      <div ref={box} style={{ position: 'absolute', inset: 0 }} role="img" aria-label={`Map of ${city}`} />
      {!ready && !failed && <span className="skeleton absolute inset-0" />}
      {failed && <span className="absolute inset-0 grid place-items-center text-detail text-muted">{city}</span>}
      {ready && !point && !extra && (
        <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-medium text-muted shadow-hair">{city}</span>
      )}
    </div>
  );
}
