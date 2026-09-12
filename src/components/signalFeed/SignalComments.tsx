import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { useApp } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { VerifiedBadge } from '../primitives';
import {
  fetchEmpirePostComments, addEmpireComment, deleteEmpireComment, reportEmpireContent,
  type EmpireComment,
} from '../../lib/data/empireFeed';

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function Avatar({ url, size = 28 }: { url: string | null; size?: number }) {
  const style = { height: size, width: size };
  if (url) return <img src={url} alt="" className="shrink-0 rounded-full object-cover" style={style} />;
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-panel text-ink-soft" style={style}>
      <Icon name="user" size={Math.round(size * 0.5)} />
    </span>
  );
}

/** A compact, flat comment list — no nested replies, matching the brief's
 *  "keep comments clean and compact." Revived from scratch (the old
 *  component was deleted when comments were removed from Signal
 *  entirely) since community posts now need them back. Optimistic append
 *  on submit — the new comment shows immediately with the caller's own
 *  known identity, no spinner-blocking — with rollback if the RPC
 *  rejects it (comments_disabled flipped mid-type, etc). */
export function SignalComments({
  postId,
  canModerateAll = false,
  onCountChanged,
}: {
  postId: string;
  /** Owner/Admin — can delete anyone's comment, not just their own. */
  canModerateAll?: boolean;
  onCountChanged?: (delta: number) => void;
}) {
  const { profile, session } = useAuth();
  const { toast } = useApp();
  const [comments, setComments] = useState<EmpireComment[] | null>(null);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEmpirePostComments(postId)
      .then((rows) => { if (!cancelled) setComments(rows); })
      .catch(() => { if (!cancelled) setComments([]); });
    return () => { cancelled = true; };
  }, [postId]);

  const handleSubmit = async () => {
    const text = body.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setBody('');
    const optimistic: EmpireComment = {
      id: `pending-${crypto.randomUUID()}`,
      postId,
      userId: session?.user.id ?? '',
      authorName: profile?.full_name || 'You',
      authorAvatarUrl: profile?.avatar_url ?? null,
      authorIsOwner: Boolean(profile?.is_owner),
      authorIsAdmin: Boolean(profile?.is_admin),
      authorIsHost: Boolean(profile?.is_host),
      authorIsVerifiedClient: false,
      body: text,
      createdAt: new Date().toISOString(),
    };
    setComments((prev) => [...(prev ?? []), optimistic]);
    onCountChanged?.(1);
    const { comment, error } = await addEmpireComment(postId, text);
    setSubmitting(false);
    if (error || !comment) {
      setComments((prev) => (prev ?? []).filter((c) => c.id !== optimistic.id));
      onCountChanged?.(-1);
      toast({ title: 'Could not post your comment', desc: error ?? undefined, icon: 'info' });
      return;
    }
    setComments((prev) => (prev ?? []).map((c) => (c.id === optimistic.id ? { ...optimistic, id: comment.id } : c)));
  };

  const handleDelete = async (commentId: string) => {
    setOpenMenuId(null);
    const prev = comments;
    setComments((p) => (p ?? []).filter((c) => c.id !== commentId));
    onCountChanged?.(-1);
    const { error } = await deleteEmpireComment(commentId);
    if (error) {
      setComments(prev);
      onCountChanged?.(1);
      toast({ title: 'Could not delete comment', desc: error, icon: 'info' });
    }
  };

  const handleReport = async (commentId: string) => {
    setOpenMenuId(null);
    const { error } = await reportEmpireContent({ commentId }, 'Reported from Signal');
    toast(error ? { title: 'Could not send report', desc: error, icon: 'info' } : { title: 'Comment reported', icon: 'check' });
  };

  return (
    <div className="px-4 py-3 sm:px-5">
      <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-muted">
        Comments{comments && comments.length > 0 ? ` (${comments.length})` : ''}
      </p>

      {comments === null ? (
        <div className="space-y-2">
          <div className="skeleton h-10 rounded-xl" />
          <div className="skeleton h-10 rounded-xl" />
        </div>
      ) : comments.length === 0 ? (
        <p className="py-2 text-caption text-muted">Be the first to comment.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map((c) => {
            const isMine = c.userId === session?.user.id;
            const role = c.authorIsOwner ? 'owner' : c.authorIsAdmin ? 'admin' : c.authorIsHost ? 'host' : c.authorIsVerifiedClient ? 'client' : null;
            return (
              <div key={c.id} className="group flex items-start gap-2.5">
                <Avatar url={c.authorAvatarUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="text-detail font-semibold text-ink">{c.authorName}</span>
                    {role && <VerifiedBadge role={role} size={12} />}
                    <span className="text-caption text-muted">{timeAgo(c.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-detail leading-snug text-ink-soft">{c.body}</p>
                </div>
                <div className="relative shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => setOpenMenuId((v) => (v === c.id ? null : c.id))}
                    aria-label="Comment options"
                    className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-panel"
                  >
                    <Icon name="moreHorizontal" size={14} />
                  </button>
                  {openMenuId === c.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                      <div className="absolute right-0 top-8 z-20 w-36 overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
                        {isMine || canModerateAll ? (
                          <button onClick={() => handleDelete(c.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-caption text-danger hover:bg-danger/5">
                            <Icon name="trash" size={13} /> Delete
                          </button>
                        ) : (
                          <button onClick={() => handleReport(c.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-caption text-ink hover:bg-panel">
                            <Icon name="info" size={13} /> Report
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Avatar url={profile?.avatar_url ?? null} size={26} />
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder="Add a comment…"
          className="input !py-2 flex-1 text-detail"
        />
        <button
          onClick={handleSubmit}
          disabled={!body.trim() || submitting}
          aria-label="Post comment"
          className="pressable grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-white disabled:opacity-30"
        >
          <Icon name="send" size={15} />
        </button>
      </div>
    </div>
  );
}
