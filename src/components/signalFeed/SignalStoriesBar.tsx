import { useState } from 'react';
import { Icon } from '../Icon';
import { useActiveEmpireStories } from '../../lib/data/empireStories';
import { resolveSignalIdentity } from '../../lib/data/signalIdentity';
import { SignalIdentityAvatar, ProfileAvatar } from './SignalIdentityBadge';
import { SignalStoryViewer } from './SignalStoryViewer';
import { SignalStoryCreator } from './SignalStoryCreator';
import { useAuth } from '../../lib/auth';
import { Tap, SharedAvatar } from '../motionKit';

/** The permanent Stories row at the top of Signal — self-contained: owns
 *  its own fetch, viewer, and (for authorized publishers) composer
 *  state, so the page just drops this in once. Renders nothing at all —
 *  not an empty placeholder — when there are zero active stories in
 *  this `scope` and the viewer can't create one here (still gets the
 *  "Add Story" circle so there's a way to create the first one).
 *
 *  `scope` is the Official/Community split (mirrors the feed's own
 *  `p_publisher_scope`) — filtered client-side from the one shared
 *  `useActiveEmpireStories()` fetch rather than a second RPC, since the
 *  active-Stories list is always small. `canCreate` replaces the old
 *  single `canManage` gate: Official passes the admin `canManage`,
 *  Community passes `canPublishSelf` — whoever may publish content in
 *  *this* space may start a Story in it. `canManage` is the separate,
 *  always-admin moderation flag (deleting a Story inside the viewer) —
 *  Story deletion stays Owner/Admin-only in both spaces for now, even
 *  though Community's own `canCreate` is a broader, non-admin flag.
 *  `composerOpen`/`onOpenComposer`/`onCloseComposer` are controlled by
 *  the parent (Signal.tsx), not local state — the Quick Control's own
 *  "Add Story" shortcut needs to open this exact same composer instance,
 *  not a second one, so whichever trigger fires first must share state
 *  with the other. */
export function SignalStoriesBar({
  scope,
  canCreate,
  canManage,
  composerOpen,
  onOpenComposer,
  onCloseComposer,
}: {
  scope: 'official' | 'community';
  canCreate: boolean;
  canManage: boolean;
  composerOpen: boolean;
  onOpenComposer: () => void;
  onCloseComposer: () => void;
}) {
  const { session, profile } = useAuth();
  const { stories: allStories, refresh } = useActiveEmpireStories();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const stories = allStories?.filter((s) =>
    scope === 'official' ? s.publisherType !== 'self' : s.publisherType === 'self'
  ) ?? null;

  if (stories === null) {
    return (
      <div className="no-scrollbar -mx-2.5 mb-3 flex snap-x scroll-pl-2.5 gap-3.5 overflow-x-auto px-2.5 pb-1 pt-0.5 sm:-mx-4 sm:scroll-pl-4 sm:px-4 lg:mx-0 lg:scroll-pl-0 lg:px-0">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex shrink-0 flex-col items-center gap-1.5">
            <div className="skeleton h-[68px] w-[68px] rounded-full" />
            <div className="skeleton h-2.5 w-10 rounded-md" />
          </div>
        ))}
      </div>
    );
  }

  if (stories.length === 0 && !canCreate) return null;

  return (
    <>
      <div className="no-scrollbar -mx-2.5 mb-3 flex snap-x scroll-pl-2.5 gap-3.5 overflow-x-auto px-2.5 pb-1 pt-0.5 sm:-mx-4 sm:scroll-pl-4 sm:px-4 lg:mx-0 lg:scroll-pl-0 lg:px-0">
        {canCreate && (
          <Tap onClick={onOpenComposer} scale={0.93} className="flex shrink-0 snap-start flex-col items-center gap-1.5">
            <span className="relative grid h-[68px] w-[68px] place-items-center rounded-full border-2 border-dashed border-line-strong p-[3px]">
              <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-panel text-ink-soft">
                {profile?.avatar_url ? <ProfileAvatar src={profile.avatar_url} size={58} /> : <Icon name="user" size={26} />}
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full bg-accent-bright text-white ring-[3px] ring-bg">
                <Icon name="plus" size={14} strokeWidth={3} />
              </span>
            </span>
            <span className="line-clamp-2 w-[72px] text-center text-[11.5px] font-medium leading-tight text-ink-soft">Add Story</span>
          </Tap>
        )}
        {stories.map((story, i) => {
          // The bubble shows WHO is speaking (Owner/CX Assistant/CX),
          // not a preview of the Story's own content — matches how the
          // identity system's own examples present the bar, and reads
          // as a broadcast channel rather than a personal-content ring.
          const identity = resolveSignalIdentity(story.publisherType, story.authorName, story.authorAvatarUrl, story.authorIsHost, story.authorIsVerifiedClient, story.authorIsOwner, story.authorIsAdmin, story.authorUsername);
          // A restrained, solid-color CX Rent take — never the raw
          // multi-stop gradient ring Instagram itself uses. Your own
          // Story gets a solid deep-accent ring regardless of viewed
          // state (it's yours, "unseen" doesn't apply to you); everyone
          // else's unseen Story gets one solid brighter accent tone; a
          // Story you've already seen fades to a quiet neutral ring.
          const isMine = story.authorId === session?.user.id;
          const ringClass = isMine
            ? 'bg-accent-700'
            : story.viewedByMe
              ? 'bg-line-strong opacity-70'
              : 'bg-[conic-gradient(from_210deg,#00d447,#8dffb0,#00d447)] shadow-[0_0_14px_-2px_rgba(0,212,71,0.55)]';
          return (
            <Tap key={story.id} onClick={() => setOpenIndex(i)} scale={0.93} className="flex shrink-0 snap-start flex-col items-center gap-1.5">
              <span className={`grid h-[68px] w-[68px] place-items-center rounded-full p-[3px] transition-opacity ${ringClass}`}>
                <span className="grid h-full w-full place-items-center overflow-hidden rounded-full border-2 border-surface bg-panel">
                  {/* The one shared-element transition in SIGNAL's Story
                      flow: this exact avatar morphs (position + size) into
                      the fullscreen viewer's header avatar the instant it
                      opens — `active` hands ownership of the shared id to
                      the viewer the moment ITS tile is the one open, so
                      there's never a moment both instances claim it. Only
                      the originally-tapped tile ever opts out — see
                      SignalStoryViewer's own matching comment for why
                      swiping to a *different* Story inside the viewer
                      doesn't also need this bar to track live position. */}
                  <SharedAvatar id={`story-avatar-${story.id}`} active={openIndex !== i}>
                    <SignalIdentityAvatar identity={identity} size={58} />
                  </SharedAvatar>
                </span>
              </span>
              <span className="max-w-[72px] truncate text-[11.5px] font-medium text-ink-soft">{isMine ? 'You' : identity.name}</span>
            </Tap>
          );
        })}
      </div>

      {openIndex !== null && (
        <SignalStoryViewer
          stories={stories}
          startIndex={openIndex}
          canManage={canManage}
          onClose={() => setOpenIndex(null)}
          onStoryDeleted={refresh}
        />
      )}

      {composerOpen && (
        <SignalStoryCreator
          mode={scope === 'community' ? 'self' : 'official'}
          onClose={onCloseComposer}
          onPublished={() => { onCloseComposer(); refresh(); }}
        />
      )}
    </>
  );
}
