import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { animate, motion } from 'motion/react';
import { ArrowUp, CircleCheck } from 'lucide-react';

export type OrbitRing = 'outer' | 'inner';

interface OrbitBase {
  ring: OrbitRing;
  angle: number;
}

export interface OrbitAvatarItem extends OrbitBase {
  kind: 'avatar';
  src: string;
  alt?: string;
  color: string;
  size?: number;
  /** A real photo (not an illustration): shown as is, centred. */
  photo?: boolean;
}

/** A round chip holding any node — a brand mark, a logo. */
export interface OrbitBadgeItem extends OrbitBase {
  kind: 'badge';
  content: ReactNode;
  color: string;
  size?: number;
}

export interface OrbitPillItem extends OrbitBase {
  kind: 'pill';
  /** Icon or emoji in front of the text. */
  icon: ReactNode;
  label: string;
}

export interface OrbitCardItem extends OrbitBase {
  kind: 'card';
  emoji?: string;
  /** A custom icon instead of an emoji. */
  icon?: ReactNode;
  badge?: string | number;
}

export interface OrbitStatusItem extends OrbitBase {
  kind: 'status';
  label: string;
}

export interface OrbitCheckItem extends OrbitBase {
  kind: 'check';
}

export type OrbitItem =
  | OrbitAvatarItem
  | OrbitBadgeItem
  | OrbitPillItem
  | OrbitCardItem
  | OrbitStatusItem
  | OrbitCheckItem;

export interface OrbitStat {
  value: string;
  label: string;
}

export interface OrbitTag {
  icon: ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface CommunityOrbitProps {
  items: OrbitItem[];
  /** What to show on a phone instead (a narrower stage, fewer chips). Falls back to `items`. */
  compactItems?: OrbitItem[];
  stats: OrbitStat[];
  headline: ReactNode;
  tags?: OrbitTag[];
  minScale?: number;
  className?: string;
}

interface Geometry {
  w: number;
  h: number;
  center: { x: number; y: number };
  radius: Record<OrbitRing, number>;
  statsTop: number;
}

const WIDE: Geometry = { w: 1200, h: 490, center: { x: 600, y: 620 }, radius: { outer: 492, inner: 404 }, statsTop: 400 };
// A phone gets its own, narrower stage (and its own set of items) so nothing is shrunk to illegibility.
const COMPACT: Geometry = { w: 420, h: 252, center: { x: 210, y: 262 }, radius: { outer: 205, inner: 150 }, statsTop: 192 };
const COMPACT_BELOW = 700;

function positionOnRing(g: Geometry, ring: OrbitRing, angle: number): CSSProperties {
  const rad = (angle * Math.PI) / 180;
  const r = g.radius[ring];
  return {
    left: g.center.x + r * Math.cos(rad),
    top: g.center.y - r * Math.sin(rad),
  };
}

// The arc runs from the left, over the top, to the right.
function arcPath(g: Geometry, r: number) {
  const dy = g.center.y - g.h;
  const dx = Math.sqrt(r * r - dy * dy);
  return `M ${g.center.x - dx} ${g.h} A ${r} ${r} 0 0 1 ${g.center.x + dx} ${g.h}`;
}

function OrbitAvatar({ src, alt, color, size = 72, photo }: OrbitAvatarItem) {
  return (
    <div
      className="rounded-full border border-black/[0.07] bg-white p-[3px] shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
      style={{ width: size, height: size }}
    >
      <div className="h-full w-full overflow-hidden rounded-full" style={{ backgroundColor: color }}>
        <img
          src={src}
          alt={alt ?? ''}
          draggable={false}
          className={`h-full w-full select-none object-cover ${photo ? 'object-center' : 'translate-y-[8%] scale-[1.08] object-top'}`}
        />
      </div>
    </div>
  );
}

function OrbitBadge({ content, color, size = 72 }: OrbitBadgeItem) {
  return (
    <div
      className="rounded-full border border-black/[0.07] bg-white p-[3px] shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
      style={{ width: size, height: size }}
    >
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full" style={{ backgroundColor: color }}>
        {content}
      </div>
    </div>
  );
}

function OrbitPill({ icon, label }: OrbitPillItem) {
  return (
    <div className="flex min-h-[27px] items-center gap-2 whitespace-nowrap rounded-full border border-black/[0.08] bg-white px-2.5 py-[5px] text-[12.5px] font-medium text-[#6c6c78] shadow-[0_2px_6px_rgba(0,0,0,0.05)]">
      <span className="flex shrink-0 items-center text-[13px] leading-none">{icon}</span>
      <span className="leading-none">{label}</span>
    </div>
  );
}

function OrbitCard({ emoji, icon, badge }: OrbitCardItem) {
  return (
    <div className="relative flex h-[52px] w-[52px] items-center justify-center rounded-xl border border-black/[0.08] bg-[#f7f7f8] text-[22px] leading-none shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
      <span className="select-none">{icon ?? emoji}</span>
      {badge !== undefined && (
        <span className="absolute -bottom-[5px] -right-2 flex h-[18px] items-center gap-0.5 rounded-[5px] border border-black/[0.08] bg-white px-1.5 text-[10px] font-medium leading-none text-[#7a7a7a] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <ArrowUp size={9} strokeWidth={2.2} />
          {badge}
        </span>
      )}
    </div>
  );
}

function OrbitStatus({ label }: OrbitStatusItem) {
  return (
    <div className="flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-full border border-[#a3d5b3] bg-[#cbe8d3] px-2.5 text-[13.5px] font-medium text-[#2f5b3a] shadow-[0_2px_6px_rgba(0,0,0,0.05)]">
      <CircleCheck size={15} strokeWidth={2.2} className="fill-[#2e7d3e] text-[#cbe8d3]" />
      {label}
    </div>
  );
}

function OrbitCheck() {
  return (
    <div className="flex h-[50px] w-[50px] items-center justify-center rounded-full border border-[#a9d8b8] bg-[#c3e5cd] shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <CircleCheck size={17} strokeWidth={2.4} className="fill-[#2e7d3e] text-[#c3e5cd]" />
    </div>
  );
}

function renderItem(item: OrbitItem) {
  switch (item.kind) {
    case 'avatar':
      return <OrbitAvatar {...item} />;
    case 'badge':
      return <OrbitBadge {...item} />;
    case 'pill':
      return <OrbitPill {...item} />;
    case 'card':
      return <OrbitCard {...item} />;
    case 'status':
      return <OrbitStatus {...item} />;
    case 'check':
      return <OrbitCheck />;
  }
}

function splitValue(value: string) {
  const m = value.match(/^([^\d]*)([\d.,]+)(.*)$/);
  if (!m) return null;
  const raw = m[2].replace(/,/g, '');
  const decimals = (raw.split('.')[1] ?? '').length;
  return { prefix: m[1], target: parseFloat(raw), decimals, suffix: m[3] };
}

function CountUp({ value, delay }: { value: string; delay: number }) {
  const parts = splitValue(value);
  const [n, setN] = useState(0);

  useEffect(() => {
    const p = splitValue(value);
    if (!p) return;
    const controls = animate(0, p.target, {
      delay,
      duration: 1.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setN(v),
    });
    return () => controls.stop();
  }, [value, delay]);

  if (!parts) return <>{value}</>;
  return (
    <>
      {parts.prefix}
      {n.toFixed(parts.decimals)}
      {parts.suffix}
    </>
  );
}

const reveal = {
  hidden: { opacity: 0, y: 14, filter: 'blur(4px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)' },
};

/** A half-orbit of live "community" chips around a few headline numbers, a title and quick links.
 *  Laid out on a fixed 1200px stage that scales down to fit its frame. */
export default function CommunityOrbit({
  items,
  compactItems,
  stats,
  headline,
  tags = [],
  minScale = 0.6,
  className,
}: CommunityOrbitProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [compact, setCompact] = useState(false);
  const g = compact ? COMPACT : WIDE;
  const shown = compact && compactItems ? compactItems : items;

  // Fixed size to start with, then shrunk to fit the frame.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const isCompact = frame.clientWidth < COMPACT_BELOW;
      const geo = isCompact ? COMPACT : WIDE;
      setCompact(isCompact);
      setScale(Math.min(1, Math.max(isCompact ? 0.5 : minScale, frame.clientWidth / geo.w)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [minScale]);

  return (
    <section className={`w-full px-4 pb-14 text-[#1f1f1f] ${className ?? ''}`}>
      <div
        ref={frameRef}
        className="relative mx-auto w-full max-w-[1200px] overflow-hidden"
        style={{ height: g.h * scale }}
      >
        <div
          className="absolute left-1/2 top-0"
          style={{
            width: g.w,
            height: g.h,
            transform: `translateX(-50%) scale(${scale})`,
            transformOrigin: 'top center',
          }}
        >
          <svg
            className="pointer-events-none absolute inset-0"
            width={g.w}
            height={g.h}
            viewBox={`0 0 ${g.w} ${g.h}`}
            fill="none"
            style={{
              maskImage: 'linear-gradient(to bottom, #000 62%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, #000 62%, transparent 100%)',
            }}
          >
            <motion.path
              d={arcPath(g, g.radius.outer)}
              className="stroke-[#e4e4e4]"
              strokeWidth={2}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.4, ease: 'easeOut' }}
            />
            <motion.path
              d={arcPath(g, g.radius.inner)}
              className="stroke-[#dcdcdc]"
              strokeWidth={3}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.4, ease: 'easeOut', delay: 0.1 }}
            />
          </svg>

          {shown.map((item, i) => (
            <motion.div
              key={`${compact}-${i}`}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={positionOnRing(g, item.ring, item.angle)}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.5 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.div
                animate={{ y: [0, -4, 0] }}
                transition={{
                  duration: 4 + (i % 4) * 0.6,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: (i * 0.4) % 2,
                }}
                whileHover={{ scale: 1.06 }}
              >
                {renderItem(item)}
              </motion.div>
            </motion.div>
          ))}

          <div className={`absolute left-1/2 grid w-max -translate-x-1/2 auto-cols-fr grid-flow-col ${compact ? 'gap-7' : 'gap-7'}`} style={{ top: g.statsTop }}>
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                className="flex flex-col items-center"
                variants={reveal}
                initial="hidden"
                animate="show"
                transition={{ duration: 0.6, delay: 0.9 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className={`${compact ? 'text-[26px]' : 'text-[40px]'} font-medium leading-none tracking-[-0.02em] text-[#0b2921] tabular-nums`}>
                  <CountUp value={s.value} delay={0.9 + i * 0.12} />
                </span>
                <span className={`${compact ? 'mt-2 text-[12px]' : 'mt-[15px] text-[14px]'} leading-none text-[#5e6966]`}>{s.label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <motion.h2
        className="mx-auto mt-5 max-w-[600px] sm:mt-2 text-center font-display text-[26px] font-[450] leading-[1.18] tracking-[-0.01em] sm:text-[34px]"
        variants={reveal}
        initial="hidden"
        animate="show"
        transition={{ duration: 0.7, delay: 1.3, ease: [0.22, 1, 0.36, 1] }}
      >
        {headline}
      </motion.h2>

      {tags.length > 0 && (
        <div className="mx-auto mt-[35px] flex max-w-[760px] flex-wrap justify-center gap-3">
          {tags.map((t, i) => {
            const Tag = (t.href ? motion.a : motion.button) as typeof motion.a;
            return (
              <Tag
                key={t.label}
                {...(t.href ? { href: t.href } : { type: 'button' as const })}
                onClick={t.onClick}
                variants={reveal}
                initial="hidden"
                animate="show"
                transition={{ duration: 0.5, delay: 1.6 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ y: -2 }}
                whileTap={{ y: 0 }}
                className="group flex h-10 items-center gap-2.5 rounded-full border border-black/[0.08] bg-white pl-1.5 pr-4 text-[14px] font-medium text-[#3a3a3a] shadow-[0_1px_2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.8)] transition-all duration-200 hover:border-black/[0.14] hover:shadow-[0_6px_16px_-6px_rgba(0,0,0,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2e7d3e]/40 active:shadow-none"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eef4f0] text-[#2e7d3e] transition-colors group-hover:bg-[#2e7d3e] group-hover:text-white [&>svg]:h-[15px] [&>svg]:w-[15px]">
                  {t.icon}
                </span>
                {t.label}
              </Tag>
            );
          })}
        </div>
      )}
    </section>
  );
}

export { CommunityOrbit as Component };
