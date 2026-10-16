import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Wraps an animated illustration: it plays while it is on screen, pauses when it is not, and shows its finished
 *  frame, still, to people who have switched animations off (the CSS reads data-play). */
export function SceneFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [play, setPlay] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setPlay(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} data-play={play ? '1' : '0'} className={`cx-scene-frame h-full w-full ${className}`}>
      {children}
    </div>
  );
}
