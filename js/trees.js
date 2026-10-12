// Trees: groves and woods of 4D trees on the grassland and the river banks, a few landmark trees, and shrubs.
// A tree is a set of 4D shapes traced exactly: capsules for the trunk and branches (which spread in all three ground
// directions), balls for the foliage, and for conifers 4D cones. Your slice cuts only some of a tree, so from most
// places it is a scatter of floating pieces; only from the right place, looking the right way, does it join up.
//
// For the renderer, each frame keeps the trees your slice cuts (within range), and of each only the pieces the slice
// reaches: a branch whose ends lie both well off your slice to the same side can't be seen. Those go up in a texture
// with the circle each tree covers on the screen. Far trees drop their twigs. The rope and the walkers' legs travel
// the same way. The nearest crowns also go up as soft balls that shade the ground, letting some light through.
import { PLANET_R, riverAt } from './world.js';
import { vec4 } from './player.js';
import { tangents } from './env.js';
import { fbm4 } from './noise.js';
import { flora, FLORA_RANGE } from './flora.js';

// kinds of piece: 0 bark, 1 leaves, 2 rope, 3 a walker's leg, 4 a conifer's needles (a cone), 5 pale bark (birch), 6 dead wood,
// and the flora's (flora.js): 7 a green stem, 8 a flower head, 9 a tuft of grass (a cone)
const F = 10;                                   // floats per piece: a (4), b (4), radius, kind
let CAPS = new Float32Array(1 << 16), ncap = 0;
export const trees = [];                        // { n, base, start, count, c, R, crown: { c, r }, kind }
export const groves = [];                       // { n, r, count }: for the radar
export const MAXTG = 640, MAXTC = 6144, MAXTSH = 16, CHUNK = 12;
export const rope = { obj: null, alpha: 1 };
export const legs = { caps: [] };
export const tgpu = { data: new Float32Array(MAXTC * 12), nc: 0, groups: new Float32Array(MAXTG * 12), n: 0,
                      shC: new Float32Array(MAXTSH * 4), shR: new Float32Array(MAXTSH), shN: 0 };
let seed = 777;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
const off = (u, t, m) => vec4.norm(vec4.add(vec4.scale(u, Math.cos(m / PLANET_R)), vec4.scale(t, Math.sin(m / PLANET_R))));
function pushCap(a, b, r, kind) {
  if ((ncap + 1) * F > CAPS.length) { const c = new Float32Array(CAPS.length * 2); c.set(CAPS); CAPS = c; }
  const o = ncap * F; CAPS.set(a, o); CAPS.set(b, o + 4); CAPS[o + 8] = r; CAPS[o + 9] = kind; ncap++;
}
const horiz = (T, w) => { const wl = Math.hypot(...w); return vec4.norm([0, 1, 2, 3].map(q => (w[0] * T[0][q] + w[1] * T[1][q] + w[2] * T[2][q]) / wl)); };
const randH = T => { let w; do { w = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]; } while (Math.hypot(...w) < 0.05 || Math.hypot(...w) > 0.5); return horiz(T, w); };

// Grow a tree at unit n (ground height h). Forms: 'broad' (a branching crown of leaf clumps), 'conifer' (a trunk and
// stacked 4D cones), 'birch' (slender, pale, few branches), 'dead' (bare branches), 'shrub' (a few clumps of leaves).
export function growTree(n, h, { height = 7, depth = 3, spread = 0.75, form = 'broad', trunk = 0.42 } = {}) {
  const up = n, base = vec4.scale(n, PLANET_R + h - 0.3), T = tangents(n), start = ncap;
  const leaves = [];
  if (form === 'shrub') {
    const k = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < k; i++) {
      const r = (0.45 + 0.5 * rnd()) * height, c = vec4.add(vec4.add(base, vec4.scale(up, 0.3 + r * 0.7)), vec4.scale(randH(T), i ? r * 0.8 : 0));
      pushCap(c, c, r, 1); leaves.push([c, r]);
    }
  } else if (form === 'conifer') {
    const top = vec4.add(base, vec4.scale(up, height));
    pushCap(base, vec4.add(base, vec4.scale(up, height * 0.9)), trunk * 0.8, 0);
    // one tall cone of needles from near the ground, and a slimmer one inside its upper half (off the axis, your slice
    // cuts them in rounded domes; through it, in cones)
    const w = height * (0.2 + 0.07 * rnd()), a0 = vec4.add(base, vec4.scale(up, 0.1)), a1 = vec4.add(base, vec4.scale(up, height * 0.45));
    pushCap(a0, top, w, 4); leaves.push([vec4.scale(vec4.add(a0, top), 0.5), w]);
    pushCap(a1, vec4.add(top, vec4.scale(up, 0.4)), w * 0.62, 4);
  } else {
    const kindBark = form === 'birch' ? 5 : form === 'dead' ? 6 : 0;
    const grow = (a, dir, len, r, level) => {
      const b = vec4.add(a, vec4.scale(dir, len));
      pushCap(a, b, r, kindBark);
      if (level === depth) { if (form !== 'dead') { const lr = (form === 'birch' ? 0.55 : 0.9) + (form === 'birch' ? 0.35 : 0.7) * rnd(); pushCap(b, b, lr, 1); leaves.push([b, lr]); } return; }
      // the inner crown: big clumps where the boughs fork, so the leaves reach in toward the trunk and down
      if (form === 'broad' && level === depth - 1 && rnd() < 0.7) { const lr = 1.2 + 0.6 * rnd(); pushCap(b, b, lr, 1); leaves.push([b, lr]); }
      const k = level === 0 ? (form === 'birch' ? 3 : 4) : form === 'birch' ? 2 : 3;
      for (let i = 0; i < k; i++) {
        // a random horizontal direction in the 3D ground (not just left or right: toward ana and kata too)
        const hz = randH(T), tilt = spread * (0.7 + 0.5 * rnd()) * (level === 0 ? 1.1 : 1);
        const d2 = vec4.norm(vec4.add(vec4.scale(dir, Math.cos(tilt)), vec4.scale(hz, Math.sin(tilt))));
        grow(b, vec4.norm(vec4.add(d2, vec4.scale(up, form === 'birch' ? 0.6 : 0.25))), len * (0.62 + 0.12 * rnd()), r * 0.62, level + 1);
      }
    };
    grow(base, up, height * (form === 'birch' ? 0.5 : 0.34), trunk, 0);
  }
  // bounding ball, and the crown's (for shade)
  let c = [0, 0, 0, 0];
  for (let i = start; i < ncap; i++) for (let q = 0; q < 4; q++) c[q] += (CAPS[i * F + q] + CAPS[i * F + 4 + q]) / (2 * (ncap - start));
  let R = 0;
  for (let i = start; i < ncap; i++) for (const o of [i * F, i * F + 4]) R = Math.max(R, Math.hypot(CAPS[o] - c[0], CAPS[o + 1] - c[1], CAPS[o + 2] - c[2], CAPS[o + 3] - c[3]) + CAPS[i * F + 8]);
  let crown = null;
  if (leaves.length) {
    let cc = [0, 0, 0, 0]; for (const [p] of leaves) cc = vec4.add(cc, vec4.scale(p, 1 / leaves.length));
    let cr = 0; for (const [p, r] of leaves) cr = Math.max(cr, vec4.len(vec4.sub(p, cc)) + r * 0.8);
    crown = { c: cc, r: cr };
  }
  const t = { n, base, start, count: ncap - start, c, R, crown, form, h: height };
  trees.push(t); addToGrid(t);
  return t;
}

// ---------- where they are (for collisions): trees by 8 m cells of their trunk's region ----------
const CELL = 8, grid = new Map();
const cellKey = (i, j, k, l) => ((i + 64) * 129 + (j + 64)) * 16641 + (k + 64) * 129 + (l + 64);
function addToGrid(t) {
  const m = Math.min(t.R, 6) + 1, c = vec4.add(t.base, vec4.scale(t.n, 2)), lo = c.map(v => Math.floor((v - m - 2) / CELL)), hi = c.map(v => Math.floor((v + m + 2) / CELL));
  for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) for (let l = lo[3]; l <= hi[3]; l++) {
    const key = cellKey(i, j, k, l); let a = grid.get(key); if (!a) grid.set(key, a = []); a.push(t);
  }
}
// Distance from p to the nearest trunk or bough (for collisions; leaves and twigs don't stop you).
export function treeSD(p) {
  let best = { d: Infinity, n: null };
  const list = grid.get(cellKey(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL), Math.floor(p[2] / CELL), Math.floor(p[3] / CELL)));
  if (!list) return best;
  for (const t of list) {
    if (vec4.len(vec4.sub(p, t.c)) > t.R + 2) continue;
    for (let i = t.start; i < t.start + t.count; i++) {
      const o = i * F, kind = CAPS[o + 9], r = CAPS[o + 8];
      if (kind === 1 || kind === 4 || r < 0.09) continue;
      const a = [CAPS[o], CAPS[o + 1], CAPS[o + 2], CAPS[o + 3]], ab = [CAPS[o + 4] - a[0], CAPS[o + 5] - a[1], CAPS[o + 6] - a[2], CAPS[o + 7] - a[3]];
      const ap = vec4.sub(p, a), L2 = vec4.dot(ab, ab), s = L2 > 0 ? Math.max(0, Math.min(1, vec4.dot(ap, ab) / L2)) : 0;
      const dv = vec4.sub(ap, vec4.scale(ab, s)), l = vec4.len(dv), d = l - r;
      if (d < best.d) best = { d, n: vec4.scale(dv, 1 / Math.max(l, 1e-9)) };
    }
  }
  return best;
}

// ---------- groves and woods ----------
// Where woods grow: low-frequency noise over the 3-sphere, on grassland (2–26 m up, dry, not steep), more along the
// river banks. Each grove is a cluster of trees of a few forms, spaced at least a few metres apart in the 3D ground.
const slope = (hf, n) => { const T = tangents(n), e = 2; let s = 0; for (const t of T) s += ((hf.heightAt(off(n, t, e)) - hf.heightAt(off(n, t, -e))) / (2 * e)) ** 2; return Math.sqrt(s); };
const woodiness = n => fbm4(n[0] * 3.1 + 7.3, n[1] * 3.1 - 2.2, n[2] * 3.1 + 5.1, n[3] * 3.1 - 9.4, 3);
function plantGrove(hf, center, radius, count, mix, keepOut, minGap = 3.4) {
  const T = tangents(center), placed = [];
  for (let k = 0; k < count * 6 && placed.length < count; k++) {
    const m = radius * Math.cbrt(rnd()), n = off(center, randH(T), m), h = hf.heightAt(n);
    if (h < 0.6 || hf.waterAt(n) > h - 0.25 || slope(hf, n) > 0.6) continue;
    if (keepOut(n, 2)) continue;
    if (placed.some(q => vec4.dot(q, n) > Math.cos(minGap / PLANET_R))) continue;
    // the form: by the grove's mix
    const u = rnd(); let acc = 0, form = 'broad';
    for (const [f, w] of mix) { acc += w; if (u < acc) { form = f; break; } }
    const s = 0.75 + 0.6 * rnd();
    if (form === 'broad') growTree(n, h, { height: 6.5 * s, depth: 2, spread: 0.6 + 0.3 * rnd(), trunk: 0.32 + 0.18 * s });
    else if (form === 'conifer') growTree(n, h, { height: 7.5 * s + 2, form, trunk: 0.28 + 0.1 * s });
    else if (form === 'birch') growTree(n, h, { height: 6 * s + 1.5, depth: 2, spread: 0.45, form, trunk: 0.17 + 0.05 * s });
    else if (form === 'dead') growTree(n, h, { height: 5 * s, depth: 2, spread: 0.8, form, trunk: 0.25 });
    else growTree(n, h, { height: 0.9 + 0.7 * rnd(), form: 'shrub' });
    placed.push(n);
  }
  // undergrowth: shrubs among the trees
  for (let k = 0, made = 0; k < placed.length * 3 && made < Math.ceil(placed.length * 0.6); k++) {
    const n = off(center, randH(T), radius * 1.1 * Math.cbrt(rnd())), h = hf.heightAt(n);
    if (h < 0.6 || hf.waterAt(n) > h - 0.25 || keepOut(n, 1.5)) continue;
    growTree(n, h, { height: 0.9 + 0.8 * rnd(), form: 'shrub' }); made++;
  }
  if (placed.length) groves.push({ n: center, r: radius, count: placed.length });
  return placed.length;
}
const MIXES = {
  meadow: [['broad', 0.55], ['shrub', 0.3], ['birch', 0.15]],
  wood: [['broad', 0.5], ['conifer', 0.2], ['birch', 0.12], ['shrub', 0.15], ['dead', 0.03]],
  pines: [['conifer', 0.75], ['shrub', 0.15], ['dead', 0.1]],
  river: [['broad', 0.5], ['birch', 0.3], ['shrub', 0.2]],
};
// The planet's woods: a grove near where you arrive, then groves and woods wherever the ground suits them.
export function makeForests(hf, home, keepOut, homeSide) {
  seed = 777;
  const gauss = () => rnd() + rnd() + rnd() + rnd() - 2, randomUnit = () => vec4.norm([gauss(), gauss(), gauss(), gauss()]);
  let total = 0;
  // where you arrive: a grove off to one side, a few trees close by, and a wood beyond
  total += plantGrove(hf, off(home, homeSide, 30), 16, 80, MIXES.meadow, keepOut, 2.8);
  total += plantGrove(hf, home, 36, 220, MIXES.meadow, keepOut, 3.2);
  total += plantGrove(hf, off(home, vec4.scale(homeSide, -1), 65), 32, 260, MIXES.wood, keepOut, 2.6);
  for (let i = 0; i < 120000 && total < 14000; i++) {
    const n = randomUnit(), h = hf.heightAt(n);
    if (h < 1 || h > 26 || hf.waterAt(n) > h - 0.3) continue;
    const rv = riverAt(n), nearRiver = rv && rv.d < 20, w = woodiness(n);
    if (!nearRiver && w < 0.08) continue;
    if (rnd() > (nearRiver ? 0.5 : 0.3)) continue;
    const big = w > 0.3 && !nearRiver;
    const kind = nearRiver ? 'river' : h > 17 ? 'pines' : big ? 'wood' : 'meadow';
    const r = big ? 15 + 10 * rnd() : kind === 'pines' ? 11 + 8 * rnd() : kind === 'river' ? 8 + 6 * rnd() : 7 + 8 * rnd();
    // a grove's count from its size: about one tree per 60 m³ of ground in a wood, sparser in a meadow
    const cnt = Math.round((4 / 3) * Math.PI * r ** 3 / (big || kind === 'pines' ? 60 : 130));
    total += plantGrove(hf, n, r, Math.min(cnt, 180), MIXES[kind], keepOut, big ? 2.6 : 3);
  }
  // and single trees and shrubs over all the grassland, between the groves
  let singles = 0, bushes = 0;
  for (let i = 0; i < 120000 && (singles < 6500 || bushes < 2000); i++) {
    const n = randomUnit(), h = hf.heightAt(n);
    if (h < 1.2 || h > 28 || hf.waterAt(n) > h - 0.3 || slope(hf, n) > 0.55 || keepOut(n, 2)) continue;
    if (bushes < 2000 && (singles >= 6500 || rnd() < 0.24)) { growTree(n, h, { height: 0.8 + 0.9 * rnd(), form: 'shrub' }); bushes++; continue; }
    const u = rnd(), s = 0.8 + 0.5 * rnd();
    if (u < 0.45) growTree(n, h, { height: 6.5 * s, depth: 2, spread: 0.6 + 0.3 * rnd(), trunk: 0.32 + 0.18 * s });
    else if (u < 0.75) growTree(n, h, { height: 7.5 * s + 2, form: 'conifer', trunk: 0.3 });
    else if (u < 0.92) growTree(n, h, { height: 6 * s + 1.5, depth: 2, spread: 0.45, form: 'birch', trunk: 0.18 });
    else growTree(n, h, { height: 5 * s, depth: 2, spread: 0.8, form: 'dead', trunk: 0.25 });
    singles++;
  }
  return total + singles;
}

// ---------- to the GPU, each frame ----------
const RANGE = 150, near = { k: 0, list: [], dirty: true };
// The trees within reach, kept up to date a slice at a time (a thirtieth of them a frame), so no frame scans them all:
// in within `enter` metres of the eye, out beyond `leave` (each flagged by .near on the item).
export function nearScan(N, all, eye, enter, leave, key = 'nearT') {
  // (all at once at the start, and after a jump of more than 30 m: a landing, a fade home)
  if (!N.at || Math.hypot(N.at[0] - eye[0], N.at[1] - eye[1], N.at[2] - eye[2], N.at[3] - eye[3]) > 30) { for (const t of all) { const c = t.c; t[key] = Math.hypot(c[0] - eye[0], c[1] - eye[1], c[2] - eye[2], c[3] - eye[3]) < enter + t.R; } N.dirty = true; }
  N.at = eye.slice();
  const step = Math.ceil(all.length / 30);
  for (let i = 0; i < step; i++, N.k = (N.k + 1) % all.length) {
    const t = all[N.k], c = t.c, d = Math.hypot(c[0] - eye[0], c[1] - eye[1], c[2] - eye[2], c[3] - eye[3]) - t.R;
    if (!t[key] && d < enter) { t[key] = true; N.dirty = true; }
    else if (t[key] && d > leave) { t[key] = false; N.dirty = true; }
  }
  if (N.dirty) { N.list = all.filter(t => t[key]); N.dirty = false; }
}
const capA = new Float32Array(4);
export function treeFrame(cam, sun, W, H, fov) {
  const eye = cam.eye, A = cam.A, D = tgpu.data, aspect = W / H;
  let nc = 0, ng = 0, seedOf = 0;
  const groups = [];
  nearScan(near, trees, eye, RANGE + 40, RANGE + 70);
  for (const t of near.list) {
    const d = vec4.sub(t.c, eye), dist2 = vec4.dot(d, d);
    if (dist2 > (RANGE + t.R) ** 2) continue;
    const a = vec4.dot(d, A);
    if (Math.abs(a) > t.R) continue;                        // the slice misses it entirely
    groups.push({ t, dist: Math.sqrt(dist2) });
  }
  groups.sort((x, y) => x.dist - y.dist);
  const ea = vec4.dot(eye, A);
  const emit = (S, o, fade) => {                               // one piece (at o in S), if the slice reaches it
    const r = S[o + 8] * fade;
    const a1 = S[o] * A[0] + S[o + 1] * A[1] + S[o + 2] * A[2] + S[o + 3] * A[3] - ea;
    const a2 = S[o + 4] * A[0] + S[o + 5] * A[1] + S[o + 6] * A[2] + S[o + 7] * A[3] - ea;
    if (Math.min(a1, a2) > r || Math.max(a1, a2) < -r) return false;
    const q = nc * 12;
    if (S[o + 9] === 1) {
      // a clump of leaves (a 4D ball): the slice cuts it in a 3D ball, which goes up in the slice's own coordinates
      // (forward, right, up from your eye), radius √(r² − a²): one fetch and a 3D test for the shader
      const c0 = S[o] - eye[0], c1 = S[o + 1] - eye[1], c2 = S[o + 2] - eye[2], c3 = S[o + 3] - eye[3];
      D[q] = c0 * cam.F[0] + c1 * cam.F[1] + c2 * cam.F[2] + c3 * cam.F[3];
      D[q + 1] = c0 * cam.R[0] + c1 * cam.R[1] + c2 * cam.R[2] + c3 * cam.R[3];
      D[q + 2] = c0 * cam.U[0] + c1 * cam.U[1] + c2 * cam.U[2] + c3 * cam.U[3];
      D[q + 3] = Math.sqrt(Math.max(0, r * r - a1 * a1));
      for (let k = 0; k < 4; k++) D[q + 4 + k] = S[o + k];         // (the 4D centre, for shading)
    } else for (let k = 0; k < 8; k++) D[q + k] = S[o + k];
    D[q + 8] = r; D[q + 9] = S[o + 9]; D[q + 10] = seedOf; D[q + 11] = 0;
    nc++;
    return true;
  };
  const Gd = tgpu.groups;
  const circle = (c, R, i) => {                                // the screen circle of a 4D ball's cut by the slice
    const a = vec4.dot(vec4.sub(c, eye), A), rho = Math.sqrt(Math.max(0, R * R - a * a)) + 0.05, cP = vec4.sub(vec4.sub(c, vec4.scale(A, a)), eye);
    const z = vec4.dot(cP, cam.F), x = vec4.dot(cP, cam.R), y = vec4.dot(cP, cam.U);
    if (z < -rho) { Gd.set([-1e5, -1e5, 0, R], 12 * i); return; }                   // wholly behind you
    if (z <= rho * 1.05) {
      // beside you, across the plane of your eye: off the screen if its tangent cone misses the view's (the view's
      // corner is at half-angle atan(fov·√(1 + aspect²)))
      const dist = Math.hypot(x, y, z);
      if (dist > rho * 1.02) {
        const cone = Math.asin(rho / dist), toC = Math.acos(Math.max(-1, Math.min(1, z / dist))), corner = Math.atan(fov * Math.sqrt(1 + aspect * aspect));
        if (toC - cone > corner) { Gd.set([-1e5, -1e5, 0, R], 12 * i); return; }
      }
      Gd.set([W / 2, H / 2, 4 * (W + H), R], 12 * i); return;                        // you are at it: everywhere
    }
    const k = Math.sqrt(z * z - rho * rho), sx = x / z, sy = y / z, rr = rho / k * Math.sqrt(1 + sx * sx + sy * sy) * 1.15;
    Gd.set([(sx / (fov * aspect) * 0.5 + 0.5) * W, (sy / fov * 0.5 + 0.5) * H, rr / fov * 0.5 * H + 3, R], 12 * i);
  };
  // the pieces since `first`, in chunks of a few (a branch and its twigs lie together), each with its bounding ball;
  // leafy: a chunk of clumps of leaves only (stored as 3D balls in the slice, their 4D centres second)
  const group = (first, leafy = false) => {
    for (let s0 = first; s0 < nc && ng < MAXTG; s0 += CHUNK) {
      const s1 = Math.min(nc, s0 + CHUNK), c = [0, 0, 0, 0], ends = leafy ? [4] : [0, 4];
      for (let j = s0; j < s1; j++) for (const e of ends) for (let q = 0; q < 4; q++) c[q] += D[12 * j + e + q] / (ends.length * (s1 - s0));
      let R = 0;
      for (let j = s0; j < s1; j++) for (const e of ends) { const o = 12 * j + e; R = Math.max(R, Math.hypot(D[o] - c[0], D[o + 1] - c[1], D[o + 2] - c[2], D[o + 3] - c[3]) + D[12 * j + 8]); }
      Gd.set(c, 12 * ng + 4); Gd[12 * ng + 8] = s0; Gd[12 * ng + 9] = s1 - s0; Gd[12 * ng + 10] = leafy ? 1 : 0; Gd[12 * ng + 11] = 0;
      circle(c, R, ng); ng++;
    }
  };
  // the rope and the walkers' legs first (they are few, and near)
  const extras = [];
  if (rope.obj) {
    const r = rope.obj, al = rope.alpha ?? 1, P = r.prevX && r.prevX.length === r.x.length && al < 1 ? r.prevX : null;
    const x = P ? r.x.map((q, i) => { const p = P[i], dd = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2]) + Math.abs(q[3] - p[3]); return dd > 1 ? q : q.map((v, k) => p[k] + (v - p[k]) * al); }) : r.x;
    let c = [0, 0, 0, 0]; for (const p of x) c = vec4.add(c, vec4.scale(p, 1 / x.length));
    let R = 0; for (const p of x) R = Math.max(R, vec4.len(vec4.sub(p, c)) + r.r);
    if (vec4.len(vec4.sub(c, eye)) < 150 + R && Math.abs(vec4.dot(vec4.sub(c, eye), A)) < R) extras.push({ caps: x.slice(1).map((q, i) => [x[i], q, r.r, 2]), c, R });
  }
  for (const L of legs.caps) extras.push(L);                   // { caps: [[a, b, r, kind]], c, R } per walker
  const tmp = new Float32Array(10);
  for (const e of extras) {
    if (ng >= MAXTG) break;
    const first = nc;
    for (const [a, b, r, kind] of e.caps) { if (nc >= MAXTC) break; tmp.set(a, 0); tmp.set(b, 4); tmp[8] = r; tmp[9] = kind; emit(tmp, 0, 1); }
    group(first);
  }
  // the flora near you (flora.js): the clusters your slice cuts, nearest first, a group to a plant (so its circle on
  // the screen is small), within a share of the budget
  const fl = [];
  for (const t of flora.list) {
    const d = vec4.sub(t.c, eye), dist2 = vec4.dot(d, d);
    if (dist2 > (FLORA_RANGE + t.R) ** 2 || Math.abs(vec4.dot(d, A)) > t.R) continue;
    fl.push({ t, dist: Math.sqrt(dist2) });
  }
  fl.sort((x, y) => x.dist - y.dist);
  const ngF = Math.min(MAXTG, ng + 300), ncF = Math.min(MAXTC, nc + 2400);
  for (const { t, dist } of fl) {
    if (ng >= ngF - 4 || nc >= ncF - 32) break;
    const fade = Math.min(1, Math.max(0, (FLORA_RANGE - dist) / (0.2 * FLORA_RANGE))), twig = dist > 20 ? 0.03 : 0;
    seedOf = t.seed;
    for (let q = 0; q + 1 < t.plants.length; q++) {
      for (const leafy of [false, true]) {                      // its stems, flowers and cones, then its leaves
        const first = nc;
        for (let i = t.plants[q]; i < t.plants[q + 1] && nc < ncF; i++) {
          const o = i * F, isLeaf = t.S[o + 9] === 1;
          if (isLeaf !== leafy || (!isLeaf && t.S[o + 8] < twig)) continue;
          emit(t.S, o, fade);
        }
        group(first, leafy);
      }
    }
  }
  tgpu.floraN = fl.length;
  for (const { t, dist } of groups) {
    if (ng >= MAXTG || nc >= MAXTC - 8) break;
    const fade = Math.min(1, Math.max(0, (RANGE - dist) / (0.15 * RANGE)));   // far ones shrink away, never pop
    const twig = dist > 100 ? 0.2 : dist > 60 ? 0.13 : dist > 30 ? 0.065 : 0;  // far ones drop their twigs
    seedOf = (t.start * 0.6180339887) % 1;
    for (const leafy of [false, true]) {                         // its wood and needles, then its leaves
      const first = nc;
      for (let i = t.start; i < t.start + t.count && nc < MAXTC; i++) {
        const o = i * F, isLeaf = CAPS[o + 9] === 1;
        if (isLeaf !== leafy || (!isLeaf && CAPS[o + 8] < twig)) continue;
        emit(CAPS, o, fade);
      }
      group(first, leafy);
    }
  }
  tgpu.nc = nc; tgpu.n = ng;

  // crowns that shade the slice near you: a crown at height y over the ground casts its shade y/(sun·up) back along
  // the sun; it falls in your slice if that point's ana offset is within the crown's radius, within 60 m of you
  const sa = sun ? vec4.dot(sun, A) : 0, sh = [];
  if (sun) for (const t of near.list) {
    if (!t.crown) continue;
    const d = vec4.sub(t.crown.c, eye), dist2 = vec4.dot(d, d);
    if (dist2 > 90 * 90) continue;
    const up = t.n, su = vec4.dot(sun, up);
    if (su < 0.05) continue;
    const y = vec4.dot(vec4.sub(t.crown.c, t.base), up), s = y / su, r = t.crown.r;
    const a = vec4.dot(d, A) - s * sa;
    if (Math.abs(a) > r * 1.05) continue;
    const foot = vec4.sub(d, vec4.scale(sun, s));
    if (vec4.dot(foot, foot) > (60 + r) ** 2) continue;
    sh.push({ t, dist: Math.sqrt(dist2) });
  }
  sh.sort((x, y) => x.dist - y.dist);
  tgpu.shN = Math.min(MAXTSH, sh.length);
  for (let i = 0; i < tgpu.shN; i++) { tgpu.shC.set(sh[i].t.crown.c, 4 * i); tgpu.shR[i] = sh[i].t.crown.r; }
  return tgpu;
}
export const treeCount = () => trees.length;
