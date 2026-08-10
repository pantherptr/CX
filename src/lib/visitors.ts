import { useEffect, useRef, useState } from 'react';

/**
 * A shared, gently-fluctuating "people viewing now" figure for the demo.
 * One module-level source so every widget shows the same number, drifting
 * up and down on a human-feeling cadence.
 */

const BASE = 1240;
let current = BASE + Math.floor(Math.random() * 120);
const listeners = new Set<(n: number) => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function schedule() {
  // Irregular beat: somewhere between 1.8s and 4.2s
  const delay = 1800 + Math.random() * 2400;
  timer = setTimeout(() => {
    // Small random step, biased to pull back toward BASE so it wanders
    // without drifting away forever.
    const pull = (BASE - current) * 0.04;
    const jitter = Math.round((Math.random() - 0.5) * 22 + pull);
    current = Math.max(BASE - 90, Math.min(BASE + 210, current + jitter));
    listeners.forEach((fn) => fn(current));
    schedule();
  }, delay);
}

function ensureRunning() {
  if (!timer && listeners.size > 0) schedule();
}

export function useVisitors() {
  const [n, setN] = useState(current);
  const [dir, setDir] = useState<'up' | 'down' | 'same'>('same');
  const prev = useRef(current);

  useEffect(() => {
    const fn = (v: number) => {
      setDir(v > prev.current ? 'up' : v < prev.current ? 'down' : 'same');
      prev.current = v;
      setN(v);
    };
    listeners.add(fn);
    ensureRunning();
    return () => {
      listeners.delete(fn);
      if (listeners.size === 0 && timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
  }, []);

  return { count: n, dir };
}
