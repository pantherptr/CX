/** A small procedural city for the live board's map: an irregular street
 *  grid (arterials, local streets, one diagonal boulevard), a river with
 *  bridges, parks, roundabouts, building footprints, street names — and a
 *  road graph, so every car route is a real path along real streets with
 *  rounded corners. Deterministic: the same seed always draws the same city. */

export const WORLD = { w: 1800, h: 1200 };
const COLS = 13;
const ROWS = 9;
const STEP = 150;

type P = { x: number; y: number };

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fmt = (n: number) => Math.round(n * 10) / 10;

export interface City {
  river: string;
  arterials: string;
  locals: string;
  buildings: { a: string; b: string; c: string };
  parks: string;
  trees: { x: number; y: number; r: number }[];
  roundabouts: P[];
  labels: { id: string; d: string; name: string }[];
  places: { x: number; y: number; label: string }[];
  node: (i: number, j: number) => P;
  routeBetween: (a: [number, number], b: [number, number]) => string;
}

let cached: City | null = null;

export function buildCity(): City {
  if (cached) return cached;
  const rand = rng(20261007);

  // ---- nodes: a grid warped by a gentle wave plus a little noise ----
  const nodes: P[][] = [];
  for (let j = 0; j < ROWS; j++) {
    nodes[j] = [];
    for (let i = 0; i < COLS; i++) {
      const wx = 16 * Math.sin(j * 0.85 + i * 0.25) + (rand() - 0.5) * 12;
      const wy = 14 * Math.sin(i * 0.7 + j * 0.4) + (rand() - 0.5) * 12;
      nodes[j][i] = { x: 75 + i * STEP + wx, y: 75 + j * STEP + wy };
    }
  }
  const node = (i: number, j: number) => nodes[j][i];

  // ---- edges ----
  type Edge = { a: [number, number]; b: [number, number]; major: boolean };
  const isMajorRow = (j: number) => j % 3 === 1;
  const isMajorCol = (i: number) => i % 4 === 2;
  const edges: Edge[] = [];
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS - 1; i++) edges.push({ a: [i, j], b: [i + 1, j], major: isMajorRow(j) });
  for (let j = 0; j < ROWS - 1; j++) for (let i = 0; i < COLS; i++) edges.push({ a: [i, j], b: [i, j + 1], major: isMajorCol(i) });

  // an irregular city: drop some local streets, never splitting the network
  const key = (i: number, j: number) => j * COLS + i;
  const connected = (list: Edge[]) => {
    const adj = new Map<number, number[]>();
    for (const e of list) {
      const ka = key(...e.a);
      const kb = key(...e.b);
      adj.set(ka, [...(adj.get(ka) ?? []), kb]);
      adj.set(kb, [...(adj.get(kb) ?? []), ka]);
    }
    const seen = new Set<number>([0]);
    const stack = [0];
    while (stack.length) {
      const k = stack.pop()!;
      for (const n of adj.get(k) ?? []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
    }
    return seen.size === COLS * ROWS;
  };
  let kept = edges.slice();
  for (const e of edges) {
    if (e.major || rand() > 0.13) continue;
    const next = kept.filter((k) => k !== e);
    if (connected(next)) kept = next;
  }
  // the diagonal boulevard
  for (let i = 1; i < 9; i++) {
    const j = Math.floor(i * 0.62) + 1;
    const j2 = Math.floor((i + 1) * 0.62) + 1;
    kept.push({ a: [i, j], b: [i + 1, j2], major: true });
    if (j2 === j) continue;
  }

  // ---- road geometry ----
  const lineD = (e: Edge) => {
    const a = node(...e.a);
    const b = node(...e.b);
    return `M${fmt(a.x)} ${fmt(a.y)}L${fmt(b.x)} ${fmt(b.y)}`;
  };
  const arterials = kept.filter((e) => e.major).map(lineD).join('');
  const locals = kept.filter((e) => !e.major).map(lineD).join('');

  // ---- river: a long bend, with the roads crossing it as bridges ----
  const riverPts: P[] = [];
  for (let t = 0; t <= 1.0001; t += 0.04) {
    riverPts.push({ x: -60 + t * (WORLD.w + 120), y: 640 + 150 * Math.sin(t * 5.1 + 0.4) - 180 * t + 40 });
  }
  const river = riverPts.map((p, k) => `${k ? 'L' : 'M'}${fmt(p.x)} ${fmt(p.y)}`).join('');
  const distToRiver = (p: P) => riverPts.reduce((m, r) => Math.min(m, Math.hypot(r.x - p.x, r.y - p.y)), 1e9);

  // ---- blocks: parks, buildings ----
  const parkCells = new Set<string>(['2,2', '7,4', '10,1', '4,6', '8,6']);
  const bA: string[] = [];
  const bB: string[] = [];
  const bC: string[] = [];
  const parksD: string[] = [];
  const trees: { x: number; y: number; r: number }[] = [];
  const inset = (pts: P[], by: number): P[] => {
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return pts.map((p) => {
      const dx = cx - p.x;
      const dy = cy - p.y;
      const d = Math.hypot(dx, dy) || 1;
      return { x: p.x + (dx / d) * by, y: p.y + (dy / d) * by };
    });
  };
  const lerpP = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const poly = (pts: P[]) => `M${pts.map((p) => `${fmt(p.x)} ${fmt(p.y)}`).join('L')}Z`;

  for (let j = 0; j < ROWS - 1; j++) {
    for (let i = 0; i < COLS - 1; i++) {
      const quad = [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)];
      const c = { x: (quad[0].x + quad[2].x) / 2, y: (quad[0].y + quad[2].y) / 2 };
      const q = inset(quad, 13);
      if (distToRiver(c) < 62) continue; // water
      if (parkCells.has(`${i},${j}`) || distToRiver(c) < 118) {
        parksD.push(poly(inset(quad, 11)));
        const n = 7 + Math.floor(rand() * 6);
        for (let k = 0; k < n; k++) {
          const p = lerpP(lerpP(q[0], q[1], rand()), lerpP(q[3], q[2], rand()), rand());
          trees.push({ x: p.x, y: p.y, r: 4 + rand() * 4 });
        }
        continue;
      }
      // split the block into 1–4 buildings
      const layout = rand();
      const pick = () => (rand() < 0.5 ? bA : rand() < 0.6 ? bB : bC);
      const gap = 0.025;
      const mid = (a: P, b: P, t: number) => lerpP(a, b, t);
      if (layout < 0.25) {
        pick().push(poly(inset(q, 2 + rand() * 4)));
      } else if (layout < 0.6) {
        const t = 0.4 + rand() * 0.2;
        const l1 = mid(q[0], q[1], t - gap), l2 = mid(q[3], q[2], t - gap);
        const r1 = mid(q[0], q[1], t + gap), r2 = mid(q[3], q[2], t + gap);
        pick().push(poly(inset([q[0], l1, l2, q[3]], 1.5)));
        pick().push(poly(inset([r1, q[1], q[2], r2], 1.5)));
      } else {
        const tx = 0.42 + rand() * 0.16;
        const ty = 0.42 + rand() * 0.16;
        const top = (t: number) => mid(q[0], q[1], t);
        const bot = (t: number) => mid(q[3], q[2], t);
        const m = (t1: number, t2: number) => mid(top(t1), bot(t1), t2);
        const cells = [
          [q[0], top(tx - gap), m(tx - gap, ty - gap), mid(q[0], q[3], ty - gap)],
          [top(tx + gap), q[1], mid(q[1], q[2], ty - gap), m(tx + gap, ty - gap)],
          [mid(q[0], q[3], ty + gap), m(tx - gap, ty + gap), bot(tx - gap), q[3]],
          [m(tx + gap, ty + gap), mid(q[1], q[2], ty + gap), q[2], bot(tx + gap)],
        ];
        for (const cell of cells) pick().push(poly(inset(cell, 1 + rand() * 3)));
      }
    }
  }

  // ---- roundabouts at a few arterial crossings ----
  const roundabouts = [node(2, 4), node(6, 1), node(10, 7), node(6, 7)].map((p) => ({ x: p.x, y: p.y }));

  // ---- street names along the long arterials ----
  const labels: City['labels'] = [];
  const names = ['Via Roma', 'Gran Vía', 'Calea Victoriei', 'Corso Italia', 'Avenida del Mar'];
  let n = 0;
  for (let j = 0; j < ROWS; j++) {
    if (!isMajorRow(j)) continue;
    const pts = nodes[j];
    labels.push({ id: `fl-st-${n}`, d: pts.map((p, k) => `${k ? 'L' : 'M'}${fmt(p.x)} ${fmt(p.y)}`).join(''), name: names[n % names.length] });
    n++;
  }
  for (let i = 0; i < COLS; i++) {
    if (!isMajorCol(i)) continue;
    const pts = nodes.map((row) => row[i]);
    labels.push({ id: `fl-st-${n}`, d: pts.map((p, k) => `${k ? 'L' : 'M'}${fmt(p.x)} ${fmt(p.y)}`).join(''), name: names[n % names.length] });
    n++;
  }

  const places = [
    { ...node(11, 1), label: 'Airport' },
    { ...node(1, 1), label: 'Old Town' },
    { ...node(10, 7), label: 'Station' },
    { ...node(5, 5), label: 'Marina' },
  ];

  // ---- routing over the real street graph ----
  const adj = new Map<number, { to: number; w: number }[]>();
  const link = (a: number, b: number, w: number) => adj.set(a, [...(adj.get(a) ?? []), { to: b, w }]);
  for (const e of kept) {
    const pa = node(...e.a);
    const pb = node(...e.b);
    const len = Math.hypot(pa.x - pb.x, pa.y - pb.y) * (e.major ? 0.8 : 1);
    link(key(...e.a), key(...e.b), len);
    link(key(...e.b), key(...e.a), len);
  }
  const routeBetween = (a: [number, number], b: [number, number]) => {
    const start = key(...a);
    const goal = key(...b);
    const dist = new Map<number, number>([[start, 0]]);
    const prev = new Map<number, number>();
    const open = new Set<number>([start]);
    while (open.size) {
      let cur = -1;
      let best = Infinity;
      for (const k of open) { const d = dist.get(k)!; if (d < best) { best = d; cur = k; } }
      if (cur === goal) break;
      open.delete(cur);
      for (const { to, w } of adj.get(cur) ?? []) {
        const nd = best + w;
        if (nd < (dist.get(to) ?? Infinity)) { dist.set(to, nd); prev.set(to, cur); open.add(to); }
      }
    }
    const chain: P[] = [];
    for (let k: number | undefined = goal; k !== undefined; k = prev.get(k)) {
      chain.push(nodes[Math.floor(k / COLS)][k % COLS]);
      if (k === start) break;
    }
    chain.reverse();
    // rounded corners
    const r = 22;
    let d = `M${fmt(chain[0].x)} ${fmt(chain[0].y)}`;
    for (let k = 1; k < chain.length - 1; k++) {
      const p0 = chain[k - 1], p1 = chain[k], p2 = chain[k + 1];
      const d1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const d2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const a1 = Math.min(r, d1 / 2.2), a2 = Math.min(r, d2 / 2.2);
      const s = { x: p1.x + ((p0.x - p1.x) / d1) * a1, y: p1.y + ((p0.y - p1.y) / d1) * a1 };
      const e = { x: p1.x + ((p2.x - p1.x) / d2) * a2, y: p1.y + ((p2.y - p1.y) / d2) * a2 };
      d += `L${fmt(s.x)} ${fmt(s.y)}Q${fmt(p1.x)} ${fmt(p1.y)} ${fmt(e.x)} ${fmt(e.y)}`;
    }
    const last = chain[chain.length - 1];
    d += `L${fmt(last.x)} ${fmt(last.y)}`;
    return d;
  };

  cached = {
    river, arterials, locals,
    buildings: { a: bA.join(''), b: bB.join(''), c: bC.join('') },
    parks: parksD.join(''), trees, roundabouts, labels, places, node, routeBetween,
  };
  return cached;
}
