import { useState } from 'react';
import { Icon } from '../Icon';
import { useAuth } from '../../lib/auth';
import { useEmpirePostComments, addEmpireComment, deleteEmpireComment } from '../../lib/data/empireFeed';

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

/** Flat (non-threaded) comment list for one post — mounted only while
 *  the card's comment section is expanded, so a feed full of posts
 *  doesn't fetch every post's comments up front. */
export function EmpireComments({ postId, disabled, onCommentAdded }: { postId: string; disabled: boolean; onCommentAdded?: () => void }) {
  const { session, profile } = useAuth();
  const { comments, refresh } = useEmpirePostComments(postId);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!body.trim()) return;
    setSubmitting(true);
    const { error } = await addEmpireComment(postId, body.trim());
    setSubmitting(false);
    if (!error) {
      setBody('');
      refresh();
      onCommentAdded?.();
    }
  };

  const remove = async (commentId: string) => {
    const { error } = await deleteEmpireComment(commentId);
    if (!error) refresh();
  };

  return (
    <div className="border-t border-line px-4 py-3 sm:px-5">
      {comments === null ? (
        <p className="py-2 text-caption text-muted">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="py-2 text-caption text-muted">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2.5">
              {c.authorAvatarUrl ? (
                <img src={c.authorAvatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-panel text-ink-soft">
                  <Icon name="user" size={13} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-detail leading-snug text-ink">
                  <span className="font-semibold">{c.authorName}</span>{' '}
                  <span className="text-caption text-muted">· {timeAgo(c.createdAt)}</span>
                </p>
                <p className="whitespace-pre-wrap break-words text-detail text-ink-soft">{c.body}</p>
              </div>
              {(c.userId === session?.user.id || profile?.is_admin || profile?.is_owner) && (
                <button
                  onClick={() => remove(c.id)}
                  aria-label="Delete comment"
                  className="shrink-0 text-muted transition-colors hover:text-danger"
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && session && (
        <div className="mt-3 flex items-center gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Add a comment…"
            className="input !py-2 flex-1 text-detail"
          />
          <button
            onClick={submit}
            disabled={submitting || !body.trim()}
            aria-label="Post comment"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-white transition-opacity disabled:opacity-30"
          >
            <Icon name="send" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
