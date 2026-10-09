import { useEffect, useState } from 'react';

/** Pixels of the layout viewport that the browser's own chrome currently
 *  covers (`innerHeight` vs `visualViewport`). Fixed overlays that must stay
 *  fully on screen subtract this from their bottom edge.
 *
 *  On iOS Safari the toolbar expands and collapses WHILE you scroll, firing
 *  a stream of tiny viewport events. Following every one made fixed bars
 *  jitter, so the value only settles once the events pause, and changes
 *  smaller than a few pixels are ignored. */
export function useViewportBottomGap(): number {
  const [gap, setGap] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const read = () => Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    setGap(read());
    let timer: number | undefined;
    const settle = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const next = read();
        setGap((prev) => (Math.abs(prev - next) < 6 ? prev : next));
      }, 140);
    };
    vv.addEventListener('resize', settle);
    vv.addEventListener('scroll', settle);
    return () => {
      window.clearTimeout(timer);
      vv.removeEventListener('resize', settle);
      vv.removeEventListener('scroll', settle);
    };
  }, []);
  return gap;
}
