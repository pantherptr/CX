import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { fetchPostPoll, voteEmpirePoll, addEmpirePollVotes, clearMyPollVotes, type PostPoll } from '../../lib/data/empirePolls';
import { tapAmount } from '../../lib/teamTapMode';
import { useApp } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { compact } from '../../lib/format';
import { useLocale } from '../../lib/i18n';

/** A post's poll. Options are buttons until you vote; after that (or for the
 *  author) they become bars with each option's share. Who voted for what is
 *  never shown — only the totals — and you can change your vote. */
export function SignalPollView({ postId, isOwnPost }: { postId: string; isOwnPost: boolean }) {
  const { t } = useLocale();
  const { session, profile } = useAuth();
  const isTeam = Boolean(profile?.is_owner || profile?.is_admin);
  const { toast } = useApp();
  const [poll, setPoll] = useState<PostPoll | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPostPoll(postId).then((p) => { if (!cancelled) setPoll(p); });
    return () => { cancelled = true; };
  }, [postId]);

  if (!poll) return null;

  const showResults = poll.myVote !== null || isOwnPost || isTeam;

  // Owner/Admin: every tap on an option stacks more votes on it (one by
  // one, or doubling that option's own votes — see teamTapMode).
  const teamVote = async (optionId: string) => {
    if (!session || busy) return;
    const before = poll;
    const have = poll.options.find((o) => o.id === optionId)?.myVotes ?? 0;
    const amt = tapAmount(have);
    setPoll({
      ...poll,
      myVote: optionId,
      totalVotes: poll.totalVotes + amt,
      options: poll.options.map((o) => (o.id === optionId ? { ...o, mine: true, votes: o.votes + amt, myVotes: o.myVotes + amt } : o)),
    });
    setBusy(true);
    const { error } = await addEmpirePollVotes(optionId, amt);
    setBusy(false);
    if (error) {
      setPoll(before);
      toast({ title: 'Could not vote', desc: error, icon: 'info' });
    }
  };
  const clearVotes = async () => {
    const before = poll;
    const mineTotal = poll.options.reduce((n, o) => n + o.myVotes, 0);
    setPoll({
      ...poll,
      myVote: null,
      totalVotes: Math.max(0, poll.totalVotes - mineTotal),
      options: poll.options.map((o) => ({ ...o, mine: false, votes: Math.max(0, o.votes - o.myVotes), myVotes: 0 })),
    });
    const { error } = await clearMyPollVotes(poll.id);
    if (error) {
      setPoll(before);
      toast({ title: 'Could not remove your votes', desc: error, icon: 'info' });
    }
  };

  const vote = async (optionId: string) => {
    if (isTeam) return teamVote(optionId);
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

  const myTotal = poll.options.reduce((n, o) => n + o.myVotes, 0);
  return (
    <>
      <PollBody poll={poll} showResults={showResults} canVote={Boolean(session)} onVote={(id) => void vote(id)} showMine={isTeam} />
      {isTeam && myTotal > 0 && (
        <button type="button" onClick={() => void clearVotes()} className="pressable -mt-1 mb-3 ml-4 text-caption font-semibold text-danger sm:ml-5">
          {t('Remove my votes ({count})', { count: myTotal })}
        </button>
      )}
    </>
  );
}

/** The poll itself, drawn from data — also used on its own for previews. */
export function PollBody({ poll, showResults, canVote, onVote, showMine = false }: { poll: PostPoll; showResults: boolean; canVote: boolean; onVote: (optionId: string) => void; showMine?: boolean }) {
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
                {showMine && o.myVotes > 1 && <span className="shrink-0 rounded-full bg-accent-bright/20 px-1.5 text-caption font-bold tabular-nums text-accent-700">×{o.myVotes}</span>}
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
