import { useId } from 'react';

/**
 * The chrome of the SIGNAL marks: the green is the same polished green as the logo's bat, and the letters get a
 * light metallic gradient (silver on the dark theme, graphite on the light one) — a touch of chrome, no flat white.
 * Gradients are vertical (objectBoundingBox), so each shape gets its own highlight band.
 */
export function useSignalChrome() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return { green: `sg-${uid}`, silver: `ss-${uid}`, graphite: `sk-${uid}` };
}

export function SignalChromeDefs({ ids }: { ids: { green: string; silver: string; graphite: string } }) {
  return (
    <defs>
      <linearGradient id={ids.green} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#7dfab0" />
        <stop offset="0.3" stopColor="#12d85a" />
        <stop offset="0.55" stopColor="#0fb84a" />
        <stop offset="0.8" stopColor="#2fe673" />
        <stop offset="1" stopColor="#0fc050" />
      </linearGradient>
      <linearGradient id={ids.silver} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.45" stopColor="#e6e9e6" />
        <stop offset="0.55" stopColor="#c4cac5" />
        <stop offset="0.8" stopColor="#f2f4f2" />
        <stop offset="1" stopColor="#d2d7d3" />
      </linearGradient>
      <linearGradient id={ids.graphite} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#44464c" />
        <stop offset="0.45" stopColor="#1c1d20" />
        <stop offset="0.55" stopColor="#0b0b0d" />
        <stop offset="0.8" stopColor="#2c2d31" />
        <stop offset="1" stopColor="#141416" />
      </linearGradient>
    </defs>
  );
}
