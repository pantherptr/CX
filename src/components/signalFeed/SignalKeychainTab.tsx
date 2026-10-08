import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { useLocale } from '../../lib/i18n';
import { useApp } from '../../lib/store';
import { stampPlace } from '../../lib/cityCountry';
import { fetchUserStamps, setStampVisibility, syncMyTripStamps, type TripStampData } from '../../lib/data/tripMemories';
import { TripStampGrid } from '../TripStamp';

export function VerifiedTripBadge({ className = '' }: { className?: string }) {
  const { t } = useLocale();
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-accent-050 px-2.5 py-1 text-caption font-semibold text-accent-700 ${className}`}>
      <Icon name="check" size={11} strokeWidth={3} /> {t('Verified CX trip')}
    </span>
  );
}

/** The profile's Keychain tab: one stamp per finished, verified trip. Private
 *  unless its owner makes it public. */
export function SignalKeychainTab({ userId, isMe }: { userId: string; isMe: boolean }) {
  const { t, lang } = useLocale();
  const { toast } = useApp();
  const [stamps, setStamps] = useState<TripStampData[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Stamps for trips that just ended are created the first time they are looked at.
      if (isMe) await syncMyTripStamps();
      const rows = await fetchUserStamps(userId);
      if (!cancelled) setStamps(rows);
    })();
    return () => { cancelled = true; };
  }, [userId, isMe]);

  const summary = useMemo(() => {
    if (!stamps || stamps.length === 0) return '';
    const cities = [...new Set(stamps.map((s) => stampPlace(s.city, lang).city))];
    const shown = cities.slice(0, 3).join(', ');
    const more = cities.length > 3 ? ` +${cities.length - 3}` : '';
    return `${stamps.length === 1 ? t('1 key') : t('{n} keys', { n: stamps.length })} · ${shown}${more}`;
  }, [stamps, lang, t]);

  const toggle = async (stamp: TripStampData) => {
    const next = stamp.visibility === 'public' ? 'private' : 'public';
    setStamps((prev) => (prev ?? []).map((s) => (s.id === stamp.id ? { ...s, visibility: next } : s)));
    const { error } = await setStampVisibility(stamp.id, next);
    if (error) {
      setStamps((prev) => (prev ?? []).map((s) => (s.id === stamp.id ? { ...s, visibility: stamp.visibility } : s)));
      toast({ title: t('Could not change who sees this'), desc: error, icon: 'info' });
    }
  };

  if (stamps === null) return <div className="skeleton mx-auto aspect-[4/3.1] w-full max-w-[19rem] rounded-[22px]" />;

  if (stamps.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-accent-050 text-accent-700 ring-1 ring-accent-bright/20">
          <Icon name="key" size={30} />
        </span>
        <p className="mt-5 max-w-[16rem] font-display text-lead font-semibold leading-snug text-ink">
          {isMe ? t('Your first key is waiting on the road.') : t('Verified trips will appear here.')}
        </p>
        {isMe && (
          <Link to="/browse" className="btn btn-primary btn-sm mt-5">
            {t('Browse cars')}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="mb-6 text-center text-detail font-medium tracking-wide text-muted">{summary}</p>
      <TripStampGrid stamps={stamps} onToggle={isMe ? (s) => void toggle(s) : undefined} />
    </div>
  );
}
