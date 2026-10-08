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

  const Masthead = () => (
    <header className="mb-9 text-center">
      <p className="flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.34em] text-ink">
        <Icon name="key" size={12} strokeWidth={2.2} /> CX Keychain
      </p>
      <h2 className="mt-3 font-display text-[1.65rem] font-medium leading-tight tracking-tight text-ink">{t('The keys to your journeys.')}</h2>
      <span aria-hidden="true" className="mx-auto mt-4 block h-px w-12" style={{ background: '#b7a06a' }} />
    </header>
  );

  if (stamps === null) return <div className="mx-auto aspect-[1.55] w-full max-w-[24rem] animate-pulse rounded-[5px] bg-panel" />;

  if (stamps.length === 0) {
    return (
      <div className="px-2 pb-10 pt-6">
        <Masthead />
        <div className="mx-auto flex max-w-[24rem] flex-col items-center rounded-[5px] px-6 py-12 text-center" style={{ border: '1px dashed #b7a06a' }}>
          <span className="grid h-14 w-14 place-items-center rounded-full text-ink" style={{ border: '1px solid #b7a06a' }}>
            <Icon name="key" size={22} strokeWidth={1.6} />
          </span>
          <p className="mt-6 max-w-[15rem] font-display text-[1.2rem] font-medium leading-snug text-ink">
            {isMe ? t('Your first key is waiting on the road.') : t('Verified trips will appear here.')}
          </p>
          {isMe && (
            <Link to="/browse" className="pressable mt-7 inline-flex min-h-11 items-center gap-2 rounded-[6px] border border-ink/80 px-6 text-detail font-semibold tracking-wide text-ink">
              {t('Browse cars')} <Icon name="arrowRight" size={15} />
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="px-2 pb-12 pt-6">
      <Masthead />
      <p className="mb-9 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">{summary}</p>
      <TripStampGrid stamps={stamps} onToggle={isMe ? (s) => void toggle(s) : undefined} />
    </div>
  );
}
