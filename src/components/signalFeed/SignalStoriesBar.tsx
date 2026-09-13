import { useState } from 'react';
import { Icon } from '../Icon';
import { useActiveEmpireStories } from '../../lib/data/empireStories';
import { resolveSignalIdentity } from '../../lib/data/signalIdentity';
import { SignalIdentityAvatar } from './SignalIdentityBadge';
import { SignalStoryViewer } from './SignalStoryViewer';
import { SignalStoryComposer } from './SignalStoryComposer';
import { useAuth } from '../../lib/auth';

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
  const { session } = useAuth();
  const { stories: allStories, refresh } = useActiveEmpireStories();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const stories = allStories?.filter((s) =>
    scope === 'official' ? s.publisherType !== 'self' : s.publisherType === 'self'
  ) ?? null;

  if (stories === null) {
    return (
      <div className="no-scrollbar mb-3 flex gap-3 overflow-x-auto pb-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex shrink-0 flex-col items-center gap-1">
            <div className="skeleton h-14 w-14 rounded-full" />
            <div className="skeleton h-2.5 w-9 rounded-md" />
          </div>
        ))}
      </div>
    );
  }

  if (stories.length === 0 && !canCreate) return null;

  return (
    <>
      <div className="no-scrollbar mb-3 flex gap-3 overflow-x-auto pb-1">
        {canCreate && (
          <button onClick={onOpenComposer} className="pressable flex shrink-0 flex-col items-center gap-1">
            <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-dashed border-line-strong text-ink-soft transition-colors hover:border-accent hover:text-accent-700">
              <Icon name="plus" size={20} />
            </span>
            <span className="max-w-[60px] truncate text-[10.5px] font-medium text-ink-soft">Add Story</span>
          </button>
        )}
        {stories.map((story, i) => {
          // The bubble shows WHO is speaking (Owner/CX Assistant/CX),
          // not a preview of the Story's own content — matches how the
          // identity system's own examples present the bar, and reads
          // as a broadcast channel rather than a personal-content ring.
          const identity = resolveSignalIdentity(story.publisherType, story.authorName, story.authorAvatarUrl, story.authorIsHost, story.authorIsVerifiedClient);
          // Three distinct, original ring treatments (never the raw
          // gradient Instagram itself uses): your own Story gets a solid
          // brand-green ring regardless of viewed state (it's yours,
          // "unseen" doesn't apply to you); everyone else's unseen Story
          // gets the existing live-gradient ring; a Story you've already
          // seen fades to a quiet neutral ring.
          const isMine = story.authorId === session?.user.id;
          const ringClass = isMine
            ? 'bg-accent-700'
            : story.viewedByMe
              ? 'bg-line-strong opacity-70'
              : 'bg-gradient-to-tr from-accent-bright via-accent to-accent-700';
          return (
            <button key={story.id} onClick={() => setOpenIndex(i)} className="pressable flex shrink-0 flex-col items-center gap-1">
              <span className={`grid h-14 w-14 place-items-center rounded-full p-[2.5px] transition-opacity ${ringClass}`}>
                <span className="grid h-full w-full place-items-center overflow-hidden rounded-full border-2 border-surface bg-panel">
                  <SignalIdentityAvatar identity={identity} size={50} />
                </span>
              </span>
              <span className="max-w-[60px] truncate text-[10.5px] font-medium text-ink-soft">{isMine ? 'You' : identity.name}</span>
            </button>
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
        <SignalStoryComposer
          mode={scope === 'community' ? 'self' : 'official'}
          onClose={onCloseComposer}
          onPublished={() => { onCloseComposer(); refresh(); }}
        />
      )}
    </>
  );
}
