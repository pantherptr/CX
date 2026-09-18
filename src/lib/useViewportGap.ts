import { useEffect, useState } from 'react';

/** Pixels of the layout viewport that the browser's own chrome currently
 *  covers (`innerHeight` vs `visualViewport`). Fixed overlays that must stay
 *  fully on screen subtract this from their bottom edge. */
export function useViewportBottomGap(): number {
  const [gap, setGap] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const g = window.innerHeight - vv.height - vv.offsetTop;
      setGap(Math.max(0, Math.round(g)));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return gap;
}
