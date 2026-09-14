import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { useApp } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { resolveSignalIdentity, SIGNAL_PUBLISHER_TYPES, type SignalPublisherType } from '../../lib/data/signalIdentity';
import { SignalIdentityAvatar, SignalIdentityBadge } from './SignalIdentityBadge';
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

/** A compact, flat comment list — no nested replies. Creation is
 *  Owner-only (see 0057_signal_owner_only_comments.sql) — everyone else
 *  reads. Each comment carries its own `publisherType` (the identity the
 *  Owner chose at write time: Owner / CX Assistant / CX Rent, or 'self'
 *  for anything written before this rule existed), resolved through the
 *  exact same `resolveSignalIdentity` a post already uses — one identity
 *  system, not a second one for comments. Optimistic append on submit,
 *  with rollback if the RPC rejects it (comments_disabled flipped
 *  mid-type, etc). */
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
  const [publisherType, setPublisherType] = useState<SignalPublisherType>('owner');
  const [identityPickerOpen, setIdentityPickerOpen] = useState(false);
  // Strictly the real Owner — not Admin. A comment "as CX Assistant" is
  // still always written by the Owner's own account; there is no
  // separate CX Assistant login that gains this permission (see the
  // migration's own comment for why is_owner(), not is_admin()).
  const canComment = Boolean(profile?.is_owner);
  const selfIdentity = resolveSignalIdentity(publisherType, profile?.full_name || 'Owner', profile?.avatar_url ?? null);

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
      authorName: profile?.full_name || 'Owner',
      authorAvatarUrl: profile?.avatar_url ?? null,
      authorIsOwner: Boolean(profile?.is_owner),
      authorIsAdmin: Boolean(profile?.is_admin),
      authorIsHost: false,
      authorIsVerifiedClient: false,
      publisherType,
      body: text,
      createdAt: new Date().toISOString(),
    };
    setComments((prev) => [...(prev ?? []), optimistic]);
    onCountChanged?.(1);
    const { comment, error } = await addEmpireComment(postId, text, publisherType);
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
        <p className="py-2 text-caption text-muted">{canComment ? 'Be the first to comment.' : 'No comments yet.'}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map((c) => {
            const isMine = c.userId === session?.user.id;
            const identity = resolveSignalIdentity(c.publisherType, c.authorName, c.authorAvatarUrl, c.authorIsHost, c.authorIsVerifiedClient, c.authorIsOwner, c.authorIsAdmin);
            return (
              <div key={c.id} className="group flex items-start gap-2.5">
                <SignalIdentityAvatar identity={identity} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="text-detail font-semibold text-ink">{identity.name}</span>
                    <SignalIdentityBadge identity={identity} size={12} />
                    <span className="text-caption text-muted">{timeAgo(c.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-detail leading-snug text-ink-soft">{c.body}</p>
                </div>
                {/* Always visible at a quiet opacity, not hover-only — a
                    `group-hover`-gated reveal never appears at all on a
                    touch device, which made a comment's own Delete/Report
                    effectively unreachable there. */}
                <div className="relative shrink-0 opacity-60 transition-opacity hover:opacity-100">
                  <button
                    onClick={() => setOpenMenuId((v) => (v === c.id ? null : c.id))}
                    aria-label="Comment options"
                    className="pressable grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-panel"
                  >
                    <Icon name="moreHorizontal" size={14} />
                  </button>
                  {openMenuId === c.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                      <div className="absolute right-0 top-8 z-20 w-36 overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
                        {isMine || canModerateAll ? (
                          <button onClick={() => handleDelete(c.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-caption text-danger transition-colors hover:bg-danger/5 active:bg-danger/5">
                            <Icon name="trash" size={13} /> Delete
                          </button>
                        ) : (
                          <button onClick={() => handleReport(c.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-caption text-ink transition-colors hover:bg-panel active:bg-panel">
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

      {canComment && (
        <div className="mt-3">
          {/* Only the Owner ever sees this — the choice of which of the
              three official voices this comment publishes as. */}
          <div className="relative mb-2 inline-block">
            <button
              onClick={() => setIdentityPickerOpen((v) => !v)}
              aria-expanded={identityPickerOpen}
              className="pressable flex items-center gap-1.5 rounded-full border border-line py-1 pl-1 pr-2.5 text-caption font-semibold text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
            >
              <SignalIdentityAvatar identity={selfIdentity} size={18} />
              Comment as {selfIdentity.name}
              <Icon name="chevronDown" size={12} />
            </button>
            {identityPickerOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIdentityPickerOpen(false)} />
                <div className="absolute left-0 top-9 z-20 w-48 overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
                  {SIGNAL_PUBLISHER_TYPES.map((type) => {
                    const identity = resolveSignalIdentity(type, profile?.full_name || 'Owner', profile?.avatar_url ?? null);
                    return (
                      <button
                        key={type}
                        onClick={() => { setPublisherType(type); setIdentityPickerOpen(false); }}
                        className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-detail font-medium transition-colors ${
                          type === publisherType ? 'bg-accent-050 text-accent-700' : 'text-ink hover:bg-panel'
                        }`}
                      >
                        <SignalIdentityAvatar identity={identity} size={22} />
                        {identity.name}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <SignalIdentityAvatar identity={selfIdentity} size={26} />
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
      )}
    </div>
  );
}
