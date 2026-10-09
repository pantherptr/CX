import { useState, type ReactNode } from 'react';
import { useLocale } from '../../lib/i18n';
import { useLightStatusBar } from '../../lib/useLightStatusBar';
import { Icon } from '../Icon';
import { Img, useCountUp } from '../motion';
import { VerifiedBadge } from '../primitives';
import { compact } from '../../lib/format';
import { Ugc } from '../../lib/i18n/ugc';

type Role = 'owner' | 'admin' | 'host' | 'client';
const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', host: 'Host', client: 'Verified Client' };

function CountUp({ value, children }: { value: number; children?: ReactNode }) {
  const { ref, value: animated } = useCountUp<HTMLSpanElement>(value, { duration: 700 });
  return (
    <span ref={ref}>
      {animated === value ? compact(value) : animated}
      {children}
    </span>
  );
}

/** One figure in the stats card under a profile's name. */
function StatCell({ value, label, onClick, suffix, decimals }: { value: number; label: string; onClick?: () => void; suffix?: string; decimals?: number }) {
  const body = (
    <>
      <p className="font-display text-[1.85rem] font-semibold leading-none tracking-tight text-ink tabular-nums">
        {decimals !== undefined ? <>{value.toFixed(decimals)}{suffix}</> : <CountUp value={value}>{suffix}</CountUp>}
      </p>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">{label}</p>
    </>
  );
  const cls = 'px-2 py-5 text-center';
  return onClick ? (
    <button onClick={onClick} className={`pressable ${cls} transition-colors active:bg-panel`}>{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * The top of a person's SIGNAL profile: their photo as a full-width cover
 * with the name over it, and a light sheet sliding up over its bottom edge
 * that holds who they are, the numbers, the main action — and, as
 * children, whatever sits below (posts, vehicles).
 *
 * The bar at the top floats over the photo and turns into a compact
 * name bar once you scroll past it. The cover drifts slower than the
 * page, a small depth cue that costs nothing.
 */
export function SignalProfileHero({
  name,
  role,
  username,
  bio,
  coverUrl,
  avatarUrl,
  hostStats,
  followers,
  following,
  postsCount,
  joined,
  hasActiveStory,
  onOpenStory,
  action,
  onClose,
  onShare,
  scrollTop,
  children,
}: {
  name: string;
  role: Role | null;
  username?: string | null;
  bio?: string | null;
  /** The big photo; falls back to the avatar. */
  coverUrl?: string | null;
  avatarUrl: string | null;
  hostStats?: { rating: number; trips: number } | null;
  followers?: { count: number; onOpen: () => void };
  following?: { count: number; onOpen: () => void };
  postsCount?: number;
  /** "Member since …", as the profile stores it. */
  joined?: string | null;
  hasActiveStory: boolean;
  onOpenStory: () => void;
  /** Follow, or Edit profile on your own. */
  action?: ReactNode;
  onClose: () => void;
  onShare: () => void;
  /** The overlay's scroll position, for the bar and the cover's drift. */
  scrollTop: number;
  children?: ReactNode;
}) {
  const { t } = useLocale();
  const [bioOpen, setBioOpen] = useState(false);
  const longBio = (bio?.length ?? 0) > 150;
  const photo = coverUrl ?? avatarUrl;
  const separateAvatar = Boolean(coverUrl && avatarUrl);
  const scrolled = scrollTop > 260;
  // the cover is a dark photo: light status-bar text until it scrolls away
  useLightStatusBar(!scrolled);
  const drift = Math.min(scrollTop, 520) * 0.28;

  const glass = scrolled ? 'bg-panel text-ink-soft hover:bg-panel-2' : 'bg-black/35 text-white backdrop-blur-md hover:bg-black/50';

  return (
    <>
      {/* Floating bar — over the photo at first, a compact name bar once scrolled */}
      <div
        className={`sticky top-0 z-20 -mb-[calc(3.75rem+env(safe-area-inset-top,0px))] flex h-[calc(3.75rem+env(safe-area-inset-top,0px))] items-center gap-3 px-3 pt-safe transition-colors duration-200 ${
          scrolled ? 'border-b border-line bg-surface/92 backdrop-blur-md' : ''
        }`}
      >
        <button onClick={onClose} aria-label="Back to Signal" className={`pressable grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors ${glass}`}>
          <Icon name="chevronLeft" size={20} />
        </button>
        <div className={`flex min-w-0 flex-1 items-center gap-2 transition-opacity duration-200 ${scrolled ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
          <span className="truncate font-display font-semibold text-ink">{name}</span>
          {role && <VerifiedBadge role={role} size={16} />}
        </div>
        <button onClick={onShare} aria-label="Share profile" className={`pressable grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors ${glass}`}>
          <Icon name="share" size={18} />
        </button>
      </div>

      {/* Cover */}
      <div className="relative h-[25rem] overflow-hidden bg-noir sm:mt-3 sm:h-[31rem] sm:rounded-t-[2rem]">
        <div className="absolute inset-0" style={{ transform: `translate3d(0, ${drift}px, 0) scale(1.08)` }}>
          {photo ? (
            <Img
              src={photo}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              fallback={<div className="absolute inset-0 bg-gradient-to-br from-noir-2 via-noir to-accent-700/30" />}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-noir-2 via-noir to-accent-700/30 text-on-noir-muted">
              <Icon name="user" size={112} strokeWidth={1.1} />
            </div>
          )}
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/45 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />

        <div className="absolute inset-x-5 bottom-12 text-white sm:inset-x-8 sm:bottom-14">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {role && role !== 'client' && (
              <span className="rounded-full bg-white/15 px-3 py-1 text-caption font-semibold backdrop-blur-md">{ROLE_LABEL[role]}</span>
            )}
            {hasActiveStory && (
              <button onClick={onOpenStory} aria-label="View Story" className="pressable inline-flex items-center gap-2 rounded-full bg-white/15 py-1 pl-2 pr-3 text-caption font-semibold backdrop-blur-md">
                <span className="h-3 w-3 rounded-full bg-gradient-to-tr from-accent-bright via-accent to-accent-700 ring-2 ring-white/40" />
                Story
              </button>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <h1 className="min-w-0 truncate font-display text-[2rem] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl">{name}</h1>
            {role && <VerifiedBadge role={role} size={18} />}
          </div>
          {username && <p className="mt-1 text-body text-white/70">@{username}</p>}
        </div>
      </div>

      {/* The sheet that slides up over the cover */}
      <div className="relative -mt-8 rounded-t-[2rem] bg-bg px-5 pb-4 pt-6 sm:px-8">
        {separateAvatar && (
          <div className="-mt-16 mb-4 flex justify-start sm:-mt-[4.5rem]">
            {(() => {
              const face = (
                <Img
                  src={avatarUrl!}
                  alt=""
                  className="h-[5.5rem] w-[5.5rem] rounded-full object-cover sm:h-28 sm:w-28"
                  fallback={<span className="grid h-[5.5rem] w-[5.5rem] place-items-center rounded-full bg-panel text-ink-soft sm:h-28 sm:w-28"><Icon name="user" size={32} /></span>}
                />
              );
              const avatarNode = hasActiveStory ? (
                <button
                  onClick={onOpenStory}
                  aria-label="View Story"
                  className="pressable rounded-full bg-[conic-gradient(from_210deg,#00d447,#8dffb0,#00d447)] p-[3px] shadow-[0_0_22px_-4px_rgba(0,212,71,0.6)]"
                >
                  <span className="block rounded-full bg-bg p-[3px]">{face}</span>
                </button>
              ) : (
                <span className="inline-block rounded-full bg-bg p-1 shadow-[0_12px_28px_-14px_rgba(0,0,0,0.5)]">{face}</span>
              );
              return avatarNode;
            })()}
          </div>
        )}

        {bio && (
          <div>
            <p className={`whitespace-pre-wrap break-words text-copy leading-relaxed text-ink-soft sm:text-lead ${longBio && !bioOpen ? 'line-clamp-3' : ''}`}>
              <Ugc text={bio} />
            </p>
            {longBio && (
              <button type="button" onClick={() => setBioOpen((o) => !o)} className="pressable mt-1 text-detail font-semibold text-ink">
                {bioOpen ? t('Show less') : t('Show more')}
              </button>
            )}
          </div>
        )}
        {joined && (
          <p className="mt-3 flex items-center gap-1.5 text-caption font-medium text-faint">
            <Icon name="calendar" size={13} /> {t('Member since {date}', { date: joined })}
          </p>
        )}

        {(followers || following || hostStats) && (
          <div
            className="mt-5 grid divide-x divide-line overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_16px_36px_-24px_rgba(0,0,0,0.35)]"
            style={{ gridTemplateColumns: `repeat(${(postsCount !== undefined ? 1 : 0) + (followers ? 1 : 0) + (following ? 1 : 0) + (hostStats ? 2 : 0)}, minmax(0, 1fr))` }}
          >
            {postsCount !== undefined && <StatCell value={postsCount} label="Posts" />}
            {followers && <StatCell value={followers.count} label="Followers" onClick={followers.onOpen} />}
            {following && <StatCell value={following.count} label="Following" onClick={following.onOpen} />}
            {hostStats && <StatCell value={hostStats.rating} label="Rating" suffix=" ★" decimals={1} />}
            {hostStats && <StatCell value={hostStats.trips} label="Trips" />}
          </div>
        )}

        {action && <div className="mt-4">{action}</div>}

        {children && <div className="mt-6">{children}</div>}
      </div>
    </>
  );
}
