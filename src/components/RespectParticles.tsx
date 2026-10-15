import { AnimatePresence, motion, useReducedMotion } from './motionKit';

const COLORS = ['#00d447', '#5dffa6', '#00d447', '#9bf7bb'];
const COUNT = 6;
// an arc of small dots flying up and out of the icon, each a little different
const PARTICLES = Array.from({ length: COUNT }, (_, i) => {
  const angle = -150 + (i / (COUNT - 1)) * 120; // -150° → -30°: upward
  const rad = (angle * Math.PI) / 180;
  const dist = 22 + (i % 2) * 12;
  return {
    id: i,
    x: Math.cos(rad) * dist,
    y: Math.sin(rad) * dist,
    color: COLORS[i % COLORS.length],
    size: 4 + (i % 2),
    dur: 0.5 + (i % 3) * 0.07,
  };
});

/**
 * The little burst when you give Respect: six dots arc up out of the icon and a soft ring spreads (the
 * idea of 21st's animated upvote button, in CX green). Put it inside a `relative` box next to the icon and
 * change `fireKey` each time a Respect is given; nothing shows while `fireKey` is 0. Skipped with "reduce motion".
 */
export function RespectParticles({ fireKey, className = '' }: { fireKey: number; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce || fireKey === 0) return null;
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute ${className}`} style={{ width: 0, height: 0 }}>
      <AnimatePresence>
        <motion.span
          key={`ring-${fireKey}`}
          className="absolute rounded-full bg-accent-bright/25"
          style={{ width: 20, height: 20, left: -10, top: -10 }}
          initial={{ scale: 0, opacity: 1 }}
          animate={{ scale: 3.2, opacity: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
        {PARTICLES.map((p) => (
          <motion.span
            key={`${p.id}-${fireKey}`}
            className="absolute rounded-full"
            style={{ width: p.size, height: p.size, left: -p.size / 2, top: -p.size / 2, background: p.color }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: p.x, y: [0, p.y * 0.6, p.y], opacity: [1, 1, 0], scale: 0.5 }}
            transition={{ duration: p.dur, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </AnimatePresence>
    </span>
  );
}
