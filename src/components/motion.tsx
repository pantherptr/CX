import {
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
