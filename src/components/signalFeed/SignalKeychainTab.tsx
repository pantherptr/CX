import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { Img } from '../motion';
import { useLocale } from '../../lib/i18n';
import { Ugc } from '../../lib/i18n/ugc';
import { fetchUserKeychain, formatTripPeriod, type TripMemory } from '../../lib/data/tripMemories';
import { KeysCta } from './KeysCta';

export function VerifiedTripBadge({ className = '' }: { className?: string }) {
  const { t } = useLocale();
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-accent-050 px-2.5 py-1 text-caption font-semibold text-accent-700 ${className}`}>
      <Icon name="check" size={11} strokeWidth={3} /> {t('Verified CX trip')}
    </span>
  );
}

/** One Keychain card: the car, a general city, the period, a short note. */
export function KeychainCard({ memory, onOpen }: { memory: TripMemory; onOpen?: () => void }) {
  const { t, lang } = useLocale();
  const car = memory.car;
  return (
    <article
      onClick={onOpen}
      className={`card overflow-hidden rounded-3xl p-0 shadow-[0_18px_40px_-26px_rgba(0,0,0,0.4)] ring-1 ring-black/[0.06] ${onOpen ? 'cursor-pointer' : ''}`}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-noir">
        {car.image && (
          <Img src={car.image} alt={`${car.make} ${car.model}`} className="absolute inset-0 h-full w-full object-cover" fallback={<span className="absolute inset-0 grid place-items-center text-muted"><Icon name="car" size={26} /></span>} />
        )}
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <VerifiedTripBadge className="bg-white/90 shadow-hair backdrop-blur" />
          {memory.visibility === 'private' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-caption font-semibold text-white backdrop-blur">
              <Icon name="eyeOff" size={11} /> {t('Only me')}
            </span>
          )}
        </div>
        <div className="absolute inset-x-4 bottom-3.5 text-white">
          <p className="font-display text-lead font-semibold leading-tight">{car.make} {car.model}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-detail text-white/80">
            <Icon name="pin" size={12} /> {memory.city} · {formatTripPeriod(memory.startDate, memory.endDate, lang)}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        {memory.body ? (
          <p className="line-clamp-3 min-w-0 flex-1 text-body leading-snug text-ink"><Ugc text={memory.body} /></p>
        ) : (
          <span className="flex-1 text-detail text-faint">{car.year}</span>
        )}
        <KeysCta carId={car.id} carSlug={car.slug} />
      </div>
    </article>
  );
}

/** The profile's Keychain tab: the trips this person turned into cards. */
export function SignalKeychainTab({ userId, isMe }: { userId: string; isMe: boolean }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const base = pathname.startsWith('/signal/community') ? '/signal/community' : '/signal';
  const [items, setItems] = useState<TripMemory[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchUserKeychain(userId).then((rows) => { if (!cancelled) setItems(rows); });
    return () => { cancelled = true; };
  }, [userId]);

  if (items === null) return <div className="skeleton aspect-[16/10] w-full rounded-3xl" />;
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-accent-050 text-accent-700 ring-1 ring-accent-bright/20">
          <Icon name="key" size={30} />
        </span>
        <p className="mt-4 font-display text-lead font-semibold text-ink">{t('No keys yet')}</p>
        <p className="mt-1 max-w-[18rem] text-detail text-muted">
          {isMe ? t('After a trip ends, turn it into a Keychain card from the trip page.') : t('Verified trips will appear here.')}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {items.map((m) => (
        <KeychainCard key={m.id} memory={m} onOpen={m.postId ? () => navigate(`${base}/post/${m.postId}`) : undefined} />
      ))}
    </div>
  );
}
