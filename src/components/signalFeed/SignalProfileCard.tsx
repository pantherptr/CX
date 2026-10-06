import type { ReactNode } from 'react';
import { Icon } from '../Icon';
import { VerifiedBadge } from '../primitives';
import { compact } from '../../lib/format';
import { Img, useCountUp } from '../motion';
import { Ugc } from '../../lib/i18n/ugc';

type Role = 'owner' | 'admin' | 'host' | 'client';

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', host: 'Host', client: 'Verified Client' };

/** A count that eases up to its value the first time it is seen. */
function CountLabel({ value }: { value: number }) {
  const { ref, value: animated } = useCountUp<HTMLSpanElement>(value, { duration: 700 });
  return (
    <span ref={ref} className="font-display text-lead font-semibold text-on-noir">
      {animated === value ? compact(value) : animated}
    </span>
  );
}

/**
 * How a person looks on SIGNAL: their photo fills a dark card, with the name
 * and verified badge, a line about them, who follows them and the one
 * action that matters (Follow, or Edit profile on your own).
 *
 * It is the same profile data as everywhere else on CX — nothing here is
 * stored separately — only presented as a card, photo first.
 */
export function SignalProfileCard({
  name,
  role,
  username,
  bio,
  avatarUrl,
  hostStats,
  followers,
  following,
  hasActiveStory,
  onOpenStory,
  action,
}: {
  name: string;
  role: Role | null;
  username?: string | null;
  bio?: string | null;
  avatarUrl: string | null;
  /** Rating and trips, for hosts. */
  hostStats?: { rating: number; trips: number } | null;
  followers?: { count: number; onOpen: () => void };
  following?: { count: number; onOpen: () => void };
  hasActiveStory: boolean;
  onOpenStory: () => void;
  action?: ReactNode;
}) {
  return (
    <div
      data-surface="noir"
      className="relative mx-auto mt-5 w-full max-w-sm overflow-hidden rounded-[1.75rem] bg-noir shadow-card ring-1 ring-black/10"
    >
      <div className="relative flex min-h-[31rem] flex-col justify-end sm:min-h-[34rem]">
        {/* The photo — or, with none yet, a quiet dark stand-in */}
        {avatarUrl ? (
          <Img
            src={avatarUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            fallback={<div className="absolute inset-0 bg-gradient-to-br from-noir-2 via-noir to-accent-700/30" />}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-noir-2 via-noir to-accent-700/30 text-on-noir-muted">
            <Icon name="user" size={96} strokeWidth={1.2} />
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-noir/60 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[72%] bg-gradient-to-t from-noir via-noir/80 to-transparent" />

        <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-3">
          {hasActiveStory ? (
            <button
              onClick={onOpenStory}
              aria-label="View Story"
              className="pressable inline-flex items-center gap-2 rounded-full bg-black/45 py-1.5 pl-2 pr-3 text-caption font-semibold text-white backdrop-blur-md"
            >
              <span className="h-3 w-3 rounded-full bg-gradient-to-tr from-accent-bright via-accent to-accent-700 ring-2 ring-white/30" />
              Story
            </button>
          ) : (
            <span />
          )}
          {role && (
            <span className="rounded-full bg-black/45 px-3 py-1.5 text-caption font-semibold text-white backdrop-blur-md">
              {ROLE_LABEL[role]}
            </span>
          )}
        </div>

        <div className="relative px-6 pb-6">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 truncate font-display text-3xl font-semibold leading-tight text-on-noir">{name}</h2>
            {role && <VerifiedBadge role={role} size={22} />}
          </div>
          {username && <p className="mt-0.5 text-detail text-on-noir-muted">@{username}</p>}
          {bio && (
            <p className="mt-3 line-clamp-4 whitespace-pre-wrap break-words text-body leading-relaxed text-on-noir-muted">
              <Ugc text={bio} />
            </p>
          )}
          {hostStats && (
            <p className="mt-3 text-detail text-on-noir-muted">
              {compact(hostStats.rating)} ★ · {compact(hostStats.trips)} trips
            </p>
          )}

          {(followers || following) && (
            <div className="mt-5 flex items-center gap-6 text-body text-on-noir-muted">
              {followers && (
                <button onClick={followers.onOpen} className="pressable inline-flex items-center gap-2 transition-colors hover:text-on-noir">
                  <Icon name="users" size={18} /> <CountLabel value={followers.count} /> Followers
                </button>
              )}
              {following && (
                <button onClick={following.onOpen} className="pressable inline-flex items-center gap-2 transition-colors hover:text-on-noir">
                  <Icon name="user" size={18} /> <CountLabel value={following.count} /> Following
                </button>
              )}
            </div>
          )}

          {action && <div className="mt-5">{action}</div>}
        </div>
      </div>
    </div>
  );
}
