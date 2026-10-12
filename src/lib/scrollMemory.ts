import { useEffect, type RefObject } from 'react';

/** Where each full-screen layer (a SIGNAL profile, post, list…) was scrolled to, so leaving it for a car or
 *  another post and coming back puts you exactly where you were instead of at the top. In memory only. */
const memory = new Map<string, number>();

export function useScrollMemory(key: string, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = memory.get(key) ?? 0;
    let cancelled = false;
    if (target > 0) {
      let tries = 0;
      const tick = () => {
        if (cancelled || !el.isConnected) return;
        // the content may still be loading: wait (briefly) until it is tall enough to scroll that far
        if (el.scrollHeight - el.clientHeight >= target - 2 || tries > 45) {
          el.scrollTop = target;
          return;
        }
        tries += 1;
        window.requestAnimationFrame(tick);
      };
      tick();
    }
    let raf = 0;
    const onScroll = () => {
      cancelled = true; // the reader took over
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        memory.set(key, el.scrollTop);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelled = true;
      el.removeEventListener('scroll', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [key, ref]);
}
