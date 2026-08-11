import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ImgHTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Scroll-reveal wrapper. Children start hidden and ease up into place the
 * first time the element enters the viewport. `delay` staggers grids.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const ob = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setInView(true);
            ob.disconnect();
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${inView ? 'in' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/**
 * Progress of an element through the viewport, 0 → 1. Used to drive the
 * scroll-told sections (pipeline, timeline) without a permanent scroll
 * listener: the listener only exists while the section is actually on
 * screen, and writes are coalesced into one rAF per frame.
 */
export function useScrollProgress(ref: RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReduced()) {
      setProgress(1);
      return;
    }

    let raf = 0;

    const measure = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // Starts when the top edge crosses 88% of the viewport, completes once
      // the bottom edge has risen to 45% — the section tells its story while
      // it is comfortably in view, not at the very edges.
      const span = r.height + vh * 0.43;
      setProgress(Math.min(1, Math.max(0, (vh * 0.88 - r.top) / span)));
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          window.addEventListener('scroll', onScroll, { passive: true });
          window.addEventListener('resize', onScroll, { passive: true });
          measure();
        } else {
          window.removeEventListener('scroll', onScroll);
          window.removeEventListener('resize', onScroll);
        }
      },
      { rootMargin: '15% 0px' },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref]);

  return progress;
}

/** Reactive media query, so layouts can branch instead of merely shrinking. */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** True once the element has been seen — for one-shot entrance work. */
export function useInView(ref: RefObject<HTMLElement | null>, threshold = 0.2) {
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const ob = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          ob.disconnect();
        }
      },
      { threshold },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [ref, threshold]);

  return seen;
}

/**
 * Mouse-follow 3D tilt for a card-like element — the automotive "premium"
 * cue, built from a plain GPU transform rather than a 3D/WebGL library
 * (there are no 3D car assets in this project, only photos). No-ops on
 * touch devices (where hover doesn't exist) and under reduced-motion;
 * callers should pair it with a CSS `active:scale-*` press state for the
 * touch-friendly equivalent.
 */
export function useTilt<T extends HTMLElement>(opts?: { max?: number; lift?: number }) {
  const ref = useRef<T>(null);
  const [style, setStyle] = useState<{ transform: string; transition: string }>({
    transform: 'perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)',
    transition: 'transform 0.5s var(--ease-out-expo)',
  });
  const coarse = useMediaQuery('(pointer: coarse)');
  const max = opts?.max ?? 7;
  const lift = opts?.lift ?? 1.015;

  useEffect(() => {
    const el = ref.current;
    if (!el || coarse || prefersReduced()) return;

    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      const rx = (0.5 - py) * max * 2;
      const ry = (px - 0.5) * max * 2;
      setStyle({
        transform: `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(${lift}, ${lift}, ${lift})`,
        transition: 'transform 0.12s ease-out',
      });
    };
    const onLeave = () => {
      setStyle({
        transform: 'perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)',
        transition: 'transform 0.6s var(--ease-out-expo)',
      });
    };

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [coarse, max, lift]);

  return { ref, style: coarse ? undefined : style };
}

/**
 * Animates a number counting up to `target` once its host element scrolls
 * into view. Jumps straight to the target under reduced-motion.
 *
 * Uses a callback ref (not `useRef` + `useInView`) so it stays correct even
 * when the host element mounts late — e.g. behind a loading state, where a
 * plain `useRef`'s observer-setup effect would already have run once
 * against a still-null ref and never retry once the real node appears.
 */
export function useCountUp<T extends HTMLElement>(
  target: number,
  opts?: { duration?: number; decimals?: number },
) {
  const [node, setNode] = useState<T | null>(null);
  const [seen, setSeen] = useState(false);
  const [value, setValue] = useState(0);
  const decimals = opts?.decimals ?? 0;
  const duration = opts?.duration ?? 1100;

  const ref = useCallback((el: T | null) => setNode(el), []);

  useEffect(() => {
    if (!node || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const ob = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          ob.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    ob.observe(node);
    return () => ob.disconnect();
  }, [node, seen]);

  useEffect(() => {
    if (!seen) return;
    if (prefersReduced()) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, target, duration]);

  return { ref, value: Number(value.toFixed(decimals)) };
}

/**
 * Simple top-anchored parallax offset — how far an element has drifted
 * from `window.scrollY`, scaled by `factor` and capped so it never runs
 * away on a long page. Meant for hero imagery, not the reveal-through-
 * viewport pattern `useScrollProgress` covers.
 */
export function useParallax(factor = 0.12, max = 60) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (prefersReduced()) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      setOffset(Math.max(-max, Math.min(max, -window.scrollY * factor)));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [factor, max]);

  return offset;
}

/** <img> that fades in once decoded (handles cached images too). */
export function Img({ className = '', ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (ref.current?.complete) setLoaded(true);
  }, []);

  return (
    <img
      ref={ref}
      onLoad={() => setLoaded(true)}
      className={`imgfade ${loaded ? 'loaded' : ''} ${className}`}
      {...rest}
    />
  );
}
