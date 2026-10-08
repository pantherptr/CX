import { supabase } from '../supabase';

export interface PollOption {
  id: string;
  label: string;
  votes: number;
  mine: boolean;
}
export interface PostPoll {
  id: string;
  options: PollOption[];
  /** The option you voted for, if any. */
  myVote: string | null;
  totalVotes: number;
}

interface PollRow {
  post_id: string;
  poll_id: string;
  option_id: string;
  label: string;
  option_position: number;
  votes: number;
  my_vote: boolean;
}

function group(rows: PollRow[]): Map<string, PostPoll> {
  const out = new Map<string, PostPoll>();
  for (const r of rows) {
    let poll = out.get(r.post_id);
    if (!poll) {
      poll = { id: r.poll_id, options: [], myVote: null, totalVotes: 0 };
      out.set(r.post_id, poll);
    }
    poll.options.push({ id: r.option_id, label: r.label, votes: r.votes, mine: r.my_vote });
    poll.totalVotes += r.votes;
    if (r.my_vote) poll.myVote = r.option_id;
  }
  return out;
}

// A feed shows many posts at once, so each post's poll lookup joins one shared
// request (a short collect window) instead of firing its own.
let queue: { id: string; resolve: (p: PostPoll | null) => void }[] = [];
let timer: number | undefined;
const cache = new Map<string, PostPoll | null>();

export function fetchPostPoll(postId: string, force = false): Promise<PostPoll | null> {
  if (!force && cache.has(postId)) return Promise.resolve(cache.get(postId) ?? null);
  return new Promise((resolve) => {
    queue.push({ id: postId, resolve });
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const batch = queue;
      queue = [];
      const ids = [...new Set(batch.map((b) => b.id))];
      const { data, error } = await supabase.rpc('fetch_empire_polls', { p_post_ids: ids });
      const grouped = error ? new Map<string, PostPoll>() : group((data ?? []) as PollRow[]);
      for (const id of ids) cache.set(id, grouped.get(id) ?? null);
      for (const b of batch) b.resolve(grouped.get(b.id) ?? null);
    }, 40);
  });
}

export async function createEmpirePoll(postId: string, options: string[]): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('create_empire_poll', { p_post_id: postId, p_options: options });
  if (error) return { error: error.message };
  cache.delete(postId);
  return { error: null };
}

export async function voteEmpirePoll(optionId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('vote_empire_poll', { p_option_id: optionId });
  return { error: error?.message ?? null };
}
