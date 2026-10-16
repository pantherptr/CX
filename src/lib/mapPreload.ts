/** The map library, its worker and the map style are the slow part of opening a map. Calling this early (when a list of
 *  cars appears, when a finger touches a car) means the map that opens a moment later only has to draw. */
let started: Promise<unknown> | null = null;

export function preloadMap(): Promise<unknown> {
  if (started) return started;
  if (typeof navigator !== 'undefined') {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return Promise.resolve();
  }
  started = Promise.all([
    import('maplibre-gl'),
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
    import('maplibre-gl/dist/maplibre-gl.css'),
    fetch('https://tiles.openfreemap.org/styles/positron').then((r) => r.json()).catch(() => null),
  ]).catch(() => { started = null; });
  return started;
}
