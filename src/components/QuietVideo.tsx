import { useEffect, useRef, type CSSProperties } from 'react';

/** A muted decorative video that does not burn bandwidth: it only plays while it is on screen and the tab is visible,
 *  and after `maxPlays` runs it stops on the last frame (a looping autoplay video keeps downloading for as long as the
 *  page is open). `preload="metadata"` until it first becomes visible. */
export function QuietVideo({ src, className = '', style, maxPlays = 2 }: { src: string; className?: string; style?: CSSProperties; maxPlays?: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const plays = useRef(0);
  const visible = useRef(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const tryPlay = () => {
      if (visible.current && !document.hidden && plays.current < maxPlays) void v.play().catch(() => {});
      else v.pause();
    };
    const io = new IntersectionObserver(([e]) => { visible.current = e.isIntersecting && e.intersectionRatio > 0.4; tryPlay(); }, { threshold: [0, 0.4, 0.8] });
    io.observe(v);
    const onEnd = () => {
      plays.current += 1;
      if (plays.current < maxPlays) { v.currentTime = 0; tryPlay(); }
    };
    const onVis = () => tryPlay();
    v.addEventListener('ended', onEnd);
    document.addEventListener('visibilitychange', onVis);
    return () => { io.disconnect(); v.removeEventListener('ended', onEnd); document.removeEventListener('visibilitychange', onVis); };
  }, [src, maxPlays]);

  return <video ref={ref} src={src} muted playsInline preload="metadata" className={className} style={style} />;
}
