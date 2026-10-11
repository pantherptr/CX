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

const DISMISS_KEY = 'cx.signal.people-shelf-dismissed-at';
const DISMISS_FOR_MS = 3 * 24 * 60 * 60 * 1000;
/** Someone who follows fewer accounts than this sees the shelf at the very top of the feed;
 *  everyone else sees it inside the feed, after the first posts — never gone, just out of the way. */
const TOP_UNDER = 5;

const dismissedRecently = () => {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return at > 0 && Date.now() - at < DISMISS_FOR_MS;
  } catch { return false; }
};

// Kept for a few minutes so a refresh (or switching Official ↔ Community) does not blink the row
// out and back in, and does not ask the server again each time.
let cache: { uid: string; at: number; following: number; people: PersonSuggestion[] } | null = null;
const FRESH_MS = 5 * 60 * 1000;

/** A short row of people worth following. `top` is for members who follow few accounts; `inline`
 *  is placed inside the feed (after the first posts) for everyone else. Dismissing it hides it for
 *  three days, not forever. */
export function SignalPeopleShelf({ profileBase, placement = 'top' }: { profileBase: string; placement?: 'top' | 'inline' }) {
  const { t } = useLocale();
  const { session } = useAuth();
  const uid = session?.user.id;
  const fresh = cache && uid && cache.uid === uid && Date.now() - cache.at < FRESH_MS ? cache : null;
  const [people, setPeople] = useState<PersonSuggestion[]>(fresh?.people ?? []);
  const [following, setFollowing] = useState<number | null>(fresh ? fresh.following : null);
  const [dismissed, setDismissed] = useState(dismissedRecently);

  useEffect(() => {
    if (!uid || dismissed) return;
    if (fresh) return;
    let cancelled = false;
    (async () => {
      const me = await fetchSignalProfile(uid).catch(() => null);
      if (cancelled || !me) return;
      const rows = await fetchPeopleSuggestions(12);
      if (cancelled) return;
      cache = { uid, at: Date.now(), following: me.followingCount, people: rows };
      setFollowing(me.followingCount);
      setPeople(rows);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, dismissed]);

  if (dismissed || people.length === 0 || following === null) return null;
  if (placement === 'top' ? following >= TOP_UNDER : following < TOP_UNDER) return null;
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
  };

  return (
    <section aria-label={t('People to follow')} className={`rounded-2xl border border-line bg-surface p-3.5 shadow-hair ${placement === 'top' ? 'mb-4' : 'my-3'}`}>
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
