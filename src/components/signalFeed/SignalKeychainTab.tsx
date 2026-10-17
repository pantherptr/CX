import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { useLocale } from '../../lib/i18n';
import { useApp } from '../../lib/store';
import { stampPlace } from '../../lib/cityCountry';
import { fetchUserStamps, setStampVisibility, syncMyTripStamps, type TripStampData } from '../../lib/data/tripMemories';
import { TripStampGrid } from '../TripStamp';
import { CxMark } from '../CxBadge';
import { CxPass, type PassData } from '../CxPass';

export function VerifiedTripBadge({ className = '' }: { className?: string }) {
  const { t } = useLocale();
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-accent-050 px-2.5 py-1 text-caption font-semibold text-accent-700 ${className}`}>
      <CxMark tier="verified" size={11} /> {t('Verified CX trip')}
    </span>
  );
}

/** The profile's Keychain tab: one stamp per finished, verified trip. Private
 *  unless its owner makes it public. */
export function SignalKeychainTab({ userId, isMe, pass }: { userId: string; isMe: boolean; pass?: PassData | null }) {
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
    <header className="mb-7 text-center">
      <p className="inline-flex items-center gap-1.5 rounded-full bg-panel px-3 py-1 text-[12px] font-semibold text-ink-soft">
        <Icon name="key" size={13} strokeWidth={2} /> CX Keychain
      </p>
      <h2 className="mt-3 font-display text-[1.6rem] font-semibold leading-tight tracking-[-0.02em] text-ink">{t('The keys to your journeys.')}</h2>
    </header>
  );

  const passBlock = pass ? (
    <section className="mx-auto mb-10 w-full max-w-[26rem]">
      <p className="mb-3 text-center text-[12px] font-semibold text-ink-soft">{isMe ? t('My CX Pass') : t('CX Pass')}</p>
      <CxPass pass={pass} height="580px" />
    </section>
  ) : null;

  if (stamps === null) return <div>{passBlock}<div className="mx-auto aspect-[1.55] w-full max-w-[24rem] animate-pulse rounded-3xl bg-panel" /></div>;

  if (stamps.length === 0) {
    return (
      <div className="px-2 pb-10 pt-6">
        {passBlock}
        <Masthead />
        <div className="mx-auto flex max-w-[24rem] flex-col items-center rounded-3xl border border-dashed border-line-strong px-6 py-11 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-panel text-ink-soft">
            <Icon name="key" size={22} strokeWidth={1.8} />
          </span>
          <p className="mt-5 max-w-[15rem] font-display text-[1.15rem] font-medium leading-snug text-ink">
            {isMe ? t('Your first key is waiting on the road.') : t('Verified trips will appear here.')}
          </p>
          {isMe && (
            <Link to="/browse" className="btn btn-secondary btn-lg mt-6">
              {t('Browse cars')} <Icon name="arrowRight" size={15} />
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="px-2 pb-12 pt-6">
      {passBlock}
      <Masthead />
      <p className="mb-7 text-center text-detail font-medium text-muted">{summary}</p>
      <TripStampGrid stamps={stamps} onToggle={isMe ? (s) => void toggle(s) : undefined} />
    </div>
  );
}
