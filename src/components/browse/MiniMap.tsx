import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { CITY_COORDS } from '../../data/cityCoords';

/** A small flat map of a car's city with the pick-up area marked. Loads the
 *  map library only when it is first shown. The pin sits on the city centre,
 *  never on the car's exact address. */
export function MiniMap({ city, className = '' }: { city: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const center = CITY_COORDS[city];
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
          zoom: 12.4,
          interactive: false,
          attributionControl: { compact: true },
          fadeDuration: 0,
        });
        map.on('load', () => {
          if (cancelled || !map) return;
          const el = document.createElement('div');
          el.className = 'fl-dest';
          const pulse = document.createElement('span');
          pulse.className = 'fl-dest__pulse';
          const dot = document.createElement('span');
          dot.className = 'fl-dest__dot';
          el.append(pulse, dot);
          new maplibregl.Marker({ element: el }).setLngLat(center).addTo(map);
          setReady(true);
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; map?.remove(); };
  }, [city]);

  return (
    <div className={`relative overflow-hidden bg-[#f2f4f7] ${className}`}>
      <div ref={box} style={{ position: 'absolute', inset: 0 }} role="img" aria-label={`Map of ${city}`} />
      {!ready && !failed && <span className="skeleton absolute inset-0" />}
      {failed && <span className="absolute inset-0 grid place-items-center text-detail text-muted">{city}</span>}
    </div>
  );
}
