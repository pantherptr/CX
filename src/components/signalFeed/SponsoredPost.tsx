import { useEffect, useRef } from 'react';
import { SignalPostCard } from './SignalPostCard';
import { recordAdImpression, type ActiveAd } from '../../lib/data/ads';
import type { EmpirePost } from '../../lib/data/empireFeed';

/** A sponsored post in the feed: the post itself, marked "Sponsored". Counted as reached
 *  once, when at least half of it has been on screen. */
export function SponsoredPost({
  ad, canManage, onChanged, onDeleted,
}: { ad: ActiveAd; canManage: boolean; onChanged: (p: EmpirePost) => void; onDeleted: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { recordAdImpression(ad.adId); io.disconnect(); }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [ad.adId]);
  return (
    <div ref={ref}>
      <SignalPostCard post={ad.post} canManage={canManage} sponsored onChanged={onChanged} onDeleted={onDeleted} />
    </div>
  );
}
