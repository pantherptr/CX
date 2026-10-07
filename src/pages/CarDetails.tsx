import { useEffect, useRef, useState } from 'react';
import { POLICY_INFO } from '../lib/cancellationPolicy';
import { CancellationPolicyCard } from '../components/CancellationPolicy';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchCarWithHost, fetchSimilarCars } from '../lib/data/cars';
import type { Car, Host } from '../data/types';
import { eur } from '../lib/format';
import { unsplash, unsplashSrcSet } from '../lib/img';
import { Icon, type IconName } from '../components/Icon';
import { Modal, Stars } from '../components/primitives';
import { Img } from '../components/motion';
import { BookingCard } from '../components/BookingCard';
import { PhotoViewer } from '../components/PhotoGallery';
import { HostCard } from '../components/HostCard';
import { HostLocked } from '../components/HostLocked';
import { Group, Row } from '../components/IosList';
import { useHasAccess } from '../lib/useAccess';
import { CarCard } from '../components/CarCard';
import { useApp } from '../lib/store';
import { useAuth } from '../lib/auth';
import { useCompare } from '../lib/compareStore';
import { useLocale } from '../lib/i18n';
import { shareLink, haptics } from '../lib/native';
import { createReport } from '../lib/data/reports';
import NotFound from './NotFound';
import { Ugc } from '../lib/i18n/ugc';

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

/** Swipeable photo pager with a translucent page control — tap a photo for full screen. */
function HeroPager({ images, alt, onOpen }: { images: string[]; alt: string; onOpen: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const go = (n: number) => ref.current?.scrollTo({ left: n * ref.current.clientWidth, behavior: 'smooth' });
  return (
    <div className="group relative">
      <div
        ref={ref}
        onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      >
        {(images.length ? images : ['']).map((im, n) => (
          <button key={n} type="button" onClick={() => onOpen(n)} className="relative aspect-[4/3] w-full shrink-0 snap-center bg-panel sm:aspect-[16/10]" aria-label={`${alt} ${n + 1}`}>
            <Img
              src={unsplash(im, 1400)}
              srcSet={unsplashSrcSet(im, [700, 1100, 1600])}
              sizes="(min-width: 1024px) 720px, 100vw"
              alt={alt}
              loading={n === 0 ? 'eager' : 'lazy'}
              fetchPriority={n === 0 ? 'high' : undefined}
              className="h-full w-full object-cover"
              fallback={<span className="grid h-full w-full place-items-center text-faint"><Icon name="car" size={42} /></span>}
            />
          </button>
        ))}
      </div>
      {images.length > 1 && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-9 flex justify-center sm:bottom-10">
            <span className="flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1.5 backdrop-blur-md">
              {images.map((_, n) => (
                <span key={n} className={`h-1.5 rounded-full bg-white transition-all duration-300 ${n === i ? 'w-4 opacity-100' : 'w-1.5 opacity-60'}`} />
              ))}
            </span>
          </div>
          <button type="button" onClick={() => go(Math.max(0, i - 1))} aria-label="Previous photo" className={`absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 shadow-hair backdrop-blur transition-opacity lg:grid ${i === 0 ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}><Icon name="chevronLeft" size={18} /></button>
          <button type="button" onClick={() => go(Math.min(images.length - 1, i + 1))} aria-label="Next photo" className={`absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 shadow-hair backdrop-blur transition-opacity lg:grid ${i === images.length - 1 ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}><Icon name="chevronRight" size={18} /></button>
        </>
      )}
    </div>
  );
}

const roundBtn = 'pressable grid h-10 w-10 place-items-center rounded-full bg-white/80 text-ink shadow-[0_6px_18px_-6px_rgba(22,22,26,0.4)] backdrop-blur-xl transition-colors hover:bg-white';

export default function CarDetails() {
  const { slug } = useParams();
  const { isFavorite, toggleFavorite, toast } = useApp();
  const { session } = useAuth();
  const hasAccess = useHasAccess();
  const { isComparing, toggleCompare } = useCompare();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [result, setResult] = useState<{ car: Car; host: Host } | null | undefined>(undefined);
  const [similar, setSimilar] = useState<Car[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreText, setMoreText] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [allReviews, setAllReviews] = useState(false);
  const navigate = useNavigate();
  const { t } = useLocale();

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

  const share = async () => {
    const r = await shareLink({ title: `${car.make} ${car.model}`, text: `Check out the ${car.make} ${car.model} on CX Rent`, url: window.location.href });
    haptics.light();
    if (r === 'copied') toast({ title: 'Link copied to clipboard', icon: 'check' });
  };
  const rated = car.trips > 0 && car.reviews.length > 0;
  const policy = POLICY_INFO[car.cancellationPolicy ?? 'flexible'];
  const alt = `${car.year} ${car.make} ${car.model}`;
  const facts: { icon: IconName; v: string; l: string }[] = [
    { icon: 'seat', v: String(car.seats), l: 'Seats' },
    { icon: 'bag', v: String(car.luggage), l: 'Bags' },
    { icon: 'gear', v: car.transmission, l: 'Gearbox' },
    { icon: 'gas', v: car.fuel, l: 'Fuel' },
  ];
  const shownReviews = allReviews ? car.reviews : car.reviews.slice(0, 4);

  return (
    <div className="pb-28 lg:pb-12">
      <div className="mx-auto max-w-[1120px] lg:px-8 lg:pt-6">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
          <div className="min-w-0">
            {/* Hero — edge to edge on a phone, a rounded card on a desktop */}
            <div className="relative overflow-hidden lg:rounded-[28px]">
              <HeroPager images={gallery} alt={alt} onOpen={setLightbox} />
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3.5 sm:p-4">
                <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/browse'))} aria-label={t('Back')} className={`${roundBtn} pointer-events-auto`}>
                  <Icon name="chevronLeft" size={20} />
                </button>
                <div className="pointer-events-auto flex gap-2.5">
                  <button onClick={() => toggleFavorite(car.id)} aria-label={fav ? t('Remove from saved') : t('Save car')} aria-pressed={fav} className={roundBtn}>
                    <Icon name="heart" size={18} fill={fav} className={fav ? 'text-[#e2384d]' : ''} strokeWidth={1.8} />
                  </button>
                  <button onClick={share} aria-label={t('Share')} className={roundBtn}><Icon name="share" size={18} /></button>
                  <button onClick={() => setMenuOpen(true)} aria-label="More" className={roundBtn}><Icon name="moreHorizontal" size={18} /></button>
                </div>
              </div>
            </div>

            {/* Sheet */}
            <div className="relative -mt-6 rounded-t-[28px] bg-bg px-5 pb-2 pt-6 lg:mt-6 lg:rounded-none lg:px-0 lg:pt-0">
              <span className="mx-auto mb-4 block h-1 w-9 rounded-full bg-ink/15 lg:hidden" aria-hidden="true" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="font-display text-[1.7rem] font-bold leading-[1.1] tracking-tight text-ink sm:text-[2rem]">
                    {car.make} {car.model}
                  </h1>
                  <p className="mt-1 text-body text-muted">{car.trim ? `${car.trim} · ` : ''}{car.year} · {hasAccess ? car.location : car.city}</p>
                </div>
              </div>
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-detail text-ink-soft">
                {car.instantBook && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-caption font-semibold text-white">
                    <Icon name="instant" size={11} className="text-accent-bright" /> {t('Instant book')}
                  </span>
                )}
                {rated ? (
                  <>
                    <span className="inline-flex items-center gap-1 font-semibold text-ink"><Icon name="star" size={14} className="text-star" /> {car.rating.toFixed(1)}</span>
                    <span className="text-muted">· {car.reviews.length} {t('Reviews').toLowerCase()} · {t('{n} trips', { n: car.trips })}</span>
                  </>
                ) : (
                  <span className="text-muted">{t('New on CX')}</span>
                )}
              </p>

              {/* Four facts, like widgets */}
              <div className="mt-5 grid grid-cols-4 gap-2">
                {facts.map((f) => (
                  <div key={f.l} className="rounded-[18px] bg-surface p-3 text-center ring-1 ring-line">
                    <Icon name={f.icon} size={18} className="mx-auto text-muted" />
                    <p className="mt-1.5 truncate text-detail font-semibold text-ink">{t(f.v)}</p>
                    <p className="truncate text-[9.5px] font-medium uppercase tracking-wide text-faint">{t(f.l)}</p>
                  </div>
                ))}
              </div>

              {/* About */}
              {car.description && (
                <section className="mt-7">
                  <h2 className="mb-2 px-1 font-display text-lg font-semibold text-ink">{t('About this car')}</h2>
                  <p className={`px-1 text-copy leading-relaxed text-ink-soft text-pretty ${moreText ? '' : 'line-clamp-3'}`}><Ugc text={car.description} /></p>
                  {car.description.length > 140 && (
                    <button onClick={() => setMoreText((v) => !v)} className="mt-1.5 px-1 text-detail font-semibold text-ink underline underline-offset-4">{moreText ? t('Less') : t('More')}</button>
                  )}
                </section>
              )}

              {/* Features */}
              {car.features.length > 0 && (
                <section className="mt-7">
                  <h2 className="mb-2.5 px-1 font-display text-lg font-semibold text-ink">{t('Features')}</h2>
                  <div className="flex flex-wrap gap-2">
                    {car.features.map((f) => (
                      <span key={f} className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 text-detail font-medium text-ink-soft ring-1 ring-line">
                        <Icon name={featureIcon[f] ?? 'checkCircle'} size={14} className="text-muted" /> {f}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Details */}
              <Group title={t('Details')}>
                <Row icon="calendar" title={t('Year')} value={String(car.year)} />
                <Row icon="grid" title={t('Category')} value={t(car.category)} />
                <Row icon="compass" title={t('Drive')} value={car.drive} />
                <Row icon="door" title={t('Doors')} value={String(car.doors)} />
                <Row icon="gauge" title={t('Mileage')} value={car.mileage} />
              </Group>

              {/* Good to know */}
              <Group title={t('Good to know')}>
                <Row icon="shield" title={t('Trip protection')} sub={t('Included on every booking and shown as its own line at checkout.')} />
                <Row
                  icon="calendar"
                  title={<>{t('Cancellation')}: {policy.label}</>}
                  sub={policy.tagline}
                  onClick={() => setPolicyOpen((v) => !v)}
                  open={policyOpen}
                >
                  <CancellationPolicyCard policy={car.cancellationPolicy ?? 'flexible'} />
                </Row>
                <Row
                  icon="pin"
                  title={t('Pick-up')}
                  sub={<>{hasAccess ? car.location : car.city}. {t('The exact address is shared once your booking is confirmed.')}</>}
                />
              </Group>

              {/* Host */}
              <section className="mt-7">
                <h2 className="mb-2.5 px-1 font-display text-lg font-semibold text-ink">{t('Meet your host')}</h2>
                {hasAccess ? <HostCard host={host} carId={car.id} /> : <HostLocked />}
              </section>

              {/* Reviews — a swipeable row */}
              {car.reviews.length > 0 && (
                <section className="mt-7">
                  <div className="mb-2.5 flex items-center justify-between px-1">
                    <h2 className="font-display text-lg font-semibold text-ink">{t('Reviews')}</h2>
                    {car.reviews.length > 4 && (
                      <button onClick={() => setAllReviews((v) => !v)} className="text-detail font-semibold text-ink underline underline-offset-4">{allReviews ? t('Less') : t('See all')}</button>
                    )}
                  </div>
                  <div className={allReviews ? 'grid gap-3 sm:grid-cols-2' : 'scrollbar-none -mx-5 flex snap-x gap-3 overflow-x-auto px-5 lg:mx-0 lg:px-0'}>
                    {shownReviews.map((r) => (
                      <div key={r.id} className={`rounded-[22px] border border-line bg-surface p-4 ${allReviews ? '' : 'w-[80%] shrink-0 snap-start sm:w-[46%]'}`}>
                        <div className="flex items-center gap-3">
                          {hasAccess ? (
                            <Img src={r.avatar} alt="" className="h-10 w-10 rounded-full object-cover" fallback={<span className="grid h-10 w-10 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={17} /></span>} />
                          ) : (
                            <span className="grid h-10 w-10 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={17} /></span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-detail font-semibold text-ink">{hasAccess ? r.author : r.author.split(' ')[0]}</p>
                            <p className="text-caption text-muted">{r.date}</p>
                          </div>
                          <Stars value={r.rating} size={12} />
                        </div>
                        <p className={`mt-3 text-detail leading-relaxed text-ink-soft ${allReviews ? '' : 'line-clamp-4'}`}><Ugc text={r.body} /></p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Similar — a swipeable row */}
              {similar.length > 0 && (
                <section className="mt-9">
                  <h2 className="mb-2.5 px-1 font-display text-lg font-semibold text-ink">{t('More {c} cars', { c: t(car.category).toLowerCase() })}</h2>
                  <div className="scrollbar-none -mx-5 flex snap-x gap-3.5 overflow-x-auto px-5 pb-2 lg:mx-0 lg:px-0">
                    {similar.map((c) => (
                      <div key={c.id} className="w-[76%] shrink-0 snap-start sm:w-[46%] lg:w-[48%]"><CarCard car={c} /></div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>

          {/* Booking (desktop) */}
          <aside className="hidden lg:block">
            <div className="sticky top-[84px]">
              <BookingCard car={car} />
            </div>
          </aside>
        </div>
      </div>

      {/* Reserve bar (phone) — price on the left, one button */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-surface/80 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-2xl lg:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-ink"><span className="font-display text-xl font-semibold">{eur(car.pricePerDay)}</span> <span className="text-detail text-muted">{t('/ day')}</span></p>
            <p className="truncate text-caption text-muted">{rated ? `★ ${car.rating.toFixed(1)} · ${t('{n} trips', { n: car.trips })}` : t('New on CX')}</p>
          </div>
          <button onClick={() => setLightbox(-1)} className="btn btn-primary btn-lg min-w-[44%] justify-center">
            {car.instantBook ? t('Reserve') : t('Request')} <Icon name="arrowRight" size={17} />
          </button>
        </div>
      </div>

      {/* iOS action sheet */}
      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} className="rounded-t-[1.75rem] p-3 pb-6" labelledBy="car-menu-title">
        <p id="car-menu-title" className="sr-only">{car.make} {car.model}</p>
        <div className="divide-y divide-line overflow-hidden rounded-[18px] bg-surface">
          <button onClick={() => { toggleCompare(car.id); setMenuOpen(false); }} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-body font-medium text-ink active:bg-panel">
            <Icon name="compare" size={18} /> {comparing ? t('Remove from compare') : t('Add to compare')}
          </button>
          <button onClick={() => { setMenuOpen(false); share(); }} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-body font-medium text-ink active:bg-panel">
            <Icon name="share" size={18} /> {t('Share')}
          </button>
          {session && (
            <button onClick={() => { setMenuOpen(false); setReportOpen(true); }} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-body font-medium text-danger active:bg-panel">
              <Icon name="info" size={18} /> Report this listing
            </button>
          )}
        </div>
        <button onClick={() => setMenuOpen(false)} className="mt-2.5 w-full rounded-[18px] bg-surface py-3.5 text-body font-semibold text-ink active:bg-panel">{t('Cancel')}</button>
      </Modal>
      {reportOpen && <ReportListingModal carId={car.id} onClose={() => setReportOpen(false)} />}

      {/* Mobile booking sheet */}
      <Modal open={lightbox === -1} onClose={() => setLightbox(null)} className="rounded-t-[1.75rem] max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-ink">Your trip</h2>
          <button onClick={() => setLightbox(null)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-panel"><Icon name="x" size={20} /></button>
        </div>
        <div className="p-5"><BookingCard car={car} embedded /></div>
      </Modal>

      {/* Full-screen photo viewer */}
      <PhotoViewer
        images={gallery}
        index={lightbox !== null && lightbox >= 0 ? lightbox : null}
        alt={alt}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}
