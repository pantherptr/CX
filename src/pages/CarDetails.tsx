import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ConfiguratorLauncher } from '../components/Configurator';
import { fetchCarWithHost, fetchSimilarCars } from '../lib/data/cars';
import type { Car, Host } from '../data/types';
import { unsplash } from '../lib/img';
import { eur } from '../lib/format';
import { Icon, type IconName } from '../components/Icon';
import { Modal, Stars } from '../components/primitives';
import { Reveal } from '../components/motion';
import { BookingCard } from '../components/BookingCard';
import { HostCard } from '../components/HostCard';
import { CarCard } from '../components/CarCard';
import { useApp } from '../lib/store';
import { useAuth } from '../lib/auth';
import { useCompare } from '../lib/compareStore';
import { shareLink, haptics } from '../lib/native';
import { createReport } from '../lib/data/reports';
import NotFound from './NotFound';

const REPORT_REASONS = ['Misleading listing', 'Suspicious pricing', 'Inappropriate photos', 'Safety concern', 'Other'];

function ReportListingModal({ carId, onClose }: { carId: string; onClose: () => void }) {
  const { toast } = useApp();
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    const { error } = await createReport(carId, reason, message);
    setSubmitting(false);
    if (error) {
      toast({ title: "Couldn't send your report", desc: error, icon: 'info' });
      return;
    }
    toast({ title: 'Report sent', desc: "Thanks — CX Rent's team will review this listing.", icon: 'checkCircle' });
    onClose();
  };

  return (
    <Modal open onClose={onClose} className="max-w-sm rounded-2xl p-6" labelledBy="report-title">
      <h2 id="report-title" className="font-display text-lg font-semibold text-ink">Report this listing</h2>
      <label className="mt-4 flex flex-col gap-1.5 text-detail font-medium text-ink-soft">
        Reason
        <select value={reason} onChange={(e) => setReason(e.target.value)} className="input">
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </label>
      <label className="mt-3 flex flex-col gap-1.5 text-detail font-medium text-ink-soft">
        Details (optional)
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="input resize-none" placeholder="Tell us more…" />
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
        <button onClick={submit} disabled={submitting} className="btn btn-primary btn-sm disabled:opacity-50">
          {submitting ? 'Sending…' : 'Send report'}
        </button>
      </div>
    </Modal>
  );
}

const featureIcon: Record<string, IconName> = {
  'Apple CarPlay': 'apple', Bluetooth: 'music', 'Heated seats': 'flame',
  'Heated & cooled seats': 'snowflake', 'Parking sensors': 'gauge',
  'Adaptive cruise control': 'route', 'Premium sound': 'music', 'Burmester sound': 'music',
  'Harman Kardon sound': 'music', 'Meridian sound': 'music', Navigation: 'compass',
  'Panoramic roof': 'sun', 'Glass roof': 'sun', 'Ambient lighting': 'sparkles',
  Autopilot: 'sparkles', 'Sport exhaust': 'flame', 'Carbon interior': 'gem',
  'Sport Chrono': 'clock', 'Neck-level heating': 'flame', 'Massage seats': 'sparkles',
  'Rear entertainment': 'music',
};

export default function CarDetails() {
  const { slug } = useParams();
  // A shared build link (`?build=1&view=N`) reopens the configurator on
  // the exact frame the sender was looking at.
  const [searchParams] = useSearchParams();
  const autoOpenBuild = searchParams.get('build') === '1';
  const sharedView = Number(searchParams.get('view')) || 0;
  const { isFavorite, toggleFavorite, toast } = useApp();
  const { session } = useAuth();
  const { isComparing, toggleCompare } = useCompare();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [result, setResult] = useState<{ car: Car; host: Host } | null | undefined>(undefined);
  const [similar, setSimilar] = useState<Car[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResult(undefined);
    setSimilar([]);
    setLoadError(null);

    fetchCarWithHost(slug ?? '')
      .then((data) => {
        if (cancelled) return;
        setResult(data);
        if (data) {
          fetchSimilarCars(data.car.category, data.car.id)
            .then((cars) => {
              if (!cancelled) setSimilar(cars);
            })
            .catch(() => {
              /* Similar cars are a nice-to-have — a failure here shouldn't block the page. */
            });
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load this car.');
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loadError) {
    return (
      <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-panel text-danger">
          <Icon name="info" size={26} />
        </span>
        <h1 className="font-display text-xl font-semibold text-ink">Couldn't load this car</h1>
        <p className="max-w-sm text-body text-muted">{loadError}</p>
      </div>
    );
  }

  if (result === undefined) {
    return (
      <div className="container-page pt-5">
        <div className="skeleton h-4 w-64 rounded-md" />
        <div className="skeleton mt-4 h-9 w-96 max-w-full rounded-md" />
        <div className="skeleton mt-3 h-4 w-52 rounded-md" />
        <div className="mt-6 grid gap-2.5 sm:grid-cols-4 sm:grid-rows-2 sm:h-[460px]">
          <div className="skeleton col-span-2 row-span-2 h-64 rounded-2xl sm:h-full" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton hidden h-full rounded-none sm:block" />
          ))}
        </div>
        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px] lg:gap-14">
          <div className="space-y-3">
            <div className="skeleton h-24 rounded-2xl" />
            <div className="skeleton h-40 rounded-2xl" />
            <div className="skeleton h-40 rounded-2xl" />
          </div>
          <div className="skeleton hidden h-72 rounded-2xl lg:block" />
        </div>
      </div>
    );
  }

  if (result === null) return <NotFound />;

  const { car, host } = result;
  const fav = isFavorite(car.id);
  const comparing = isComparing(car.id);
  const gallery = car.images;

  const specs: { icon: IconName; label: string; value: string }[] = [
    { icon: 'seat', label: 'Seats', value: `${car.seats} seats` },
    { icon: 'door', label: 'Doors', value: `${car.doors} doors` },
    { icon: 'bag', label: 'Luggage', value: `${car.luggage} ${car.luggage === 1 ? 'bag' : 'bags'}` },
    { icon: 'gear', label: 'Transmission', value: car.transmission },
    { icon: 'gas', label: 'Fuel', value: car.fuel },
    { icon: 'gauge', label: 'Mileage', value: car.mileage },
    { icon: 'compass', label: 'Drive', value: car.drive },
  ];

  return (
    <div className="pb-24 lg:pb-0">
      <div className="container-page pt-5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-detail text-muted">
          <Link to="/" className="hover:text-ink">Home</Link>
          <Icon name="chevronRight" size={13} />
          <Link to="/browse" className="hover:text-ink">Browse</Link>
          <Icon name="chevronRight" size={13} />
          <span className="text-ink">{car.make} {car.model}</span>
        </nav>

        {/* Title */}
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            {car.instantBook && (
              <span className="badge badge-accent mb-2"><Icon name="instant" size={12} /> Instant book</span>
            )}
            <h1 className="font-display text-[1.8rem] font-semibold leading-tight text-ink sm:text-4xl">
              {car.year} {car.make} {car.model}{car.trim ? ` ${car.trim}` : ''}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-body text-muted">
              <span className="inline-flex items-center gap-1 font-medium text-ink">
                <Icon name="star" size={15} className="text-star" /> {car.rating.toFixed(2)}
                <span className="font-normal text-muted">({car.reviews.length} reviews)</span>
              </span>
              <span className="inline-flex items-center gap-1"><Icon name="route" size={15} /> {car.trips} trips</span>
              <span className="inline-flex items-center gap-1"><Icon name="pin" size={15} /> {car.location}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ConfiguratorLauncher
              car={car}
              autoOpen={autoOpenBuild}
              initialView={sharedView}
              className="btn btn-accent-bright btn-sm"
            >
              <Icon name="sparkles" size={16} /> Build Your CX
            </ConfiguratorLauncher>
            <button
              onClick={async () => {
                const result = await shareLink({
                  title: `${car.make} ${car.model}`,
                  text: `Check out the ${car.make} ${car.model} on CX Rent`,
                  url: window.location.href,
                });
                haptics.light();
                // 'failed' also covers the user simply dismissing the native
                // share sheet — not a real error, so it stays silent.
                if (result === 'copied') toast({ title: 'Link copied to clipboard', icon: 'check' });
              }}
              className="btn btn-secondary btn-sm"
            >
              <Icon name="arrowUpRight" size={16} /> Share
            </button>
            <button
              onClick={() => toggleFavorite(car.id)}
              className="btn btn-secondary btn-sm"
            >
              <Icon name="heart" size={16} fill={fav} className={fav ? 'text-[#e2384d]' : ''} /> {fav ? 'Saved' : 'Save'}
            </button>
            <button
              onClick={() => toggleCompare(car.id)}
              aria-pressed={comparing}
              className={`btn btn-sm ${comparing ? '!border-ink !bg-ink !text-white' : 'btn-secondary'}`}
            >
              <Icon name="compare" size={16} /> {comparing ? 'Comparing' : 'Compare'}
            </button>
          </div>
        </div>

        {session && (
          <button
            onClick={() => setReportOpen(true)}
            className="mt-2 inline-flex items-center gap-1.5 text-caption text-faint hover:text-muted"
          >
            <Icon name="info" size={12} /> Report this listing
          </button>
        )}
        {reportOpen && <ReportListingModal carId={car.id} onClose={() => setReportOpen(false)} />}

        {/* Gallery */}
        <div className="mt-6 grid gap-2.5 sm:grid-cols-4 sm:grid-rows-2 sm:h-[460px]">
          <button
            onClick={() => setLightbox(0)}
            className="group relative col-span-2 row-span-2 overflow-hidden rounded-2xl sm:rounded-l-2xl"
          >
            <img src={unsplash(gallery[0], 1000)} alt={`${car.make} ${car.model}`} className="h-64 w-full object-cover transition-transform duration-700 group-hover:scale-105 sm:h-full" />
          </button>
          {gallery.slice(1, 5).map((img, i) => (
            <button
              key={i}
              onClick={() => setLightbox(i + 1)}
              className="group relative hidden overflow-hidden sm:block"
              style={{ borderTopRightRadius: i === 1 ? 16 : 0, borderBottomRightRadius: i === 3 ? 16 : 0 }}
            >
              <img src={unsplash(img, 600)} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
              {i === 3 && (
                <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-detail font-medium text-ink shadow-hair backdrop-blur">
                  <Icon name="grid" size={14} /> All photos
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px] lg:gap-14">
          <div className="min-w-0">
            {/* Quick specs row */}
            <div className="flex flex-wrap gap-2.5">
              {[
                { icon: 'seat' as IconName, v: `${car.seats} seats` },
                { icon: 'bag' as IconName, v: `${car.luggage} ${car.luggage === 1 ? 'bag' : 'bags'}` },
                { icon: 'gear' as IconName, v: car.transmission },
                { icon: 'gas' as IconName, v: car.fuel },
                { icon: 'compass' as IconName, v: car.drive },
              ].map((s) => (
                <span key={s.v} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-detail font-medium text-ink-soft">
                  <Icon name={s.icon} size={16} className="text-muted" /> {s.v}
                </span>
              ))}
            </div>

            {/* About */}
            <section className="mt-8 border-t border-line pt-8">
              <h2 className="font-display text-xl font-semibold text-ink">About this car</h2>
              <p className="mt-3 text-copy leading-relaxed text-ink-soft text-pretty">{car.description}</p>
            </section>

            {/* Specifications */}
            <section className="mt-8 border-t border-line pt-8">
              <h2 className="font-display text-xl font-semibold text-ink">Specifications</h2>
              <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
                {specs.map((s) => (
                  <div key={s.label} className="flex items-center gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-panel text-ink-soft">
                      <Icon name={s.icon} size={20} />
                    </span>
                    <div>
                      <p className="text-caption text-muted">{s.label}</p>
                      <p className="text-body font-medium text-ink">{s.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Features */}
            <section className="mt-8 border-t border-line pt-8">
              <h2 className="font-display text-xl font-semibold text-ink">Features</h2>
              <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
                {car.features.map((f) => (
                  <div key={f} className="flex items-center gap-3 text-body text-ink-soft">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-050 text-accent">
                      <Icon name={featureIcon[f] ?? 'checkCircle'} size={17} />
                    </span>
                    {f}
                  </div>
                ))}
              </div>
            </section>

            {/* Protection, cancellation & pickup */}
            <section className="mt-8 border-t border-line pt-8">
              <h2 className="font-display text-xl font-semibold text-ink">Good to know</h2>
              <div className="mt-5 grid gap-5 sm:grid-cols-3">
                <div className="flex gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-050 text-accent">
                    <Icon name="shield" size={20} />
                  </span>
                  <div>
                    <p className="font-medium text-ink">Trip protection</p>
                    <p className="mt-1 text-detail leading-relaxed text-muted">
                      A protection plan is included on every booking, priced at 18% of your rental
                      cost and shown as its own line at checkout — never folded into the daily rate.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-050 text-accent">
                    <Icon name="calendar" size={20} />
                  </span>
                  <div>
                    <p className="font-medium text-ink">Cancellation policy</p>
                    <p className="mt-1 text-detail leading-relaxed text-muted">
                      Free cancellation up to 24 hours before pick-up. After that, the trip is
                      confirmed with your host.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-050 text-accent">
                    <Icon name="pin" size={20} />
                  </span>
                  <div>
                    <p className="font-medium text-ink">Pick-up</p>
                    <p className="mt-1 text-detail leading-relaxed text-muted">
                      In {car.location}. The exact address is shared once your booking is
                      confirmed{host.responseTime ? ` — ${host.name} typically responds ${host.responseTime}` : ''}.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Host */}
            <section className="mt-8 border-t border-line pt-8">
              <h2 className="mb-5 font-display text-xl font-semibold text-ink">Meet your host</h2>
              <HostCard host={host} carId={car.id} />
            </section>

            {/* Reviews */}
            <section className="mt-8 border-t border-line pt-8">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-semibold text-ink">Reviews</h2>
                <span className="inline-flex items-center gap-1.5 text-copy font-medium text-ink">
                  <Icon name="star" size={16} className="text-star" /> {car.rating.toFixed(2)}
                  <span className="font-normal text-muted">· {car.reviews.length} reviews</span>
                </span>
              </div>
              <div className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2">
                {car.reviews.map((r) => (
                  <div key={r.id}>
                    <div className="flex items-center gap-3">
                      <img src={r.avatar} alt="" className="h-11 w-11 rounded-full object-cover" />
                      <div>
                        <p className="font-medium text-ink">{r.author}</p>
                        <p className="text-caption text-muted">{r.location} · {r.date}</p>
                      </div>
                    </div>
                    <div className="mt-3"><Stars value={r.rating} /></div>
                    <p className="mt-2 text-body leading-relaxed text-ink-soft text-pretty">{r.body}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => toast({ title: 'Showing all reviews', icon: 'reviews' })}
                className="btn btn-secondary mt-7"
              >
                Show all {car.reviews.length} reviews
              </button>
            </section>
          </div>

          {/* Sticky booking (desktop) */}
          <aside className="hidden lg:block">
            <div className="sticky top-[84px]">
              <BookingCard car={car} />
            </div>
          </aside>
        </div>

        {/* Similar */}
        {similar.length > 0 && (
          <section className="mt-16 border-t border-line pt-10">
            <h2 className="font-display text-2xl font-semibold text-ink">More {car.category.toLowerCase()} cars</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {similar.map((c, i) => (
                <Reveal key={c.id} delay={i * 70}>
                  <CarCard car={c} />
                </Reveal>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Sticky reserve (mobile) */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-detail text-muted">
              <span className="text-lg font-semibold text-ink">{eur(car.pricePerDay)}</span> / day
            </p>
            <span className="inline-flex items-center gap-1 text-caption text-muted">
              <Icon name="star" size={12} className="text-star" /> {car.rating.toFixed(2)} · {car.trips} trips
            </span>
          </div>
          <a href="#reserve-sheet" onClick={(e) => { e.preventDefault(); setLightbox(-1); }} className="btn btn-accent-bright flex-1 max-w-[55%]">
            {car.instantBook ? 'Reserve' : 'Request'} <Icon name="arrowRight" size={16} />
          </a>
        </div>
      </div>

      {/* Mobile booking sheet */}
      <Modal open={lightbox === -1} onClose={() => setLightbox(null)} className="rounded-t-[1.75rem] max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-ink">Your trip</h2>
          <button onClick={() => setLightbox(null)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-panel"><Icon name="x" size={20} /></button>
        </div>
        <div className="p-5"><BookingCard car={car} embedded /></div>
      </Modal>

      {/* Lightbox */}
      <Modal open={lightbox !== null && lightbox >= 0} onClose={() => setLightbox(null)} className="max-w-4xl rounded-2xl overflow-hidden">
        {lightbox !== null && lightbox >= 0 && (
          <div className="bg-ink">
            <div className="flex items-center justify-between px-4 py-3 text-white/80">
              <span className="text-detail">{(lightbox % gallery.length) + 1} / {gallery.length}</span>
              <button onClick={() => setLightbox(null)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10"><Icon name="x" size={20} /></button>
            </div>
            <div className="relative">
              <img src={unsplash(gallery[lightbox % gallery.length], 1400)} alt="" className="max-h-[70vh] w-full object-contain" />
              <button onClick={() => setLightbox((l) => (l! - 1 + gallery.length) % gallery.length)} className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink hover:bg-white"><Icon name="chevronLeft" size={22} /></button>
              <button onClick={() => setLightbox((l) => (l! + 1) % gallery.length)} className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink hover:bg-white"><Icon name="chevronRight" size={22} /></button>
            </div>
            <div className="flex gap-2 overflow-x-auto p-3 no-scrollbar">
              {gallery.map((img, i) => (
                <button key={i} onClick={() => setLightbox(i)} className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition ${(lightbox % gallery.length) === i ? 'border-white' : 'border-transparent opacity-60'}`}>
                  <img src={unsplash(img, 200)} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
