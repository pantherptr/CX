import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react';

/** "Your moment. Your car." as separate pieces laid out around the car (canvas 1254 × 720): the words on the sides, the
 *  car in the middle, the signature under it. Each piece is painted in on scroll from its own side. */
const PIECES: { f: string; x: number; y: number; w: number; from: [number, number]; dir: 'l' | 'r' | 'u'; ar: number }[] = [
  { f: 'l1', x: 1.2, y: 1.4, w: 51.5, from: [0.0, 0.3], dir: 'l', ar: 771 / 157 },
  { f: 'mo', x: 50.5, y: 3.2, w: 48, from: [0.12, 0.42], dir: 'l', ar: 713 / 153 },
  { f: 'y2', x: 0, y: 33, w: 24.5, from: [0.28, 0.56], dir: 'l', ar: 524 / 278 },
  { f: 'ca', x: 75.5, y: 36, w: 23.5, from: [0.36, 0.62], dir: 'r', ar: 420 / 163 },
  { f: 'car', x: 22.5, y: 21, w: 54, from: [0.46, 0.8], dir: 'r', ar: 549 / 228 },
  { f: 'sig', x: 21, y: 63, w: 57, from: [0.7, 0.98], dir: 'l', ar: 911 / 196 },
];
const CANVAS_AR = 1254 / 720;

function Piece({ p, spec }: { p: MotionValue<number>; spec: (typeof PIECES)[number] }) {
  const k = useTransform(p, spec.from, [0, 1], { clamp: true });
  const edge = 0.2;
  const mask = useTransform(k, (v) => {
    const at = v * (1 + edge);
    const dir = spec.dir === 'r' ? 'to left' : 'to right';
    return `linear-gradient(${dir}, #000 ${((at - edge) * 100).toFixed(2)}%, transparent ${(at * 100).toFixed(2)}%)`;
  });
  const shift = useTransform(k, [0, 1], [spec.dir === 'r' ? 28 : spec.dir === 'l' ? -28 : 0, 0]);
  return (
    <motion.img
      src={`/home/mw-${spec.f}.webp`}
      alt=""
      draggable={false}
      className="absolute select-none"
      style={{ left: `${spec.x}%`, top: `${spec.y}%`, width: `${spec.w}%`, aspectRatio: spec.ar, WebkitMaskImage: mask, maskImage: mask, x: shift }}
    />
  );
}

export function MomentScatter({ alt }: { alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 90%', 'end 55%'] });
  const p = useSpring(scrollYProgress, { stiffness: 110, damping: 30, mass: 0.5 });
  return (
    <div ref={ref} role="img" aria-label={alt} className="relative mx-auto w-full" style={{ aspectRatio: CANVAS_AR }}>
      {reduced
        ? PIECES.map((s) => (
            <img key={s.f} src={`/home/mw-${s.f}.webp`} alt="" draggable={false} className="absolute select-none" style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, aspectRatio: s.ar }} />
          ))
        : PIECES.map((s) => <Piece key={s.f} p={p} spec={s} />)}
    </div>
  );
}
