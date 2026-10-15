import { cxFlagMarkup, CX_FLAG_TIP_X } from './CxFlag';
import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';
import { AddressInput } from './AddressInput';
import { Icon } from './Icon';
import { CITY_COORDS } from '../data/cityCoords';
import { collapseAttribution } from '../lib/mapAttribution';
import { reversePlace, type Place } from '../lib/geocode';

export interface PickedLocation {
  lat: number;
  lng: number;
  /** What renters read: street / place and city. */
  label: string;
}

/**
 * The host's pick-up spot: search an address, then drag the pin to the exact point (a gate, a
 * parking bay, a corner). Tapping the map also places the pin. Renters later see this exact point.
 */
export function LocationPicker({
  value,
  onChange,
  city,
}: {
  value: PickedLocation | null;
  onChange: (v: PickedLocation | null) => void;
  city: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const [text, setText] = useState(value?.label ?? '');
  const [ready, setReady] = useState(false);
  const [resolving, setResolving] = useState(false);
  const seq = useRef(0);
  const cityCenter = CITY_COORDS[city];

  // Build the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [maplibregl, worker] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'), import('maplibre-gl/dist/maplibre-gl.css')]);
      if (cancelled || !box.current) return;
      maplibregl.setWorkerUrl(worker.default);
      const start: [number, number] = valueRef.current ? [valueRef.current.lng, valueRef.current.lat] : cityCenter ?? [9.19, 45.46];
      const map = new maplibregl.Map({
        container: box.current,
        style: 'https://tiles.openfreemap.org/styles/positron',
        center: start,
        zoom: valueRef.current ? 16 : 11.5,
        attributionControl: { compact: true },
        fadeDuration: 0,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      collapseAttribution(map);
      mapRef.current = map;

      const makeMarker = (lngLat: [number, number]) => {
        // the pick-up point is the CX flag planted on the spot: drag it, the spear tip is the position
        const W = 34;
        const el = document.createElement('div');
        el.style.cssText = `width:${W}px;height:${Math.round(W * 1.26)}px;cursor:grab;filter:drop-shadow(0 3px 3px rgba(0,0,0,0.35))`;
        el.innerHTML = cxFlagMarkup();
        const m = new maplibregl.Marker({ element: el, draggable: true, anchor: 'bottom', offset: [-(CX_FLAG_TIP_X - 0.5) * W, 0] }).setLngLat(lngLat).addTo(map);
        m.on('dragend', () => {
          const ll = m.getLngLat();
          void settle(ll.lat, ll.lng);
        });
        markerRef.current = m;
      };
      (map as unknown as { __make: typeof makeMarker }).__make = makeMarker;

      map.on('load', () => {
        if (cancelled) return;
        if (valueRef.current) makeMarker([valueRef.current.lng, valueRef.current.lat]);
        setReady(true);
      });
      map.on('click', (e) => {
        const { lng, lat } = e.lngLat;
        if (markerRef.current) markerRef.current.setLngLat([lng, lat]);
        else makeMarker([lng, lat]);
        void settle(lat, lng);
      });
    })();
    return () => { cancelled = true; markerRef.current = null; mapRef.current?.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  /** The pin is placed at once (the position is saved the moment it lands); the address text catches up when
   *  the geocoder answers, unless the pin has been moved again in the meantime. */
  const settle = async (lat: number, lng: number) => {
    const mine = ++seq.current;
    const provisional = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setResolving(true);
    onChangeRef.current({ lat, lng, label: provisional });
    const p = await reversePlace(lat, lng);
    if (mine !== seq.current) return;
    setResolving(false);
    const label = p?.label || provisional;
    setText(label);
    onChangeRef.current({ lat, lng, label });
  };

  // When the city changes and nothing is placed yet, show that city.
  useEffect(() => {
    if (!value && cityCenter && mapRef.current) mapRef.current.jumpTo({ center: cityCenter, zoom: 11.5 });
  }, [city, value, cityCenter]);

  const pick = (p: Place) => {
    const map = mapRef.current;
    if (map) {
      map.flyTo({ center: [p.lng, p.lat], zoom: 16.5, duration: 700 });
      if (markerRef.current) markerRef.current.setLngLat([p.lng, p.lat]);
      else (map as unknown as { __make?: (l: [number, number]) => void }).__make?.([p.lng, p.lat]);
    }
    seq.current += 1;
    setResolving(false);
    onChange({ lat: p.lat, lng: p.lng, label: p.label });
  };

  return (
    <div>
      <AddressInput
        value={text}
        onChange={(v) => { setText(v); if (value) onChange(null); }}
        onPick={pick}
        near={cityCenter}
        placeholder="Street, number — or a place name"
      />
      <div className="relative mt-3 overflow-hidden rounded-[20px] border border-line">
        <div ref={box} className="h-64 w-full sm:h-72" />
        {!ready && <span className="skeleton absolute inset-0" />}
        {ready && !value && (
          <p className="pointer-events-none absolute inset-x-3 bottom-3 rounded-xl bg-white/90 px-3 py-2 text-center text-caption font-semibold text-ink-soft shadow-hair backdrop-blur">
            Search an address, or tap the map to drop the pin
          </p>
        )}
      </div>
      {resolving && (
        <p className="mt-2 flex items-center gap-2 text-caption font-medium text-muted">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" />
          Pin placed — finding the address…
        </p>
      )}
      {value && !resolving && !/\d/.test(value.label.split(',')[0] ?? '') && (
        <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-warn/15 px-3 py-2 text-caption font-medium text-warn-ink">
          <Icon name="info" size={14} className="mt-0.5 shrink-0" />
          This address has no street number. Add it in the search box, or drag the pin onto the exact door so renters find the right spot.
        </p>
      )}
      <p className="mt-2 flex items-start gap-1.5 text-caption text-muted">
        <Icon name={value ? 'checkCircle' : 'info'} size={14} className={`mt-0.5 shrink-0 ${value ? 'text-accent' : ''}`} />
        {value
          ? 'Drag the pin to the exact spot. Signed-in renters see this exact point on the map, so choose a meeting place you are comfortable sharing.'
          : 'Renters will see this exact point, so choose a meeting place you are comfortable sharing.'}
      </p>
    </div>
  );
}
