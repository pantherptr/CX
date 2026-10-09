import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../Icon';
import { Img } from '../motion';
import { searchEmpirePosts, type EmpirePost } from '../../lib/data/empireFeed';
import { searchSignalPeople, type SignalPeopleResult } from '../../lib/data/signalProfile';
import { VerifiedBadge, type VerifiedRole } from '../primitives';
import { FollowButton } from './FollowButton';
import { Tap, motion, AnimatePresence, useReducedMotion, useHideForNavigation, TRANSITION_STANDARD } from '../motionKit';

function personRole(p: SignalPeopleResult): VerifiedRole | null {
  return p.isOwner ? 'owner' : p.isAdmin ? 'admin' : p.isHost ? 'host' : p.isVerifiedClient ? 'client' : null;
}

/** "3h" / "2d" / "7 Oct" — the same short age every other SIGNAL surface uses. */
function resultAge(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
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
export function SignalSearchOverlay({ query }: { query: string }) {
  const reduceMotion = useReducedMotion();
  const { pathname } = useLocation();
  const profileBase = pathname.startsWith('/signal/community') ? '/signal/community' : '/signal';
  const { hidden, hideForNavigation } = useHideForNavigation(pathname);
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
    <motion.div
      className="fixed inset-x-0 bottom-0 top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-[250] lg:top-16 flex flex-col bg-bg"
      role="dialog"
      aria-modal="true"
      aria-label="Search results"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
    >
      <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] pt-4">
        {!trimmed ? (
          recent.length > 0 ? (
            <div>
              <p className="mb-2 px-1 text-detail font-semibold text-muted">Recent</p>
              <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-hair">
                {recent.map((r) => (
                  <div key={r.id} className="group flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-0 active:bg-panel">
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
                          className="h-11 w-11 shrink-0 rounded-full object-cover"
                          fallback={<span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={18} /></span>}
                        />
                      ) : (
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={18} /></span>
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
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-faint transition-colors hover:bg-line/40 hover:text-ink-soft"
                    >
                      <Icon name="x" size={13} />
                    </Tap>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="search" size={24} /></span>
              <p className="max-w-[16rem] text-detail text-muted">Search Signal — people, news, cars, offers…</p>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-2 px-1 text-detail font-semibold text-muted">People</p>
              <ResultsFade stateKey={peopleState}>
                {peopleState === 'loading' ? (
                  <div className="flex flex-col gap-2">
                    {[0, 1].map((i) => <div key={i} className="skeleton h-12 w-full rounded-xl" />)}
                  </div>
                ) : peopleState === 'empty' ? (
                  <p className="py-4 text-center text-detail text-muted">No accounts found.</p>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-hair">
                    {(people ?? []).map((p) => {
                      const role = personRole(p);
                      return (
                        <div key={p.id} className="flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-0 active:bg-panel">
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
                                className="h-12 w-12 shrink-0 rounded-full object-cover"
                                fallback={<span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={19} /></span>}
                              />
                            ) : (
                              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-panel text-ink-soft"><Icon name="user" size={19} /></span>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="truncate text-[15px] font-semibold text-ink">{p.fullName}</span>
                                {role && <VerifiedBadge role={role} size={16} />}
                              </div>
                              <p className="truncate text-caption text-faint">
                                {p.username && `@${p.username}`}
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
              <p className="mb-2 px-1 text-detail font-semibold text-muted">Posts</p>
              <ResultsFade stateKey={postsState}>
                {postsState === 'loading' ? (
                  <div className="flex flex-col gap-2">
                    {[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 w-full rounded-xl" />)}
                  </div>
                ) : postsState === 'empty' ? (
                  <p className="py-4 text-center text-detail text-muted">No Signal posts match “{trimmed}”.</p>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-hair">
                    {(posts ?? []).map((r) => (
                      <Link
                        key={r.id}
                        to={`/signal/post/${r.id}`}
                        viewTransition
                        onClick={hideForNavigation}
                        className="pressable flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-0 active:bg-panel"
                      >
                        {r.mediaUrls[0] ? (
                          <Img
                            src={r.mediaUrls[0]}
                            alt=""
                            className="h-14 w-14 shrink-0 rounded-xl object-cover"
                            fallback={<span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-panel text-muted"><Icon name="image" size={18} /></span>}
                          />
                        ) : (
                          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-panel text-muted"><Icon name="image" size={18} /></span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{r.title || r.body || 'Photo / Video'}</p>
                          <p className="mt-0.5 truncate text-caption text-muted">{r.authorName} · {resultAge(r.createdAt)}</p>
                        </div>
                        <Icon name="chevronRight" size={16} className="shrink-0 text-faint" />
                      </Link>
                    ))}
                  </div>
                )}
              </ResultsFade>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
