import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DashboardShell } from '../components/DashboardShell';
import { Icon, type IconName } from '../components/Icon';
import { CarLoader } from '../components/CarLoader';
import { Reveal } from '../components/motion';
import { Modal } from '../components/primitives';
import { eur } from '../lib/format';
import { useApp } from '../lib/store';
import { useAuth } from '../lib/auth';
import {
  acceptRentalAgreement,
  cancelBooking,
  checkAvailability,
  classifyBooking,
  fetchBookingById,
  modifyBookingDates,
  type Booking,
  type TripPhase,
} from '../lib/data/bookings';
import { useVerification, submitVerification } from '../lib/data/verification';
import { findOrCreateConversation } from '../lib/data/messages';
import { useInspectionPhotos } from '../lib/data/inspections';
import { InspectionGrid } from '../components/InspectionGrid';

const todayISO = () => new Date().toISOString().slice(0, 10);

const phaseBadge: Record<TripPhase, string> = {
  upcoming: 'badge-accent',
  active: 'bg-accent text-white',
  completed: 'bg-panel-2 text-ink-soft',
  cancelled: 'bg-danger/10 text-danger',
};

const phaseLabel: Record<TripPhase, string> = {
  upcoming: 'Upcoming',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function daysUntil(dateStr: string) {
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

function ChecklistRow({ done, label, right }: { done: boolean; label: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
            done ? 'bg-accent text-white' : 'border-2 border-line'
          }`}
        >
          {done && <Icon name="check" size={12} strokeWidth={3} />}
        </span>
        <span className={`truncate text-[14px] ${done ? 'text-ink' : 'text-ink-soft'}`}>{label}</span>
      </div>
      {right}
    </div>
  );
}

function TimelineStep({ label, done, current }: { label: string; done: boolean; current?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2 text-center">
      <span
        className={`grid h-8 w-8 place-items-center rounded-full text-[12px] font-semibold ${
          done ? 'bg-accent text-white' : current ? 'bg-ink text-white' : 'bg-panel-2 text-faint'
        }`}
      >
        {done ? <Icon name="check" size={14} strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      </span>
      <span className={`text-[11.5px] font-medium uppercase tracking-wide ${done || current ? 'text-ink' : 'text-faint'}`}>{label}</span>
    </div>
  );
}

export default function TripDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useApp();
  const { session } = useAuth();
  const [booking, setBooking] = useState<Booking | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [modifying, setModifying] = useState(false);
  const [modStart, setModStart] = useState('');
  const [modEnd, setModEnd] = useState('');
  const [modAvailability, setModAvailability] = useState<'checking' | 'available' | 'unavailable' | null>(null);
  const [modSubmitting, setModSubmitting] = useState(false);
  const [modError, setModError] = useState<string | null>(null);
  const { verification, refresh: refreshVerification } = useVerification(session?.user.id);
  const { photos: inspectionPhotos, refresh: refreshInspectionPhotos } = useInspectionPhotos(booking?.id);
  const [uploadingSelfie, setUploadingSelfie] = useState(false);
  const [uploadingLicence, setUploadingLicence] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [acceptingAgreement, setAcceptingAgreement] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchBookingById(id ?? '')
      .then((data) => {
        if (!cancelled) setBooking(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load this trip.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Live-check availability for the modify-dates form, excluding this
  // booking's own current row so it never collides with itself.
  useEffect(() => {
    if (!modifying || !booking || !modStart || !modEnd || modEnd <= modStart) {
      setModAvailability(null);
      return;
    }
    let cancelled = false;
    setModAvailability('checking');
    checkAvailability(booking.car.id, modStart, modEnd, booking.id)
      .then((ok) => {
        if (!cancelled) setModAvailability(ok ? 'available' : 'unavailable');
      })
      .catch(() => {
        if (!cancelled) setModAvailability(null);
      });
    return () => {
      cancelled = true;
    };
  }, [modifying, booking, modStart, modEnd]);

  if (loadError) {
    return (
      <DashboardShell variant="customer" active="My Trips">
        <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-panel text-danger">
            <Icon name="info" size={26} />
          </span>
          <h1 className="font-display text-xl font-semibold text-ink">Couldn't load this trip</h1>
          <p className="max-w-sm text-[14px] text-muted">{loadError}</p>
        </div>
      </DashboardShell>
    );
  }

  if (booking === undefined) {
    return (
      <DashboardShell variant="customer" active="My Trips">
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <CarLoader size={90} />
          <p className="text-[14px] text-muted">Loading trip…</p>
        </div>
      </DashboardShell>
    );
  }

  if (booking === null) {
    return (
      <DashboardShell variant="customer" active="My Trips">
        <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-panel text-muted">
            <Icon name="search" size={26} />
          </span>
          <h1 className="font-display text-xl font-semibold text-ink">Trip not found</h1>
          <p className="max-w-sm text-[14px] text-muted">
            This trip doesn't exist, or doesn't belong to your account.
          </p>
          <Link to="/dashboard#trips" className="btn btn-primary mt-2">Back to My Trips</Link>
        </div>
      </DashboardShell>
    );
  }

  const phase = classifyBooking(booking);
  const days = Math.max(1, Math.round((new Date(booking.endDate).getTime() - new Date(booking.startDate).getTime()) / 86400000));
  // Same formula as the server-side trigger that computed totalPrice (see
  // migration 0003/0005) and the checkout summary (BookingCard's
  // priceBreakdown) — reconstructed here from the real per-day rate for
  // an itemized display, not guessed from the total.
  const base = booking.car.pricePerDay * days;
  const service = Math.round(base * 0.12);
  const protection = Math.round(booking.car.pricePerDay * 0.18) * days;
  const flexSurcharge = booking.fareTier === 'flexible' ? Math.round(booking.car.pricePerDay * 0.1) * days : 0;

  // Flexible-tier bookings can be cancelled any time before the trip
  // starts; standard-tier keeps the 24h-ahead rule.
  const canCancel =
    (phase === 'upcoming' || phase === 'active') &&
    (booking.fareTier === 'flexible' ? daysUntil(booking.startDate) >= 0 : daysUntil(booking.startDate) >= 1);
  const canModify = phase === 'upcoming';
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    booking.pickupLocation || booking.car.location,
  )}`;

  const handleSelfieChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !session) return;
    setUploadingSelfie(true);
    const { error } = await submitVerification(session.user.id, { selfieFile: file });
    setUploadingSelfie(false);
    if (error) {
      toast({ title: 'Could not upload selfie', desc: error, icon: 'info' });
      return;
    }
    refreshVerification();
    toast({ title: 'Selfie submitted', desc: 'Under review.', icon: 'checkCircle' });
  };

  const handleLicenceChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !session) return;
    setUploadingLicence(true);
    const { error } = await submitVerification(session.user.id, { licenceFile: file });
    setUploadingLicence(false);
    if (error) {
      toast({ title: 'Could not upload licence', desc: error, icon: 'info' });
      return;
    }
    refreshVerification();
    toast({ title: 'Licence submitted', desc: 'Under review.', icon: 'checkCircle' });
  };

  const handleAcceptAgreement = async () => {
    setAcceptingAgreement(true);
    const { error } = await acceptRentalAgreement(booking.id);
    setAcceptingAgreement(false);
    if (error) {
      toast({ title: 'Could not save your acceptance', desc: error, icon: 'info' });
      return;
    }
    setBooking({ ...booking, agreementAcceptedAt: new Date().toISOString() });
    setAgreementOpen(false);
    toast({ title: 'Rental agreement accepted', icon: 'checkCircle' });
  };

  const handleMessageHost = async () => {
    if (!session) return;
    setMessaging(true);
    try {
      const conversationId = await findOrCreateConversation(booking.car.id, session.user.id, booking.host.id);
      navigate(`/messages?c=${conversationId}`);
    } catch (err) {
      toast({ title: 'Could not open conversation', desc: err instanceof Error ? err.message : undefined, icon: 'info' });
      setMessaging(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Cancel this trip? This cannot be undone.')) return;
    setCancelling(true);
    const { error } = await cancelBooking(booking.id);
    setCancelling(false);
    if (error) {
      toast({ title: 'Could not cancel trip', desc: error, icon: 'info' });
      return;
    }
    setBooking({ ...booking, status: 'cancelled' });
    toast({ title: 'Trip cancelled', icon: 'checkCircle' });
  };

  const openModify = () => {
    setModStart(booking.startDate);
    setModEnd(booking.endDate);
    setModError(null);
    setModifying(true);
  };

  const handleModifySubmit = async () => {
    setModSubmitting(true);
    setModError(null);
    const { booking: updated, error } = await modifyBookingDates(booking.id, modStart, modEnd);
    setModSubmitting(false);
    if (error || !updated) {
      setModError(error ?? 'Something went wrong. Please try again.');
      return;
    }
    setBooking(updated);
    setModifying(false);
    toast({ title: 'Trip dates updated', icon: 'checkCircle' });
  };

  const specs: { icon: IconName; label: string; value: string }[] = [
    { icon: 'calendar', label: 'Pick-up', value: new Date(booking.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) },
    { icon: 'calendar', label: 'Return', value: new Date(booking.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) },
    { icon: 'pin', label: 'Location', value: booking.pickupLocation || booking.car.location },
    { icon: 'card', label: 'Total paid', value: eur(booking.totalPrice) },
  ];

  // "Before your trip" checklist state — every row reflects something
  // real: a submitted document, an accepted agreement timestamp. Identity
  // verification stays honestly "under review" rather than faking
  // approval, since there's no real reviewer behind it yet.
  const selfieSubmitted = !!verification?.selfiePath;
  const licenceSubmitted = !!verification?.licencePhotoPath;
  const agreementAccepted = !!booking.agreementAcceptedAt;
  const readyForPickup = selfieSubmitted && licenceSubmitted && agreementAccepted;
  const verificationStatusLabel =
    verification?.status === 'approved' ? 'Verified' : verification?.status === 'rejected' ? 'Rejected — resubmit' : 'Under review';

  return (
    <DashboardShell variant="customer" active="My Trips">
      <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
        <Link to="/dashboard#trips" className="mb-5 inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-ink">
          <Icon name="chevronLeft" size={16} /> My Trips
        </Link>

        <Reveal>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className={`badge ${phaseBadge[phase]}`}>{phaseLabel[phase]}</span>
            <h1 className="mt-2 font-display text-2xl font-semibold text-ink sm:text-3xl">
              {booking.car.year} {booking.car.make} {booking.car.model}
            </h1>
            <p className="mt-1 text-[13.5px] text-muted">Booking {booking.reference}</p>
          </div>
        </div>

        {phase === 'upcoming' && (
          <div className="mt-5 rounded-2xl bg-ink px-5 py-4 text-white">
            <p className="text-[14.5px] font-medium">
              Your trip starts in {daysUntil(booking.startDate)} {daysUntil(booking.startDate) === 1 ? 'day' : 'days'}
            </p>
          </div>
        )}
        </Reveal>

        {/* Before your trip */}
        {phase === 'upcoming' && (
          <Reveal delay={40}>
          <section className="mt-6 card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">Get ready for your trip</h2>
              {readyForPickup && <span className="badge badge-accent"><Icon name="checkCircle" size={12} /> Ready</span>}
            </div>
            <div className="mt-2 divide-y divide-line">
              <ChecklistRow done label="Booking confirmed" />
              <ChecklistRow
                done={selfieSubmitted}
                label="Verify identity"
                right={
                  selfieSubmitted ? (
                    <span className="shrink-0 text-[12.5px] text-muted">{verificationStatusLabel}</span>
                  ) : (
                    <label className="btn btn-secondary btn-sm shrink-0 cursor-pointer">
                      {uploadingSelfie ? 'Uploading…' : 'Upload'}
                      <input type="file" accept="image/*" className="hidden" onChange={handleSelfieChange} disabled={uploadingSelfie} />
                    </label>
                  )
                }
              />
              <ChecklistRow
                done={licenceSubmitted}
                label="Upload driving licence"
                right={
                  licenceSubmitted ? (
                    <span className="shrink-0 text-[12.5px] text-muted">{verificationStatusLabel}</span>
                  ) : (
                    <label className="btn btn-secondary btn-sm shrink-0 cursor-pointer">
                      {uploadingLicence ? 'Uploading…' : 'Upload'}
                      <input type="file" accept="image/*" className="hidden" onChange={handleLicenceChange} disabled={uploadingLicence} />
                    </label>
                  )
                }
              />
              <ChecklistRow
                done={agreementAccepted}
                label="Review rental agreement"
                right={
                  agreementAccepted ? (
                    <span className="shrink-0 text-[12.5px] text-muted">Signed</span>
                  ) : (
                    <button onClick={() => setAgreementOpen(true)} className="btn btn-secondary btn-sm shrink-0">Review</button>
                  )
                }
              />
              <ChecklistRow done label="Pickup instructions" right={<span className="shrink-0 text-[12.5px] text-muted">See below</span>} />
              <ChecklistRow done={readyForPickup} label="Ready for pickup" />
            </div>
          </section>
          </Reveal>
        )}

        {/* Timeline */}
        {phase !== 'cancelled' && (
          <Reveal delay={60}>
          <div className="mt-6 card p-6">
            <div className="flex items-start">
              <TimelineStep label="Booked" done />
              <TimelineStep label="Pick-up" done={phase !== 'upcoming'} current={phase === 'upcoming'} />
              <TimelineStep label="Trip" done={phase === 'completed'} current={phase === 'active'} />
              <TimelineStep label="Returned" done={phase === 'completed'} />
            </div>
          </div>
          </Reveal>
        )}

        <Reveal delay={100}>
        <div className="mt-6 overflow-hidden rounded-2xl border border-line">
          <img src={booking.car.image} alt="" className="aspect-[16/9] w-full object-cover" />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          {specs.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-panel text-ink-soft">
                <Icon name={s.icon} size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-[12px] text-muted">{s.label}</p>
                <p className="truncate text-[14px] font-medium text-ink">{s.value}</p>
              </div>
            </div>
          ))}
        </div>
        </Reveal>

        {/* Pickup location */}
        <Reveal>
        <section className="mt-8 border-t border-line pt-6">
          <h2 className="font-display text-lg font-semibold text-ink">Pick-up location</h2>
          <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-line p-4">
            <p className="text-[14px] text-ink-soft">{booking.pickupLocation || booking.car.location}</p>
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm shrink-0">
              Open Maps <Icon name="arrowUpRight" size={14} />
            </a>
          </div>
        </section>
        </Reveal>

        {/* Vehicle inspection */}
        {session && phase !== 'cancelled' && (
          <Reveal>
          <section className="mt-8 border-t border-line pt-6">
            <h2 className="font-display text-lg font-semibold text-ink">Vehicle inspection</h2>
            <p className="mt-1 text-[13px] text-muted">Photograph the car before pick-up and after return — a real before/after record for this trip.</p>

            <h3 className="mt-5 text-[13px] font-semibold uppercase tracking-wide text-muted">Before pick-up</h3>
            <div className="mt-2.5">
              <InspectionGrid
                bookingId={booking.id}
                uploaderId={session.user.id}
                phase="pre"
                photos={inspectionPhotos ?? []}
                onUploaded={refreshInspectionPhotos}
              />
            </div>

            <h3 className="mt-6 text-[13px] font-semibold uppercase tracking-wide text-muted">After return</h3>
            <div className="mt-2.5">
              <InspectionGrid
                bookingId={booking.id}
                uploaderId={session.user.id}
                phase="post"
                photos={inspectionPhotos ?? []}
                onUploaded={refreshInspectionPhotos}
                locked={phase === 'upcoming'}
                lockedMessage="Unlocks once your trip has started."
              />
            </div>
          </section>
          </Reveal>
        )}

        {/* Host */}
        <Reveal>
        <section className="mt-8 border-t border-line pt-6">
          <h2 className="font-display text-lg font-semibold text-ink">Your host</h2>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-line p-4">
            {booking.host.avatar ? (
              <img src={booking.host.avatar} alt="" className="h-11 w-11 rounded-full object-cover" />
            ) : (
              <span className="grid h-11 w-11 place-items-center rounded-full bg-accent-050 text-accent">
                <Icon name="user" size={18} />
              </span>
            )}
            <div className="flex-1">
              <p className="text-[14px] font-medium text-ink">{booking.host.name}</p>
              {booking.host.responseTime && <p className="text-[13px] text-muted">Responds {booking.host.responseTime}</p>}
            </div>
            <button onClick={handleMessageHost} disabled={messaging} className="btn btn-secondary btn-sm disabled:opacity-60">
              <Icon name="message" size={15} /> {messaging ? 'Opening…' : 'Message'}
            </button>
          </div>
        </section>
        </Reveal>

        {/* Payment */}
        <Reveal>
        <section className="mt-8 border-t border-line pt-6">
          <h2 className="font-display text-lg font-semibold text-ink">Payment details</h2>
          <dl className="mt-3 space-y-2.5 rounded-xl border border-line p-4 text-[14px]">
            <div className="flex justify-between"><dt className="text-muted">{days} {days === 1 ? 'day' : 'days'} rental</dt><dd className="text-ink">{eur(base)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Service fee</dt><dd className="text-ink">{eur(service)}</dd></div>
            <div className="flex justify-between"><dt className="flex items-center gap-1 text-muted">Protection <Icon name="shield" size={13} className="text-accent" /></dt><dd className="text-ink">{eur(protection)}</dd></div>
            {booking.fareTier === 'flexible' && (
              <div className="flex justify-between"><dt className="text-muted">Flexible cancellation</dt><dd className="text-ink">{eur(flexSurcharge)}</dd></div>
            )}
            {booking.extras.map((ex) => (
              <div key={ex.id} className="flex justify-between"><dt className="text-muted">{ex.name}</dt><dd className="text-ink">{eur(ex.unitPrice * ex.quantity)}</dd></div>
            ))}
            <div className="hairline my-1" />
            <div className="flex justify-between text-[15px] font-semibold text-ink"><dt>Total</dt><dd>{eur(booking.totalPrice)}</dd></div>
          </dl>
          {(booking.fareTier === 'flexible' || booking.extras.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {booking.fareTier === 'flexible' && (
                <span className="badge badge-accent"><Icon name="shield" size={12} /> Flexible cancellation</span>
              )}
              {booking.extras.map((ex) => (
                <span key={ex.id} className="badge bg-panel-2 text-ink-soft">{ex.name}</span>
              ))}
            </div>
          )}
        </section>
        </Reveal>

        {/* Insurance & cancellation */}
        <Reveal>
        <section className="mt-8 border-t border-line pt-6">
          <h2 className="font-display text-lg font-semibold text-ink">Insurance &amp; cancellation</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
            This trip includes damage protection and 24/7 roadside assistance.{' '}
            {booking.fareTier === 'flexible'
              ? 'Your flexible fare includes free cancellation any time before pick-up.'
              : 'Free cancellation up to 24 hours before pick-up — after that, the booking stays confirmed with your host.'}
          </p>
        </section>
        </Reveal>

        {/* Modify dates */}
        {canModify && (
          <Reveal>
          <section className="mt-8 border-t border-line pt-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">Trip dates</h2>
              {!modifying && (
                <button onClick={openModify} className="text-[13.5px] font-medium text-accent hover:underline">
                  Modify dates
                </button>
              )}
            </div>
            {modifying && (
              <div className="mt-3 rounded-xl border border-line p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="field-label">Pick-up date</span>
                    <input type="date" min={todayISO()} value={modStart} onChange={(e) => setModStart(e.target.value)} className="input" />
                  </label>
                  <label>
                    <span className="field-label">Return date</span>
                    <input type="date" min={modStart || todayISO()} value={modEnd} onChange={(e) => setModEnd(e.target.value)} className="input" />
                  </label>
                </div>
                {modAvailability === 'checking' && <p className="mt-3 text-[13.5px] text-muted">Checking availability…</p>}
                {modAvailability === 'unavailable' && (
                  <p className="mt-3 flex items-center gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-[13.5px] text-danger">
                    <Icon name="info" size={16} /> This car is already booked for part of those dates.
                  </p>
                )}
                {modAvailability === 'available' && (
                  <p className="mt-3 flex items-center gap-2 rounded-xl bg-accent-050 px-3.5 py-2.5 text-[13.5px] text-accent-700">
                    <Icon name="checkCircle" size={16} /> Available — price will be recalculated for the new dates.
                  </p>
                )}
                {modError && (
                  <p className="mt-3 flex items-center gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-[13.5px] text-danger">
                    <Icon name="info" size={16} /> {modError}
                  </p>
                )}
                <div className="mt-4 flex gap-3">
                  <button onClick={() => setModifying(false)} className="btn btn-secondary flex-1">Cancel</button>
                  <button
                    onClick={handleModifySubmit}
                    disabled={modSubmitting || modAvailability !== 'available'}
                    className="btn btn-primary flex-1 disabled:opacity-60"
                  >
                    {modSubmitting ? 'Saving…' : 'Save new dates'}
                  </button>
                </div>
              </div>
            )}
          </section>
          </Reveal>
        )}

        {/* Support */}
        <Reveal>
        <section className="mt-8 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row">
          <Link to="/help" className="btn btn-secondary flex-1"><Icon name="headset" size={16} /> Get support</Link>
          {canCancel ? (
            <button onClick={handleCancel} disabled={cancelling} className="btn btn-secondary flex-1 !text-danger disabled:opacity-60">
              {cancelling ? 'Cancelling…' : 'Cancel trip'}
            </button>
          ) : phase === 'upcoming' || phase === 'active' ? (
            <p className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-center text-[13px] text-muted">
              Cancellation window has passed — contact your host or support.
            </p>
          ) : null}
        </section>
        </Reveal>
      </div>

      <Modal open={agreementOpen} onClose={() => setAgreementOpen(false)} className="max-w-lg" labelledBy="agreement-title">
        <div className="p-6">
          <h2 id="agreement-title" className="font-display text-xl font-semibold text-ink">Rental agreement</h2>
          <div className="mt-4 max-h-72 space-y-3 overflow-y-auto rounded-xl border border-line p-4 text-[13.5px] leading-relaxed text-ink-soft">
            <p>By accepting, you confirm you'll use {booking.car.make} {booking.car.model} only as licensed and insured, return it by {new Date(booking.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} in the condition it was received, and report any damage to your host immediately.</p>
            <p>This trip includes damage protection and 24/7 roadside assistance, as shown in your payment breakdown.{' '}
              {booking.fareTier === 'flexible'
                ? 'Your flexible fare allows free cancellation any time before pick-up.'
                : 'Free cancellation applies up to 24 hours before pick-up.'}
            </p>
            <p>Fuel or charge should be returned at the same level as pick-up. Smoking is not permitted in the vehicle.</p>
          </div>
          <div className="mt-5 flex gap-3">
            <button onClick={() => setAgreementOpen(false)} className="btn btn-secondary flex-1">Cancel</button>
            <button onClick={handleAcceptAgreement} disabled={acceptingAgreement} className="btn btn-primary flex-1 disabled:opacity-60">
              {acceptingAgreement ? 'Saving…' : 'I agree'}
            </button>
          </div>
        </div>
      </Modal>
    </DashboardShell>
  );
}
