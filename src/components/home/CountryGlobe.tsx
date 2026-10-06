import { useEffect, useRef, useState } from 'react';
import { geoContains, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Geometry } from 'geojson';
import world from 'world-atlas/countries-110m.json';
import { COUNTRIES, type Country } from '../../lib/i18n/countries';

/** ISO 3166-1 numeric ids used by world-atlas, per country code. */
const NUMERIC: Record<string, number> = {
  IT: 380, RO: 642, ES: 724, FR: 250, DE: 276, GB: 826, NL: 528, PT: 620,
  GR: 300, CH: 756, AT: 40, BE: 56, PL: 616, SE: 752, US: 840, AE: 784,
};

type CountryFeature = Feature<Geometry>;

const ALL = feature(
  world as unknown as Topology,
  (world as unknown as { objects: { countries: GeometryCollection } }).objects.countries,
);

const CHOOSABLE: { country: Country; feature: CountryFeature }[] = COUNTRIES.flatMap((country) => {
  const f = ALL.features.find((x) => Number(x.id) === NUMERIC[country.code]) as CountryFeature | undefined;
  return f ? [{ country, feature: f }] : [];
});

interface Hover {
  country: Country;
  x: number;
  y: number;
}

/**
 * The country picker: a globe where the countries themselves are the
 * buttons. Live countries are green and clickable; locked ones are drawn
 * muted and say "coming soon" on hover. Drag to spin, click/tap to choose.
 * A visually hidden list mirrors it for keyboards and screen readers.
 */
export function CountryGlobe({
  onChoose,
  soonLabel = 'Coming soon',
}: {
  onChoose: (code: string) => void;
  soonLabel?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const zoomRef = useRef<(factor: number) => void>(() => {});
  const onChooseRef = useRef(onChoose);
  onChooseRef.current = onChoose;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !wrap || !ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const projection = geoOrthographic().precision(0.5);
    const path = geoPath(projection, ctx);
    const graticule = geoGraticule10();
    const ink = getComputedStyle(canvas).color;
    const accent = '#00b83c';

    let size = 0;
    let zoom = 2.3;
    let zoomTarget = zoom;
    const applyScale = () => projection.translate([size / 2, size / 2]).scale((size / 2 - 8) * zoom);
    zoomRef.current = (delta) => {
      zoomTarget = Math.max(1, Math.min(4, zoomTarget * delta));
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = wrap.clientWidth;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.height = `${size}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      applyScale();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // Start turned away and swing round to Europe, centred on Italy-ish.
    const home: [number, number] = [-11, -43];
    let rot: [number, number] = reduce ? home : [home[0] + 70, home[1]];
    let hovered: Country | null = null;
    let dragging = false;
    let moved = 0;
    let lastX = 0;
    let lastY = 0;
    let raf = 0;

    const pick = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const ll = projection.invert?.([x, y]);
      if (!ll || !Number.isFinite(ll[0])) return { x, y, country: null as Country | null };
      const hit = CHOOSABLE.find((c) => geoContains(c.feature, ll));
      return { x, y, country: hit?.country ?? null };
    };

    const draw = () => {
      if (Math.abs(zoomTarget - zoom) > 0.002) {
        zoom += (zoomTarget - zoom) * 0.15;
        applyScale();
      }
      if (!dragging) {
        const dx = home[0] - rot[0];
        if (Math.abs(dx) > 0.05) rot = [rot[0] + dx * 0.06, rot[1] + (home[1] - rot[1]) * 0.06];
      }
      projection.rotate(rot);
      ctx.clearRect(0, 0, size, size);

      ctx.strokeStyle = ink;
      ctx.beginPath();
      path({ type: 'Sphere' });
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.3;
      ctx.stroke();

      ctx.beginPath();
      path(graticule);
      ctx.globalAlpha = 0.09;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      path(ALL);
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 0.7;
      ctx.stroke();

      for (const { country, feature: f } of CHOOSABLE) {
        const live = !!country.lang;
        const isHover = hovered?.code === country.code;
        ctx.beginPath();
        path(f);
        ctx.globalAlpha = 1;
        if (live) {
          ctx.fillStyle = isHover ? 'rgba(0,184,60,0.62)' : 'rgba(0,184,60,0.32)';
          ctx.fill();
          ctx.strokeStyle = accent;
          ctx.lineWidth = isHover ? 2 : 1.2;
          ctx.stroke();
        } else {
          ctx.fillStyle = isHover ? 'rgba(20,30,25,0.16)' : 'rgba(20,30,25,0.07)';
          ctx.fill();
          ctx.strokeStyle = ink;
          ctx.globalAlpha = 0.45;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }

      // Names pinned to the live countries so they read as the way in.
      const centre: [number, number] = [-rot[0], -rot[1]];
      const rad = Math.PI / 180;
      ctx.font = '600 12px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const { country } of CHOOSABLE) {
        if (!country.lang) continue;
        const [lng, lat] = country.coords;
        const d = Math.acos(
          Math.sin(centre[1] * rad) * Math.sin(lat * rad) +
            Math.cos(centre[1] * rad) * Math.cos(lat * rad) * Math.cos((lng - centre[0]) * rad),
        );
        if (d > 1.2) continue;
        const p = projection([lng, lat]);
        if (!p) continue;
        const w = ctx.measureText(country.name).width + 18;
        const ly = p[1] - 22;
        ctx.globalAlpha = Math.min(1, (1.2 - d) * 4);
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(p[0], p[1], 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.roundRect(p[0] - w / 2, ly - 12, w, 24, 12);
        ctx.fill();
        ctx.fillStyle = '#0d1f14';
        ctx.fillText(country.name, p[0], ly + 0.5);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const down = (e: PointerEvent) => {
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        moved += Math.abs(dx) + Math.abs(dy);
        rot = [rot[0] + dx * 0.4, Math.max(-80, Math.min(80, rot[1] - dy * 0.4))];
        lastX = e.clientX;
        lastY = e.clientY;
      }
      const { x, y, country } = pick(e.clientX, e.clientY);
      hovered = country;
      setHover(country ? { country, x, y } : null);
      canvas.style.cursor = dragging ? 'grabbing' : country ? (country.lang ? 'pointer' : 'not-allowed') : 'grab';
    };
    const up = (e: PointerEvent) => {
      const wasClick = dragging && moved < 6;
      dragging = false;
      if (wasClick) {
        const { country } = pick(e.clientX, e.clientY);
        if (country?.lang) onChooseRef.current(country.code);
      }
    };
    const leave = () => {
      hovered = null;
      setHover(null);
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', leave);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('pointerleave', leave);
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative mx-auto w-full text-ink">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="block w-full cursor-grab touch-none rounded-full border border-line bg-white/50 shadow-soft"
        onWheel={(e) => zoomRef.current(e.deltaY < 0 ? 1.12 : 1 / 1.12)}
      />
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5 sm:bottom-6 sm:right-6">
        {([['+', 1.4, 'Zoom in'], ['−', 1 / 1.4, 'Zoom out']] as const).map(([label, f, aria]) => (
          <button
            key={label}
            type="button"
            aria-label={aria}
            onClick={() => zoomRef.current(f)}
            className="grid h-9 w-9 place-items-center rounded-full border border-line bg-white/95 text-lead font-medium text-ink shadow-hair transition hover:border-ink/30 active:scale-95"
          >
            {label}
          </button>
        ))}
      </div>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl border border-line bg-white/95 px-3 py-1.5 text-detail font-semibold text-ink shadow-soft backdrop-blur"
          style={{ left: hover.x, top: hover.y - 14 }}
        >
          <span className="mr-1.5">{hover.country.flag}</span>
          {hover.country.name}
          {!hover.country.lang && <span className="ml-2 font-medium text-faint">{soonLabel}</span>}
        </div>
      )}

      <ul className="sr-only">
        {COUNTRIES.map((c) => (
          <li key={c.code}>
            <button type="button" disabled={!c.lang} onClick={() => onChoose(c.code)}>
              {c.name}
              {!c.lang && ` — ${soonLabel}`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
