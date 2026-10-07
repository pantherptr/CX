// One-off generator for src/data/liveRoutes.json — real driving routes (OSRM)
// between points around each CX city's centre, so the Live board's cars drive
// real streets without any routing request at runtime.
//   node scripts/build-live-routes.mjs
import { writeFileSync } from 'node:fs';

const CITIES = {
  Milan: [9.19, 45.46], Rome: [12.5, 41.9], Florence: [11.25, 43.77], Paris: [2.35, 48.86],
  Amsterdam: [4.9, 52.37], Munich: [11.58, 48.14], Barcelona: [2.17, 41.39],
};
// three trips per city, as offsets (lng, lat) from the centre
const TRIPS = [
  [[-0.013, -0.007], [0.011, 0.008]],
  [[0.014, -0.006], [-0.010, 0.007]],
  [[-0.008, 0.009], [0.012, -0.009]],
];

const out = {};
for (const [city, [lng, lat]] of Object.entries(CITIES)) {
  out[city] = [];
  for (const [[ax, ay], [bx, by]] of TRIPS) {
    const a = `${(lng + ax).toFixed(5)},${(lat + ay).toFixed(5)}`;
    const b = `${(lng + bx).toFixed(5)},${(lat + by).toFixed(5)}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${a};${b}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url);
    const json = await res.json();
    const r = json.routes?.[0];
    if (!r) { console.error('no route', city, a, b, json.code); continue; }
    const steps = r.legs[0].steps.filter((s) => s.name);
    out[city].push({
      coords: r.geometry.coordinates.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]),
      distance: Math.round(r.distance),
      duration: Math.round(r.duration),
      from: steps[0]?.name ?? '',
      to: steps[steps.length - 1]?.name ?? '',
    });
    await new Promise((ok) => setTimeout(ok, 700));
  }
  console.log(city, out[city].length, 'routes');
}
writeFileSync(new URL('../src/data/liveRoutes.json', import.meta.url), JSON.stringify(out));
