import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { Img } from '../motion';
import { VerifiedBadge } from '../primitives';
import { FollowButton } from './FollowButton';
import { useAuth } from '../../lib/auth';
import { useLocale } from '../../lib/i18n';
import { fetchSignalProfile } from '../../lib/data/signalProfile';
import { fetchPeopleSuggestions, type PersonSuggestion } from '../../lib/data/privacy';

const DISMISS_KEY = 'cx.signal.people-shelf-dismissed';

/** A short row of people worth following, shown at the top of the feed to someone who
 *  does not follow anybody yet — so a new member has somewhere to start. It disappears
 *  on its own once they follow someone, and can be dismissed. */
export function SignalPeopleShelf({ profileBase }: { profileBase: string }) {
  const { t } = useLocale();
  const { session } = useAuth();
  const uid = session?.user.id;
  const [people, setPeople] = useState<PersonSuggestion[]>([]);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    if (!uid || dismissed) return;
    let cancelled = false;
    (async () => {
      const me = await fetchSignalProfile(uid).catch(() => null);
      // Only for someone who follows nobody yet.
      if (cancelled || !me || me.followingCount > 0) return;
      const rows = await fetchPeopleSuggestions(10);
      if (!cancelled) setPeople(rows);
    })();
    return () => { cancelled = true; };
  }, [uid, dismissed]);

  if (dismissed || people.length === 0) return null;
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  };

  return (
    <section aria-label={t('People to follow')} className="mb-4 rounded-2xl border border-line bg-surface p-3.5 shadow-hair">
      <div className="mb-3 flex items-center justify-between gap-3 px-0.5">
        <h2 className="text-detail font-semibold text-ink">{t('People to follow')}</h2>
        <button type="button" onClick={dismiss} aria-label={t('Dismiss')} className="pressable grid h-8 w-8 place-items-center rounded-full text-faint hover:bg-panel hover:text-ink-soft">
          <Icon name="x" size={14} />
        </button>
      </div>
      <div className="no-scrollbar -mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-0.5">
        {people.map((p) => (
          <div key={p.id} className="flex w-36 shrink-0 snap-start flex-col items-center rounded-2xl bg-panel/60 px-3 pb-3 pt-3.5 text-center">
            <Link to={`${profileBase}/profile/${p.id}`} className="flex min-w-0 flex-col items-center">
              {p.avatarUrl ? (
                <Img src={p.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" fallback={<span className="grid h-14 w-14 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={22} /></span>} />
              ) : (
                <span className="grid h-14 w-14 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={22} /></span>
              )}
              <span className="mt-2 flex max-w-full items-center gap-1">
                <span className="truncate text-detail font-semibold text-ink">{p.fullName}</span>
                {(p.isHost || p.isVerifiedClient) && <VerifiedBadge role={p.isHost ? 'host' : 'client'} size={14} />}
              </span>
              <span className="mt-0.5 line-clamp-1 min-h-4 text-caption text-faint">
                {p.mutualFollows > 0 ? t('Followed by {n} you follow', { n: p.mutualFollows }) : p.username ? `@${p.username}` : ''}
              </span>
            </Link>
            <div className="mt-2.5">
              <FollowButton userId={p.id} initialFollowing={false} size="sm" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
