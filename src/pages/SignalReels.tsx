import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Img } from '../components/motion';
import { RespectIcon } from '../components/RespectIcon';
import { RespectParticles } from '../components/RespectParticles';
import { setChromeOverride, setChromeSuspended } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { useLocale } from '../lib/i18n';
import { haptics, shareLink } from '../lib/native';
import {
  fetchForYouFeed, fetchEmpirePostsByAuthor, mediaKindFromPath, toggleEmpirePostLike, toggleEmpirePostSave, incrementEmpirePostShare,
  type EmpirePost,
} from '../lib/data/empireFeed';

const MUTE_KEY = 'cx-reels-muted';

function videoUrlOf(p: EmpirePost): string | null {
  const i = p.mediaPaths.findIndex((m) => mediaKindFromPath(m) === 'video');
  return i >= 0 ? p.mediaUrls[i] ?? null : null;
}

function Reel({ post, active, next, muted, onToggleMute, onChange }: {
  post: EmpirePost; active: boolean; next: boolean; muted: boolean; onToggleMute: () => void; onChange: (p: EmpirePost) => void;
}) {
  const { t } = useLocale();
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [burst, setBurst] = useState(0);
  const [fire, setFire] = useState(0);
  const [more, setMore] = useState(false);
  const [portrait, setPortrait] = useState(false); // a vertical clip fills the whole screen; a wide one stays whole
  const [buffering, setBuffering] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const lastTap = useRef(0);
  const src = videoUrlOf(post);

  // Plays only while it is the reel on screen; one reel at a time. `muted` is also set on the element itself
  // (React only sets it as a property after the element exists, and iOS decides about autoplay at that moment),
  // and if the browser still refuses to start it the Play button is shown instead of a dead black screen.
  const tryPlay = useCallback(() => {
    const v = video.current;
    if (!v) return;
    v.muted = muted;
    const p = v.play();
    if (p && typeof p.catch === 'function') p.catch(() => setPaused(true));
  }, [muted]);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.muted = muted;
    if (active && !paused) tryPlay();
    else v.pause();
    if (!active) { v.currentTime = 0; setPaused(false); setProgress(0); }
  }, [active, paused, muted, tryPlay]);

  const respect = useCallback(async (force?: boolean) => {
    if (force && post.likedByMe) return;
    setFire(Date.now());
    haptics.medium();
    onChange({ ...post, likedByMe: !post.likedByMe, likeCount: post.likeCount + (post.likedByMe ? -1 : 1) });
    const r = await toggleEmpirePostLike(post.id);
    if (r.error) onChange(post);
  }, [post, onChange]);
  const save = async () => {
    haptics.light();
    onChange({ ...post, savedByMe: !post.savedByMe, saveCount: post.saveCount + (post.savedByMe ? -1 : 1) });
    const r = await toggleEmpirePostSave(post.id);
    if (r.error) onChange(post);
  };
  const share = async () => {
    const res = await shareLink({ title: post.authorName, text: post.body.slice(0, 80), url: `${window.location.origin}/signal/post/${post.id}` });
    if (res !== 'failed') { haptics.light(); void incrementEmpirePostShare(post.id); }
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
    <div data-reel data-no-edge-back className="relative w-full snap-start snap-always overflow-hidden bg-black" style={{ height: '100lvh' }}>
      <video
        ref={video}
        src={active || next ? src : undefined}
        loop
        muted={muted}
        playsInline
        preload={next ? 'auto' : 'none'}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (v.videoWidth && v.videoHeight) setPortrait(v.videoWidth / v.videoHeight < 0.9);
        }}
        onLoadedData={() => { if (active && !paused) tryPlay(); }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (v.duration > 0 && !scrubbing) setProgress(v.currentTime / v.duration);
        }}
        className={`absolute inset-0 h-full w-full ${portrait ? 'object-cover' : 'object-contain'}`}
      />
      {buffering && active && (
        <span className="pointer-events-none absolute inset-0 z-[2] grid place-items-center" aria-hidden>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" className="animate-spin text-white/90">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" strokeOpacity="0.25" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </span>
      )}
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

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] flex items-end gap-3 px-4 pb-[calc(max(1.75rem,env(safe-area-inset-bottom))+4.75rem)] text-white">
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
              <span className="shrink-0 rounded-full bg-[#fff] px-2.5 py-1 text-label font-bold text-noir">{t('Book')}</span>
            </Link>
          )}
        </div>

        <div className="pointer-events-auto flex shrink-0 flex-col items-center gap-5 pb-1">
          <button type="button" onClick={() => void respect()} aria-label="Respect" className="flex flex-col items-center gap-1">
            <span className={`relative grid h-12 w-12 place-items-center rounded-full backdrop-blur-md ${post.likedByMe ? 'bg-white/25' : 'bg-white/15'}`}>
              <RespectIcon size={20} filled={post.likedByMe} playKey={fire} className={post.likedByMe ? '' : 'text-white'} />
              <RespectParticles fireKey={post.likedByMe ? fire : 0} className="left-1/2 top-1/2" />
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

      {/* progress — drag it to scrub (a tall invisible touch area around the thin line) */}
      <div
        data-no-edge-back
        className="absolute inset-x-0 bottom-0 z-[4] flex h-7 touch-none items-end"
        onPointerDown={(e) => {
          const v = video.current;
          if (!v || !v.duration) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setScrubbing(true);
          const r = e.currentTarget.getBoundingClientRect();
          const k = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
          v.currentTime = k * v.duration;
          setProgress(k);
        }}
        onPointerMove={(e) => {
          if (!scrubbing) return;
          const v = video.current;
          if (!v || !v.duration) return;
          const r = e.currentTarget.getBoundingClientRect();
          const k = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
          v.currentTime = k * v.duration;
          setProgress(k);
        }}
        onPointerUp={() => setScrubbing(false)}
        onPointerCancel={() => setScrubbing(false)}
      >
        <div className={`w-full bg-white/20 transition-[height] ${scrubbing ? 'h-[6px]' : 'h-[3px]'}`}>
          <div className="h-full bg-[#fff]" style={{ width: `${progress * 100}%` }} />
        </div>
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

  // Pages of the ranked Community feed until there are enough videos in them.
  const loadMore = useCallback(async () => {
    const s = loadRef.current;
    if (s.done || s.busy) return;
    s.busy = true;
    try {
      let total = 0;
      for (let i = 0; i < 4 && total < 6 && !s.done; i++) {
        const rows = await fetchForYouFeed({ limit: 20, offset: s.offset, seed: s.seed, since: s.since, mode: 'foryou', scope: 'community' });
        s.offset += rows.length;
        if (rows.length < 20) s.done = true;
        const withVideo = rows.filter((p) => videoUrlOf(p));
        total += withVideo.length;
        // show each batch the moment it is in: the first reel no longer waits for up to four pages
        setPosts((prev) => {
          const have = new Set((prev ?? []).map((p) => p.id));
          return [...(prev ?? []), ...withVideo.filter((p) => !have.has(p.id))];
        });
        if (i === 0 && withVideo.length === 0 && s.done) setPosts((prev) => prev ?? []);
      }
      setPosts((prev) => prev ?? []);
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
    if (!posts || !startPost) return;
    const i = posts.findIndex((p) => p.id === startPost);
    if (i <= 0) return;
    window.requestAnimationFrame(() => {
      const el = document.querySelectorAll('[data-reel]')[i] as HTMLElement | undefined;
      if (el) { window.scrollTo(0, el.offsetTop); setIndex(i); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts === null]);

  // Full screen, the way a native reels screen is: the page itself becomes the list of reels (the
  // document scrolls, snapping one video at a time), so Safari folds its toolbar away as you swipe;
  // everything behind is black and the rest of the app steps aside while this is open.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const app = document.getElementById('root');
    const prev = {
      rootBg: root.style.backgroundColor,
      bodyBg: document.body.style.backgroundColor,
      snap: root.style.scrollSnapType,
      behavior: root.style.scrollBehavior,
      appDisplay: app?.style.display ?? '',
      y: window.scrollY,
    };
    root.style.backgroundColor = '#000';
    document.body.style.backgroundColor = '#000';
    root.style.scrollSnapType = 'y mandatory';
    root.style.scrollBehavior = 'auto';
    if (app) app.style.display = 'none';
    window.scrollTo(0, 0);
    setChromeOverride({ light: '#000000', dark: '#000000' });
    setChromeSuspended(true);
    return () => {
      root.style.backgroundColor = prev.rootBg;
      document.body.style.backgroundColor = prev.bodyBg;
      root.style.scrollSnapType = prev.snap;
      root.style.scrollBehavior = prev.behavior;
      if (app) app.style.display = prev.appDisplay;
      setChromeSuspended(false);
      setChromeOverride(null);
      window.scrollTo(0, prev.y);
    };
  }, []);

  // Which reel is the one on screen: the one whose top is closest to the top of the window.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const els = Array.from(document.querySelectorAll('[data-reel]'));
        let best = 0;
        let bestD = Infinity;
        els.forEach((el, i) => {
          const d = Math.abs(el.getBoundingClientRect().top);
          if (d < bestD) { bestD = d; best = i; }
        });
        setIndex(best);
        if (posts && best >= posts.length - 2) void loadMore();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [posts, loadMore]);

  const toggleMute = () => {
    setMuted((m) => {
      try { localStorage.setItem(MUTE_KEY, m ? '0' : '1'); } catch { /* ignore */ }
      return !m;
    });
  };

  if (loading) return null;
  if (!session) return <Navigate to="/signal" replace />;

  return createPortal(
    <div className="relative bg-black text-white">
      <button
        type="button"
        onClick={() => navigate(authorId ? `/signal/profile/${authorId}` : '/signal/community')}
        aria-label={t('Close')}
        className="fixed left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 grid h-11 w-11 place-items-center rounded-full bg-black/40 backdrop-blur-md"
      >
        <Icon name="chevronLeft" size={20} />
      </button>
      <span className="pointer-events-none fixed left-1/2 top-[max(1.1rem,calc(env(safe-area-inset-top)+0.35rem))] z-20 -translate-x-1/2 text-detail font-bold uppercase tracking-[0.25em]">Reels</span>

      {posts === null ? (
        <div className="grid place-items-center" style={{ height: '100lvh' }}><span className="skeleton h-40 w-24 rounded-2xl" /></div>
      ) : posts.length === 0 ? (
        <div className="grid place-items-center px-8 text-center" style={{ height: '100lvh' }}>
          <div>
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/10"><Icon name="play" size={26} /></span>
            <p className="mt-4 font-display text-lead font-semibold">{t('No videos yet')}</p>
            <p className="mt-1 text-detail text-white/70">{t('Videos shared by the Community appear here.')}</p>
          </div>
        </div>
      ) : (
        <div>
          {posts.map((p, i) => (
            <Reel
              key={p.id}
              post={p}
              active={Math.abs(i - index) === 0}
              next={i === index + 1}
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
