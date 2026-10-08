import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { Img } from './motion';
import { Modal } from './primitives';
import { VerifiedTripBadge } from './signalFeed/SignalKeychainTab';
import { useLocale } from '../lib/i18n';
import { useApp } from '../lib/store';
import { useAuth } from '../lib/auth';
import { useCars } from '../lib/data/cars';
import { fetchMyTripMemoryFor, formatTripPeriod, publishTripMemory } from '../lib/data/tripMemories';
import type { Booking } from '../lib/data/bookings';

const MAX = 400;

/** On a finished trip: offer to turn it into a CX Keychain card. The renter
 *  always chooses — "Pubblica" puts it in SIGNAL, their Keychain and the car's
 *  Roadbook; "Solo io" keeps it private. Never published automatically. */
export function TripMemoryPrompt({ booking }: { booking: Booking }) {
  const { t, lang } = useLocale();
  const { toast } = useApp();
  const { session } = useAuth();
  const [existing, setExisting] = useState<{ visibility: 'public' | 'private' } | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'public' | 'private' | null>(null);
  const { cars } = useCars();
  // The car's general city — never its street address (`location`).
  const city = cars?.find((c) => c.id === booking.car.id)?.city ?? '';
  const car = `${booking.car.make} ${booking.car.model}`;
  const days = Math.max(1, Math.round((new Date(booking.endDate).getTime() - new Date(booking.startDate).getTime()) / 86_400_000));
  const [text, setText] = useState('');

  // Prefill with the real city once it is known — until the person edits the text.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched || !city) return;
    setText(t('{n} days in {city} with the {car}.', { n: days, city, car }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.id, lang, city, touched]);

  useEffect(() => {
    let cancelled = false;
    fetchMyTripMemoryFor(booking.id).then((m) => { if (!cancelled) setExisting(m); });
    return () => { cancelled = true; };
  }, [booking.id]);

  const submit = async (visibility: 'public' | 'private') => {
    if (busy) return;
    setBusy(visibility);
    const { error } = await publishTripMemory(booking.id, text.trim(), visibility);
    setBusy(null);
    if (error) {
      toast({ title: t('Could not save your card'), desc: error, icon: 'info' });
      return;
    }
    setExisting({ visibility });
    setOpen(false);
    toast({ title: visibility === 'public' ? t('Published to SIGNAL') : t('Saved just for you'), icon: 'check' });
  };

  if (existing === undefined) return null;

  return (
    <>
      <section className="mt-6 overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_18px_40px_-26px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-4 p-4">
          <span className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-panel">
            <Img src={booking.car.image} alt="" className="h-full w-full object-cover" fallback={<span className="grid h-full w-full place-items-center text-muted"><Icon name="car" size={22} /></span>} />
          </span>
          <div className="min-w-0 flex-1">
            <VerifiedTripBadge />
            <p className="mt-1.5 font-display text-lead font-semibold leading-tight text-ink">
              {existing ? t('Your Keychain card') : t('Turn this trip into a Keychain card')}
            </p>
            <p className="mt-0.5 text-detail text-muted">
              {existing
                ? existing.visibility === 'public' ? t('Published to SIGNAL, your Keychain and this car’s Roadbook.') : t('Saved just for you.')
                : t('You choose: share it on SIGNAL, or keep it just for you.')}
            </p>
          </div>
        </div>
        <div className="border-t border-line p-3">
          {existing ? (
            session && (
              <Link to={`/signal/profile/${session.user.id}`} className="btn btn-secondary btn-block">
                <Icon name="key" size={16} /> {t('Open my Keychain')}
              </Link>
            )
          ) : (
            <button type="button" onClick={() => setOpen(true)} className="btn btn-primary btn-block">
              <Icon name="key" size={16} /> {t('Create the card')}
            </button>
          )}
        </div>
      </section>

      <Modal open={open} onClose={() => setOpen(false)} className="flex max-h-[92dvh] flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-2 pt-5">
          <h2 className="font-display text-xl font-semibold text-ink">{t('Your Keychain card')}</h2>
          <div className="mt-4 overflow-hidden rounded-3xl ring-1 ring-black/[0.06]">
            <div className="relative aspect-[16/10] bg-noir">
              <Img src={booking.car.image} alt="" className="absolute inset-0 h-full w-full object-cover" fallback={<span className="absolute inset-0 grid place-items-center text-muted"><Icon name="car" size={26} /></span>} />
              <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
              <VerifiedTripBadge className="absolute left-3 top-3 bg-white/90 shadow-hair backdrop-blur" />
              <div className="absolute inset-x-4 bottom-3.5 text-white">
                <p className="font-display text-lead font-semibold leading-tight">{car}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-detail text-white/80">
                  <Icon name="pin" size={12} /> {city} · {formatTripPeriod(booking.startDate, booking.endDate, lang)}
                </p>
              </div>
            </div>
          </div>
          <label className="mt-4 block text-detail font-semibold text-ink-soft" htmlFor="trip-memory-text">{t('A few words')}</label>
          <textarea
            id="trip-memory-text"
            value={text}
            onChange={(e) => { setTouched(true); setText(e.target.value.slice(0, MAX)); }}
            rows={4}
            className="mt-1.5 w-full resize-none rounded-2xl border border-line bg-panel p-3.5 text-[16px] leading-snug text-ink outline-none focus:border-line-strong"
          />
          <p className="mt-1 text-right text-caption text-faint tabular-nums">{text.length}/{MAX}</p>
          <p className="mt-2 text-caption text-muted">
            {t('Only the car, the city, the dates and your words are shown — never an address or an exact position.')}
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-line p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <button type="button" onClick={() => void submit('private')} disabled={busy !== null} className="btn btn-secondary btn-lg justify-center disabled:opacity-60">
            <Icon name="eyeOff" size={16} /> {busy === 'private' ? '…' : t('Only me')}
          </button>
          <button type="button" onClick={() => void submit('public')} disabled={busy !== null} className="btn btn-primary btn-lg justify-center disabled:opacity-60">
            {busy === 'public' ? '…' : t('Publish')}
          </button>
        </div>
      </Modal>
    </>
  );
}
