import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../Icon';
import { Img } from '../motion';
import { searchEmpirePosts, type EmpirePost } from '../../lib/data/empireFeed';
import { searchSignalPeople, type SignalPeopleResult } from '../../lib/data/signalProfile';
import { VerifiedBadge, type VerifiedRole } from '../primitives';
import { FollowButton } from './FollowButton';
import { Tap, motion, AnimatePresence, useReducedMotion, useHideForNavigation, TRANSITION_STANDARD } from '../motionKit';

const ROLE_LABEL: Record<VerifiedRole, string> = {
  owner: 'Owner', owner_assistant: 'Owner', admin: 'Admin', host: 'Host', client: 'Verified Client', assistant: 'Assistant',
};

function personRole(p: SignalPeopleResult): VerifiedRole | null {
  return p.isOwner ? 'owner' : p.isAdmin ? 'admin' : p.isHost ? 'host' : p.isVerifiedClient ? 'client' : null;
}

const RECENT_KEY = 'signal:recentPeopleSearches';
const RECENT_MAX = 5;

interface RecentPerson {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  username: string | null;
}

function loadRecent(): RecentPerson[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as RecentPerson[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(list: RecentPerson[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Private-browsing / storage-disabled — recent searches just won't persist.
  }
}

/** A single crossfade between whatever this section currently renders —
 *  a loading skeleton, an empty state, or the real result list — keyed
 *  by `stateKey` so it only plays once per genuine state change (the
 *  debounced fetch settling), never per keystroke. */
function ResultsFade({ stateKey, children }: { stateKey: string; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    // No `mode="wait"` — the new state fades in while the old one fades
    // out (Motion's default), so a loading->results swap reads as
    // instant, not as two sequential 220ms animations stacked end to end.
    <AnimatePresence initial={false}>
      <motion.div
        key={stateKey}
        initial={reduceMotion ? undefined : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={TRANSITION_STANDARD}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/** A lightweight fullscreen search — not a separate page. Two ranked,
 *  server-side searches run off the same query: people
 *  (`search_signal_people`, exact/starts-with/contains over
 *  username/name) and Official Signal posts (`search_empire_posts`,
 *  unchanged). Empty query shows only a small "Recent" people shelf
 *  (real taps this browser made, nothing fabricated) — no "browse
 *  everyone" behavior either way.
 *
 *  Opening a result (a profile or a post) doesn't close this overlay —
 *  it hides (via `useHideForNavigation`, the same primitive
 *  SignalStoryViewer uses for its own Story -> Profile -> Story flow)
 *  while staying mounted, so the query, results, and scroll position are
 *  all still exactly there when the user backs out of whatever they
 *  opened. The explicit close button (top-left) is the only thing that
 *  actually unmounts it. */
export function SignalSearchOverlay({ onClose }: { onClose: () => void }) {
  const { pathname } = useLocation();
  const profileBase = pathname.startsWith('/signal/community') ? '/signal/community' : '/signal';
  const { hidden, hideForNavigation } = useHideForNavigation(pathname);
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<SignalPeopleResult[] | null>(null);
  const [peopleSearching, setPeopleSearching] = useState(false);
  const [posts, setPosts] = useState<EmpirePost[] | null>(null);
  const [postsSearching, setPostsSearching] = useState(false);
  const [recent, setRecent] = useState<RecentPerson[]>(() => loadRecent());
  // Guards against an out-of-order response: if the query changes again
  // before a fetch resolves, that fetch's result is stale the moment it
  // lands and must never overwrite whatever the CURRENT query already
  // showed — without this, a slow response for an earlier, shorter query
  // could arrive after a faster one for the current query and clobber it.
  const requestIdRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setPeople(null);
      setPosts(null);
      return;
    }
    setPeopleSearching(true);
    setPostsSearching(true);
    const handle = window.setTimeout(() => {
      const requestId = ++requestIdRef.current;
      searchSignalPeople(q)
        .then((rows) => { if (requestIdRef.current === requestId) setPeople(rows); })
        .catch(() => { if (requestIdRef.current === requestId) setPeople([]); })
        .finally(() => { if (requestIdRef.current === requestId) setPeopleSearching(false); });
      searchEmpirePosts(q)
        .then((rows) => { if (requestIdRef.current === requestId) setPosts(rows); })
        .catch(() => { if (requestIdRef.current === requestId) setPosts([]); })
        .finally(() => { if (requestIdRef.current === requestId) setPostsSearching(false); });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [query]);

  if (hidden) return null;

  const rememberPerson = (p: SignalPeopleResult) => {
    const entry: RecentPerson = { id: p.id, fullName: p.fullName, avatarUrl: p.avatarUrl, username: p.username };
    const next = [entry, ...recent.filter((r) => r.id !== p.id)].slice(0, RECENT_MAX);
    setRecent(next);
    saveRecent(next);
  };

  const removeRecent = (id: string) => {
    const next = recent.filter((r) => r.id !== id);
    setRecent(next);
    saveRecent(next);
  };

  const trimmed = query.trim();
  const peopleState = peopleSearching ? 'loading' : !people ? 'idle' : people.length === 0 ? 'empty' : 'results';
  const postsState = postsSearching ? 'loading' : !posts ? 'idle' : posts.length === 0 ? 'empty' : 'results';

  return (
    <div className="fixed inset-0 z-[250] flex flex-col bg-bg animate-scale-in" role="dialog" aria-modal="true">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 pt-safe">
        <button onClick={onClose} aria-label="Close search" className="pressable grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-panel">
          <Icon name="chevronLeft" size={20} />
        </button>
        <div className="relative flex-1">
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, news, cars, offers…"
            className="input !py-2 !pl-9"
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="search"
          />
        </div>
      </div>

      <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-4 py-3">
        {!trimmed ? (
          recent.length > 0 ? (
            <div>
              <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-faint">Recent</p>
              <div className="flex flex-col gap-1">
                {recent.map((r) => (
                  <div key={r.id} className="group flex items-center gap-2.5 rounded-xl px-1 py-1.5 hover:bg-panel">
                    <Link
                      to={`${profileBase}/profile/${r.id}`}
                      viewTransition
                      onClick={hideForNavigation}
                      className="flex min-w-0 flex-1 items-center gap-2.5"
                    >
                      {r.avatarUrl ? (
                        <Img
                          src={r.avatarUrl}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded-full object-cover"
                          fallback={<span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={16} /></span>}
                        />
                      ) : (
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={16} /></span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-detail font-semibold text-ink">{r.fullName}</p>
                        {r.username && <p className="truncate text-caption text-faint">@{r.username}</p>}
                      </div>
                    </Link>
                    <Tap
                      onClick={() => removeRecent(r.id)}
                      scale={0.9}
                      aria-label={`Remove ${r.fullName} from recent searches`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-faint opacity-0 transition-opacity hover:bg-line/40 hover:text-ink-soft group-hover:opacity-100"
                    >
                      <Icon name="x" size={13} />
                    </Tap>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="py-16 text-center text-detail text-muted">Search Signal — people, news, cars, offers…</p>
          )
        ) : (
          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-faint">People</p>
              <ResultsFade stateKey={peopleState}>
                {peopleState === 'loading' ? (
                  <div className="flex flex-col gap-2">
                    {[0, 1].map((i) => <div key={i} className="skeleton h-12 w-full rounded-xl" />)}
                  </div>
                ) : peopleState === 'empty' ? (
                  <p className="py-4 text-center text-detail text-muted">No accounts found.</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {(people ?? []).map((p) => {
                      const role = personRole(p);
                      return (
                        <div key={p.id} className="flex items-center gap-2.5 rounded-xl px-1 py-1.5 hover:bg-panel">
                          <Link
                            to={`${profileBase}/profile/${p.id}`}
                            viewTransition
                            onClick={() => { rememberPerson(p); hideForNavigation(); }}
                            className="flex min-w-0 flex-1 items-center gap-2.5"
                          >
                            {p.avatarUrl ? (
                              <Img
                                src={p.avatarUrl}
                                alt=""
                                className="h-10 w-10 shrink-0 rounded-full object-cover"
                                fallback={<span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={17} /></span>}
                              />
                            ) : (
                              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={17} /></span>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="truncate text-detail font-semibold text-ink">{p.fullName}</span>
                                {role && <VerifiedBadge role={role} size={13} />}
                              </div>
                              <p className="truncate text-caption text-faint">
                                {p.username && `@${p.username}`}
                                {p.username && role ? ' · ' : ''}
                                {role && ROLE_LABEL[role]}
                              </p>
                            </div>
                          </Link>
                          {(p.isHost || p.isVerifiedClient) && (
                            <FollowButton userId={p.id} initialFollowing={p.followedByMe} size="sm" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </ResultsFade>
            </div>

            <div>
              <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-faint">Posts</p>
              <ResultsFade stateKey={postsState}>
                {postsState === 'loading' ? (
                  <div className="flex flex-col gap-2">
                    {[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 w-full rounded-xl" />)}
                  </div>
                ) : postsState === 'empty' ? (
                  <p className="py-4 text-center text-detail text-muted">No Signal posts match “{trimmed}”.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {(posts ?? []).map((r) => (
                      <Link
                        key={r.id}
                        to={`/signal/post/${r.id}`}
                        viewTransition
                        onClick={hideForNavigation}
                        className="pressable flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5 hover:border-line-strong"
                      >
                        {r.mediaUrls[0] ? (
                          <Img
                            src={r.mediaUrls[0]}
                            alt=""
                            className="h-12 w-12 shrink-0 rounded-lg object-cover"
                            fallback={<span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-panel text-muted"><Icon name="image" size={16} /></span>}
                          />
                        ) : (
                          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-panel text-muted"><Icon name="image" size={16} /></span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-detail font-semibold text-ink">{r.title || r.body}</p>
                          <p className="text-caption text-muted">{r.category.replace('_', ' ')}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </ResultsFade>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
