import { useEffect, useRef, useState } from 'react';
import { geoGraticule10, geoOrthographic, geoPath, geoInterpolate } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';

/** [lng, lat] — only cities CX actually lists cars in (see catalogue.cityNames). */
const CITY_COORDS: Record<string, [number, number]> = {
  Milan: [9.19, 45.46],
  Rome: [12.5, 41.9],
  Florence: [11.25, 43.77],
  Paris: [2.35, 48.86],
  Amsterdam: [4.9, 52.37],
  Munich: [11.58, 48.14],
  Barcelona: [2.17, 41.39],
};

const LAND = feature(
  world as unknown as Topology,
  (world as unknown as { objects: { countries: GeometryCollection } }).objects.countries,
);

const HOLD_MS = 2600;
const TRAVEL_MS = 1400;

/**
 * A wireframe globe that drifts from one live CX city to the next, drawn on
 * a canvas (one redraw per frame, no per-frame DOM work). Drag to spin it
 * yourself; it pauses off-screen and respects reduced motion.
 */
export function CityGlobe({
  cities,
  onCityChange,
}: {
  cities: string[];
  onCityChange?: (city: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const known = cities.filter((c) => CITY_COORDS[c]);
  const knownKey = known.join('|');
  const onChangeRef = useRef(onCityChange);
  onChangeRef.current = onCityChange;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return setVisible(true);
    const ob = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.1 });
    ob.observe(el);
    return () => ob.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !visible || known.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const projection = geoOrthographic().precision(0.5);
    const path = geoPath(projection, ctx);
    const graticule = geoGraticule10();
    const style = getComputedStyle(canvas);
    const ink = style.color;
    const accent = style.getPropertyValue('--globe-accent').trim() || '#00d447';

    let size = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = wrap.clientWidth;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.height = `${size}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      projection.translate([size / 2, size / 2]).scale(size / 2 - 6);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // rotation is [-lng, -lat] of the point facing the viewer
    const target = (c: string): [number, number] => [-CITY_COORDS[c][0], -CITY_COORDS[c][1] + 8];
    let from = target(known[0]);
    let to = from;
    let index = 0;
    let rot: [number, number] = from;
    let phase: 'hold' | 'travel' = 'hold';
    let phaseStart = performance.now();
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let raf = 0;
    onChangeRef.current?.(known[0]);

    const draw = (now: number) => {
      if (!dragging && !reduce && known.length > 1) {
        if (phase === 'hold' && now - phaseStart > HOLD_MS) {
          index = (index + 1) % known.length;
          from = rot;
          to = target(known[index]);
          // shortest way round in longitude
          while (to[0] - from[0] > 180) to = [to[0] - 360, to[1]];
          while (to[0] - from[0] < -180) to = [to[0] + 360, to[1]];
          phase = 'travel';
          phaseStart = now;
          onChangeRef.current?.(known[index]);
        } else if (phase === 'travel') {
          const t = Math.min((now - phaseStart) / TRAVEL_MS, 1);
          const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          const interp = geoInterpolate(from, to);
          rot = interp(e) as [number, number];
          if (t >= 1) {
            phase = 'hold';
            phaseStart = now;
          }
        }
      } else if (!dragging && reduce) {
        rot = target(known[0]);
      }

      projection.rotate([rot[0], rot[1]]);
      ctx.clearRect(0, 0, size, size);
      ctx.strokeStyle = ink;

      ctx.beginPath();
      path({ type: 'Sphere' });
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.beginPath();
      path(graticule);
      ctx.globalAlpha = 0.1;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      path(LAND);
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 0.7;
      ctx.stroke();

      const current = known[index];
      const centre: [number, number] = [-rot[0], -rot[1]];
      for (const city of known) {
        const coords = CITY_COORDS[city];
        // hide dots on the far side of the sphere
        const d = Math.acos(
          Math.sin((centre[1] * Math.PI) / 180) * Math.sin((coords[1] * Math.PI) / 180) +
            Math.cos((centre[1] * Math.PI) / 180) * Math.cos((coords[1] * Math.PI) / 180) *
              Math.cos(((coords[0] - centre[0]) * Math.PI) / 180),
        );
        if (d > Math.PI / 2) continue;
        const p = projection(coords);
        if (!p) continue;
        const active = city === current;
        ctx.globalAlpha = 1;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(p[0], p[1], active ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fill();
        if (active) {
          const pulse = ((now / 900) % 1);
          ctx.globalAlpha = 0.5 * (1 - pulse);
          ctx.strokeStyle = accent;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p[0], p[1], 4.5 + pulse * 16, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = ink;
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      rot = [rot[0] + (e.clientX - lastX) * 0.4, Math.max(-80, Math.min(80, rot[1] - (e.clientY - lastY) * 0.4))];
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      from = rot;
      to = rot;
      phase = 'hold';
      phaseStart = performance.now();
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, knownKey]);

  return (
    <div ref={wrapRef} className="mx-auto w-full max-w-[26rem] text-ink">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Globe showing CX cities: ${known.join(', ')}`}
        className="block w-full cursor-grab touch-pan-y active:cursor-grabbing"
      />
    </div>
  );
}
