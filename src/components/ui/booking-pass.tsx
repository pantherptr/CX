import * as React from 'react';

/**
 * CX boarding pass — the ticket a renter gets the moment a booking is complete.
 *
 * Adapted from the "Lunar Boarding Pass" component: a black pass on the front (our car cut-out
 * flying across a star field, the CX medal in the stub) and a silver boarding pass on the back with
 * the booking's real details. Tear the stub off (drag it, or click / Enter) and the pass is stamped.
 * Click the ticket, or use the switch under it, to turn it over.
 *
 * No dependencies: React only; stars and the stamp are SVG / CSS.
 */

const clamp01 = (v: number): number => (v > 0 ? (v < 1 ? v : 1) : 0);
const finite = (v: number): number => (Number.isFinite(v) ? v : 0);

/** A drag past a fifth of the stub, or a quick flick, tears it. */
const tearDecision = (dx: number, v: number, w: number): boolean => dx > w * 0.2 || (v > 0.5 && dx > w * 0.05);

/** The stub follows the finger freely at first, then stiffens like paper. */
const resist = (dx: number, w: number): number => {
  const d = Math.max(0, finite(dx));
  const lim = Math.max(1, w) * 0.12;
  return d < lim ? d : lim + (d - lim) * 0.22;
};

const mulberry = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** n stars in a box: x, y, radius, twinkles (0/1), delay (s). Same seed, same sky. */
const starField = (seed: number, n: number, x0: number, x1: number, y0: number, y1: number): number[][] => {
  const rnd = mulberry(seed);
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const big = rnd() < 0.12;
    out.push([
      x0 + rnd() * (x1 - x0),
      y0 + rnd() * (y1 - y0),
      big ? 0.9 + rnd() * 0.8 : 0.3 + rnd() * 0.5,
      big || rnd() < 0.1 ? 1 : 0,
      Math.round(rnd() * 40) / 10,
    ]);
  }
  return out;
};

type Side = 'front' | 'back';

export interface BookingPassProps {
  /** Corner label on the front (e.g. "CX"). */
  tier?: string;
  /** Car, as one line: "2023 Aston Martin DB12". */
  title: string;
  /** Front, top right: the trip's dates. */
  date: string;
  /** Over the car, lower left. A newline breaks the line. */
  welcome?: string;
  /** Small print beside the stub. A newline breaks the line. */
  eyebrow?: string;
  /** The two words floating in the art (make / model). */
  words: [string, string];
  /** Three bits of fine print along the front's foot. */
  notes: [string, string, string];
  passenger: string;
  vehicle: string;
  reference: string;
  pickup: string;
  returnDate: string;
  place: string;
  /** Three small boxes: [label, value] ×3. */
  small: [[string, string], [string, string], [string, string]];
  total: string;
  coords?: string;
  host?: string;
  headline?: string;
  stamp?: string;
  /** Static labels (translated by the caller). */
  labels: {
    boardingPass: string;
    passenger: string;
    vehicle: string;
    reference: string;
    pickup: string;
    return: string;
    place: string;
    total: string;
    spot: string;
    tearHere: string;
    tear: string;
    reattach: string;
    front: string;
    back: string;
  };
  night?: string;
  starInk?: string;
  paper?: string;
  paperInk?: string;
  stampColor?: string;
  /** Picture of the car (transparent), shown flying on the front. */
  carImage?: string;
  /** The medal shown in the stub. */
  medalImage?: string;
  defaultSide?: Side;
  onTear?: (torn: boolean) => void;
  tilt?: number;
  maxWidth?: number | string;
  className?: string;
}

const VIEW_W = 1000;
const VIEW_H = 330;

const CONDENSED = '"Oswald", "Bebas Neue", "Avenir Next Condensed", "Helvetica Neue", "Arial Narrow", "Roboto Condensed", sans-serif';
const MONO = '"Courier Prime", "IBM Plex Mono", "Courier New", ui-monospace, monospace';
const DISPLAY = '"Futura", "Century Gothic", "Avenir Next", "Josefin Sans", ui-sans-serif, sans-serif';

const STARS = starField(1969, 120, 240, 990, 10, 320);

const CSS = [
  '.lbp{position:relative;width:100%;margin:0 auto}',
  '.lbp-stage{position:relative;width:100%;perspective:1800px;touch-action:pan-y}',
  '.lbp-tilt,.lbp-flip{position:absolute;inset:0;transform-style:preserve-3d}',
  '.lbp-tilt{transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .6s cubic-bezier(.2,.8,.2,1)}',
  '.lbp-flip{cursor:pointer;transition:transform 1.05s cubic-bezier(.65,-0.2,.25,1.2)}',
  '.lbp-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;',
  'filter:drop-shadow(0 1.4cqw 1.8cqw rgba(0,0,0,.2)) drop-shadow(0 .25cqw .35cqw rgba(0,0,0,.14))}',
  '.lbp-back{transform:rotateY(180deg)}',
  '.lbp-night{position:absolute;inset:0;overflow:hidden;border-radius:.35cqw;background:var(--lbp-night);color:var(--lbp-star);',
  'box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--lbp-star) 9%,transparent)}',
  '.lbp-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}',
  '.lbp-grain{opacity:.16;mix-blend-mode:screen}',
  '.lbp-piece .lbp-grain{opacity:.3;mix-blend-mode:multiply}',
  '.lbp-glow{background:radial-gradient(circle at var(--mx,50%) var(--my,40%),color-mix(in srgb,var(--lbp-star) 12%,transparent),transparent 42%)}',
  '.lbp-piece{position:absolute;top:0;bottom:0;overflow:hidden;color:var(--lbp-ink);',
  'background:linear-gradient(162deg,color-mix(in srgb,var(--lbp-paper) 82%,#fff) 0%,var(--lbp-paper) 48%,color-mix(in srgb,var(--lbp-paper) 88%,#000) 100%)}',
  '.lbp-main{left:0;width:77.4%;border-radius:.35cqw 0 0 .35cqw;padding:2.3cqw 2.6cqw 2.1cqw;display:flex;flex-direction:column;',
  '-webkit-mask:radial-gradient(circle at 100% 50%,#0000 .2cqw,#000 .24cqw) 0 0/100% .86cqw repeat-y;',
  'mask:radial-gradient(circle at 100% 50%,#0000 .2cqw,#000 .24cqw) 0 0/100% .86cqw repeat-y}',
  '.lbp-stub{left:77.4%;width:22.6%;border-radius:0 .35cqw .35cqw 0;padding:2.3cqw 1.9cqw 2.1cqw;display:flex;flex-direction:column;',
  'font:inherit;text-align:left;border:0;margin:0;cursor:grab;touch-action:pan-y;transform-origin:0 100%;',
  'transition:transform .75s cubic-bezier(.2,.9,.25,1.25);',
  '-webkit-mask:radial-gradient(circle at 0 50%,#0000 .2cqw,#000 .24cqw) 0 0/100% .86cqw repeat-y;',
  'mask:radial-gradient(circle at 0 50%,#0000 .2cqw,#000 .24cqw) 0 0/100% .86cqw repeat-y}',
  '.lbp-stub:active{cursor:grabbing}',
  '.lbp-stub:focus-visible{outline:2px solid var(--lbp-stamp);outline-offset:-4px}',
  '.lbp-stub.is-torn{transform:translate(2.4cqw,1.1cqw) rotate(4deg);cursor:pointer}',
  '.lbp-foil{background:linear-gradient(115deg,transparent calc(var(--mx,50%) - 24%),rgba(255,255,255,.62) var(--mx,50%),transparent calc(var(--mx,50%) + 24%)) no-repeat;mix-blend-mode:soft-light}',
  '.lbp-main .lbp-foil{background-size:129.2% 100%;background-position:0 0}',
  '.lbp-stub .lbp-foil{background-size:442.5% 100%;background-position:100% 0}',
  '.lbp-c{font-family:var(--lbp-cond);font-weight:700;font-stretch:condensed;text-transform:uppercase;line-height:1;letter-spacing:.01em}',
  '.lbp-m{font-family:var(--lbp-mono);text-transform:uppercase;line-height:1.05;letter-spacing:.03em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.lbp-d{font-family:var(--lbp-disp);font-weight:300;text-transform:uppercase;letter-spacing:.16em;line-height:1;white-space:nowrap}',
  '.lbp-l{display:block;font-family:var(--lbp-cond);font-weight:600;font-stretch:condensed;text-transform:uppercase;font-size:.6cqw;letter-spacing:.07em;line-height:1;opacity:.82;margin-bottom:.45cqw;white-space:nowrap}',
  '.lbp-at{position:absolute;white-space:nowrap}',
  '.lbp-pre{white-space:pre-line}',
  '.lbp-head{display:flex;align-items:baseline;justify-content:space-between;gap:1.5cqw;padding-bottom:1cqw;border-bottom:1px solid var(--lbp-rule)}',
  '.lbp-grid{display:grid;grid-template-columns:1.08fr 1fr .78fr;border-bottom:1px solid var(--lbp-rule)}',
  '.lbp-cell{padding:1cqw 1.2cqw 1cqw 0;min-width:0}',
  '.lbp-cell+.lbp-cell,.lbp-grid>:nth-child(5),.lbp-grid>:nth-child(6){border-left:1px solid var(--lbp-rule);padding-left:1.2cqw}',
  '.lbp-grid>:nth-child(4){border-left:0;padding-left:0}',
  '.lbp-grid>:nth-child(5),.lbp-grid>:nth-child(6){border-top:1px solid var(--lbp-rule)}',
  '.lbp-grid>:nth-child(4){border-top:1px solid var(--lbp-rule)}',
  '.lbp-row{display:flex;gap:2.4cqw}',
  '.lbp-foot{flex:1;display:flex;align-items:center;gap:2cqw;padding-top:1.1cqw}',
  '.lbp-sf{margin-top:1.45cqw;min-width:0}',
  '.lbp-stamp{position:absolute;left:33%;top:52%;padding:.35cqw;border:.2cqw solid var(--lbp-stamp);border-radius:.45cqw;color:var(--lbp-stamp);',
  'opacity:0;transform:rotate(-9deg);pointer-events:none;mix-blend-mode:multiply}',
  '.lbp-stamp>span{display:block;padding:.45cqw 1.1cqw;border:.08cqw solid var(--lbp-stamp);border-radius:.25cqw;text-align:center}',
  '.lbp-main.is-torn .lbp-stamp{opacity:.86;animation:lbp-stamp .5s cubic-bezier(.3,1.6,.5,1) both}',
  '@keyframes lbp-stamp{0%{opacity:0;transform:rotate(-4deg) scale(1.9)}100%{opacity:.86;transform:rotate(-9deg) scale(1)}}',
  '.lbp-hint{position:absolute;left:77.4%;bottom:1.6cqw;transform:translateX(-50%) rotate(180deg);writing-mode:vertical-rl;font-family:var(--lbp-cond);',
  'font-size:.5cqw;letter-spacing:.3em;text-transform:uppercase;color:var(--lbp-ink);opacity:.45;pointer-events:none;white-space:nowrap;transition:opacity .3s}',
  '.lbp-back.is-torn .lbp-hint{opacity:0}',
  '.lbp-printed .lbp-v{animation:lbp-type .8s steps(14,end) both}',
  '@keyframes lbp-type{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}',
  '.lbp-tw{animation:lbp-tw 3.4s ease-in-out infinite}',
  '@keyframes lbp-tw{0%,100%{opacity:1}50%{opacity:.2}}',
  '.lbp-carfly{position:absolute;left:30%;top:20%;width:60%;pointer-events:none;filter:drop-shadow(0 1.6cqw 1.2cqw rgba(0,0,0,.55));',
  'animation:lbp-float 6s ease-in-out infinite;transition:transform .9s cubic-bezier(.2,.8,.2,1)}',
  '.lbp-stage:hover .lbp-carfly{transform:translateX(2.2cqw)}',
  '@keyframes lbp-float{0%,100%{margin-top:0}50%{margin-top:-.9cqw}}',
  '.lbp-medal{position:absolute;border-radius:50%;pointer-events:none;',
  '-webkit-mask:radial-gradient(circle,#000 62%,transparent 64%) 0 0/.62cqw .62cqw;mask:radial-gradient(circle,#000 62%,transparent 64%) 0 0/.62cqw .62cqw;',
  'opacity:.95}',
  '@media (prefers-reduced-motion: reduce){.lbp-tilt,.lbp-flip,.lbp-stub{transition-duration:.01ms}',
  '.lbp-tw,.lbp-v,.lbp-stamp,.lbp-carfly{animation:none!important}}',
].join('');

function Star({ size }: { size: string }) {
  const p: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const r = i % 2 ? 0.34 : 1;
    p.push(`${Math.round((12 + Math.cos(a) * r * 11) * 100) / 100},${Math.round((12 + Math.sin(a) * r * 11) * 100) / 100}`);
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ display: 'inline-block', maxWidth: 'none', verticalAlign: '-0.1em' }}>
      <polygon points={p.join(' ')} fill="currentColor" />
    </svg>
  );
}

function Grain({ id }: { id: string }) {
  return (
    <svg className="lbp-layer lbp-grain" aria-hidden="true" style={{ maxWidth: 'none' }}>
      <filter id={id}>
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
}

function Field({ label, value, size, d }: { label: string; value: string; size: number; d?: number }) {
  return (
    <span style={{ display: 'block', minWidth: 0 }}>
      <span className="lbp-l">{label}</span>
      <span className="lbp-m lbp-v" style={{ display: 'block', fontSize: `${size}cqw`, animationDelay: `${d || 0}s` }}>
        {value}
      </span>
    </span>
  );
}

export default function BookingPass({
  tier = 'CX',
  title,
  date,
  welcome = 'Ready for\nthe road',
  eyebrow = 'Your CX\nboarding pass',
  words,
  notes,
  passenger,
  vehicle,
  reference,
  pickup,
  returnDate,
  place,
  small,
  total,
  coords,
  host,
  headline = 'I own the keys',
  stamp = 'Confirmed',
  labels,
  night = '#0b0b0c',
  starInk = '#f1f0eb',
  paper = '#cfd2cc',
  paperInk = '#16161a',
  stampColor = '#007a30',
  carImage = '/hero-car.webp?v=3',
  medalImage = '/brand/app-icon-1024.png',
  defaultSide = 'front',
  onTear,
  tilt = 6,
  maxWidth = 960,
  className = '',
}: BookingPassProps) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const [turns, setTurns] = React.useState(defaultSide === 'back' ? 1 : 0);
  const side: Side = turns % 2 ? 'back' : 'front';
  const [printed, setPrinted] = React.useState(defaultSide === 'back');
  const [torn, setTorn] = React.useState(false);
  const [reduced, setReduced] = React.useState(false);

  const stageRef = React.useRef<HTMLDivElement>(null);
  const tiltRef = React.useRef<HTMLDivElement>(null);
  const stubRef = React.useRef<HTMLButtonElement>(null);
  const drag = React.useRef<{ x: number; t: number; dx: number; v: number; moved: boolean } | null>(null);
  const swallowClick = React.useRef(false);
  const tearCb = React.useRef(onTear);
  tearCb.current = onTear;

  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  React.useEffect(() => {
    if (side === 'back') setPrinted(true);
  }, [side]);

  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    tearCb.current?.(torn);
  }, [torn]);

  const flip = () => setTurns((t) => t + 1);
  const show = (s: Side) => {
    if (s !== side) flip();
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = stageRef.current;
    const t = tiltRef.current;
    if (!el || !t) return;
    const r = el.getBoundingClientRect();
    const px = clamp01((e.clientX - r.left) / r.width);
    const py = clamp01((e.clientY - r.top) / r.height);
    t.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
    t.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    if (tilt && !reduced && e.pointerType === 'mouse') {
      t.style.setProperty('--rx', `${(-(py - 0.5) * 2 * tilt).toFixed(2)}deg`);
      t.style.setProperty('--ry', `${((px - 0.5) * 2 * tilt).toFixed(2)}deg`);
    }
  };
  const onLeave = () => {
    const t = tiltRef.current;
    if (t) {
      t.style.setProperty('--rx', '0deg');
      t.style.setProperty('--ry', '0deg');
    }
  };

  const stubDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (torn || e.button !== 0) return;
    drag.current = { x: e.clientX, t: performance.now(), dx: 0, v: 0, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const stubMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    const el = stubRef.current;
    if (!d || !el) return;
    const now = performance.now();
    const dx = Math.max(0, e.clientX - d.x);
    d.v = (dx - d.dx) / Math.max(1, now - d.t);
    d.t = now;
    d.dx = dx;
    if (dx > 4) d.moved = true;
    const w = el.offsetWidth;
    const shown = resist(dx, w);
    el.style.transition = 'none';
    el.style.transform = `translateX(${shown.toFixed(1)}px) rotate(${((shown / Math.max(1, w)) * 7).toFixed(2)}deg)`;
  };
  const stubUp = () => {
    const d = drag.current;
    const el = stubRef.current;
    drag.current = null;
    if (!d || !el) return;
    el.style.transition = '';
    el.style.transform = '';
    if (d.moved) {
      swallowClick.current = true;
      if (tearDecision(d.dx, d.v, el.offsetWidth)) setTorn(true);
    }
  };
  const stubClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    setTorn((v) => !v);
  };

  const front = side === 'front';
  const vars = {
    '--lbp-night': night,
    '--lbp-star': starInk,
    '--lbp-paper': paper,
    '--lbp-ink': paperInk,
    '--lbp-rule': `color-mix(in srgb, ${paperInk} 55%, transparent)`,
    '--lbp-stamp': stampColor,
    '--lbp-cond': CONDENSED,
    '--lbp-mono': MONO,
    '--lbp-disp': DISPLAY,
  } as React.CSSProperties;
  const at = (x: number, y: number): React.CSSProperties => ({ left: `${x / 10}%`, top: `${(y / VIEW_H) * 100}%` });

  return (
    <div className={`lbp ${className}`.trim()} style={{ ...vars, maxWidth }}>
      <style>{CSS}</style>
      <div
        ref={stageRef}
        className="lbp-stage"
        style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}`, containerType: 'inline-size' }}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
      >
        <div ref={tiltRef} className="lbp-tilt">
          <div className="lbp-flip" style={{ transform: `rotateY(${turns * 180}deg)` }} onClick={flip}>
            {/* ---------------- front ---------------- */}
            <div className="lbp-face" aria-hidden={!front}>
              <div className="lbp-night">
                <svg className="lbp-layer" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={{ maxWidth: 'none' }} aria-hidden="true">
                  {STARS.map((s, i) => (
                    <circle key={i} cx={s[0]} cy={s[1]} r={s[2]} fill={starInk} className={s[3] ? 'lbp-tw' : undefined} style={s[3] ? { animationDelay: `${s[4]}s` } : undefined} />
                  ))}
                  <line x1={226} x2={226} y1={0} y2={VIEW_H} stroke={starInk} strokeWidth={1} strokeDasharray="3 3.5" opacity={0.75} />
                </svg>
                {/* the medal, as a halftone, in the stub */}
                <div
                  className="lbp-medal"
                  style={{ left: `${((53 - 128) / VIEW_W) * 100}%`, top: `${((201 - 128) / VIEW_H) * 100}%`, width: `${(256 / VIEW_W) * 100}%`, aspectRatio: '1 / 1', overflow: 'hidden' }}
                >
                  <img src={medalImage} alt="" style={{ position: 'absolute', width: '230%', left: '-65%', top: '-83%', maxWidth: 'none' }} />
                </div>
                <img src={carImage} alt="" className="lbp-carfly" draggable={false} />
                <Grain id={`${uid}gf`} />
                <div className="lbp-layer lbp-glow" />

                <div className="lbp-at lbp-c" style={{ ...at(22, 23), fontSize: '2.7cqw', display: 'flex', alignItems: 'center', gap: '.55cqw' }}>
                  <Star size="0.92em" />
                  {tier}
                </div>
                <div className="lbp-at lbp-c lbp-pre" style={{ left: '2.4%', bottom: '6.5%', fontSize: '2.15cqw', lineHeight: 0.98, textShadow: `0 0 .5cqw ${night}, 0 0 1.2cqw ${night}` }}>
                  {welcome}
                </div>
                <div className="lbp-at lbp-c lbp-pre" style={{ ...at(256, 22), fontSize: '.8cqw', lineHeight: 1.2 }}>
                  {eyebrow}
                </div>
                <div className="lbp-at lbp-c" style={{ ...at(590, 22), transform: 'translateX(-50%)', fontSize: '2.2cqw' }}>
                  {title}
                </div>
                <div className="lbp-at lbp-c" style={{ right: '2.8%', top: `${(22 / VIEW_H) * 100}%`, fontSize: '2.2cqw' }}>
                  {date}
                </div>
                <div className="lbp-at lbp-d" style={{ right: '6%', top: '33%', fontSize: '2.35cqw', fontWeight: 400 }}>
                  {words[0]}
                </div>
                <div className="lbp-at lbp-d" style={{ ...at(268, 142), fontSize: '2.35cqw', fontWeight: 400 }}>
                  {words[1]}
                </div>
                <div className="lbp-at lbp-c" style={{ ...at(256, 296), fontSize: '.85cqw' }}>
                  {notes[0]}
                </div>
                <div className="lbp-at lbp-c" style={{ ...at(520, 296), fontSize: '.85cqw' }}>
                  {notes[1]}
                </div>
                <div className="lbp-at lbp-c" style={{ right: '2.8%', top: `${(296 / VIEW_H) * 100}%`, fontSize: '.85cqw' }}>
                  {notes[2]}
                </div>
              </div>
            </div>

            {/* ---------------- back ---------------- */}
            <div className={`lbp-face lbp-back${printed ? ' lbp-printed' : ''}${torn ? ' is-torn' : ''}`} aria-hidden={front}>
              <div className={`lbp-piece lbp-main${torn ? ' is-torn' : ''}`}>
                <Grain id={`${uid}gm`} />
                <div className="lbp-layer lbp-foil" />
                <div className="lbp-head">
                  <span className="lbp-c" style={{ fontSize: '1.65cqw' }}>{labels.boardingPass}</span>
                  <span className="lbp-c" style={{ fontSize: '2.3cqw' }}>{title}</span>
                  <span className="lbp-c" style={{ fontSize: '2.3cqw' }}>{tier}</span>
                </div>
                <div className="lbp-grid">
                  <div className="lbp-cell"><Field label={labels.passenger} value={passenger} size={1.45} d={0.1} /></div>
                  <div className="lbp-cell"><Field label={labels.vehicle} value={vehicle} size={1.45} d={0.25} /></div>
                  <div className="lbp-cell"><Field label={labels.reference} value={reference} size={1.45} d={0.4} /></div>
                  <div className="lbp-cell lbp-row">
                    <Field label={labels.pickup} value={pickup} size={1.3} d={0.55} />
                    <Field label={labels.return} value={returnDate} size={1.3} d={0.65} />
                  </div>
                  <div className="lbp-cell lbp-row" style={{ gap: '1.6cqw' }}>
                    <Field label={small[0][0]} value={small[0][1]} size={2.25} d={0.75} />
                    <Field label={small[1][0]} value={small[1][1]} size={2.25} d={0.85} />
                    <Field label={small[2][0]} value={small[2][1]} size={2.25} d={0.95} />
                  </div>
                  <div className="lbp-cell"><Field label={labels.total} value={total} size={1.45} d={1.05} /></div>
                </div>
                <div className="lbp-foot">
                  <div style={{ minWidth: 0, flex: '0 0 40%' }}>
                    <span className="lbp-l">{labels.spot}</span>
                    <div className="lbp-m lbp-v" style={{ fontSize: '1.3cqw', animationDelay: '1.15s' }}>{place}</div>
                    {coords && <div className="lbp-m lbp-v" style={{ fontSize: '1.3cqw', marginTop: '.3cqw', animationDelay: '1.25s' }}>{coords}</div>}
                    {host && <span className="lbp-l" style={{ marginTop: '.7cqw', marginBottom: 0, letterSpacing: '.04em' }}>{host}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                    <div className="lbp-d" style={{ fontSize: '3.3cqw' }}>{headline}</div>
                  </div>
                </div>
                <div className="lbp-stamp" aria-hidden="true">
                  <span>
                    <span className="lbp-c" style={{ display: 'block', fontSize: '2.2cqw', letterSpacing: '.18em' }}>{stamp}</span>
                    <span className="lbp-m" style={{ display: 'block', fontSize: '.75cqw', marginTop: '.35cqw' }}>{reference}</span>
                  </span>
                </div>
              </div>
              <button
                ref={stubRef}
                type="button"
                className={`lbp-piece lbp-stub${torn ? ' is-torn' : ''}`}
                tabIndex={front ? -1 : 0}
                aria-pressed={torn}
                aria-label={torn ? labels.reattach : labels.tear}
                onPointerDown={stubDown}
                onPointerMove={stubMove}
                onPointerUp={stubUp}
                onPointerCancel={stubUp}
                onClick={stubClick}
              >
                <Grain id={`${uid}gs`} />
                <span className="lbp-layer lbp-foil" />
                <span className="lbp-c" style={{ display: 'block', fontSize: '1.65cqw', paddingBottom: '1cqw', borderBottom: '1px solid var(--lbp-rule)' }}>
                  {labels.boardingPass}
                </span>
                <span className="lbp-sf" style={{ display: 'block' }}><Field label={labels.passenger} value={passenger} size={1.25} d={0.3} /></span>
                <span className="lbp-sf" style={{ display: 'block' }}><Field label={labels.vehicle} value={vehicle} size={1.2} d={0.45} /></span>
                <span className="lbp-sf lbp-row" style={{ display: 'flex', gap: '1.3cqw' }}>
                  <Field label={small[0][0]} value={small[0][1]} size={1.7} d={0.75} />
                  <Field label={small[1][0]} value={small[1][1]} size={1.7} d={0.85} />
                </span>
                <span className="lbp-sf" style={{ display: 'block' }}><Field label={labels.pickup} value={pickup} size={1.2} d={1.05} /></span>
                <span className="lbp-sf" style={{ display: 'block' }}><Field label={labels.reference} value={reference} size={1.2} d={1.15} /></span>
              </button>
              <span className="lbp-hint" aria-hidden="true">{labels.tearHere}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center gap-6" role="group">
        {(['front', 'back'] as Side[]).map((s, i) => (
          <button
            key={s}
            type="button"
            aria-pressed={side === s}
            onClick={() => show(s)}
            className={`group flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] transition-colors ${side === s ? 'text-ink' : 'text-muted hover:text-ink'}`}
          >
            <span className={`h-px bg-current transition-all duration-500 motion-reduce:transition-none ${side === s ? 'w-6' : 'w-2 opacity-50'}`} />
            <span>0{i + 1}</span>
            <span>{i === 0 ? labels.front : labels.back}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
