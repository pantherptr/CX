import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { useLocale } from '../lib/i18n';
import { Ugc } from '../lib/i18n/ugc';
import { useAuth } from '../lib/auth';
import { fetchCarRoadbook, formatTripPeriod, type RoadbookEntry } from '../lib/data/tripMemories';
import { VerifiedTripBadge } from './signalFeed/SignalKeychainTab';
import { KeysCta } from './signalFeed/KeysCta';

/** The car's memory: verified trips people chose to publish, told like pages
 *  of a logbook — not a list of reviews. Signed-in members only, like SIGNAL. */
export function CarRoadbook({ carId, carSlug }: { carId: string; carSlug: string }) {
  const { t } = useLocale();
  const { session } = useAuth();
  const [entries, setEntries] = useState<RoadbookEntry[] | null>(null);

  useEffect(() => {
    if (!session) { setEntries([]); return; }
    let cancelled = false;
    fetchCarRoadbook(carId).then((rows) => { if (!cancelled) setEntries(rows); });
    return () => { cancelled = true; };
  }, [carId, session]);

  if (entries === null) return <div className="skeleton h-40 w-full rounded-3xl" />;

  if (!session) {
    return (
      <div className="rounded-3xl bg-panel px-5 py-8 text-center">
        <Icon name="key" size={26} className="mx-auto text-accent-700" />
        <p className="mt-3 font-display text-lead font-semibold text-ink">{t('The Roadbook')}</p>
        <p className="mx-auto mt-1 max-w-xs text-detail text-muted">{t('Sign in to read the verified trips of this car.')}</p>
        <Link to="/login" className="btn btn-primary btn-sm mt-4">{t('Sign in')}</Link>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-3xl bg-panel px-5 py-8 text-center">
        <Icon name="key" size={26} className="mx-auto text-accent-700" />
        <p className="mt-3 font-display text-lead font-semibold text-ink">{t('The Roadbook')}</p>
        <p className="mx-auto mt-1 max-w-xs text-detail text-muted">{t('Be the first to write a page of this car’s story: after your trip, share it from the trip page.')}</p>
      </div>
    );
  }

  return <RoadbookList entries={entries} carId={carId} carSlug={carSlug} />;
}

export function RoadbookList({ entries, carId, carSlug }: { entries: RoadbookEntry[]; carId: string; carSlug: string }) {
  const { t, lang } = useLocale();
  return (
    <div>
      <p className="mb-4 text-detail text-muted">{t('Pages from the people who drove it.')}</p>
      <ol className="relative flex flex-col gap-6 border-l border-line pl-5">
        {entries.map((e) => (
          <li key={e.id} className="relative">
            <span aria-hidden="true" className="absolute -left-[1.62rem] top-1.5 h-2.5 w-2.5 rounded-full bg-accent-bright ring-4 ring-bg" />
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption font-semibold uppercase tracking-[0.08em] text-faint">
              <Icon name="pin" size={11} /> {e.city} · {formatTripPeriod(e.startDate, e.endDate, lang)}
            </p>
            {e.body && <p className="mt-2 font-display text-[1.15rem] font-medium leading-snug text-ink text-pretty">“<Ugc text={e.body} />”</p>}
            <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
              <span className="text-detail font-medium text-ink-soft">{e.authorUsername ? `@${e.authorUsername}` : e.authorName}</span>
              <VerifiedTripBadge />
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6">
        <KeysCta carId={carId} carSlug={carSlug} />
      </div>
    </div>
  );
}
