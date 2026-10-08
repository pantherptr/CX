import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { fetchPostPoll, voteEmpirePoll, type PostPoll } from '../../lib/data/empirePolls';
import { useApp } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { compact } from '../../lib/format';

/** A post's poll. Options are buttons until you vote; after that (or for the
 *  author) they become bars with each option's share. Who voted for what is
 *  never shown — only the totals — and you can change your vote. */
export function SignalPollView({ postId, isOwnPost }: { postId: string; isOwnPost: boolean }) {
  const { session } = useAuth();
  const { toast } = useApp();
  const [poll, setPoll] = useState<PostPoll | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPostPoll(postId).then((p) => { if (!cancelled) setPoll(p); });
    return () => { cancelled = true; };
  }, [postId]);

  if (!poll) return null;

  const showResults = poll.myVote !== null || isOwnPost;

  const vote = async (optionId: string) => {
    if (!session || busy || poll.myVote === optionId) return;
    const before = poll;
    const next: PostPoll = {
      ...poll,
      myVote: optionId,
      totalVotes: poll.myVote ? poll.totalVotes : poll.totalVotes + 1,
      options: poll.options.map((o) => ({
        ...o,
        mine: o.id === optionId,
        votes: o.votes + (o.id === optionId ? 1 : 0) - (o.id === poll.myVote ? 1 : 0),
      })),
    };
    setPoll(next);
    setBusy(true);
    const { error } = await voteEmpirePoll(optionId);
    setBusy(false);
    if (error) {
      setPoll(before);
      toast({ title: 'Could not vote', desc: error, icon: 'info' });
    }
  };

  return <PollBody poll={poll} showResults={showResults} canVote={Boolean(session)} onVote={(id) => void vote(id)} />;
}

/** The poll itself, drawn from data — also used on its own for previews. */
export function PollBody({ poll, showResults, canVote, onVote }: { poll: PostPoll; showResults: boolean; canVote: boolean; onVote: (optionId: string) => void }) {
  return (
    <div className="mx-4 mb-3 flex flex-col gap-2 sm:mx-5">
      {poll.options.map((o) => {
        const pct = poll.totalVotes > 0 ? Math.round((o.votes / poll.totalVotes) * 100) : 0;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onVote(o.id)}
            disabled={!canVote}
            className={`relative min-h-11 overflow-hidden rounded-xl border px-3.5 py-2.5 text-left text-[15px] transition-colors ${
              o.mine ? 'border-accent-bright bg-accent-050/60' : 'border-line bg-surface hover:border-line-strong'
            }`}
          >
            {showResults && (
              <span
                aria-hidden="true"
                className={`absolute inset-y-0 left-0 transition-[width] duration-500 ease-out ${o.mine ? 'bg-accent-bright/25' : 'bg-panel'}`}
                style={{ width: `${pct}%` }}
              />
            )}
            <span className="relative flex items-center justify-between gap-3">
              <span className={`flex min-w-0 items-center gap-2 ${o.mine ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>
                {o.mine && <Icon name="check" size={15} strokeWidth={3} className="shrink-0 text-accent-700" />}
                <span className="truncate">{o.label}</span>
              </span>
              {showResults && <span className="shrink-0 text-[14px] font-semibold tabular-nums text-ink-soft">{pct}%</span>}
            </span>
          </button>
        );
      })}
      <p className="px-0.5 text-caption text-faint">
        <span className="tabular-nums">{compact(poll.totalVotes)}</span> {poll.totalVotes === 1 ? 'vote' : 'votes'}
      </p>
    </div>
  );
}
