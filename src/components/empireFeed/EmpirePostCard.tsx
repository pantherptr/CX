import { useState } from 'react';
import { Icon } from '../Icon';
import { VerifiedBadge } from '../primitives';
import { useApp } from '../../lib/store';
import { compact } from '../../lib/format';
import {
  EMPIRE_CATEGORIES, toggleEmpirePostLike, toggleEmpirePostSave, deleteEmpirePost, setEmpirePostPinned,
  updateEmpirePost, type EmpirePost,
} from '../../lib/data/empireFeed';
import { EmpireMediaViewer } from './EmpireMediaViewer';
import { EmpireComments } from './EmpireComments';
import { EmpirePostComposer } from './EmpirePostComposer';

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const categoryLabel = (c: EmpirePost['category']) => EMPIRE_CATEGORIES.find((x) => x.value === c)?.label ?? c;

/** One post in the feed. Author badge, category chip, body, media grid,
 *  the like/comment/save/share row, and — only when the viewer is
 *  Owner/Admin — an overflow menu for edit/delete/pin/toggle-comments.
 *  The admin controls are a client-side convenience only; every action
 *  they trigger is re-checked server-side by the RPC it calls. */
export function EmpirePostCard({
  post,
  canManage,
  onChanged,
  onDeleted,
}: {
  post: EmpirePost;
  canManage: boolean;
  onChanged: (post: EmpirePost) => void;
  onDeleted: (postId: string) => void;
}) {
  const { toast } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const handleLike = async () => {
    onChanged({ ...post, likedByMe: !post.likedByMe, likeCount: post.likeCount + (post.likedByMe ? -1 : 1) });
    const { error } = await toggleEmpirePostLike(post.id);
    if (error) onChanged(post);
  };

  const handleSave = async () => {
    onChanged({ ...post, savedByMe: !post.savedByMe, saveCount: post.saveCount + (post.savedByMe ? -1 : 1) });
    const { error } = await toggleEmpirePostSave(post.id);
    if (error) onChanged(post);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/empire`;
    const shareData = { title: post.title || 'CX Rent — Empire', text: post.body.slice(0, 140), url };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // user cancelled — no error toast needed
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied to clipboard', icon: 'check' });
    }
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    setBusy(true);
    const { error } = await deleteEmpirePost(post.id);
    setBusy(false);
    if (error) toast({ title: 'Could not delete post', desc: error, icon: 'info' });
    else onDeleted(post.id);
  };

  const handlePinToggle = async () => {
    setMenuOpen(false);
    setBusy(true);
    const { error } = await setEmpirePostPinned(post.id, !post.isPinned);
    setBusy(false);
    if (error) toast({ title: 'Could not update pin', desc: error, icon: 'info' });
    else onChanged({ ...post, isPinned: !post.isPinned });
  };

  const handleToggleComments = async () => {
    setMenuOpen(false);
    setBusy(true);
    const { error } = await updateEmpirePost(post.id, {
      category: post.category,
      title: post.title ?? undefined,
      body: post.body,
      mediaPaths: post.mediaPaths,
      commentsDisabled: !post.commentsDisabled,
    });
    setBusy(false);
    if (error) toast({ title: 'Could not update comments', desc: error, icon: 'info' });
    else onChanged({ ...post, commentsDisabled: !post.commentsDisabled });
  };

  if (editing) {
    return (
      <EmpirePostComposer
        editing={post}
        onDone={(updated) => { setEditing(false); onChanged(updated); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <article className={`card mb-4 overflow-hidden p-0 ${post.isPinned ? 'ring-1 ring-accent-bright/40' : ''}`}>
      {post.isPinned && (
        <div className="flex items-center gap-1.5 border-b border-line bg-accent-050 px-4 py-1.5 text-caption font-semibold text-accent-700">
          <Icon name="pinned" size={12} fill /> Pinned
        </div>
      )}

      <div className="flex items-start gap-3 p-4 pb-3 sm:px-5">
        {post.authorAvatarUrl ? (
          <img src={post.authorAvatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-noir text-white">
            <Icon name="verified" size={18} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-display font-semibold text-ink">{post.authorName}</span>
            <VerifiedBadge role={post.authorRole} />
          </div>
          <p className="text-caption text-muted">
            {categoryLabel(post.category)} · {timeAgo(post.createdAt)}
            {post.editedAt && ' · Edited'}
          </p>
        </div>
        {canManage && (
          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Post options"
              disabled={busy}
              className="grid h-8 w-8 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel"
            >
              <Icon name="moreHorizontal" size={18} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-9 z-20 w-52 overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
                  <button onClick={() => { setMenuOpen(false); setEditing(true); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-detail text-ink hover:bg-panel">
                    <Icon name="edit" size={15} /> Edit post
                  </button>
                  <button onClick={handlePinToggle} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-detail text-ink hover:bg-panel">
                    <Icon name="pinned" size={15} /> {post.isPinned ? 'Unpin' : 'Pin to top'}
                  </button>
                  <button onClick={handleToggleComments} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-detail text-ink hover:bg-panel">
                    <Icon name="message" size={15} /> {post.commentsDisabled ? 'Enable comments' : 'Disable comments'}
                  </button>
                  <button onClick={handleDelete} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-detail text-danger hover:bg-danger/5">
                    <Icon name="trash" size={15} /> Delete post
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {post.title && <h3 className="px-4 pb-1 font-display text-lead font-semibold text-ink sm:px-5">{post.title}</h3>}
      <p className="whitespace-pre-wrap break-words px-4 pb-3 text-body leading-relaxed text-ink sm:px-5">{post.body}</p>

      {post.mediaUrls.length > 0 && (
        <div className={`grid gap-0.5 px-0 ${post.mediaUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {post.mediaUrls.map((url, i) => (
            <button
              key={url}
              onClick={() => setViewerIndex(i)}
              className={`overflow-hidden bg-panel ${post.mediaUrls.length === 1 ? 'aspect-video' : 'aspect-square'}`}
            >
              <img src={url} alt="" className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.03]" />
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 px-2 py-1.5 sm:px-3">
        <button onClick={handleLike} className="pressable flex items-center gap-1.5 rounded-full px-3 py-2 text-detail font-medium text-ink-soft transition-colors hover:bg-panel">
          <Icon name="heart" size={18} fill={post.likedByMe} className={post.likedByMe ? 'text-[#e2384d]' : ''} />
          {post.likeCount > 0 && compact(post.likeCount)}
        </button>
        <button onClick={() => setCommentsOpen((v) => !v)} className="pressable flex items-center gap-1.5 rounded-full px-3 py-2 text-detail font-medium text-ink-soft transition-colors hover:bg-panel">
          <Icon name="message" size={17} />
          {post.commentCount > 0 && compact(post.commentCount)}
        </button>
        <button onClick={handleSave} className="pressable flex items-center gap-1.5 rounded-full px-3 py-2 text-detail font-medium text-ink-soft transition-colors hover:bg-panel">
          <Icon name="bookmark" size={17} fill={post.savedByMe} className={post.savedByMe ? 'text-accent-700' : ''} />
          {post.saveCount > 0 && compact(post.saveCount)}
        </button>
        <button onClick={handleShare} className="pressable ml-auto flex items-center gap-1.5 rounded-full px-3 py-2 text-detail font-medium text-ink-soft transition-colors hover:bg-panel">
          <Icon name="share" size={17} />
        </button>
      </div>

      {commentsOpen && (
        <EmpireComments postId={post.id} disabled={post.commentsDisabled} onCommentAdded={() => onChanged({ ...post, commentCount: post.commentCount + 1 })} />
      )}

      {viewerIndex !== null && (
        <EmpireMediaViewer images={post.mediaUrls} startIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </article>
  );
}
