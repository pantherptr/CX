import { Icon } from '../Icon';
import { useSheetDrag } from '../motion';
import { resolveSignalIdentity } from '../../lib/data/signalIdentity';
import { SignalIdentityAvatar } from './SignalIdentityBadge';
import { SignalComments } from './SignalComments';
import type { EmpirePost } from '../../lib/data/empireFeed';

/** Comments, reached from the feed's own "Comment" action, as the same
 *  compact bottom sheet every other Signal action (Share, Analytics,
 *  Notifications) already uses — connected to the post it belongs to via
 *  a small identity + snippet header, so it's never ambiguous which post
 *  is being discussed even once the feed itself has scrolled behind it.
 *  `SignalComments` itself decides whether the write composer renders at
 *  all (CX-team-only — see its own canComment) — this sheet is just the
 *  container, not a second permission check. */
export function SignalCommentsSheet({
  post,
  canModerateAll,
  onCountChanged,
  onClose,
}: {
  post: EmpirePost;
  canModerateAll: boolean;
  onCountChanged: (delta: number) => void;
  onClose: () => void;
}) {
  const { handlers: dragHandlers, style: dragStyle, closing, requestClose } = useSheetDrag(onClose);
  const identity = resolveSignalIdentity(post.publisherType, post.authorName, post.authorAvatarUrl, post.authorIsHost, post.authorIsVerifiedClient, post.authorIsOwner, post.authorIsAdmin);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 animate-fade-in sm:items-center"
      style={{ opacity: closing ? 0 : undefined, transition: 'opacity 220ms var(--ease-out-expo)' }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[80vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface animate-sheet-in sm:max-h-[70vh] sm:max-w-md sm:rounded-2xl"
        style={dragStyle}
      >
        <div {...dragHandlers} className="flex flex-col items-center pt-2 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-line" aria-hidden="true" />
        </div>
        <div {...dragHandlers} className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <SignalIdentityAvatar identity={identity} size={30} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-detail font-semibold text-ink">{identity.name}</p>
            <p className="truncate text-caption text-muted">{post.body}</p>
          </div>
          <button onClick={requestClose} aria-label="Close" className="pressable grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-panel">
            <Icon name="x" size={19} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {post.commentsDisabled ? (
            <p className="px-4 py-8 text-center text-detail text-muted">Comments are turned off for this post.</p>
          ) : (
            <SignalComments postId={post.id} canModerateAll={canModerateAll} onCountChanged={onCountChanged} />
          )}
        </div>
      </div>
    </div>
  );
}
