import { useEffect, useRef, useState } from 'react';

/** Gates 3D mounting to cards actually on screen — the spec is explicit
 *  that the game must never load every vehicle's model/canvas at once,
 *  and a Market or Collection grid can easily hold more cards than fit
 *  in the viewport. Stays mounted once seen (`once`) so a card doesn't
 *  tear down and rebuild its WebGL context on every scroll wobble. */
export function useInView<T extends HTMLElement>(rootMargin = '200px') {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}
