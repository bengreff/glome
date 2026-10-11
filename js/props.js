// Props: solid 4D shapes that stand on the ground. The rocks (outcrops of slabs, crystals, river stones, scree,
// erratic blocks) and the creatures' bodies are all props. Each is a convex shape in its own frame, scaled along its
// four axes, so one routine traces them all:
//   ball   a 4D ball (a glome), squashed into an ellipsoid by the scale;
//   box    a tesseract: slabs, blocks, pillars;
//   cross  the 16-cell (|x|+|y|+|z|+|w| <= 1): its slices are octahedra and tetrahedra, changing as you turn;
//   c24    the 24-cell (|x_i| + |x_j| <= 1 for every pair): cuboctahedra, octahedra, cubes as you turn;
//   duo    a duocylinder: smooth stones that roll in two planes.
// A slice-view ray never leaves your slice, so only the props your slice cuts can be seen: each frame the CPU keeps
// those (within range), finds the circle each covers on the screen, and the shader tests a pixel only against the
// circles it lies in. Props off your slice can still shade it, so the nearest of those go up too, for shadows.
import { G } from './game.js';
import { vec4, CAP_LO, CAP_HI, CAP_R } from './player.js';
import { LAWS } from './laws.js';
import { PLANET_R } from './world.js';
import { tangents } from './env.js';
import { rot as R4 } from './so4.js';

export const SHAPE = { ball: 0, box: 1, cross: 2, c24: 3, duo: 4 };
// materials: rock kinds first, then the creatures'
export const MAT = { granite: 0, sandstone: 1, crystal: 2, basalt: 3, worked: 4, metal: 5, roller: 6 };
export const MAXP = 96;                 // props sent to the GPU per frame
const TEXELS = 8;                       // per prop: centre, four axis columns, half-extents, (shape, mat, glow, R), spare
export const props = { rocks: [], extra: [], grid: new Map(), data: new Float32Array(MAXP * TEXELS * 4), circles: new Float32Array(MAXP * 4), centres: new Float32Array(MAXP * 4), n: 0, cut: 0, shade0: 0, list: [] };

// ---------- shapes ----------
const PLANES = { [SHAPE.cross]: [], [SHAPE.c24]: [] };
for (let s = 0; s < 16; s++) PLANES[SHAPE.cross].push([0, 1, 2, 3].map(i => (s >> i & 1 ? 1 : -1)));
for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) for (const a of [-1, 1]) for (const b of [-1, 1]) { const n = [0, 0, 0, 0]; n[i] = a; n[j] = b; PLANES[SHAPE.c24].push(n); }

// The prop's frame as columns (its axes in the world) from an SO(4) rotation.
function columns(rot) { const M = R4.toRows(rot); return [0, 1, 2, 3].map(j => [M[0][j], M[1][j], M[2][j], M[3][j]]); }
export function makeProp({ c, rot, e, shape, mat, glow = 0, kind = 'rock' }) {
  const cols = columns(rot);
  const p = { c: c.slice(), rot, cols, e: e.slice(), shape, mat, glow, kind };
  p.R = boundR(p);
  return p;
}
// How far the shape reaches along a unit direction u (its support function).
export function support(p, u) {
  const l = [0, 1, 2, 3].map(j => vec4.dot(u, p.cols[j]) * p.e[j]), a = l.map(Math.abs);
  switch (p.shape) {
    case SHAPE.ball: return Math.hypot(...l);
    case SHAPE.box: return a[0] + a[1] + a[2] + a[3];
    case SHAPE.cross: return Math.max(...a);
    case SHAPE.c24: return Math.max(Math.max(...a), (a[0] + a[1] + a[2] + a[3]) / 2);
    default: return Math.hypot(l[0], l[1]) + Math.hypot(l[2], l[3]);
  }
}
function boundR(p) {
  const e = p.e;
  switch (p.shape) {
    case SHAPE.ball: case SHAPE.cross: return Math.max(...e);
    case SHAPE.box: return Math.hypot(...e);
    case SHAPE.c24: return Math.max(Math.max(...e), Math.hypot(...e) / 2);
    default: return Math.hypot(Math.max(e[0], e[1]), Math.max(e[2], e[3]));
  }
}
// Signed distance (a close lower bound outside, exact on the faces) and the outward normal, at world point q.
export function propSD(p, q) {
  const d = vec4.sub(q, p.c), x = p.cols.map(col => vec4.dot(d, col)), e = p.e;
  let dist, nl;
  if (p.shape === SHAPE.box) {
    const o = x.map((v, i) => Math.abs(v) - e[i]), out = o.map(v => Math.max(v, 0)), ol = Math.hypot(...out);
    if (ol > 0) { dist = ol; nl = out.map((v, i) => v * Math.sign(x[i]) / ol); }
    else { let k = 0; for (let i = 1; i < 4; i++) if (o[i] > o[k]) k = i; dist = o[k]; nl = [0, 0, 0, 0]; nl[k] = Math.sign(x[k]) || 1; }
  } else if (p.shape === SHAPE.ball) {
    const qs = x.map((v, i) => v / e[i]), k0 = Math.hypot(...qs), k1 = Math.hypot(...qs.map((v, i) => v / e[i]));
    dist = k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(...e);
    const g = qs.map((v, i) => v / e[i]), gl = Math.hypot(...g) || 1; nl = g.map(v => v / gl);
  } else if (p.shape === SHAPE.duo) {
    const r1 = Math.hypot(x[0], x[1]), r2 = Math.hypot(x[2], x[3]), a = r1 - e[0], b = r2 - e[2];
    if (a > 0 && b > 0) { dist = Math.hypot(a, b); nl = [x[0] / r1 * a, x[1] / r1 * a, x[2] / r2 * b, x[3] / r2 * b].map(v => v / dist); }
    else if (a > b) { dist = a; nl = r1 > 1e-9 ? [x[0] / r1, x[1] / r1, 0, 0] : [1, 0, 0, 0]; }
    else { dist = b; nl = r2 > 1e-9 ? [0, 0, x[2] / r2, x[3] / r2] : [0, 0, 1, 0]; }
  } else {
    let best = -Infinity;
    for (const n of PLANES[p.shape]) {
      const m = n.map((v, i) => v / e[i]), ml = Math.hypot(...m), s = (m[0] * x[0] + m[1] * x[1] + m[2] * x[2] + m[3] * x[3] - 1) / ml;
      if (s > best) { best = s; nl = m.map(v => v / ml); }
    }
    dist = best;
  }
  const n = [0, 0, 0, 0];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) n[i] += nl[j] * p.cols[j][i];
  return { d: dist, n: vec4.norm(n) };
}

// ---------- where they are: a hash of 8 m cells over 4D positions, each prop entered in every cell its ball meets ----------
const CELL = 8;
const cellKey = (i, j, k, l) => ((i + 64) * 129 + (j + 64)) * 16641 + (k + 64) * 129 + (l + 64);
export function addRock(p) {
  props.rocks.push(p);
  const m = p.R + 1.0, lo = p.c.map(v => Math.floor((v - m) / CELL)), hi = p.c.map(v => Math.floor((v + m) / CELL));
  for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) for (let l = lo[3]; l <= hi[3]; l++) {
    const key = cellKey(i, j, k, l); let a = props.grid.get(key); if (!a) props.grid.set(key, a = []); a.push(p);
  }
}
const EMPTY = [];
export const rocksAt = q => props.grid.get(cellKey(Math.floor(q[0] / CELL), Math.floor(q[1] / CELL), Math.floor(q[2] / CELL), Math.floor(q[3] / CELL))) || EMPTY;
// The nearest rock surface to q (within about a metre: farther, Infinity).
export function rockSD(q) {
  let best = { d: Infinity, n: null, p: null };
  for (const p of rocksAt(q)) {
    const dd = vec4.sub(q, p.c);
    if (vec4.dot(dd, dd) > (p.R + 1) ** 2) continue;
    const s = propSD(p, q);
    if (s.d < best.d) best = { d: s.d, n: s.n, p };
  }
  return best;
}

// ---------- the rocks of the planet ----------
let seed = 31337;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
const off = (u, t, m) => vec4.norm(vec4.add(vec4.scale(u, Math.cos(m / PLANET_R)), vec4.scale(t, Math.sin(m / PLANET_R))));
const randDir = n => { const T = tangents(n); let w; do { w = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]; } while (Math.hypot(...w) > 0.5 || Math.hypot(...w) < 0.05); return vec4.norm([0, 1, 2, 3].map(i => w[0] * T[0][i] + w[1] * T[1][i] + w[2] * T[2][i])); };
// A random rotation that keeps local axis 3 within `tilt` of up at n, turned about up at random.
function standing(n, tilt) {
  const T = tangents(n);
  // a random frame of the 3D ground: a random rotation of the tangents (by a random unit quaternion's action)
  const a = randDir(n); let b = randDir(n); b = vec4.norm(vec4.sub(b, vec4.scale(a, vec4.dot(b, a))));
  let c = [0, 0, 0, 0]; for (const t of T) { const v = vec4.sub(vec4.sub(t, vec4.scale(a, vec4.dot(t, a))), vec4.scale(b, vec4.dot(t, b))); if (vec4.len(v) > vec4.len(c)) c = v; }
  c = vec4.norm(c);
  // tilt: lean the up axis toward a by a random angle
  const th = tilt * rnd(), up = vec4.add(vec4.scale(n, Math.cos(th)), vec4.scale(a, Math.sin(th))), a2 = vec4.sub(vec4.scale(a, Math.cos(th)), vec4.scale(n, Math.sin(th)));
  const rows = [0, 1, 2, 3].map(r => [a2[r], b[r], c[r], up[r]]);
  const det = m => { let d = 0; for (let j = 0; j < 4; j++) { const mm = [1, 2, 3].map(i => m[i].filter((_, k) => k !== j)); d += (j % 2 ? -1 : 1) * m[0][j] * (mm[0][0] * (mm[1][1] * mm[2][2] - mm[1][2] * mm[2][1]) - mm[0][1] * (mm[1][0] * mm[2][2] - mm[1][2] * mm[2][0]) + mm[0][2] * (mm[1][0] * mm[2][1] - mm[1][1] * mm[2][0])); } return d; };
  if (det(rows) < 0) rows.forEach(r => { r[0] = -r[0]; });
  return R4.fromMatrix(rows);
}
// Kinds of rock, each a cluster: what shapes, how big, how many, how deep in the ground (a share of its height).
const KINDS = {
  outcrop: () => ({ shape: rnd() < 0.8 ? SHAPE.box : SHAPE.c24, mat: rnd() < 0.55 ? MAT.sandstone : MAT.granite, e: [0.9 + 2.2 * rnd(), 0.8 + 1.8 * rnd(), 0.7 + 1.6 * rnd(), 0.5 + 1.4 * rnd()], tilt: 0.45, sink: 0.45 }),
  crystal: () => { const w = 0.3 + 0.45 * rnd(); return { shape: rnd() < 0.5 ? SHAPE.cross : SHAPE.c24, mat: MAT.crystal, e: [w, w * (0.8 + 0.4 * rnd()), w * (0.8 + 0.4 * rnd()), 1.0 + 1.6 * rnd()], tilt: 0.55, sink: 0.35 }; },
  stone: () => { const a = 0.3 + 0.55 * rnd(), b = a * (0.55 + 0.35 * rnd()); return rnd() < 0.6 ? { shape: SHAPE.duo, mat: MAT.basalt, e: [a, a, b, b], tilt: 1.4, sink: 0.25 }
                                                 : { shape: SHAPE.ball, mat: MAT.basalt, e: [a * 1.3, a * (0.8 + 0.4 * rnd()), a * (0.8 + 0.4 * rnd()), a * 0.55], tilt: 0.3, sink: 0.3 }; },
  scree: () => { const s = 0.18 + 0.35 * rnd(); return { shape: [SHAPE.box, SHAPE.cross, SHAPE.c24][Math.floor(rnd() * 3)], mat: rnd() < 0.5 ? MAT.granite : MAT.sandstone, e: [s, s * (0.6 + 0.6 * rnd()), s * (0.6 + 0.6 * rnd()), s * (0.5 + 0.5 * rnd())], tilt: 1.2, sink: 0.25 }; },
  erratic: () => { const s = 1.1 + 1.6 * rnd(); return { shape: rnd() < 0.7 ? SHAPE.box : SHAPE.cross, mat: MAT.granite, e: [s, s * (0.75 + 0.3 * rnd()), s * (0.75 + 0.3 * rnd()), s * (0.65 + 0.3 * rnd())], tilt: 0.6, sink: 0.35 }; },
};
const CLUSTER = { outcrop: [3, 7, 7], crystal: [4, 9, 3.5], stone: [2, 5, 4], scree: [10, 22, 6], erratic: [1, 1, 0] };   // count min, max, spread (m)
// Place one rock of a kind at unit n: its centre sunk a share of its height into the ground.
function placeRock(kind, n, hf, keepOut) {
  const k = KINDS[kind](), rot = standing(n, k.tilt);
  const p0 = makeProp({ c: [0, 0, 0, 0], rot, e: k.e, shape: k.shape, mat: k.mat });
  const reach = support(p0, n), h = hf.heightAt(n);
  if (hf.waterAt(n) > h + 0.2 && kind !== 'stone') return null;
  const c = vec4.scale(n, PLANET_R + h + reach * (1 - 2 * k.sink));
  if (keepOut(n, p0.R)) return null;
  for (const q of rocksAt(c)) if (vec4.len(vec4.sub(q.c, c)) < (q.R + p0.R) * 0.7) return null;   // not inside another
  const p = makeProp({ c, rot, e: k.e, shape: k.shape, mat: k.mat });
  p.kind = kind;
  addRock(p);
  return p;
}
function cluster(kind, n, hf, keepOut) {
  const [lo, hi, spread] = CLUSTER[kind], cnt = lo + Math.floor(rnd() * (hi - lo + 1)), out = [];
  for (let i = 0; i < cnt; i++) { const q = i === 0 ? n : off(n, randDir(n), spread * Math.sqrt(rnd())); const p = placeRock(kind, q, hf, keepOut); if (p) out.push(p); }
  return out;
}
const slopeAt = (hf, n) => { const T = tangents(n), e = 2; let s = 0; for (const t of T) s += ((hf.heightAt(off(n, t, e)) - hf.heightAt(off(n, t, -e))) / (2 * e)) ** 2; return Math.sqrt(s); };
// The planet's rocks, clustered by kind on the ground that suits each: outcrops on slopes and heights, crystals in the
// highlands, smooth stones by rivers and shores, scree at the foot of steep ground, and erratic blocks anywhere dry.
// A few of each near where you arrive. keepOut(n, r) says where none may stand (the start, the artifacts, paths).
export function makeRocks(hf, home, keepOut, near) {
  props.rocks.length = 0; props.grid.clear(); seed = 31337;
  const gauss = () => rnd() + rnd() + rnd() + rnd() - 2;
  const randomUnit = () => vec4.norm([gauss(), gauss(), gauss(), gauss()]);
  const want = { outcrop: 450, crystal: 70, stone: 240, scree: 180, erratic: 380 };
  const fits = {
    outcrop: (h, s, w) => w <= 0.01 && h > 3 && (s > 0.22 || h > 14),
    crystal: (h, s, w) => w <= 0.01 && h > 16,
    stone: (h, s, w, river) => (river || (h > -0.3 && h < 1.6)),
    scree: (h, s, w) => w <= 0.01 && s > 0.35 && h > 4,
    erratic: (h, s, w) => w <= 0.01 && h > 1.5 && s < 0.3,
  };
  const made = Object.fromEntries(Object.keys(want).map(k => [k, 0]));
  const tryAt = (kind, n) => {
    const h = hf.heightAt(n), w = hf.waterAt(n) - h, s = slopeAt(hf, n);
    const river = hf.waterAt(n) > 0.05 && w < 0.4 && w > -1.5;
    if (!fits[kind](h, s, w, river)) return false;
    if (cluster(kind, n, hf, keepOut).length) { made[kind]++; return true; }
    return false;
  };
  // near the start first: an outcrop, a crystal cluster, stones and an erratic within a short walk
  for (const [kind, lo, hi] of near) {
    for (let i = 0; i < 300; i++) { const n = off(home, randDir(home), lo + (hi - lo) * rnd()); if (tryAt(kind, n)) break; }
  }
  for (const kind of Object.keys(want)) for (let i = 0; i < 120000 && made[kind] < want[kind]; i++) tryAt(kind, randomUnit());
  return made;
}

// ---------- to the GPU ----------
// Extra props this frame (the creatures' bodies): { c, cols, e, shape, mat, glow, R }.
export function setExtraProps(list) { props.extra = list; }
const RANGE = 160;
export function uploadProps(cam, sun, W, H, fov) {
  const eye = cam.eye, A = cam.A, sa = sun ? vec4.dot(sun, A) : 0, cand = [];
  const consider = p => {
    const d = vec4.sub(p.c, eye), dist2 = vec4.dot(d, d), R = p.R;
    if (dist2 > (RANGE + R) ** 2) return;
    const a = vec4.dot(d, A), dist = Math.sqrt(dist2), s = Math.abs(a) < R + 8 ? support(p, A) : R;
    const cut = Math.abs(a) < s;
    if (!cut) {
      // off your slice it can still shade it, if its shadow reaches the slice: cast from its top along the sun, the
      // shadow spans ana offsets from a to a − L·(sun·A), L the length of the sun's ray down from its top to the ground
      if (dist > 70 || !sun) return;
      const up = vec4.scale(p.c, 1 / vec4.len(p.c)), su = vec4.dot(sun, up);
      if (su < 0.06) return;
      const L = Math.min(80, (R + R) / su), a2 = a - L * sa;
      if (Math.min(a, a2) > s || Math.max(a, a2) < -s) return;
    }
    cand.push({ p, dist, a, cut });
  };
  if (!props.nearAt || vec4.len(vec4.sub(props.nearAt, eye)) > 10 || props.nearT++ > 60) {   // the rocks within reach, now and then
    props.nearAt = eye.slice(); props.nearT = 0; props.nearList = props.rocks.filter(p => vec4.len(vec4.sub(p.c, eye)) < RANGE + 50 + p.R);
  }
  for (const p of props.nearList) consider(p);
  for (const p of props.extra) consider(p);
  // the nearest first; then in three runs: cut and far (seen only), cut and near (seen and shading), near and not
  // cut (shading only), so the shader's two loops (what a ray meets, what shades a point) each take one run
  cand.sort((x, y) => x.dist - y.dist);
  const NEAR = 60, cutL = cand.filter(x => x.cut), shadeL = cand.filter(x => !x.cut && x.dist < NEAR + x.p.R);
  const seen = cutL.slice(0, MAXP), shade = shadeL.slice(0, Math.max(0, Math.min(16, MAXP - seen.length)));
  const isNear = x => x.dist < NEAR + x.p.R;
  const list = seen.filter(x => !isNear(x)).concat(seen.filter(isNear), shade);
  props.list = list; props.n = list.length; props.cut = seen.length; props.shade0 = seen.filter(x => !isNear(x)).length;
  const D = props.data, C = props.circles, aspect = W / H;
  list.forEach(({ p, dist, a, cut }, i) => {
    const o = i * TEXELS * 4;
    // the far ones shrink to nothing toward the edge of the range, so they never pop
    const fade = Math.min(1, Math.max(0, (RANGE - dist) / (0.15 * RANGE)));
    D.set(p.c, o); for (let j = 0; j < 4; j++) D.set(p.cols[j], o + 4 + 4 * j);
    D.set(p.e.map(v => v * fade), o + 20); D.set([p.shape, p.mat, p.glow || 0, p.R * fade], o + 24); D.set([p.seed ?? i, 0, 0, 0], o + 28);
    // the circle on the screen its cut covers: the cut lies in the 3D ball of radius √(R² − a²) round c − a·A
    if (cut) {
      const rho = Math.sqrt(Math.max(0, p.R * p.R - a * a)) * fade + 0.02, cP = vec4.sub(vec4.sub(p.c, vec4.scale(A, a)), eye);
      const z = vec4.dot(cP, cam.F), x = vec4.dot(cP, cam.R), y = vec4.dot(cP, cam.U);
      if (z <= rho * 1.05) C.set([W / 2, H / 2, 4 * (W + H), p.R * fade], 4 * i);   // you are at it, or inside it: everywhere
      else {
        const k = Math.sqrt(z * z - rho * rho), sx = x / z, sy = y / z, rr = rho / k * Math.sqrt(1 + sx * sx + sy * sy) * 1.15;
        C.set([(sx / (fov * aspect) * 0.5 + 0.5) * W, (sy / fov * 0.5 + 0.5) * H, rr / fov * 0.5 * H + 3, p.R * fade], 4 * i);
      }
    } else C.set([-1e5, -1e5, 0, p.R * fade], 4 * i);
    props.centres.set(p.c, 4 * i);
  });
  return props;
}

// ---------- you among the rocks ----------
// As with boulders: full 4D contact with Coulomb friction (push in within about 42° of head-on and you stick), footing
// on any face within 60° of level, and holding Space against a big one scrambles you up its steepest way.
const AXIS = [CAP_LO, (CAP_LO + CAP_HI) / 2, CAP_HI];
export function rockContact(p, dt, input) {
  if (p.onB != null) return;
  const up = p.up(), MU = LAWS.MU;
  for (const y of AXIS) {
    const q = vec4.add(p.pos, vec4.scale(up, y)), s = rockSD(q);
    if (!(s.d < CAP_R + 0.02)) continue;
    const n = s.n, nu = vec4.dot(n, up);
    if (s.d < CAP_R) p.pos = vec4.add(p.pos, vec4.scale(nu > 0.5 && y === CAP_LO ? up : n, Math.min(0.3, (CAP_R - s.d) / (nu > 0.5 && y === CAP_LO ? nu : 1))));
    if (nu > 0.5) p.supported = true;
    if (input && input.jump && nu < 0.85 && nu > -0.3 && (input.fwd || input.right || input.ana) && s.p.R > 0.7) {
      const climb = vec4.sub(up, vec4.scale(n, nu)), cl = vec4.len(climb);
      if (cl > 1e-3) { p.vel = vec4.scale(climb, LAWS.CLIMB / cl); p.supported = true; p.climbUntil = G.simT + 0.35; return; }
    }
    const vn = vec4.dot(p.vel, n);
    if (vn >= 0) continue;
    let v = vec4.sub(p.vel, vec4.scale(n, vn));
    const vr = vec4.dot(v, up), vt = vec4.sub(v, vec4.scale(up, vr)), vtl = vec4.len(vt), stop = MU * -vn;
    p.vel = vtl <= stop ? vec4.scale(up, vr) : vec4.add(vec4.scale(up, vr), vec4.scale(vt, 1 - stop / vtl));
  }
}
