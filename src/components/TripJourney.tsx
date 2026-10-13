import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { ShareProfileSheet, type PassData } from './CxPass';
import { useAuth } from '../lib/auth';
import { useLocale } from '../lib/i18n';
import { uiLocale } from '../lib/i18n/uiLocale';
import type { Booking } from '../lib/data/bookings';
import { fetchHandoverState, releasePayoutAfterHandover, undoScan, UNDO_WINDOW_MS, type HandoverState } from '../lib/data/handovers';
import { useVerification, licenceReady } from '../lib/data/verification';

type Role = 'renter' | 'host';
type Stage = 'prepare' | 'pickup' | 'road' | 'return' | 'done';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Time left until the end of the return day, in words: "2 days 4 h", "5 h 12 min", "overdue by 3 h". */
function leftLabel(deadline: Date, t: (k: string, v?: Record<string, string | number>) => string): { text: string; late: boolean } {
  const ms = deadline.getTime() - Date.now();
  const late = ms < 0;
  const mins = Math.floor(Math.abs(ms) / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const body = d > 0 ? t('{d} d {h} h', { d, h }) : h > 0 ? t('{h} h {m} min', { h, m }) : t('{m} min', { m });
  return { text: late ? t('Overdue by {x}', { x: body }) : body, late };
}

function Step({
  n,
  last,
  state,
  title,
  summary,
  children,
}: {
  n: number;
  last?: boolean;
  state: 'done' | 'current' | 'todo';
  title: string;
  summary?: string;
  children?: ReactNode;
}) {
  return (
    <li className="relative flex gap-3.5 pb-5 last:pb-0">
      {!last && <span aria-hidden className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-line" />}
      <span
        className={`relative z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-full text-detail font-bold ${
          state === 'done' ? 'bg-accent text-white' : state === 'current' ? 'bg-ink text-white' : 'border-2 border-line bg-surface text-faint'
        }`}
      >
        {state === 'done' ? <Icon name="check" size={15} strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className={`text-body font-semibold ${state === 'todo' ? 'text-faint' : 'text-ink'}`}>{title}</p>
        {summary && state !== 'current' && <p className="mt-0.5 text-detail text-muted">{summary}</p>}
        {state === 'current' && children}
      </div>
    </li>
  );
}

function Numbered({ items }: { items: string[] }) {
  return (
    <ol className="mt-3 space-y-2.5">
      {items.map((x, i) => (
        <li key={i} className="flex gap-2.5 text-detail leading-snug text-ink-soft">
          <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-panel text-[11px] font-bold text-ink">{i + 1}</span>
          <span>{x}</span>
        </li>
      ))}
    </ol>
  );
}

/** The whole trip as four clear steps — get ready, pickup (scan = the trip starts), on the road with the
 *  return countdown, return (scan = the trip is closed). Same card for the renter and for the host; each
 *  sees what to do at their own step. */
export function TripJourney({
  booking,
  role,
  inspectionHref,
  onChanged,
  onReviewAgreement,
}: {
  booking: Booking;
  role: Role;
  /** Where the before/after photos live on this page. */
  inspectionHref?: string;
  onChanged?: () => void;
  /** Opens the rental agreement (renter): shown as a to-do if it is not signed yet. */
  onReviewAgreement?: () => void;
}) {
  const { t } = useLocale();
  const { profile, session } = useAuth();
  const [state, setState] = useState<HandoverState | null>(null);
  const [tickN, tick] = useState(0);
  const [undoing, setUndoing] = useState(false);
  const releasedRef = useRef(false);
  const [passOpen, setPassOpen] = useState(false);
  const { verification } = useVerification(role === 'renter' ? session?.user.id : undefined);

  useEffect(() => {
    let off = false;
    void fetchHandoverState(booking.id).then((s) => { if (!off) { setState(s); onChanged?.(); } });
    // The other person may scan while this page is open: look again when the app comes back and now and then.
    const again = () => void fetchHandoverState(booking.id).then((s) => { if (!off) setState(s); });
    const timer = window.setInterval(again, 20000);
    document.addEventListener('visibilitychange', again);
    return () => {
      off = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', again);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.id]);

  // The countdown re-renders every 30 seconds.
  useEffect(() => {
    const timer = window.setInterval(() => tick((x) => x + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);

  // Once the 5-minute undo window has passed, ask for the host's payout (the server holds it until then and
  // re-checks everything; asking twice can never pay twice).
  useEffect(() => {
    if (!state?.pickupAt || releasedRef.current) return;
    if (Date.now() - new Date(state.pickupAt).getTime() <= UNDO_WINDOW_MS) return;
    releasedRef.current = true;
    void releasePayoutAfterHandover(booking.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.pickupAt, tickN]);

  const deadline = useMemo(() => {
    const [y, m, d] = booking.endDate.split('-').map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59);
  }, [booking.endDate]);

  if (!state || booking.status === 'cancelled' || booking.status === 'refunded' || booking.status === 'pending' || booking.status === 'payment_processing') return null;

  const today = iso(new Date());
  const stage: Stage = state.returnAt
    ? 'done'
    : state.pickupAt
      ? booking.endDate <= today ? 'return' : 'road'
      : booking.startDate <= today ? 'pickup' : 'prepare';

  // A trip that ended without anyone scanning (older bookings) has nothing to guide.
  if (stage === 'pickup' && booking.endDate < today && role === 'renter') return null;

  // "Scanned by mistake?": only the person who scanned, only inside the window.
  const me = session?.user.id;
  const withinWindow = (at: string | null | undefined) => Boolean(at) && Date.now() - new Date(at as string).getTime() < UNDO_WINDOW_MS;
  const undoKind: 'pickup' | 'return' | null = state.returnAt
    ? state.returnBy && state.returnBy === me && withinWindow(state.returnAt) ? 'return' : null
    : state.pickupBy && state.pickupBy === me && withinWindow(state.pickupAt) ? 'pickup' : null;
  const doUndo = async () => {
    if (!undoKind || undoing) return;
    setUndoing(true);
    const { error } = await undoScan(booking.id, undoKind);
    setUndoing(false);
    if (error) { window.alert(error); return; }
    const s = await fetchHandoverState(booking.id);
    setState(s);
    onChanged?.();
  };

  const other = role === 'renter' ? booking.host : booking.renter;
  const otherName = other.name || (role === 'renter' ? t('your host') : t('the renter'));
  const delivery = booking.fulfillmentType === 'delivery';
  const place = delivery ? booking.deliveryAddress || t('the delivery address') : booking.pickupLocation || booking.car.location || booking.car.city;
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(uiLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
  const left = leftLabel(deadline, t);

  const status = (s: Stage): 'done' | 'current' | 'todo' => {
    const order: Stage[] = ['prepare', 'pickup', 'road', 'return', 'done'];
    const i = order.indexOf(s);
    const c = order.indexOf(stage);
    // "return" is available as soon as the trip is on the road, so step 3 and 4 share the second half.
    if (s === 'road') return stage === 'road' ? 'current' : c > 2 ? 'done' : 'todo';
    if (s === 'return') return stage === 'return' ? 'current' : stage === 'done' ? 'done' : 'todo';
    return c > i ? 'done' : c === i ? 'current' : 'todo';
  };

  const myPass: PassData | null = profile && session
    ? {
        name: profile.full_name || session.user.email?.split('@')[0] || 'CX',
        username: profile.username,
        avatarUrl: profile.avatar_url,
        tier: profile.is_owner ? 'team' : profile.is_host ? 'host' : profile.is_verified_client ? 'verified' : 'member',
        trips: 0,
        respects: 0,
        since: String(new Date(profile.created_at).getFullYear()),
        url: `${window.location.origin}/signal/profile/${profile.id}`,
        hideStats: true,
      }
    : null;

  const scanBtn = (kind: 'pickup' | 'return', label: string) => (
    <Link
      to={`/scan?booking=${booking.id}&kind=${kind}`}
      className="mt-4 inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-ink text-[15px] font-bold text-white"
    >
      <Icon name="camera" size={19} /> {label}
    </Link>
  );
  const showPassBtn = myPass && (
    <button
      type="button"
      onClick={() => setPassOpen(true)}
      className="mt-2.5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-detail font-semibold text-ink"
    >
      <Icon name="key" size={17} /> {t('Show my CX Pass')}
    </button>
  );
  const photosLink = inspectionHref && (
    <a href={inspectionHref} className="mt-2 inline-flex items-center gap-1.5 text-detail font-semibold text-accent-700">
      <Icon name="camera" size={14} /> {t('Open the car photos')}
    </a>
  );

  // Renter, before the car changes hands: what is still missing to be allowed to drive it.
  const missing: { label: string; to?: string; onClick?: () => void }[] = [];
  if (role === 'renter' && (stage === 'pickup' || stage === 'prepare')) {
    const idOk = verification?.identityStatus === 'pending' || verification?.identityStatus === 'approved';
    if (!idOk) missing.push({ label: t('Verify your identity'), to: '/settings#verification' });
    if (!licenceReady(verification)) missing.push({ label: t('Upload your driving licence'), to: '/settings#licence' });
    if (!booking.agreementAcceptedAt && onReviewAgreement) missing.push({ label: t('Sign the rental agreement'), onClick: onReviewAgreement });
  }

  const heading: Record<Stage, { icon: IconName; title: string; sub: string }> = {
    prepare: { icon: 'clock', title: t('Your trip starts {date}', { date: fmt(booking.startDate) }), sub: t('Step 1 of 4 — get ready') },
    pickup: { icon: 'key', title: t('Today: the handover'), sub: t('Step 2 of 4 — pick up the car') },
    road: { icon: 'route', title: t('The trip is on'), sub: t('Step 3 of 4 — on the road') },
    return: { icon: 'clock', title: t('Time to return the car'), sub: t('Step 4 of 4 — return') },
    done: { icon: 'checkCircle', title: t('Trip closed'), sub: t('All done') },
  };
  const hd = heading[stage];

  const undoBar = undoKind && (
    <div className="flex items-center justify-between gap-3 border-b border-line bg-panel px-5 py-3">
      <p className="text-detail text-ink-soft">{undoKind === 'return' ? t('Return scanned by mistake?') : t('Handover scanned by mistake?')}</p>
      <button
        type="button"
        onClick={() => void doUndo()}
        disabled={undoing}
        className="shrink-0 rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-detail font-semibold text-ink disabled:opacity-60"
      >
        {undoing ? t('Undoing…') : t('Undo')}
      </button>
    </div>
  );

  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-line bg-surface shadow-hair">
      <div className="flex items-center gap-3.5 border-b border-line bg-panel/60 px-5 py-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink text-white"><Icon name={hd.icon} size={20} /></span>
        <div className="min-w-0">
          <p className="truncate font-display text-lead font-semibold text-ink">{hd.title}</p>
          <p className="text-caption font-semibold uppercase tracking-wide text-muted">{hd.sub}</p>
        </div>
      {undoBar}
      </div>

      {(stage === 'road' || stage === 'return') && (
        <div className={`mx-5 mt-4 flex items-center justify-between rounded-2xl px-4 py-3 ${left.late ? 'bg-danger/10' : 'bg-accent-050'}`}>
          <span className="text-detail font-semibold text-ink">{t('Return by {date}, end of day', { date: fmt(booking.endDate) })}</span>
          <span className={`font-display text-lg font-semibold tabular-nums ${left.late ? 'text-danger' : 'text-accent-700'}`}>{left.text}</span>
        </div>
      )}

      {missing.length > 0 && (
        <div className="mx-5 mt-4 rounded-2xl border border-[#f5a524]/40 bg-warn/10 p-4">
          <p className="text-detail font-semibold text-ink">{t('Before you can drive, finish:')}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {missing.map((m) =>
              m.to ? (
                <Link key={m.label} to={m.to} className="btn btn-secondary btn-sm">{m.label}</Link>
              ) : (
                <button key={m.label} type="button" onClick={m.onClick} className="btn btn-secondary btn-sm">{m.label}</button>
              ),
            )}
          </div>
        </div>
      )}

      <ol className="px-5 py-5">
        <Step
          n={1}
          state={status('prepare')}
          title={role === 'renter' ? t('Get ready') : t('Get the car ready')}
          summary={role === 'renter' ? t('Identity, licence and agreement are in order') : t('Car ready, keys at hand')}
        >
          <Numbered
            items={
              role === 'renter'
                ? [
                    t('Check the list below: verified identity, driving licence and signed rental agreement.'),
                    t('Pick-up is {date} at {place}.', { date: fmt(booking.startDate), place }),
                    t('Write to {name} if you need to agree on a time.', { name: otherName }),
                  ]
                : [
                    t('Clean the car, check fuel or charge and have the keys at hand.'),
                    t('{name} picks up on {date} at {place}.', { name: otherName, date: fmt(booking.startDate), place }),
                    t('Be there on time — you will both scan your CX Pass at the handover.'),
                  ]
            }
          />
        </Step>

        <Step
          n={2}
          state={status('pickup')}
          title={role === 'renter' ? t('Pick up the car') : t('Hand over the car')}
          summary={state.pickupAt ? t('Handover verified') : undefined}
        >
          <Numbered
            items={
              role === 'renter'
                ? [
                    delivery ? t('Wait at {place} — {name} brings the car to you.', { place, name: otherName }) : t('Meet {name} at {place}.', { name: otherName, place }),
                    t('Look the car over together and take the “before pick-up” photos.'),
                    t('Scan {name}’s CX Pass. This is what starts your trip.', { name: otherName }),
                  ]
                : [
                    delivery ? t('Bring the car to {place}.', { place }) : t('Meet {name} at {place}.', { name: otherName, place }),
                    t('Check that the person in front of you is {name}, with the verified badge.', { name: otherName }),
                    t('Let {name} scan your CX Pass — or scan theirs. This is what starts the trip.', { name: otherName }),
                  ]
            }
          />
          {photosLink}
          {role === 'renter' ? scanBtn('pickup', t('Scan {name}’s CX Pass', { name: otherName })) : showPassBtn}
          {role === 'renter' ? showPassBtn : scanBtn('pickup', t('Scan {name}’s CX Pass', { name: otherName }))}
          <p className="mt-3 text-caption leading-snug text-muted">
            {t('Scanning confirms the car has changed hands: the trip starts, the return countdown begins and the host’s payout is released.')}
          </p>
        </Step>

        <Step
          n={3}
          state={status('road')}
          title={t('On the road')}
          summary={stage === 'return' || stage === 'done' ? t('Trip completed') : undefined}
        >
          <Numbered
            items={
              role === 'renter'
                ? [
                    t('Enjoy the trip. The return is at {place}.', { place: booking.car.location || booking.car.city }),
                    t('Bring the car back by the end of {date}, in the state you received it.', { date: fmt(booking.endDate) }),
                    t('Running late or something wrong? Message {name} before the deadline.', { name: otherName }),
                  ]
                : [
                    t('{name} has the car until the end of {date}.', { name: otherName, date: fmt(booking.endDate) }),
                    t('Your payout was released at the handover.'),
                    t('If {name} writes, answer quickly — it keeps everything smooth.', { name: otherName }),
                  ]
            }
          />
          <Link to="/messages" className="mt-3 inline-flex items-center gap-1.5 text-detail font-semibold text-accent-700">
            <Icon name="message" size={14} /> {t('Message {name}', { name: otherName })}
          </Link>
          {stage === 'road' && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="text-caption text-muted">{t('Back early? You can close the trip at any time.')}</p>
              {scanBtn('return', t('Return the car — scan {name}’s CX Pass', { name: otherName }))}
            </div>
          )}
        </Step>

        <Step
          n={4}
          last
          state={status('return')}
          title={role === 'renter' ? t('Return the car') : t('Take the car back')}
          summary={state.returnAt ? t('Return confirmed') : undefined}
        >
          <Numbered
            items={
              role === 'renter'
                ? [
                    t('Bring the car to {place} by the end of {date}.', { place: booking.car.location || booking.car.city, date: fmt(booking.endDate) }),
                    t('Look it over with {name} and take the “after return” photos — this protects you both.', { name: otherName }),
                    t('Scan {name}’s CX Pass again. This closes your trip and starts the release of your deposit.', { name: otherName }),
                  ]
                : [
                    t('{name} brings the car back to {place}.', { name: otherName, place: booking.car.location || booking.car.city }),
                    t('Look it over together and take the “after return” photos.'),
                    t('Scan {name}’s CX Pass — or let them scan yours. This closes the trip.', { name: otherName }),
                  ]
            }
          />
          {photosLink}
          {scanBtn('return', t('Confirm the return — scan {name}’s CX Pass', { name: otherName }))}
          {showPassBtn}
        </Step>
      </ol>

      {stage === 'done' && (
        <div className="border-t border-line bg-accent-050 px-5 py-4">
          <p className="text-detail font-semibold text-accent-700">
            {role === 'renter'
              ? t('The car is back. Your deposit is being released — it can take a day. How was the trip? Share it or leave a review.')
              : t('The car is back and the trip is closed. Thank you for hosting!')}
          </p>
        </div>
      )}

      {myPass && (
        <ShareProfileSheet
          open={passOpen}
          onClose={() => setPassOpen(false)}
          pass={myPass}
          heading={t('Show this to {name}', { name: otherName })}
        />
      )}
    </section>
  );
}
