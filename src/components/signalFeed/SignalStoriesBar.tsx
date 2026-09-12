import { useState } from 'react';
import { Icon } from '../Icon';
import { useActiveEmpireStories } from '../../lib/data/empireStories';
import { resolveSignalIdentity } from '../../lib/data/signalIdentity';
import { SignalIdentityAvatar } from './SignalIdentityBadge';
import { SignalStoryViewer } from './SignalStoryViewer';
import { SignalStoryComposer } from './SignalStoryComposer';

/** The permanent Stories row at the top of Signal — self-contained: owns
 *  its own fetch, viewer, and (for Owner/Admin) composer state, so the
 *  page just drops this in once. Renders nothing at all — not an empty
 *  placeholder — when there are zero active stories and the viewer
 *  isn't Owner/Admin (who still gets the "Add Story" circle so there's
 *  a way to create the first one). */
export function SignalStoriesBar({ canManage }: { canManage: boolean }) {
  const { stories, refresh } = useActiveEmpireStories();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  if (stories === null) {
    return (
      <div className="no-scrollbar mb-5 flex gap-4 overflow-x-auto pb-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex shrink-0 flex-col items-center gap-1.5">
            <div className="skeleton h-16 w-16 rounded-full" />
            <div className="skeleton h-2.5 w-10 rounded-md" />
          </div>
        ))}
      </div>
    );
  }

  if (stories.length === 0 && !canManage) return null;

  return (
    <>
      <div className="no-scrollbar mb-5 flex gap-4 overflow-x-auto pb-1">
        {canManage && (
          <button onClick={() => setComposerOpen(true)} className="pressable flex shrink-0 flex-col items-center gap-1.5">
            <span className="grid h-16 w-16 place-items-center rounded-full border-2 border-dashed border-line-strong text-ink-soft transition-colors hover:border-accent hover:text-accent-700">
              <Icon name="plus" size={22} />
            </span>
            <span className="max-w-[68px] truncate text-[11px] font-medium text-ink-soft">Add Story</span>
          </button>
        )}
        {stories.map((story, i) => {
          // The bubble shows WHO is speaking (Owner/CX Assistant/CX),
          // not a preview of the Story's own content — matches how the
          // identity system's own examples present the bar, and reads
          // as a broadcast channel rather than a personal-content ring.
          const identity = resolveSignalIdentity(story.publisherType, story.authorName, story.authorAvatarUrl);
          return (
            <button key={story.id} onClick={() => setOpenIndex(i)} className="pressable flex shrink-0 flex-col items-center gap-1.5">
              <span
                className={`grid h-16 w-16 place-items-center rounded-full p-[2.5px] transition-opacity ${
                  story.viewedByMe ? 'bg-line-strong opacity-70' : 'bg-gradient-to-tr from-accent-bright via-accent to-accent-700'
                }`}
              >
                <span className="grid h-full w-full place-items-center overflow-hidden rounded-full border-2 border-surface bg-panel">
                  <SignalIdentityAvatar identity={identity} size={58} />
                </span>
              </span>
              <span className="max-w-[68px] truncate text-[11px] font-medium text-ink-soft">{identity.name}</span>
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
          onClose={() => setComposerOpen(false)}
          onPublished={() => { setComposerOpen(false); refresh(); }}
        />
      )}
    </>
  );
}
