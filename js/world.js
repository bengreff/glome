// The planet: a 4D ball whose surface is a 3-sphere. Terrain height is a function on that 3-sphere,
// stored in a "cubed 3-sphere" atlas: 8 cubic charts, one per tesseract cell (±x, ±y, ±z, ±w).
import { fbm4, ridged4 } from './noise.js?v=20261008122325';
import { LAWS } from './laws.js?v=20261008122325';

export const PLANET_R = LAWS.R_A;   // metres
export const SEA = LAWS.SEA;        // sea level, metres above PLANET_R

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const FREQ = PLANET_R / 180;   // base feature wavelength ~180 m
const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const norm4 = a => { const l = Math.hypot(a[0], a[1], a[2], a[3]); return [a[0] / l, a[1] / l, a[2] / l, a[3] / l]; };
const arcM = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot4(a, b)))) * PLANET_R;   // walking distance (m)
// three perpendicular directions along the ground at unit u (quaternion i, j, k: no poles)
const tangents = ([a, b, c, d]) => [[-b, a, d, -c], [-c, -d, a, b], [-d, c, -b, a]];
const offset = (u, t, m) => norm4([0, 1, 2, 3].map(i => u[i] * Math.cos(m / PLANET_R) + t[i] * Math.sin(m / PLANET_R)));
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

// ---------- the crafted places (fixed for everyone: the planet is the same world for all) ----------
// The great massif: the most continental land on the planet, found once by search and fixed here.
export const MASSIF = norm4([-0.68321, 0.71031, -0.15836, 0.06005]);
// The archipelago: the deepest open sea about 400 m from the massif.
export const ARCHI = norm4([0.03776, -0.12244, -0.62311, -0.77157]);
let seed = 4242;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
const TA = tangents(ARCHI);
const dirIn = (T, a, b, c) => norm4([0, 1, 2, 3].map(i => a * T[0][i] + b * T[1][i] + c * T[2][i]));
// Islands: seven bumps of land in the archipelago's sea, at fixed places around its centre.
export const ISLANDS = [];
for (let i = 0; i < 7; i++) {
  const d = dirIn(TA, rnd() - 0.5, rnd() - 0.5, rnd() - 0.5), r = 25 + 70 * Math.cbrt(rnd());
  ISLANDS.push({ n: offset(ARCHI, d, i === 0 ? 0 : r), r: 11 + 10 * rnd(), H: 5 + 9 * rnd() });
}
// Bridges: low land joining two islands, bent sideways through a third ground direction, so from the obvious
// slice (the one holding both islands) the bridge is out of sight: the islands are joined only through ana.
export const BRIDGES = [[0, 1], [2, 3], [1, 4]].map(([i, j], k) => {
  const a = ISLANDS[i].n, b = ISLANDS[j].n, m = norm4(a.map((v, q) => v + b[q]));
  const along = norm4(b.map((v, q) => v - a[q] * dot4(a, b)));
  // a ground direction at the midpoint perpendicular to the bridge's line
  let side = tangents(m)[k % 3];
  side = norm4(side.map((v, q) => v - along[q] * dot4(side, along) - m[q] * dot4(side, m)));
  const mid = offset(m, side, 0.45 * arcM(a, b));
  return [a, mid, b];
});

// distance (m) from unit n to the chord a-b on the sphere (chords sag < 1 m for these lengths), and where along it
function segDist(n, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2], b[3] - a[3]], an = [n[0] - a[0], n[1] - a[1], n[2] - a[2], n[3] - a[3]];
  const t = Math.max(0, Math.min(1, dot4(an, ab) / dot4(ab, ab)));
  const d = [an[0] - t * ab[0], an[1] - t * ab[1], an[2] - t * ab[2], an[3] - t * ab[3]];
  return { d: Math.hypot(d[0], d[1], d[2], d[3]) * PLANET_R, t };
}

// The base landscape: fractal continents and ridged mountains, then the massif and the archipelago.
function baseHeight(n) {
  const x = n[0] * FREQ, y = n[1] * FREQ, z = n[2] * FREQ, w = n[3] * FREQ;
  const c = fbm4(x, y, z, w, 4);
  const m = ridged4(x * 2.1 + 11.3, y * 2.1 - 4.7, z * 2.1 + 2.9, w * 2.1 + 7.1, 4);
  const land = smoothstep(-0.02, 0.22, c);
  let h = 26 * c - 3 + 25 * land * m * m * m;
  // the massif: a broad dome of ridges round one summit, the highest on the planet by a clear margin
  const sM = arcM(n, MASSIF);
  if (sM < 260) {
    const B = Math.exp(-((sM / 88) ** 2));
    const mr = ridged4(x * 4.3 - 3.1, y * 4.3 + 8.2, z * 4.3 + 1.7, w * 4.3 - 5.9, 3);
    h = h * (1 - 0.6 * B) + B * (19 + 15 * mr * mr) + 10 * Math.exp(-((sM / 15) ** 2));
  }
  // the archipelago: open sea with islands, some joined only through ana
  const sA = arcM(n, ARCHI);
  if (sA < 190) {
    const W = smoothstep(185, 115, sA);
    let hs = -9 + 0.3 * h;
    for (const I of ISLANDS) {
      const d = arcM(n, I.n);
      if (d < 4 * I.r) hs = Math.max(hs, -9 + (I.H + 9) * Math.exp(-((d / I.r) ** 2)) + 1.5 * ridged4(x * 9, y * 9, z * 9, w * 9, 2) * Math.exp(-((d / I.r) ** 2)));
    }
    for (const [a, mid, b] of BRIDGES) {
      const d = Math.min(segDist(n, a, mid).d, segDist(n, mid, b).d);
      if (d < 14) hs = Math.max(hs, 2.2 - 0.09 * d * d);
    }
    h = h * (1 - W) + hs * W;
  }
  return h;
}

// Rivers: from springs on the massif's flanks, follow the steepest way down to the sea. Each is a polyline with a
// bed height that only ever falls; the channel is carved into the ground and the water stands 0.5 m above the bed.
const RIVER_W = 3.2;   // half-width of the flat bed (m)
export const RIVERS = [];
{
  // Trace a river from a spring: steepest descent with some momentum (so it cuts through small rises as a gorge).
  const trace = s0 => {
    const pts = [s0];
    let p = s0, prevDir = null, bed = baseHeight(s0) - 1.2;
    const beds = [bed];
    for (let i = 0; i < 170; i++) {
      const T = tangents(p), e = 1.5;
      let g = [0, 0, 0, 0];
      for (const t of T) { const dh = (baseHeight(offset(p, t, e)) - baseHeight(offset(p, t, -e))) / (2 * e); g = g.map((v, q) => v - dh * t[q]); }
      const gl = Math.hypot(...g);
      let dir = gl > 1e-4 ? g.map(v => v / gl) : prevDir;
      if (prevDir) dir = norm4(dir.map((v, q) => 0.4 * v + 0.6 * prevDir[q]));
      dir = norm4(dir.map((v, q) => v - p[q] * dot4(dir, p)));
      p = offset(p, dir, 3);
      prevDir = dir;
      const h = baseHeight(p);
      bed = Math.min(bed - 0.015, h - 1.2);
      pts.push(p); beds.push(bed);
      if (h < -1.5 && bed < -0.6) return { pts, beds };
    }
    return null;                                            // ends in a basin: not a river
  };
  // Springs round the massif's flanks; keep the three shortest rivers that reach the sea and stay apart.
  const TM = tangents(MASSIF), found = [];
  for (let k = 0; k < 24; k++) {
    const a = 2 * Math.PI * k / 24, b = Math.acos(1 - 2 * ((k * 0.618034) % 1));
    const d = dirIn(TM, Math.sin(b) * Math.cos(a), Math.sin(b) * Math.sin(a), Math.cos(b));
    const r = trace(offset(MASSIF, d, 46));
    if (r) found.push(r);
  }
  found.sort((x, y) => x.pts.length - y.pts.length);
  for (const r of found) {
    if (RIVERS.length === 3) break;
    if (RIVERS.some(R => R.pts.some(q => r.pts.some(p => arcM(p, q) < 30)))) continue;
    RIVERS.push(r);
  }
  for (const R of RIVERS) {
    // chunks of 8 segments with bounding caps, so a lookup far from the river costs a few dot products
    R.chunks = [];
    for (let i = 0; i < R.pts.length - 1; i += 8) {
      const j = Math.min(R.pts.length - 1, i + 8), c = norm4(R.pts[Math.floor((i + j) / 2)]);
      let r = 0; for (let k = i; k <= j; k++) r = Math.max(r, arcM(c, R.pts[k]));
      R.chunks.push({ i, j, c, cosR: Math.cos((r + 22) / PLANET_R) });
    }
  }
}
// The nearest river point to n within 22 m: distance, and the bed height there (or null).
export function riverAt(n) {
  let best = null;
  for (const R of RIVERS) for (const ch of R.chunks) {
    if (dot4(n, ch.c) < ch.cosR) continue;
    for (let k = ch.i; k < ch.j; k++) {
      const { d, t } = segDist(n, R.pts[k], R.pts[k + 1]);
      if (!best || d < best.d) best = { d, bed: R.beds[k] + t * (R.beds[k + 1] - R.beds[k]) };
    }
  }
  return best;
}

// Height (metres) of the ground above PLANET_R in unit direction n.
export function terrainHeight(n) {
  let h = baseHeight(n);
  const r = riverAt(n);
  if (r && r.d < 22) {
    const bank = r.bed + 0.25 * Math.max(0, r.d - RIVER_W) ** 2;          // a flat bed, then banks rising
    h = smin(h, bank, 2);
    h += (Math.max(h, r.bed) - h) * smoothstep(RIVER_W + 2, RIVER_W, r.d);   // and no pits in the channel
  }
  return h;
}
// The water surface (m above PLANET_R): the sea everywhere, and 0.5 m above the bed along the rivers.
export function waterLevel(n) {
  const r = riverAt(n);
  return r && r.d < 12 ? Math.max(SEA, r.bed + 0.5) : SEA;
}

// Chart c = 2*axis + (positive ? 1 : 0). Inside a chart the other three coordinates, in increasing
// axis order and divided by |n[axis]|, give cube coordinates u in [-1, 1]^3.
export function chartVector(c, u0, u1, u2) {
  const axis = c >> 1, s = (c & 1) ? 1 : -1, v = [0, 0, 0, 0], u = [u0, u1, u2];
  for (let i = 0, j = 0; i < 4; i++) v[i] = i === axis ? s : u[j++];
  const len = Math.hypot(v[0], v[1], v[2], v[3]);
  return [v[0] / len, v[1] / len, v[2] / len, v[3] / len];
}

export function chartCoords(n) {
  let axis = 0, m = Math.abs(n[0]);
  for (let i = 1; i < 4; i++) if (Math.abs(n[i]) > m) { m = Math.abs(n[i]); axis = i; }
  const u = [];
  for (let i = 0; i < 4; i++) if (i !== axis) u.push(n[i] / m);
  return { c: 2 * axis + (n[axis] > 0 ? 1 : 0), u };
}

// CPU copy of the atlas for physics. Layout matches the GPU 3D texture:
// index = i + N*j + N*N*(c*N + l), with texture depth 8N.
const SEAM = 0.04;   // blend width across chart seams, as a fraction of the largest component

// Pre-smooth the raw samples with the cubic B-spline kernel [1, 4, 1]/6 along each axis (clamped at chart
// edges). Trilinear interpolation of the result tracks the smooth cubic surface closely (median ~1 cm)
// while costing a single texture fetch.
export function prefilter(src, N) {
  const a = new Float32Array(src.length), b = new Float32Array(src.length), NN = N * N, rows = src.length / N;
  const run = (from, to, stride, startOf) => {
    for (let r = 0; r < rows; r++) {
      const s0 = startOf(r);
      for (let i = 0; i < N; i++) {
        const lo = from[s0 + Math.max(0, i - 1) * stride], mid = from[s0 + i * stride], hi = from[s0 + Math.min(N - 1, i + 1) * stride];
        to[s0 + i * stride] = (lo + 4 * mid + hi) / 6;
      }
    }
  };
  run(src, a, 1, r => r * N);
  run(a, b, N, r => (r % N) + Math.floor(r / N) * NN);
  run(b, a, NN, r => (r % NN) + Math.floor(r / NN) * NN * N);   // z stays within its chart
  return a;
}

// CPU copy of the (prefiltered) atlas for physics. Layout matches the GPU 3D texture:
// index = i + N*j + N*N*(c*N + l), texture depth 8N. Lookups match the shader exactly.
export class HeightField {
  constructor(data, N, water = null) { this.data = data; this.N = N; this.water = water; }

  chartHeight(n, k, N = this.N, data = this.data) {
    const m = Math.abs(n[k]), c = 2 * k + (n[k] > 0 ? 1 : 0);
    const t = [];
    for (let i = 0; i < 4; i++) if (i !== k) t.push(Math.min(N - 1, Math.max(0, (n[i] / m * 0.5 + 0.5) * (N - 1))));
    const i0 = t.map(v => Math.min(N - 2, Math.floor(v))), f = t.map((v, j) => v - i0[j]);
    let h = 0;
    for (let q = 0; q < 8; q++) {
      const x = q & 1, y = (q >> 1) & 1, z = (q >> 2) & 1;
      h += (x ? f[0] : 1 - f[0]) * (y ? f[1] : 1 - f[1]) * (z ? f[2] : 1 - f[2]) * data[(i0[0] + x) + N * (i0[1] + y) + N * N * (c * N + i0[2] + z)];
    }
    return h;
  }

  // Blend every chart whose axis is within SEAM of the largest, with smoothly varying weights,
  // so the ground is continuous across seams and corners.
  heightAt(n) { return this.blend(n, this.N, this.data); }
  // The water's surface: the sea, or a river 0.5 m above its bed (same lookup, half the resolution).
  waterAt(n) { return this.water ? Math.max(SEA, this.blend(n, this.N >> 1, this.water)) : SEA; }
  blend(n, N, data) {
    const a = n.map(Math.abs), amax = Math.max(a[0], a[1], a[2], a[3]);
    let sum = 0, wsum = 0;
    for (let k = 0; k < 4; k++) {
      let w = 1 - (amax - a[k]) / (SEAM * amax);
      if (w <= 0) continue;
      w = w * w * (3 - 2 * w);
      sum += w * this.chartHeight(n, k, N, data); wsum += w;
    }
    return sum / wsum;
  }
}
