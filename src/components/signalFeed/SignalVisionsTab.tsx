import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { Img } from '../motion';
import { fetchEmpirePostById, fetchEmpirePostsByAuthorAll, mediaKindFromPath, type EmpirePost } from '../../lib/data/empireFeed';
import { fetchVisionPostIds } from '../../lib/data/visions';
import { useLocale } from '../../lib/i18n';
import { SignalMediaViewer } from './SignalMediaViewer';

/** A profile's CX Visions: a quiet, editorial grid of the photos and videos
 *  its owner chose to show. Each tile is a normal post underneath, opened in
 *  the same fullscreen media viewer the feed uses — no counts, badges or
 *  reactions in the grid. Two columns on a phone; wider screens get three,
 *  with every fifth tile set larger so the grid reads as a layout, not a feed. */
export function SignalVisionsTab({ userId, isMe }: { userId: string; isMe: boolean }) {
  const [posts, setPosts] = useState<EmpirePost[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPosts(null);
    (async () => {
      try {
        const ids = await fetchVisionPostIds(userId, 60);
        if (ids.length === 0) {
          if (!cancelled) setPosts([]);
          return;
        }
        // One call for the author's recent posts covers almost everything;
        // anything older than that window is fetched by id.
        const recent = await fetchEmpirePostsByAuthorAll(userId, 60).catch(() => [] as EmpirePost[]);
        const byId = new Map(recent.map((p) => [p.id, p]));
        const missing = ids.filter((id) => !byId.has(id));
        const extra = await Promise.all(missing.slice(0, 24).map((id) => fetchEmpirePostById(id).catch(() => null)));
        for (const p of extra) if (p) byId.set(p.id, p);
        const ordered = ids.map((id) => byId.get(id)).filter((p): p is EmpirePost => Boolean(p) && (p as EmpirePost).mediaUrls.length > 0);
        if (!cancelled) setPosts(ordered);
      } catch {
        if (!cancelled) setPosts([]);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return <VisionsGrid posts={posts} isMe={isMe} />;
}

/** The portfolio layout itself — pure presentation, no data access. */
export function VisionsGrid({ posts, isMe }: { posts: EmpirePost[] | null; isMe: boolean }) {
  const { t } = useLocale();
  const [open, setOpen] = useState<EmpirePost | null>(null);
  return (
    <div>
      <header className="px-1 pb-5 pt-1">
        <p className="text-micro font-semibold uppercase tracking-[0.3em] text-faint">CX Visions</p>
        <h2 className="mt-2 font-display text-[22px] font-semibold leading-tight tracking-tight text-ink">{t('The moments worth keeping.')}</h2>
      </header>

      {posts === null && (
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <span key={i} className="skeleton aspect-[4/5] rounded-sm" />)}
        </div>
      )}

      {posts && posts.length === 0 && (
        <p className="px-6 py-14 text-center text-body text-muted">
          {isMe ? t('Nothing here yet. When you post a photo or video, choose “Also add to Visions”.') : t('No Visions yet.')}
        </p>
      )}

      {posts && posts.length > 0 && (
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 sm:grid-flow-dense">
          {posts.map((post, i) => {
            const first = post.mediaUrls[0];
            const isVideo = mediaKindFromPath(first) === 'video';
            // Only with two tiles after it to sit beside — otherwise the big tile would have no height.
            const feature = i % 5 === 0 && i + 2 < posts.length;
            return (
              <button
                key={post.id}
                type="button"
                onClick={() => setOpen(post)}
                aria-label={post.title || post.body.slice(0, 60) || 'Vision'}
                className={`pressable group relative overflow-hidden bg-panel aspect-[4/5] ${feature ? 'sm:col-span-2 sm:row-span-2 sm:aspect-auto' : ''}`}
              >
                {isVideo ? (
                  <video src={first} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <Img src={first} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]" fallback={<span className="grid h-full w-full place-items-center text-muted"><Icon name="image" size={22} /></span>} />
                )}
                {isVideo && (
                  <span className="pointer-events-none absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm"><Icon name="play" size={10} fill /></span>
                )}
                {!isVideo && post.mediaUrls.length > 1 && (
                  <span className="pointer-events-none absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm"><Icon name="grid" size={11} /></span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {open && <SignalMediaViewer images={open.mediaUrls} sharedKey={`vision-${open.id}`} startIndex={0} onClose={() => setOpen(null)} />}
    </div>
  );
}
