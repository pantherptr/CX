import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Img } from '../components/motion';
import { RespectGlyph } from '../components/RespectGlyph';
import { useAuth } from '../lib/auth';
import { useLocale } from '../lib/i18n';
import { shareLink } from '../lib/native';
import {
  fetchEmpireFeed, mediaKindFromPath, toggleEmpirePostLike, toggleEmpirePostSave, incrementEmpirePostShare,
  type EmpirePost,
} from '../lib/data/empireFeed';

function videoUrlOf(p: EmpirePost): string | null {
  const i = p.mediaPaths.findIndex((m) => mediaKindFromPath(m) === 'video');
  return i >= 0 ? p.mediaUrls[i] ?? null : null;
}

function Reel({ post, muted, onToggleMute, onChange }: {
  post: EmpirePost; muted: boolean; onToggleMute: () => void; onChange: (p: EmpirePost) => void;
}) {
  const { t } = useLocale();
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const src = videoUrlOf(post);

  // Plays only while it is the one on screen.
  useEffect(() => {
    const el = box.current;
    const v = video.current;
    if (!el || !v) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && e.intersectionRatio > 0.6) void v.play().catch(() => {});
        else { v.pause(); v.currentTime = 0; }
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const respect = async () => {
    onChange({ ...post, likedByMe: !post.likedByMe, likeCount: post.likeCount + (post.likedByMe ? -1 : 1) });
    const r = await toggleEmpirePostLike(post.id);
    if (r.error) onChange(post);
  };
  const save = async () => {
    onChange({ ...post, savedByMe: !post.savedByMe, saveCount: post.saveCount + (post.savedByMe ? -1 : 1) });
    const r = await toggleEmpirePostSave(post.id);
    if (r.error) onChange(post);
  };
  const share = async () => {
    const res = await shareLink({ title: post.authorName, text: post.body.slice(0, 80), url: `${window.location.origin}/signal/post/${post.id}` });
    if (res !== 'failed') void incrementEmpirePostShare(post.id);
  };

  if (!src) return null;
  return (
    <div ref={box} className="relative h-dvh w-full snap-start snap-always overflow-hidden bg-black">
      <video
        ref={video}
        src={src}
        loop
        muted={muted}
        playsInline
        preload="metadata"
        onClick={onToggleMute}
        className="absolute inset-0 h-full w-full object-contain"
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 z-10 flex items-end gap-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-white">
        <div className="min-w-0 flex-1">
          <Link to={`/signal/profile/${post.authorId}`} className="flex items-center gap-2.5">
            <Img
              src={post.authorAvatarUrl ?? ''}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white/60"
              fallback={<span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20"><Icon name="user" size={18} /></span>}
            />
            <span className="truncate font-display text-copy font-semibold">{post.authorName}</span>
          </Link>
          {(post.title || post.body) && <p className="mt-2.5 line-clamp-3 text-detail leading-snug text-white/90">{post.title || post.body}</p>}
          {post.vehicle && (
            <Link to={`/cars/${post.vehicle.slug}`} className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-white/15 py-1.5 pl-1.5 pr-3.5 backdrop-blur-md">
              {post.vehicle.imageUrl && <img src={post.vehicle.imageUrl} alt="" className="h-8 w-8 rounded-full object-cover" />}
              <span className="truncate text-caption font-semibold">{post.vehicle.make} {post.vehicle.model}</span>
              <span className="shrink-0 rounded-full bg-accent-bright px-2.5 py-1 text-label font-bold text-noir">{t('Book')}</span>
            </Link>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-center gap-5 pb-1">
          <button type="button" onClick={() => void respect()} aria-label="Respect" className="flex flex-col items-center gap-1">
            <span className={`grid h-12 w-12 place-items-center rounded-full backdrop-blur-md ${post.likedByMe ? 'bg-accent-bright/25' : 'bg-white/15'}`}>
              <RespectGlyph height={24} on={post.likedByMe} className={post.likedByMe ? '' : 'text-white'} />
            </span>
            <span className="text-caption font-semibold">{post.likeCount}</span>
          </button>
          <button type="button" onClick={() => void save()} aria-label={t('Save')} className="flex flex-col items-center gap-1">
            <span className={`grid h-12 w-12 place-items-center rounded-full backdrop-blur-md ${post.savedByMe ? 'bg-accent-bright/25' : 'bg-white/15'}`}>
              <Icon name="bookmark" size={22} fill={post.savedByMe} />
            </span>
            <span className="text-caption font-semibold">{post.saveCount}</span>
          </button>
          <button type="button" onClick={() => void share()} aria-label={t('Share')} className="flex flex-col items-center gap-1">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white/15 backdrop-blur-md"><Icon name="share" size={21} /></span>
          </button>
          <button type="button" onClick={onToggleMute} aria-label={muted ? 'Sound on' : 'Sound off'} className="grid h-10 w-10 place-items-center rounded-full bg-white/15 backdrop-blur-md">
            <Icon name={muted ? 'volumeOff' : 'volume'} size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** SIGNAL Reels: the videos of the feed, one per screen, vertical, autoplaying as you scroll. */
export default function SignalReels() {
  const { session, loading } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<EmpirePost[] | null>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    let off = false;
    fetchEmpireFeed(60)
      .then((rows) => { if (!off) setPosts(rows.filter((p) => videoUrlOf(p))); })
      .catch(() => { if (!off) setPosts([]); });
    return () => { off = true; };
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (loading) return null;
  if (!session) return <Navigate to="/signal" replace />;

  return (
    <div className="fixed inset-0 z-[300] bg-black text-white">
      <button
        type="button"
        onClick={() => navigate('/signal')}
        aria-label={t('Close')}
        className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 grid h-11 w-11 place-items-center rounded-full bg-black/40 backdrop-blur-md"
      >
        <Icon name="chevronLeft" size={20} />
      </button>
      <span className="absolute left-1/2 top-[max(1.1rem,calc(env(safe-area-inset-top)+0.35rem))] z-20 -translate-x-1/2 text-detail font-bold uppercase tracking-[0.25em]">Reels</span>

      {posts === null ? (
        <div className="grid h-full place-items-center"><span className="skeleton h-40 w-24 rounded-2xl" /></div>
      ) : posts.length === 0 ? (
        <div className="grid h-full place-items-center px-8 text-center">
          <div>
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/10"><Icon name="play" size={26} /></span>
            <p className="mt-4 font-display text-lead font-semibold">{t('No videos yet')}</p>
            <p className="mt-1 text-detail text-white/70">{t('Videos shared on SIGNAL appear here.')}</p>
          </div>
        </div>
      ) : (
        <div className="h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain [scrollbar-width:none]">
          {posts.map((p) => (
            <Reel
              key={p.id}
              post={p}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
              onChange={(np) => setPosts((cur) => (cur ? cur.map((x) => (x.id === np.id ? np : x)) : cur))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
