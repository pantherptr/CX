import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react';

const SRC = '/home/moment-cut2-1254.webp';
const SET = '/home/moment-cut2-800.webp 800w, /home/moment-cut2-1254.webp 1254w';
const W = 1254;
const H = 1098;

/** One slice of the artwork: a horizontal band of the picture (feathered at its top and bottom) that is painted in from
 *  the left, like a brush pulling across, as the scroll progress goes from `from` to `to`. */
function Slice({ p, band, from, to, rise = 0, alt }: { p: MotionValue<number>; band: [number, number, number, number]; from: number; to: number; rise?: number; alt?: string }) {
  const k = useTransform(p, [from, to], [0, 1], { clamp: true });
  const edge = 0.16; // softness of the moving edge (fraction of the width)
  const mask = useTransform(k, (v) => {
    const at = v * (1 + edge);
    return `linear-gradient(100deg, #000 ${((at - edge) * 100).toFixed(2)}%, transparent ${(at * 100).toFixed(2)}%)`;
  });
  const y = useTransform(k, [0, 1], [rise, 0]);
  const [a, b, c, d] = band; // transparent→opaque at a..b, opaque until c, →transparent at d (fractions of the height)
  const vBand = `linear-gradient(to bottom, transparent ${a * 100}%, #000 ${b * 100}%, #000 ${c * 100}%, transparent ${d * 100}%)`;
  return (
    <div className="absolute inset-0" style={{ WebkitMaskImage: vBand, maskImage: vBand }} aria-hidden={alt ? undefined : true}>
      <motion.div className="absolute inset-0" style={{ WebkitMaskImage: mask, maskImage: mask, y }}>
        <img src={SRC} srcSet={SET} sizes="(min-width: 640px) 36rem, 92vw" width={W} height={H} alt={alt ?? ''} draggable={false} className="block h-full w-full select-none" />
      </motion.div>
    </div>
  );
}

/** The "Your moment. Your car." artwork, painted in as it scrolls into view: the two lines first, then the road with the
 *  car, then the signature. With "reduce motion" it is simply there. */
export function MomentReveal({ alt }: { alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 92%', 'end 55%'] });
  const p = useSpring(scrollYProgress, { stiffness: 110, damping: 30, mass: 0.5 });
  const scale = useTransform(p, [0, 1], [0.94, 1]);

  if (reduced) {
    return <img src={SRC} srcSet={SET} sizes="(min-width: 640px) 36rem, 92vw" width={W} height={H} alt={alt} draggable={false} className="mx-auto block h-auto w-full select-none" />;
  }
  return (
    <motion.div ref={ref} role="img" aria-label={alt} className="relative mx-auto w-full" style={{ aspectRatio: `${W} / ${H}`, scale }}>
      <Slice p={p} band={[0, 0, 0.55, 0.6]} from={0.02} to={0.5} />
      <Slice p={p} band={[0.5, 0.56, 0.84, 0.88]} from={0.3} to={0.78} rise={36} />
      <Slice p={p} band={[0.82, 0.86, 1, 1]} from={0.62} to={0.95} />
    </motion.div>
  );
}
