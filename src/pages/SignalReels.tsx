import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Img } from '../components/motion';
import { RespectIcon } from '../components/RespectIcon';
import { setChromeOverride } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { useLocale } from '../lib/i18n';
import { shareLink } from '../lib/native';
import {
  fetchForYouFeed, fetchEmpirePostsByAuthor, mediaKindFromPath, toggleEmpirePostLike, toggleEmpirePostSave, incrementEmpirePostShare,
  type EmpirePost,
} from '../lib/data/empireFeed';

const MUTE_KEY = 'cx-reels-muted';

function videoUrlOf(p: EmpirePost): string | null {
  const i = p.mediaPaths.findIndex((m) => mediaKindFromPath(m) === 'video');
  return i >= 0 ? p.mediaUrls[i] ?? null : null;
}

function Reel({ post, active, muted, onToggleMute, onChange }: {
  post: EmpirePost; active: boolean; muted: boolean; onToggleMute: () => void; onChange: (p: EmpirePost) => void;
}) {
  const { t } = useLocale();
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [burst, setBurst] = useState(0);
  const [fire, setFire] = useState(0);
  const [more, setMore] = useState(false);
  const lastTap = useRef(0);
  const src = videoUrlOf(post);

  // Plays only while it is the reel on screen; one reel at a time.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (active && !paused) void v.play().catch(() => {});
    else v.pause();
    if (!active) { v.currentTime = 0; setPaused(false); setProgress(0); }
  }, [active, paused]);

  const respect = useCallback(async (force?: boolean) => {
    if (force && post.likedByMe) return;
    setFire(Date.now());
    onChange({ ...post, likedByMe: !post.likedByMe, likeCount: post.likeCount + (post.likedByMe ? -1 : 1) });
    const r = await toggleEmpirePostLike(post.id);
    if (r.error) onChange(post);
  }, [post, onChange]);
  const save = async () => {
    onChange({ ...post, savedByMe: !post.savedByMe, saveCount: post.saveCount + (post.savedByMe ? -1 : 1) });
    const r = await toggleEmpirePostSave(post.id);
    if (r.error) onChange(post);
  };
  const share = async () => {
    const res = await shareLink({ title: post.authorName, text: post.body.slice(0, 80), url: `${window.location.origin}/signal/post/${post.id}` });
    if (res !== 'failed') void incrementEmpirePostShare(post.id);
  };

  // One tap = play / pause; a quick second tap = Respect (with a burst).
  const onScreenTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 320) {
      lastTap.current = 0;
      setBurst(Date.now());
      void respect(true);
      return;
    }
    lastTap.current = now;
    window.setTimeout(() => {
      if (lastTap.current === now) setPaused((p) => !p);
    }, 330);
  };

  if (!src) return null;
  const text = post.title || post.body;
  return (
    <div className="relative h-dvh w-full snap-start snap-always overflow-hidden bg-black">
      <video
        ref={video}
        src={active ? src : undefined}
        loop
        muted={muted}
        playsInline
        preload="none"
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (v.duration > 0) setProgress(v.currentTime / v.duration);
        }}
        className="absolute inset-0 h-full w-full object-contain"
      />
      <button type="button" aria-label={paused ? t('Play') : t('Pause')} onClick={onScreenTap} className="absolute inset-0 z-[1]" />
      {paused && (
        <span className="pointer-events-none absolute inset-0 z-[2] grid place-items-center">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-black/45 backdrop-blur-md"><Icon name="play" size={34} /></span>
        </span>
      )}
      {burst > 0 && (
        <span key={burst} className="reels-burst pointer-events-none absolute inset-0 z-[2] grid place-items-center" aria-hidden>
          <RespectIcon size={84} filled playKey={burst} />
        </span>
      )}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-2/5 bg-gradient-to-t from-black/85 to-transparent" />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] flex items-end gap-3 px-4 pb-[max(1.75rem,env(safe-area-inset-bottom))] text-white">
        <div className="pointer-events-auto min-w-0 flex-1">
          <Link to={`/signal/profile/${post.authorId}`} className="inline-flex items-center gap-2.5">
            <Img
              src={post.authorAvatarUrl ?? ''}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white/60"
              fallback={<span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20"><Icon name="user" size={18} /></span>}
            />
            <span className="truncate font-display text-copy font-semibold">{post.authorName}</span>
          </Link>
          {text && (
            <button type="button" onClick={() => setMore((m) => !m)} className="mt-2.5 block w-full text-left">
              <span className={`block text-detail leading-snug text-white/90 ${more ? '' : 'line-clamp-2'}`}>{text}</span>
            </button>
          )}
          {post.vehicle && (
            <Link to={`/cars/${post.vehicle.slug}`} className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-white/15 py-1.5 pl-1.5 pr-3.5 backdrop-blur-md">
              {post.vehicle.imageUrl && <img src={post.vehicle.imageUrl} alt="" className="h-8 w-8 rounded-full object-cover" />}
              <span className="truncate text-caption font-semibold">{post.vehicle.make} {post.vehicle.model}</span>
              <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-label font-bold text-noir">{t('Book')}</span>
            </Link>
          )}
        </div>

        <div className="pointer-events-auto flex shrink-0 flex-col items-center gap-5 pb-1">
          <button type="button" onClick={() => void respect()} aria-label="Respect" className="flex flex-col items-center gap-1">
            <span className={`grid h-12 w-12 place-items-center rounded-full backdrop-blur-md ${post.likedByMe ? 'bg-white/25' : 'bg-white/15'}`}>
              <RespectIcon size={20} filled={post.likedByMe} playKey={fire} className={post.likedByMe ? '' : 'text-white'} />
            </span>
            <span className="text-caption font-semibold">{post.likeCount}</span>
          </button>
          <button type="button" onClick={() => void save()} aria-label={t('Save')} className="flex flex-col items-center gap-1">
            <span className={`grid h-12 w-12 place-items-center rounded-full backdrop-blur-md ${post.savedByMe ? 'bg-white/25' : 'bg-white/15'}`}>
              <Icon name="bookmark" size={22} fill={post.savedByMe} />
            </span>
            <span className="text-caption font-semibold">{post.saveCount}</span>
          </button>
          <button type="button" onClick={() => void share()} aria-label={t('Share')} className="flex flex-col items-center gap-1">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white/15 backdrop-blur-md"><Icon name="share" size={21} /></span>
          </button>
          <button type="button" onClick={onToggleMute} aria-label={muted ? t('Sound on') : t('Sound off')} className="grid h-11 w-11 place-items-center rounded-full bg-white/15 backdrop-blur-md">
            <Icon name={muted ? 'volumeOff' : 'volume'} size={19} />
          </button>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-[4] h-[3px] bg-white/20">
        <div className="h-full bg-white" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

/** SIGNAL Reels: the Community's videos, one per screen, vertical, playing as you scroll. Tap to pause,
 *  double-tap to Respect, the sound choice is remembered. Community only — Official stays editorial. */
export default function SignalReels() {
  const { session, loading } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  // From a profile: only that person's videos, opening on the one that was tapped.
  const [params] = useSearchParams();
  const authorId = params.get('author');
  const startPost = params.get('post');
  const [posts, setPosts] = useState<EmpirePost[] | null>(null);
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem(MUTE_KEY) !== '0'; } catch { return true; }
  });
  const [index, setIndex] = useState(0);
  const loadRef = useRef({ offset: 0, seed: Math.floor(Math.random() * 2147483000), since: new Date().toISOString(), done: false, busy: false });
  const scroller = useRef<HTMLDivElement>(null);

  // Pages of the ranked Community feed until there are enough videos in them.
  const loadMore = useCallback(async () => {
    const s = loadRef.current;
    if (s.done || s.busy) return;
    s.busy = true;
    try {
      const found: EmpirePost[] = [];
      for (let i = 0; i < 4 && found.length < 6 && !s.done; i++) {
        const rows = await fetchForYouFeed({ limit: 20, offset: s.offset, seed: s.seed, since: s.since, mode: 'foryou', scope: 'community' });
        s.offset += rows.length;
        if (rows.length < 20) s.done = true;
        found.push(...rows.filter((p) => videoUrlOf(p)));
      }
      setPosts((prev) => {
        const have = new Set((prev ?? []).map((p) => p.id));
        return [...(prev ?? []), ...found.filter((p) => !have.has(p.id))];
      });
    } catch {
      loadRef.current.done = true;
      setPosts((prev) => prev ?? []);
    } finally {
      s.busy = false;
    }
  }, []);

  useEffect(() => {
    if (!authorId) { void loadMore(); return; }
    loadRef.current.done = true;
    fetchEmpirePostsByAuthor(authorId, 50)
      .then((rows) => setPosts(rows.filter((p) => !p.isArchived && videoUrlOf(p))))
      .catch(() => setPosts([]));
  }, [loadMore, authorId]);

  // Opening on the tapped reel.
  useEffect(() => {
    if (!posts || !startPost || !scroller.current) return;
    const i = posts.findIndex((p) => p.id === startPost);
    if (i > 0) {
      scroller.current.scrollTop = i * scroller.current.clientHeight;
      setIndex(i);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts === null]);

  // Full black screen: Safari's status bar and toolbar take the dark tone, the page behind steps aside.
  useEffect(() => {
    const root = document.documentElement;
    const app = document.getElementById('root');
    const prev = {
      overflow: document.body.style.overflow,
      rootBg: root.style.backgroundColor,
      bodyBg: document.body.style.backgroundColor,
      appBg: app?.style.backgroundColor ?? '',
      appVis: app?.style.visibility ?? '',
    };
    document.body.style.overflow = 'hidden';
    root.style.backgroundColor = '#000';
    document.body.style.backgroundColor = '#000';
    if (app) { app.style.backgroundColor = '#000'; app.style.visibility = 'hidden'; }
    setChromeOverride({ light: '#000000', dark: '#000000' });
    const y = window.scrollY;
    window.scrollTo(0, y + 1);
    window.requestAnimationFrame(() => window.scrollTo(0, y));
    return () => {
      document.body.style.overflow = prev.overflow;
      root.style.backgroundColor = prev.rootBg;
      document.body.style.backgroundColor = prev.bodyBg;
      if (app) { app.style.backgroundColor = prev.appBg; app.style.visibility = prev.appVis; }
      setChromeOverride(null);
    };
  }, []);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    setIndex(i);
    if (posts && i >= posts.length - 2) void loadMore();
  };

  const toggleMute = () => {
    setMuted((m) => {
      try { localStorage.setItem(MUTE_KEY, m ? '0' : '1'); } catch { /* ignore */ }
      return !m;
    });
  };

  if (loading) return null;
  if (!session) return <Navigate to="/signal" replace />;

  return createPortal(
    <div className="fixed inset-x-0 top-0 z-[300] bg-black text-white" style={{ bottom: -160 }}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-black" style={{ height: 'env(safe-area-inset-top, 0px)' }} />
      <button
        type="button"
        onClick={() => navigate(authorId ? `/signal/profile/${authorId}` : '/signal/community')}
        aria-label={t('Close')}
        className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 grid h-11 w-11 place-items-center rounded-full bg-black/40 backdrop-blur-md"
      >
        <Icon name="chevronLeft" size={20} />
      </button>
      <span className="pointer-events-none absolute left-1/2 top-[max(1.1rem,calc(env(safe-area-inset-top)+0.35rem))] z-20 -translate-x-1/2 text-detail font-bold uppercase tracking-[0.25em]">Reels</span>

      {posts === null ? (
        <div className="grid h-full place-items-center"><span className="skeleton h-40 w-24 rounded-2xl" /></div>
      ) : posts.length === 0 ? (
        <div className="grid h-full place-items-center px-8 text-center">
          <div>
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/10"><Icon name="play" size={26} /></span>
            <p className="mt-4 font-display text-lead font-semibold">{t('No videos yet')}</p>
            <p className="mt-1 text-detail text-white/70">{t('Videos shared by the Community appear here.')}</p>
          </div>
        </div>
      ) : (
        <div ref={scroller} onScroll={onScroll} className="snap-y snap-mandatory overflow-y-scroll overscroll-contain [scrollbar-width:none]" style={{ height: '100dvh' }}>
          {posts.map((p, i) => (
            <Reel
              key={p.id}
              post={p}
              active={Math.abs(i - index) === 0}
              muted={muted}
              onToggleMute={toggleMute}
              onChange={(np) => setPosts((cur) => (cur ? cur.map((x) => (x.id === np.id ? np : x)) : cur))}
            />
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
