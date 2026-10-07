import type { Map as MapLibreMap } from 'maplibre-gl';

/** The map data is OpenStreetMap's, whose licence requires the credit to stay
 *  one tap away. Keep it, but fold it into the small (i) button instead of a
 *  line of text across the map. */
export function collapseAttribution(map: MapLibreMap) {
  const fold = () => {
    const el = map.getContainer().querySelector('.maplibregl-ctrl-attrib.maplibregl-compact-show');
    el?.querySelector<HTMLElement>('.maplibregl-ctrl-attrib-button')?.click();
  };
  map.once('load', () => { fold(); window.setTimeout(fold, 60); });
}
