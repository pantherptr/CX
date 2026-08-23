import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { useApp } from '../lib/store';
import { useCompare } from '../lib/compareStore';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import {
  getCarConfigOptions,
  hasAnyConfigOptions,
  getAppointments,
  saveBuild,
  type CarConfigOptions,
} from '../lib/data/carConfig';
import type { Car } from '../data/types';

/**
 * CX Configurator — "Build your CX".
 *
 * No vehicle in this catalogue has a 3D model, so per the feature's own
 * fallback rule this is the image-based experience built on the car's
 * REAL photography: drag to rotate through its actual gallery, pinch/
 * scroll to zoom, pick a frame from real thumbnails. There is deliberately
 * no synthetic 3D car — a generic model would misrepresent the specific
 * vehicle being rented.
 *
 * Likewise the Exterior/Wheels/Interior panels render their architecture
 * but show an honest "not published" state, because the `cars` table has
 * no colour/wheel/interior columns (see `lib/data/carConfig.ts`). Nothing
 * here invents an option the booking flow couldn't honour.
 */

export function ConfiguratorLauncher({
  car,
  className,
  children,
  autoOpen = false,
  initialView = 0,
}: {
  car: Car;
  className?: string;
  children: ReactNode;
  /** Opens immediately on mount — used by a shared `?build=1` link. */
  autoOpen?: boolean;
  initialView?: number;
}) {
  const [open, setOpen] = useState(autoOpen);
  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open && <ConfiguratorModal car={car} initialView={initialView} onClose={() => setOpen(false)} />}
    </>
  );
}

/** A spec row is only rendered when the underlying field actually has a
 *  value — no placeholder dashes for data the database doesn't hold. */
function realSpecs(car: Car): { icon: IconName; label: string; value: string }[] {
  const rows: { icon: IconName; label: string; value: string }[] = [
    { icon: 'grid', label: 'Category', value: car.category },
    { icon: 'seat', label: 'Seats', value: `${car.seats}` },
    { icon: 'door', label: 'Doors', value: `${car.doors}` },
    { icon: 'gear', label: 'Transmission', value: car.transmission },
    { icon: 'gas', label: 'Fuel', value: car.fuel },
    { icon: 'bag', label: 'Luggage', value: `${car.luggage}` },
  ];
  if (car.drive) rows.push({ icon: 'compass', label: 'Drive', value: car.drive });
  if (car.mileage) rows.push({ icon: 'gauge', label: 'Mileage', value: car.mileage });
  return rows;
}

function ConfigSection({
  title,
  options,
  selected,
  onSelect,
}: {
  title: string;
  options: CarConfigOptions['exterior'];
  selected?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">{title}</p>
      {options.length === 0 ? (
        <p className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-[13px] leading-relaxed text-white/50">
          Not published for this vehicle — CX delivers it in its listed specification.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2.5">
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => onSelect(o.id)}
              aria-pressed={selected === o.id}
              title={o.label}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] transition-colors ${
                selected === o.id
                  ? 'border-accent-bright/60 bg-accent-bright/10 text-white'
                  : 'border-white/12 bg-white/[0.04] text-white/75 hover:border-white/30'
              }`}
            >
              {o.swatch && (
                <span className="h-4 w-4 shrink-0 rounded-full border border-white/25" style={{ background: o.swatch }} />
              )}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfiguratorModal({ car, initialView, onClose }: { car: Car; initialView: number; onClose: () => void }) {
  const navigate = useNavigate();
  const { toast, isFavorite, toggleFavorite } = useApp();
  const { toggleCompare } = useCompare();

  const gallery = car.images.length > 0 ? car.images : [''];
  const [view, setView] = useState(() => Math.min(Math.max(0, initialView), gallery.length - 1));
  const [zoom, setZoom] = useState(1);
  const [saved, setSaved] = useState(false);

  const options = getCarConfigOptions(car);
  const appointments = getAppointments(car);
  const [exteriorId, setExteriorId] = useState<string | undefined>();
  const [wheelsId, setWheelsId] = useState<string | undefined>();
  const [interiorId, setInteriorId] = useState<string | undefined>();

  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; startView: number; active: boolean }>({ x: 0, startView: 0, active: false });
  // Pinch state — distance between the two touch points when the gesture began.
  const pinch = useRef<{ dist: number; startZoom: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setView((v) => (v + 1) % gallery.length);
      if (e.key === 'ArrowLeft') setView((v) => (v - 1 + gallery.length) % gallery.length);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, gallery.length]);

  // Drag-to-rotate: horizontal travel advances through the real gallery,
  // the honest equivalent of a turntable when no 3D model exists.
  const onPointerDown = (e: React.PointerEvent) => {
    if (pinch.current) return;
    drag.current = { x: e.clientX, startView: view, active: true };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active || gallery.length < 2) return;
    const dx = e.clientX - drag.current.x;
    const step = Math.round(dx / 60);
    if (step !== 0) {
      const next = (((drag.current.startView + step) % gallery.length) + gallery.length) % gallery.length;
      setView(next);
    }
  };
  const endDrag = () => {
    drag.current.active = false;
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      pinch.current = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), startZoom: zoom };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinch.current) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      setZoom(Math.min(2.5, Math.max(1, pinch.current.startZoom * (d / pinch.current.dist))));
    }
  };
  const onTouchEnd = () => {
    pinch.current = null;
  };

  const onWheel = useCallback((e: React.WheelEvent) => {
    setZoom((z) => Math.min(2.5, Math.max(1, z - e.deltaY * 0.0015)));
  }, []);

  const handleSave = () => {
    saveBuild({ carId: car.id, carSlug: car.slug, view, exteriorId, wheelsId, interiorId });
    if (!isFavorite(car.id)) toggleFavorite(car.id);
    setSaved(true);
    toast({ title: 'Saved to your Garage', desc: 'Find it under My CX Garage.', icon: 'check' });
  };

  const handleShare = () => {
    const url = `${window.location.origin}/cars/${car.slug}?build=1&view=${view}`;
    navigator.clipboard
      .writeText(url)
      .then(() => toast({ title: 'Build link copied', icon: 'check' }))
      .catch(() => toast({ title: 'Could not copy link', icon: 'info' }));
  };

  // CX Card — drawn to a canvas from real vehicle data only, then handed
  // to the browser as a PNG download.
  const handleCard = () => {
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 630;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0a0d0b';
    ctx.fillRect(0, 0, 1200, 630);
    const glow = ctx.createRadialGradient(980, 90, 10, 980, 90, 620);
    glow.addColorStop(0, 'rgba(0,212,71,0.22)');
    glow.addColorStop(1, 'rgba(0,212,71,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1200, 630);

    ctx.fillStyle = '#00d447';
    ctx.font = "600 22px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillText('CX  ·  BUILD YOUR CX', 72, 92);

    ctx.fillStyle = '#f5f6f2';
    ctx.font = "700 68px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillText(`${car.make} ${car.model}`, 72, 190);

    ctx.fillStyle = '#9aa39a';
    ctx.font = "400 28px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillText([car.trim, String(car.year), car.category].filter(Boolean).join('  ·  '), 72, 238);

    const specs = realSpecs(car).slice(0, 4);
    specs.forEach((s, i) => {
      const x = 72 + i * 268;
      ctx.fillStyle = '#6f776f';
      ctx.font = "600 18px system-ui, -apple-system, 'Segoe UI', sans-serif";
      ctx.fillText(s.label.toUpperCase(), x, 360);
      ctx.fillStyle = '#f5f6f2';
      ctx.font = "700 34px system-ui, -apple-system, 'Segoe UI', sans-serif";
      ctx.fillText(s.value, x, 402);
    });

    ctx.fillStyle = '#00d447';
    ctx.fillRect(72, 480, 260, 4);
    ctx.fillStyle = '#f5f6f2';
    ctx.font = "700 40px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillText(`${eur(car.pricePerDay)} / day`, 72, 552);
    ctx.fillStyle = '#00d447';
    ctx.font = "700 26px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillText('CX RENT', 1000, 552);

    c.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cx-${car.slug}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'CX Card downloaded', icon: 'check' });
    }, 'image/png');
  };

  const rent = () => {
    onClose();
    navigate(`/book/${car.slug}`);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden overscroll-none bg-noir">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: 'radial-gradient(55% 45% at 80% 8%, rgba(0,212,71,0.14), transparent 62%)' }}
      />

      {/* Header */}
      <div
        className="relative flex h-16 shrink-0 items-center justify-between gap-3 px-4 sm:px-6"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-bright">Build your CX</p>
          <p className="truncate text-[14.5px] font-semibold uppercase tracking-wide text-white">
            {car.make} {car.model}
            {car.trim ? ` ${car.trim}` : ''}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Icon name="x" size={20} />
        </button>
      </div>

      <div className="relative flex flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* ---------------- Stage ---------------- */}
        <div className="flex min-h-[46vh] flex-col lg:min-h-0 lg:flex-1">
          <div
            ref={stageRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onWheel={onWheel}
            className="relative flex-1 cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
          >
            {gallery.map((img, i) => (
              <img
                key={img + i}
                src={unsplash(img, 1400)}
                alt={i === view ? `${car.make} ${car.model}` : ''}
                draggable={false}
                loading={i === 0 ? 'eager' : 'lazy'}
                className="absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ease-out"
                style={{
                  opacity: i === view ? 1 : 0,
                  transform: `scale(${i === view ? zoom : 1})`,
                  transition: 'opacity 300ms ease-out, transform 200ms ease-out',
                }}
              />
            ))}

            {gallery.length > 1 && (
              <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[12px] text-white/40">
                Drag to rotate · scroll or pinch to zoom
              </p>
            )}
            {zoom > 1 && (
              <button
                onClick={() => setZoom(1)}
                className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-[12px] text-white/80 backdrop-blur-md"
              >
                Reset zoom
              </button>
            )}
          </div>

          {/* Frame thumbnails — real photos, deliberately not labelled
              FRONT/REAR/SIDE because the catalogue carries no angle
              metadata and guessing would be inventing data. */}
          {gallery.length > 1 && (
            <div className="scrollbar-none flex shrink-0 gap-2 overflow-x-auto px-4 pb-4 sm:px-6">
              {gallery.map((img, i) => (
                <button
                  key={img + i}
                  onClick={() => setView(i)}
                  aria-label={`View ${i + 1}`}
                  aria-pressed={i === view}
                  className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                    i === view ? 'border-accent-bright' : 'border-white/10 opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={unsplash(img, 160)} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ---------------- Controls ---------------- */}
        <aside className="shrink-0 border-t border-white/10 bg-black/25 px-4 py-6 backdrop-blur-xl sm:px-6 lg:w-[380px] lg:overflow-y-auto lg:border-l lg:border-t-0 xl:w-[420px]">
          <div className="space-y-7">
            <ConfigSection title="Exterior" options={options.exterior} selected={exteriorId} onSelect={setExteriorId} />
            <ConfigSection title="Wheels" options={options.wheels} selected={wheelsId} onSelect={setWheelsId} />
            <ConfigSection title="Interior" options={options.interior} selected={interiorId} onSelect={setInteriorId} />

            {!hasAnyConfigOptions(options) && (
              <p className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-[12.5px] leading-relaxed text-white/45">
                <Icon name="info" size={15} className="mt-0.5 shrink-0" />
                This vehicle is rented exactly as listed. Your saved build records the framing you liked, not a change to the car.
              </p>
            )}

            {appointments.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">This vehicle&apos;s appointments</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {appointments.map((a) => (
                    <span key={a} className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[12.5px] text-white/75">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Specs — verified fields only */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Specification</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                {realSpecs(car).map((s) => (
                  <div key={s.label} className="flex items-center gap-2.5">
                    <Icon name={s.icon} size={16} className="shrink-0 text-white/40" />
                    <div className="min-w-0">
                      <dt className="text-[11px] text-white/45">{s.label}</dt>
                      <dd className="truncate text-[13.5px] font-medium text-white">{s.value}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </div>

            {/* Summary */}
            <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-bright">Your CX</p>
              <p className="mt-2 font-display text-lg font-semibold text-white">
                {car.make} {car.model}
              </p>
              <p className="mt-0.5 text-[13px] text-white/55">
                {car.trim ? `${car.trim} · ` : ''}
                {car.year} · {car.category}
              </p>
              <p className="mt-3 text-white">
                <span className="font-display text-2xl font-semibold">{eur(car.pricePerDay)}</span>
                <span className="text-[13px] text-white/55"> / day</span>
              </p>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <button onClick={rent} className="btn btn-accent-bright btn-lg btn-block">
                Rent This CX <Icon name="arrowRight" size={17} />
              </button>
              <button
                onClick={handleSave}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 py-3 text-[14px] font-medium text-white/85 transition-colors hover:border-white/30"
              >
                <Icon name={saved ? 'check' : 'heart'} size={16} className={saved ? 'text-accent-bright' : ''} />
                {saved ? 'Saved to Garage' : 'Save to Garage'}
              </button>
              <div className="flex gap-3">
                <button
                  onClick={handleShare}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 py-2.5 text-[13.5px] font-medium text-white/80 transition-colors hover:border-white/30"
                >
                  <Icon name="arrowUpRight" size={15} /> Share
                </button>
                <button
                  onClick={handleCard}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 py-2.5 text-[13.5px] font-medium text-white/80 transition-colors hover:border-white/30"
                >
                  <Icon name="camera" size={15} /> CX Card
                </button>
                <button
                  onClick={() => toggleCompare(car.id)}
                  aria-label="Add to compare"
                  className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl border border-white/15 text-white/80 transition-colors hover:border-white/30"
                >
                  <Icon name="compare" size={15} />
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>,
    document.body,
  );
}
