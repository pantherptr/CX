import type { Map as MapLibreMap } from 'maplibre-gl';

/** The CX look for every map: the free "positron" base, recoloured on load — soft green-white land, green parks,
 *  quiet roads with the motorways in a pale green, and ink-black place names. No extra request, no cost. */
const PAINT: [layer: string, prop: string, value: string][] = [
  ['background', 'background-color', '#f4f6f1'],
  ['park', 'fill-color', '#dcebd9'],
  ['landcover_wood', 'fill-color', '#d2e5cf'],
  ['landuse_residential', 'fill-color', '#eef1ea'],
  ['water', 'fill-color', '#c9ddd9'],
  ['waterway', 'line-color', '#b9d2cd'],
  ['building', 'fill-color', '#e8ece4'],
  ['highway_minor', 'line-color', '#e4e8de'],
  ['highway_path', 'line-color', '#e0e5da'],
  ['highway_major_casing', 'line-color', '#d3d9cd'],
  ['highway_major_inner', 'line-color', '#ffffff'],
  ['highway_motorway_casing', 'line-color', '#8fd3a6'],
  ['highway_motorway_inner', 'line-color', '#c3efd0'],
  ['highway_motorway_bridge_casing', 'line-color', '#8fd3a6'],
  ['highway_motorway_bridge_inner', 'line-color', '#c3efd0'],
  ['tunnel_motorway_casing', 'line-color', '#c5e3cf'],
  ['tunnel_motorway_inner', 'line-color', '#e3f4e8'],
  ['highway-name-minor', 'text-color', '#4a5148'],
  ['highway-name-major', 'text-color', '#4a5148'],
  ['water_name_point_label', 'text-color', '#3f6b60'],
  ['water_name_line_label', 'text-color', '#3f6b60'],
  ['label_village', 'text-color', '#16161a'],
  ['label_town', 'text-color', '#16161a'],
  ['label_city', 'text-color', '#16161a'],
  ['label_city_capital', 'text-color', '#16161a'],
  ['label_other', 'text-color', '#2a2f28'],
];

export function applyCxMapStyle(map: MapLibreMap): void {
  const apply = () => {
    for (const [layer, prop, value] of PAINT) {
      try {
        if (map.getLayer(layer)) map.setPaintProperty(layer, prop as Parameters<MapLibreMap['setPaintProperty']>[1], value);
      } catch { /* a layer the style does not have */ }
    }
  };
  if (map.isStyleLoaded()) apply();
  map.on('style.load', apply);
}
