import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '../Icon';
import { useLocale } from '../../lib/i18n';
import { CxFlag } from '../CxFlag';

interface Ach {
  id: string;
  icon: IconName | 'flag';
  title: string;
  hint: string;
  earned: boolean;
  gold?: boolean;
  /** What to do to get it — shown in a small bar when the chip is tapped. */
  how: string;
  /** current / target, shown on a goal that is not reached yet. */
  progress: readonly [number, number];
}

/** Milestones earned on SIGNAL and on the road — computed from what the profile already shows, nothing
 *  stored. The big one is the Golden Host: 25 completed trips. */
export function SignalAchievements({
  isHost,
  trips,
  followers,
  respects,
  handovers,
  isMe,
  joined,
}: {
  isHost: boolean;
  trips: number;
  followers: number;
  respects: number;
  handovers: number;
  isMe: boolean;
  /** ISO date the profile joined; used for the founding-member badge */
  joined?: string | null;
}) {
  const { t } = useLocale();
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!tip) return;
    const close = () => setTip(null);
    const timer = window.setTimeout(close, 3500);
    window.addEventListener('scroll', close, true);
    window.addEventListener('touchmove', close, { passive: true });
    window.addEventListener('pointerdown', close, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('touchmove', close);
      window.removeEventListener('pointerdown', close, true);
    };
  }, [tip]);
  const list: Ach[] = [
    ...(isHost
      ? [
          { id: 'first', icon: 'key' as IconName, title: 'First trip', hint: 'Complete a first trip', how: 'Finish your first trip as a host — the first handover and return.', earned: trips >= 1, progress: [trips, 1] as const },
          { id: 'ten', icon: 'route' as IconName, title: '10 trips', hint: 'Complete 10 trips', how: 'Every completed trip counts. Keep your car available and your replies quick.', earned: trips >= 10, progress: [trips, 10] as const },
          { id: 'golden', icon: 'flag' as const, title: 'Golden Host', hint: 'Complete 25 trips', how: 'Complete 25 trips as a host to become a Golden Host.', earned: trips >= 25, gold: true, progress: [trips, 25] as const },
        ]
      : []),
    { id: 'founding', icon: 'flag' as const, title: 'Founding member', hint: 'Join before 2027', how: 'Members who joined CX before 2027 are founding members.', earned: Boolean(joined && joined < '2027-01-01'), progress: [joined && joined < '2027-01-01' ? 1 : 0, 1] as const },
    { id: 'handover', icon: 'verified' as IconName, title: 'Verified handover', hint: 'Scan a CX Pass at a handover', how: 'At the handover, both of you scan each other’s CX Pass from the trip page. Each verified handover counts.', earned: handovers >= 1, progress: [handovers, 1] as const },
    { id: 'respected', icon: 'like' as IconName, title: 'Respected', hint: 'Earn 1,000 Respect', how: 'Share your trips, your car and your moments — every Respect on your posts counts toward 1,000.', earned: respects >= 1000, progress: [respects, 1000] as const },
    { id: 'rising', icon: 'trending' as IconName, title: 'Rising', hint: 'Reach 100 followers', how: 'Post often and follow people you like — 100 followers makes you Rising.', earned: followers >= 100, progress: [followers, 100] as const },
  ];
  // Others see what was earned; you also see the next two goals still ahead of you.
  const goals = isMe ? list.filter((a) => !a.earned).slice(0, 2) : [];
  const shown = [...list.filter((a) => a.earned), ...goals];
  if (shown.length === 0) return null;
  const earnedCount = shown.filter((a) => a.earned).length;
  return (
    <div className="mb-4">
      {isMe && (
        <p className="mb-2 px-1 text-caption font-semibold uppercase tracking-wide text-faint">
          {t('Achievements')}{earnedCount > 0 ? ` · ${earnedCount}` : ''}
        </p>
      )}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {shown.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const text = t(a.how);
              window.setTimeout(() => setTip({ text, x: r.left + r.width / 2, y: r.top }), 0);
            }}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-caption font-semibold ${
              a.earned
                ? a.gold
                  ? 'border-[#c9971c]/50 bg-[#c9971c]/15 text-[#8a6d1f] shadow-[0_0_18px_-6px_rgba(201,151,28,0.7)]'
                  : 'border-accent/25 bg-accent-050 text-accent-700'
                : 'border-dashed border-line-strong bg-transparent text-muted'
            }`}
          >
            {a.earned && a.icon === 'flag' ? (
              <CxFlag tone={a.gold ? 'gold' : 'green'} className="h-[15px] w-3 shrink-0" />
            ) : (
              <Icon name={a.earned && a.icon !== 'flag' ? a.icon : 'lock'} size={13} />
            )}
            {a.earned ? t(a.title) : `${t(a.hint)} · ${Math.min(a.progress[0], a.progress[1])}/${a.progress[1]}`}
          </button>
        ))}
      </div>
      {tip && createPortal(
        <div
          role="status"
          className="pointer-events-none fixed z-[600] animate-fade-in"
          style={{
            left: Math.min(Math.max(tip.x, 12 + 150), window.innerWidth - 12 - 150),
            top: tip.y - 8,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <span className="block max-w-[19rem] rounded-2xl bg-noir px-3.5 py-2 text-caption font-semibold leading-snug text-on-noir shadow-pop ring-1 ring-accent-bright/30">
            {tip.text}
          </span>
        </div>,
        document.body,
      )}
    </div>
  );
}
