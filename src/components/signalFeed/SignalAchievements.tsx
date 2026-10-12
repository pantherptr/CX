import { Icon, type IconName } from '../Icon';
import { useLocale } from '../../lib/i18n';

interface Ach {
  id: string;
  icon: IconName;
  title: string;
  hint: string;
  earned: boolean;
  gold?: boolean;
}

/** Milestones earned on SIGNAL and on the road — computed from what the profile already shows, nothing
 *  stored. The big one is the Golden Host: 25 completed trips. */
export function SignalAchievements({
  isHost,
  trips,
  followers,
  posts,
  respects,
  isMe,
}: {
  isHost: boolean;
  trips: number;
  followers: number;
  posts: number;
  respects: number;
  isMe: boolean;
}) {
  const { t } = useLocale();
  const list: Ach[] = [
    ...(isHost
      ? [
          { id: 'first', icon: 'key' as IconName, title: 'First trip', hint: 'Complete a first trip', earned: trips >= 1 },
          { id: 'ten', icon: 'route' as IconName, title: '10 trips', hint: 'Complete 10 trips', earned: trips >= 10 },
          { id: 'golden', icon: 'trophy' as IconName, title: 'Golden Host', hint: 'Complete 25 trips', earned: trips >= 25, gold: true },
        ]
      : []),
    { id: 'voice', icon: 'message' as IconName, title: 'Storyteller', hint: 'Share 10 posts', earned: posts >= 10 },
    { id: 'respected', icon: 'like' as IconName, title: 'Respected', hint: 'Earn 50 Respect', earned: respects >= 50 },
    { id: 'rising', icon: 'trending' as IconName, title: 'Rising', hint: 'Reach 100 followers', earned: followers >= 100 },
  ];
  const shown = isMe ? list : list.filter((a) => a.earned);
  if (shown.length === 0) return null;
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label={t('Achievements')}>
      {shown.map((a) => (
        <span
          key={a.id}
          title={a.earned ? t(a.title) : t(a.hint)}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-caption font-semibold ${
            a.earned
              ? a.gold
                ? 'border-[#c9971c]/50 bg-[#c9971c]/15 text-[#8a6d1f] shadow-[0_0_18px_-6px_rgba(201,151,28,0.7)]'
                : 'border-accent/25 bg-accent-050 text-accent-700'
              : 'border-line bg-panel text-faint'
          }`}
        >
          <Icon name={a.icon} size={13} /> {a.earned ? t(a.title) : t(a.hint)}
        </span>
      ))}
    </div>
  );
}
