// 4D rigid bodies: 4D balls ("glomes"), tesseracts, and compound bodies made of boxes and balls (keys), any
// orientation in SO(4), with contacts, Coulomb friction, sleeping and buoyancy. Fixed step; sequential impulses with
// warm starting.
//
// Facts used:
// - Angular velocity is a bivector ω (a rate in each of the six planes); a point at offset r from the centre moves
//   at v = Ω·r (so4.bivApply). Angular momentum, in the same convention as a point mass's m·wedge(v, r), is
//   L = ΩS + SΩ, with S = Σ m r rᵀ the second moments about the centre: in the frame where S is diagonal,
//   L_ij = (s_i + s_j)·ω_ij. A ball (I = m r²/3) and a tesseract (I = m s²/6) have S = (I/2)·1, so L = I·ω, and
//   torque-free they spin at a constant ω, which so4.step integrates exactly. A compound body keeps the 6×6 matrix
//   of ω ↦ L in its own frame; torque-free, its L is constant in the world while ω changes as it turns (Euler's
//   equations), which the step keeps exactly by carrying L.
// - An impulse J at offset r changes L by wedge(J, r) (checked: the energy change equals J·v).
// - Friction acts in the 3D tangent space of the contact normal: the tangential impulse is a vector there,
//   clamped in length to μ times the normal impulse.
import { rot as R4, wedge, bivApply, step as rotStep } from './so4.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s, a[3] * s];
const len = a => Math.sqrt(dot(a, a));

let nextId = 1;
export const ROLL_RES = 0.08;   // rolling resistance coefficient of the ground (soft soil and grass)
export const DENSITY = { stone: 2600, metal: 7800, wood: 450, water: 1000 };   // kg per m⁴ (4D densities)
export const VOLUME = { glome: r => Math.PI * Math.PI / 2 * r ** 4, tesseract: s => s ** 4 };

// A compound body: parts [{ shape: 'box', c, e } | { shape: 'glome', c, r } | { shape: 'cap', c, h, r }] (centre c
// and half-extents e in the body's own frame, axis-aligned in it; a cap is a 4D capsule, the points within r of a
// segment of half-length h along the body's fourth axis), given about any origin and moved so that pos is the centre
// of mass. (A cap's mass is reckoned as its box [r, r, r, h]: caps are for fixed things.)
export function makeBody({ shape, size, mass, density, pos, vel = [0, 0, 0, 0], rot = R4.identity(), omega = [0, 0, 0, 0, 0, 0], mu = 0.9, restitution = 0.15, kind = shape, parts = null, ...extra }) {
  if (shape === 'compound') return makeCompound({ parts, mass, density, pos, vel, rot, omega, mu, restitution, kind, extra });
  const m = mass ?? density * VOLUME[shape](size);
  const I = shape === 'glome' ? m * size * size / 3 : m * size * size / 6;
  return {
    id: nextId++, shape, size, half: shape === 'tesseract' ? size / 2 : size, kind,
    m, invM: 1 / m, I, invI: 1 / I, pos: pos.slice(), vel: vel.slice(), rot, omega: omega.slice(), mu, e: restitution,
    bound: shape === 'tesseract' ? size : size,            // bounding radius (a tesseract's circumradius is its side)
    volume: VOLUME[shape](size),
    sleeping: false, sleepT: 0, kinematic: false, ...extra,
  };
}
const PL = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
const capBox = q => q.shape === 'cap' ? { ...q, e: [q.r, q.r, q.r, q.h] } : q;
const partVol = q => q.shape === 'glome' ? VOLUME.glome(q.r) : (q = capBox(q), 16 * q.e[0] * q.e[1] * q.e[2] * q.e[3]);
function makeCompound({ parts, mass, density, pos, vel, rot, omega, mu, restitution, kind, extra }) {
  const vols = parts.map(partVol), V = vols.reduce((a, b) => a + b, 0), m = mass ?? density * V;
  const ms = vols.map(v => m * v / V);
  const com = [0, 1, 2, 3].map(i => parts.reduce((s, q, k) => s + ms[k] * q.c[i], 0) / m);
  const ps = parts.map(q => ({ ...q, c: sub(q.c, com) }));
  // second moments about the centre: each part's own (a box: m e²/3 per axis; a ball: m r²/6) and its offset's
  const S = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
  ps.map(capBox).forEach((q, k) => { for (let i = 0; i < 4; i++) { for (let j = 0; j < 4; j++) S[i][j] += ms[k] * q.c[i] * q.c[j]; S[i][i] += ms[k] * (q.shape === 'glome' ? q.r * q.r / 6 : q.e[i] * q.e[i] / 3); } });
  const I6 = inertia6(S), I6inv = inv6(I6), Imean = I6.reduce((s, r, k) => s + r[k], 0) / 6;
  const bound = Math.max(...ps.map(q => q.shape === 'glome' ? len(q.c) + q.r : q.shape === 'cap' ? len(q.c) + q.h + q.r : len(q.c.map((c, i) => Math.abs(c) + q.e[i]))));   // (a box's farthest corner)
  return {
    id: nextId++, shape: 'compound', parts: ps, com, size: bound, half: bound / 2, kind,
    m, invM: 1 / m, I: Imean, invI: 1 / Imean, I6, I6inv, S, pos: pos.slice(), vel: vel.slice(), rot, omega: omega.slice(), mu, e: restitution,
    bound, volume: V, sleeping: false, sleepT: 0, kinematic: false, ...extra,
  };
}
// The 6×6 matrix of ω ↦ L = ΩS + SΩ (its columns: L of each unit bivector), and its inverse.
function inertia6(S) {
  const I = PL.map(() => [0, 0, 0, 0, 0, 0]);
  PL.forEach(([a, b], k) => {
    const W = [0, 1, 2, 3].map(() => [0, 0, 0, 0]); W[a][b] = 1; W[b][a] = -1;
    PL.forEach(([i, j], r) => { let v = 0; for (let q = 0; q < 4; q++) v += W[i][q] * S[q][j] + S[i][q] * W[q][j]; I[r][k] = v; });
  });
  return I;
}
function inv6(A) {
  const n = 6, M = A.map((r, i) => [...r, ...[0, 1, 2, 3, 4, 5].map(j => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map(r => r.slice(n));
}
// The body's rotation as rows (cached while its rotation is unchanged), and a bivector carried between frames:
// to the world M·W·Mᵀ, to the body Mᵀ·W·M.
function rowsOf(b) { if (b._rotRef !== b.rot) { b._M = R4.toRows(b.rot); b._rotRef = b.rot; } return b._M; }
function bivRot(M, w, toBody) {
  const W = [[0, w[0], w[1], w[2]], [-w[0], 0, w[3], w[4]], [-w[1], -w[3], 0, w[5]], [-w[2], -w[4], -w[5], 0]];
  const T = [0, 1, 2, 3].map(() => [0, 0, 0, 0]), R = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let v = 0; for (let q = 0; q < 4; q++) v += (toBody ? M[q][i] : M[i][q]) * W[q][j]; T[i][j] = v; }
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let v = 0; for (let q = 0; q < 4; q++) v += T[i][q] * (toBody ? M[q][j] : M[j][q]); R[i][j] = v; }
  return [R[0][1], R[0][2], R[0][3], R[1][2], R[1][3], R[2][3]];
}
const mat6 = (A, v) => A.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2] + r[3] * v[3] + r[4] * v[4] + r[5] * v[5]);
// ω from L (world frame), and L from ω
export function invIApply(b, L) { if (!b.I6inv) return L.map(x => x * b.invI); const M = rowsOf(b); return bivRot(M, mat6(b.I6inv, bivRot(M, L, true)), false); }
export function IApply(b, w) { if (!b.I6) return w.map(x => x * b.I); const M = rowsOf(b); return bivRot(M, mat6(b.I6, bivRot(M, w, true)), false); }
// The 16 vertices of a tesseract in its own frame (±h on every axis).
const CORNERS = [];
for (let i = 0; i < 16; i++) CORNERS.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
const axesOf = b => { const M = rowsOf(b); return [0, 1, 2, 3].map(j => [M[0][j], M[1][j], M[2][j], M[3][j]]); };   // columns
const vertsOf = b => { const A = axesOf(b), h = b.half; return CORNERS.map(c => [0, 1, 2, 3].map(i => b.pos[i] + h * (c[0] * A[0][i] + c[1] * A[1][i] + c[2] * A[2][i] + c[3] * A[3][i]))); };
// point -> body frame coordinates (the transpose of the rotation)
const toLocal = (b, A, p) => { const d = sub(p, b.pos); return [dot(d, A[0]), dot(d, A[1]), dot(d, A[2]), dot(d, A[3])]; };

// Velocity of the material point of b at world point p.
const pointVel = (b, p) => b ? add(b.vel, bivApply(b.omega, sub(p, b.pos))) : [0, 0, 0, 0];
function applyImpulse(b, J, p) {
  if (!b || b.kinematic || b.invM === 0) return;
  for (let i = 0; i < 4; i++) b.vel[i] += J[i] * b.invM;
  const dw = invIApply(b, wedge(J, sub(p, b.pos)));
  for (let i = 0; i < 6; i++) b.omega[i] += dw[i];
}
// Effective inverse mass along unit direction n at offset r: 1/m + (n∧r)·I⁻¹(n∧r) (for an isotropic body,
// 1/m + (|r|² − (r·n)²)/I).
export const kEff = (b, r, n) => {
  if (!b || b.kinematic) return 0;
  if (!b.I6inv) return b.invM + (dot(r, r) - dot(r, n) ** 2) * b.invI;
  const L = wedge(n, r), w = invIApply(b, L);
  return b.invM + L[0] * w[0] + L[1] * w[1] + L[2] * w[2] + L[3] * w[3] + L[4] * w[4] + L[5] * w[5];
};
// How far ahead contacts are looked for: 2 cm, or as far as the body's surface can move in one step, so a fast one
// is caught at the surface instead of found already deep in what it hit (the step is 1/120 s).
const reach = b => (!b || b.kinematic || b.sleeping) ? 0 : (len(b.vel) + Math.sqrt(b.omega.reduce((s, x) => s + x * x, 0)) * b.bound) / 120;
const margin = (a, b) => 0.02 + reach(a) + reach(b);
// A body as primitives in the world: balls { g: true, p, r } and boxes { g: false, p, A (axes), e (half-extents) },
// i numbering its parts (for warm starting).
const H4 = h => [h, h, h, h];
function prims(b) {
  if (b.shape === 'glome') return [{ g: true, p: b.pos, r: b.size, i: 0 }];
  const A = axesOf(b);
  if (b.shape !== 'compound') return [{ g: false, p: b.pos, A, e: H4(b.half), i: 0 }];
  return b.parts.map((q, i) => {
    const p = [0, 1, 2, 3].map(k => b.pos[k] + q.c[0] * A[0][k] + q.c[1] * A[1][k] + q.c[2] * A[2][k] + q.c[3] * A[3][k]);
    if (q.shape === 'cap') return { g: false, cap: true, p, p0: sub(p, scale(A[3], q.h)), p1: add(p, scale(A[3], q.h)), r: q.r, h: q.h, A, e: [q.r, q.r, q.r, q.h], i };
    return q.shape === 'glome' ? { g: true, p, r: q.r, i } : { g: false, p, A, e: q.e, i };
  });
}
const primBound = q => q.g ? q.r : q.cap ? q.h + q.r : len(q.e);
// the nearest point to x on the segment a–b
const onSeg = (a, b, x) => { const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(x, a), ab) / dot(ab, ab))); return add(a, scale(ab, t)); };
// the nearest point of box q to x (clamped in its frame), and x in its frame
function boxNearest(q, x) {
  const d = sub(x, q.p), l = [dot(d, q.A[0]), dot(d, q.A[1]), dot(d, q.A[2]), dot(d, q.A[3])], c = l.map((v, i) => Math.max(-q.e[i], Math.min(q.e[i], v)));
  return { pb: add(q.p, add(add(scale(q.A[0], c[0]), scale(q.A[1], c[1])), add(scale(q.A[2], c[2]), scale(q.A[3], c[3])))), l };
}
const primVerts = q => CORNERS.map(c => [0, 1, 2, 3].map(i => q.p[i] + c[0] * q.e[0] * q.A[0][i] + c[1] * q.e[1] * q.A[1][i] + c[2] * q.e[2] * q.A[2][i] + c[3] * q.e[3] * q.A[3][i]));

// ---------- contact generation ----------
// A contact: bodies a (may be null for the environment) and b, the point, the normal from a to b, the depth.
function envContacts(b, env, out) {
  if (b.shape === 'glome') {
    const s = env(b.pos);
    if (s.d < b.size + margin(null, b)) out.push({ a: null, b, p: sub(b.pos, scale(s.n, b.size)), n: s.n, depth: b.size - s.d, key: `e${b.id}` });
    return;
  }
  const s0 = env(b.pos), mg = margin(null, b);
  if (s0.d > b.bound + 0.03 + mg) return;                   // far from everything
  const found = [];
  for (const q of prims(b)) {
    if (q.g) { const s = env(q.p); if (s.d < q.r + mg) found.push({ a: null, b, p: sub(q.p, scale(s.n, q.r)), n: s.n, depth: q.r - s.d, key: `e${b.id}.${q.i}` }); continue; }
    if (q.cap) { [q.p0, q.p1].forEach((x, j) => { const s = env(x); if (s.d < q.r + mg) found.push({ a: null, b, p: sub(x, scale(s.n, q.r)), n: s.n, depth: q.r - s.d, key: `e${b.id}.${q.i}c${j}` }); }); continue; }
    if (b.parts && env(q.p).d > primBound(q) + 0.03 + mg) continue;
    primVerts(q).forEach((p, i) => { const s = env(p); if (s.d < mg) found.push({ a: null, b, p, n: s.n, depth: -s.d, key: `e${b.id}.${q.i}v${i}` }); });
  }
  found.sort((x, y) => y.depth - x.depth);
  for (const c of found.slice(0, b.parts ? 32 : 8)) out.push(c);
}
function pairContacts(A, B, out) {
  const d = sub(B.pos, A.pos);
  if (dot(d, d) > (A.bound + B.bound + 0.03 + margin(A, B)) ** 2) return;
  const PA = prims(A), PB = prims(B), found = [], mg = margin(A, B);
  for (const pa of PA) for (const pb of PB) {
    const dd = sub(pb.p, pa.p), r = primBound(pa) + primBound(pb) + 0.03 + mg;
    if (dot(dd, dd) > r * r) continue;
    primPair(A, B, pa, pb, found, mg);
  }
  if (found.length > 8 && (A.parts || B.parts)) { found.sort((x, y) => y.depth - x.depth); found.length = 16; }
  for (const c of found) if (c) out.push(c);
}
// The box–box axes chosen last step and this one (by primitive pair).
let AXES = new Map(), AXES_NEXT = new Map();
// Two primitives (of bodies A and B): contacts with normals from A to B.
function primPair(A, B, pa, pb, out, mg = 0.02) {
  const key = `${A.id}.${pa.i}:${B.id}.${pb.i}`, d = sub(pb.p, pa.p);
  if (pa.cap || pb.cap) {
    // a capsule against a ball or a box: the nearest points (for a box, found by turns: the segment's point nearest
    // the box, the box's nearest that, three times), so its normal never flips the way a thin box's axis can
    const [c, o] = pa.cap ? [pa, pb] : [pb, pa];
    if (o.cap) return;                                             // (two caps: not needed, both are fixed)
    let q = onSeg(c.p0, c.p1, o.p), po, n, depth;
    if (o.g) { const dd = sub(o.p, q), l = len(dd); if (l < 1e-9) return; n = scale(dd, 1 / l); depth = c.r + o.r - l; po = sub(o.p, scale(n, o.r)); }
    else {
      let nb = boxNearest(o, q);
      for (let it = 0; it < 3; it++) { q = onSeg(c.p0, c.p1, nb.pb); nb = boxNearest(o, q); }
      const dd = sub(nb.pb, q), l = len(dd);
      if (l > 1e-9) { n = scale(dd, 1 / l); depth = c.r - l; po = nb.pb; }         // n: capsule -> box
      else {                                                       // the axis is inside the box: out through the nearest face
        let k = 0; for (let i = 1; i < 4; i++) if (o.e[i] - Math.abs(nb.l[i]) < o.e[k] - Math.abs(nb.l[k])) k = i;
        n = scale(o.A[k], -(Math.sign(nb.l[k]) || 1)); depth = c.r + o.e[k] - Math.abs(nb.l[k]); po = q;
      }
    }
    if (depth < -mg) return;
    out.push({ a: A, b: B, p: po, n: pa.cap ? n : scale(n, -1), depth, key: key + 'c' });
    return;
  }
  if (pa.g && pb.g) {
    const l = len(d), depth = pa.r + pb.r - l;
    if (depth > -mg && l > 1e-9) { const n = scale(d, 1 / l); out.push({ a: A, b: B, p: add(pa.p, scale(n, pa.r - depth / 2)), n, depth, key: key + 'g' }); }
    return;
  }
  if (pa.g || pb.g) {
    const [g, x] = pa.g ? [pa, pb] : [pb, pa], Ax = x.A, e = x.e;
    const dg = sub(g.p, x.p), q = [dot(dg, Ax[0]), dot(dg, Ax[1]), dot(dg, Ax[2]), dot(dg, Ax[3])];
    const c = q.map((v, i) => Math.max(-e[i], Math.min(e[i], v)));
    const inside = c.every((v, i) => v === q[i]);
    let n, depth, p;
    if (!inside) {
      const cw = add(x.p, add(add(scale(Ax[0], c[0]), scale(Ax[1], c[1])), add(scale(Ax[2], c[2]), scale(Ax[3], c[3]))));
      const dd = sub(g.p, cw), l = len(dd);
      if (l > g.r + mg || l < 1e-9) return;
      n = scale(dd, 1 / l); depth = g.r - l; p = cw;               // n: box -> ball
    } else {                                                       // centre inside the box: push out the nearest face
      let k = 0; for (let i = 1; i < 4; i++) if (e[i] - Math.abs(q[i]) < e[k] - Math.abs(q[k])) k = i;
      n = scale(Ax[k], Math.sign(q[k]) || 1); depth = g.r + e[k] - Math.abs(q[k]); p = g.p;
    }
    out.push({ a: A, b: B, p, n: pa.g ? scale(n, -1) : n, depth, key: key + 'x' });
    return;
  }
  // box–box: separating axes among the eight face normals; the box owning the least-overlap axis is the reference,
  // and the other's vertices that reach below its face (clamped onto the face) are the contact points.
  // (Edge–edge axes are not tested: an approximation that matters only for boxes meeting edge-on.)
  // The axis is kept from the last step while it overlaps no more than 3 cm beyond the least: a thin wall resting on
  // a narrow lip (a ring on a ring) would otherwise flip to the side the moment it sank a little into it.
  let best = null, kept = null;
  const memo = AXES.get(key);
  for (const [axes, owner] of [[pa.A, 'A'], [pb.A, 'B']]) for (let k = 0; k < 4; k++) {
    const ax = axes[k], s = dot(d, ax);
    let rA = 0, rB = 0;
    for (let j = 0; j < 4; j++) { rA += pa.e[j] * Math.abs(dot(pa.A[j], ax)); rB += pb.e[j] * Math.abs(dot(pb.A[j], ax)); }
    const ov = rA + rB - Math.abs(s);
    if (ov < -mg) return;                                          // separated
    const score = ov * (owner === 'A' ? 1 : 1.0001), cand = { score, ov, ax: scale(ax, s >= 0 ? 1 : -1), owner, k };
    if (!best || score < best.score) best = cand;
    if (memo && memo.owner === owner && memo.k === k && Math.sign(s) === memo.sg) kept = cand;
  }
  if (kept && kept.ov <= best.ov + 0.03) best = kept;
  AXES_NEXT.set(key, { owner: best.owner, k: best.k, sg: Math.sign(dot(d, best.owner === 'A' ? pa.A[best.k] : pb.A[best.k])) });
  const n = best.ax;                                               // from A to B
  const [ref, inc, sign] = best.owner === 'A' ? [pa, pb, 1] : [pb, pa, -1];
  const nr = scale(n, sign), er = ref.e, k = best.k;               // the reference face's outward normal, toward inc
  const found = [];
  primVerts(inc).forEach((v, i) => {
    const dv = sub(v, ref.p), q = [dot(dv, ref.A[0]), dot(dv, ref.A[1]), dot(dv, ref.A[2]), dot(dv, ref.A[3])];
    const depth = er[k] - dot(dv, nr);
    if (depth < -mg) return;
    for (let j = 0; j < 4; j++) if (j !== k) q[j] = Math.max(-er[j], Math.min(er[j], q[j]));   // onto the reference face
    const pf = add(ref.p, add(add(scale(ref.A[0], q[0]), scale(ref.A[1], q[1])), add(scale(ref.A[2], q[2]), scale(ref.A[3], q[3]))));
    found.push({ a: A, b: B, p: pf, n, depth, key: `${key}${best.owner}${k}v${i}` });
  });
  found.sort((x, y) => y.depth - x.depth);
  for (const c of found.slice(0, 8)) out.push(c);
}

// ---------- buoyancy ----------
// ∫(r² − x²)^{3/2} dx, for the 4-ball's cross-sections (3-balls of volume (4π/3)(r² − x²)^{3/2})
const capF = (x, r) => (x / 8) * (5 * r * r - 2 * x * x) * Math.sqrt(Math.max(0, r * r - x * x)) + (3 * r ** 4 / 8) * Math.asin(Math.max(-1, Math.min(1, x / r)));
export function ballSubmerged(r, y) {          // volume of a 4-ball of radius r below a plane y above its centre
  const yy = Math.max(-r, Math.min(r, y));
  return (4 * Math.PI / 3) * (capF(yy, r) - capF(-r, r));
}
const GRID = []; for (let i = 0; i < 256; i++) GRID.push([(i & 3) - 1.5, ((i >> 2) & 3) - 1.5, ((i >> 4) & 3) - 1.5, ((i >> 6) & 3) - 1.5].map(v => v / 2));
function buoyancy(b, water, g, dt) {
  const up = water.up(b.pos);
  if (-water.height(b.pos) < -b.bound) return 0;
  let Vt = 0;
  for (const q of prims(b)) {
    if (q.cap) continue;                                         // (caps are on fixed things)
    const y = -water.height(q.p);                                // water surface height above the part's centre
    if (y < -primBound(q)) continue;
    let V, cb = q.p;
    if (q.g) V = ballSubmerged(q.r, y);
    else {
      // a box: 4⁴ sub-cells against the water's surface, taken as flat across the body (its curvature over a
      // metre is a millimetre). Each cell is wet in proportion to how deep it sits (exact for a level cell, close for a
      // tilted one), so the volume changes smoothly however shallow the draft; the wet part's centre lies below the
      // cell's by the dry share of its height.
      const a = q.A.map(A => dot(A, up)), e = q.e;
      const ec = (Math.abs(a[0]) * e[0] + Math.abs(a[1]) * e[1] + Math.abs(a[2]) * e[2] + Math.abs(a[3]) * e[3]) / 4;   // a cell's half-height
      let n = 0, c = [0, 0, 0, 0];
      for (const G of GRID) {
        const z = G[0] * e[0] * a[0] + G[1] * e[1] * a[1] + G[2] * e[2] * a[2] + G[3] * e[3] * a[3];
        const f = Math.max(0, Math.min(1, (y - z + ec) / (2 * ec)));
        if (f <= 0) continue;
        const pp = add(q.p, add(add(scale(q.A[0], G[0] * e[0]), scale(q.A[1], G[1] * e[1])), add(scale(q.A[2], G[2] * e[2]), scale(q.A[3], G[3] * e[3]))));
        n += f; c = add(c, scale(sub(pp, scale(up, ec * (1 - f))), f));
      }
      V = (n / 256) * 16 * e[0] * e[1] * e[2] * e[3];
      if (n) cb = scale(c, 1 / n);
    }
    if (V <= 0) continue;
    applyImpulse(b, scale(up, water.density * g * V * dt), cb);
    Vt += V;
  }
  if (Vt <= 0) return 0;
  const frac = Vt / b.volume;
  // water's drag (an approximation): a rate set by the mass of water displaced against the body's own, so anything
  // afloat settles alike however light it is, and a sinking stone is slowed less. Boats keep their own drag across
  // the water (boats.js) and get only this one's damping of bobbing and rolling.
  const damp = Math.exp(-1.5 * water.density * Vt * b.invM * dt);
  if (!b.boat) b.vel = b.vel.map(v => v * damp);
  else { const vu = dot(b.vel, up); b.vel = sub(b.vel, scale(up, vu * (1 - damp))); }
  b.omega = b.omega.map(v => v * damp);
  return frac;
}

// ---------- the world ----------
export class World {
  constructor({ accel, env, dt = 1 / 120, iterations = 12 }) {
    this.accel = accel; this.env = env; this.dt = dt; this.iterations = iterations;
    this.bodies = []; this.water = null; this.warm = new Map();
  }
  add(b) { this.bodies.push(b); b.sleeping = false; b.sleepT = 0; return b; }
  remove(b) { const i = this.bodies.indexOf(b); if (i >= 0) this.bodies.splice(i, 1); }
  wake(b) { if (b) { b.sleeping = false; b.sleepT = 0; } }

  step() {
    const dt = this.dt, bodies = this.bodies;
    AXES = this.axes || new Map(); AXES_NEXT = new Map();
    // only the awake bodies move: the many asleep (most of the planet's things) cost a check each
    const awake = [];
    for (let i = 0; i < bodies.length; i++) { const b = bodies[i]; b.idx = i; if (!b.sleeping && !b.kinematic) awake.push(b); }
    for (const b of awake) { b.prevPos = b.pos.slice(); b.prevRot = b.rot; }      // (for drawing between steps)
    // 1. forces
    for (const b of awake) {
      const a = this.accel(b.pos, b.vel);
      for (let i = 0; i < 4; i++) b.vel[i] += a[i] * dt;
      if (this.water) b.wet = buoyancy(b, this.water, len(a), dt);
    }
    // 2. contacts: each awake body against the environment and every body near it (each pair once)
    const cs = [];
    for (const b of awake) envContacts(b, this.env, cs);
    for (const A of awake) {
      if (A.ghostly) continue;
      for (const B of bodies) {
        if (B === A || B.ghostly) continue;
        if (!B.sleeping && !B.kinematic && B.idx < A.idx) continue;   // (both awake: once, from the first)
        const d0 = B.pos[0] - A.pos[0], d1 = B.pos[1] - A.pos[1], d2 = B.pos[2] - A.pos[2], d3 = B.pos[3] - A.pos[3], r = A.bound + B.bound + 0.03 + margin(A, B);
        if (d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3 > r * r) continue;
        if (A.idx < B.idx) pairContacts(A, B, cs); else pairContacts(B, A, cs);
      }
    }
    // a moving body wakes a sleeping one it touches
    for (const c of cs) for (const [s, o] of [[c.a, c.b], [c.b, c.a]]) {
      if (s && s.sleeping && o && !o.sleeping && (len(o.vel) > 0.05 || len(o.omega) > 0.05)) this.wake(s);
    }
    // (each body's motion before the contacts act, and the islands of bodies touching: see the energy check after)
    const dyn = new Set(), root = new Map();
    for (const c of cs) for (const o of [c.a, c.b]) if (o && !o.kinematic && !o.fixed) dyn.add(o);
    for (const o of dyn) { o._v0 = o.vel.slice(); o._w0 = o.omega.slice(); root.set(o, o); }
    const find = o => { while (root.get(o) !== o) { root.set(o, root.get(root.get(o))); o = root.get(o); } return o; };
    const driven = new Set();                             // islands pushed by something kinematic that moves (exempt)
    for (const c of cs) {
      const da = c.a && dyn.has(c.a), db = dyn.has(c.b);
      if (da && db) root.set(find(c.a), find(c.b));
    }
    for (const c of cs) for (const [o, x] of [[c.a, c.b], [c.b, c.a]]) if (o && o.kinematic && (len(o.vel) > 1e-9 || len(o.omega) > 1e-9) && x && dyn.has(x)) driven.add(x);
    // 3. prepare (warm start from last step's impulses on the same features)
    const warm = new Map();
    this.impacts = [];                    // new contacts that strike (for sound): one per pair, the hardest
    const struck = new Map();
    for (const c of cs) {
      c.ra = c.a ? sub(c.p, c.a.pos) : null; c.rb = sub(c.p, c.b.pos);
      c.kn = kEff(c.a, c.ra, c.n) + kEff(c.b, c.rb, c.n);
      const vn = dot(sub(pointVel(c.b, c.p), pointVel(c.a, c.p)), c.n);
      if (vn < -0.8 && !this.warm.has(c.key)) {
        const k = `${c.a ? c.a.id : 'e'}:${c.b.id}`, prev = struck.get(k);
        if (!prev || -vn > prev.speed) struck.set(k, { a: c.a, b: c.b, p: c.p, speed: -vn });
      }
      // a contact still apart (found up to 2 cm early) may close its gap within the step, and stops only what would
      // pass through it; one that meets within this step (or touches) bounces, and an overlap eases out
      const meets = c.depth >= -0.002 || vn * dt < c.depth;
      c.target = meets && vn < -1 ? -Math.min(c.a ? c.a.e : 0.2, c.b.e) * vn : 0;
      c.bias = c.depth < 0 ? (meets ? 0 : c.depth / dt) : Math.min(0.8, 0.2 / dt * Math.max(0, c.depth - 0.004));   // capped: deep overlaps ease out, never explode
      c.mu = c.a ? Math.sqrt(c.a.mu * c.b.mu) : Math.sqrt(0.9 * c.b.mu);
      const w = this.warm.get(c.key);
      c.ln = 0; c.lt = [0, 0, 0, 0];
      if (w && c.kn > 0) {
        c.ln = w.ln * 0.9; c.lt = scale(w.lt, 0.9);
        const J = add(scale(c.n, c.ln), c.lt);
        applyImpulse(c.b, J, c.p); applyImpulse(c.a, scale(J, -1), c.p);
      }
    }
    // 4. sequential impulses
    for (let it = 0; it < this.iterations; it++) for (const c of cs) {
      if (c.kn <= 0) continue;
      if ((!c.a || c.a.sleeping || c.a.kinematic) && (c.b.sleeping || c.b.kinematic)) continue;
      let vrel = sub(pointVel(c.b, c.p), pointVel(c.a, c.p));
      const vn = dot(vrel, c.n);
      const ln = Math.max(0, c.ln + (c.target + c.bias - vn) / c.kn), dln = ln - c.ln;
      c.ln = ln;
      if (dln) { const J = scale(c.n, dln); applyImpulse(c.b, J, c.p); applyImpulse(c.a, scale(J, -1), c.p); }
      // friction in the 3D tangent space
      vrel = sub(pointVel(c.b, c.p), pointVel(c.a, c.p));
      const vt = sub(vrel, scale(c.n, dot(vrel, c.n))), vtl = len(vt);
      if (vtl < 1e-9) continue;
      const t = scale(vt, 1 / vtl), kt = kEff(c.a, c.ra, t) + kEff(c.b, c.rb, t);
      let lt = sub(c.lt, scale(t, vtl / kt));
      const lim = c.mu * c.ln, ltl = len(lt);
      if (ltl > lim) lt = scale(lt, lim / ltl);
      const dJ = sub(lt, c.lt); c.lt = lt;
      applyImpulse(c.b, dJ, c.p); applyImpulse(c.a, scale(dJ, -1), c.p);
    }
    // Contacts cannot make energy: they push, rub and absorb, pass it between the bodies they join, and only easing
    // an overlap apart may add a little (its push is capped at 0.8 m/s). Where contacts conflict (a ring wedged
    // between two of the pillar's balls, or pressed into another ring), sequential impulses can still feed bodies
    // energy they could never have; so each island of touching bodies keeps at most its energy before the contacts
    // plus that of the capped push, its changes of motion scaled back together until it does. (An island pushed by
    // something kinematic that moves is left alone.)
    const islands = new Map();
    for (const o of dyn) { const r = find(o); if (!islands.has(r)) islands.set(r, []); islands.get(r).push(o); }
    const ke = (o, v, w) => 0.5 * o.m * dot(v, v) + 0.5 * w.reduce((s, x, i) => s + x * IApply(o, w)[i], 0);
    const at = (o, m) => [add(o._v0, scale(sub(o.vel, o._v0), m)), o._w0.map((x, i) => x + m * (o.omega[i] - x))];
    for (const isl of islands.values()) {
      if (isl.some(o => driven.has(o))) continue;
      const lim = isl.reduce((s, o) => s + ke(o, o._v0, o._w0) + 0.5 * o.m * 0.64, 0);
      const E = m => isl.reduce((s, o) => s + ke(o, ...at(o, m)), 0);
      if (E(1) <= lim) continue;
      let lo = 0, hi = 1;
      for (let it = 0; it < 12; it++) { const m = (lo + hi) / 2; if (E(m) > lim) hi = m; else lo = m; }
      for (const o of isl) { [o.vel, o.omega] = at(o, lo); }
      for (const c of cs) if (isl.includes(c.b) || isl.includes(c.a)) { c.ln *= lo; c.lt = scale(c.lt, lo); }
    }
    for (const c of cs) warm.set(c.key, { ln: c.ln, lt: c.lt });
    for (const v of struck.values()) this.impacts.push(v);
    // Rolling resistance of soft ground (soil and grass give under a rolling ball): a force c·N against the rolling
    // velocity of a ball on the environment. An approximation of the ground's deformation, which we don't model.
    // (On stone, a fixed block, it is a hard surface's: 0.02.)
    for (const c of cs) {
      if (c.ln <= 0) continue;
      const onFixed = c.a && c.a.fixed && c.b.shape === 'glome' ? 1 : c.a && c.b.fixed && c.a.shape === 'glome' ? 2 : 0;
      if ((c.a && !onFixed) || (!c.a && c.b.shape !== 'glome')) continue;
      const b = onFixed === 2 ? c.a : c.b, rr = onFixed ? 0.02 : ROLL_RES;
      if (b.kinematic) continue;
      const vt = sub(b.vel, scale(c.n, dot(b.vel, c.n))), l = len(vt);
      if (l < 1e-6) continue;
      const dv = Math.min(l, rr * c.ln * b.invM);
      b.vel = sub(b.vel, scale(vt, dv / l));
      const k = 1 - dv / l;
      for (let i = 0; i < 6; i++) b.omega[i] *= k;            // and the spin with it (it keeps rolling without slipping)
    }
    this.warm = warm;
    this.axes = AXES_NEXT;
    this.contacts = cs;
    // 5. integrate, and sleep
    for (const b of awake) {
      if (b.sleeping || b.kinematic) continue;
      for (let i = 0; i < 4; i++) b.pos[i] += b.vel[i] * dt;
      if (b.I6) {
        // not isotropic: L is what stays constant; ω follows the body's turning (the midpoint's ω for the step)
        const L = IApply(b, b.omega), r0 = b.rot;
        b.rot = R4.renorm(rotStep(r0, b.omega, dt / 2));
        const wm = invIApply(b, L);
        b.rot = R4.renorm(rotStep(r0, wm, dt));
        b.omega = invIApply(b, L);
      } else b.rot = R4.renorm(rotStep(b.rot, b.omega, dt));
      const floating = b.wet > 0 && b.wet < 0.999;               // a floating body bobs; it never sleeps
      const still = !floating && !b.held && len(b.vel) < 0.06 && len(b.omega) < 0.08;
      b.sleepT = still ? b.sleepT + dt : 0;
      if (b.sleepT > 0.6) { b.sleeping = true; b.vel = [0, 0, 0, 0]; b.omega = [0, 0, 0, 0, 0, 0]; }
    }
  }

  // Analytic ray casts: ray–ball, and ray–box by a 4D slab test in the box's frame (a compound body, part by part).
  raycast(ro, rd, tMax = Infinity, skip = null) {
    let best = null;
    for (const b of this.bodies) {
      if (b === skip) continue;
      if (tMax < Infinity) { const e0 = b.pos[0] - ro[0], e1 = b.pos[1] - ro[1], e2 = b.pos[2] - ro[2], e3 = b.pos[3] - ro[3], m = tMax + b.bound; if (e0 * e0 + e1 * e1 + e2 * e2 + e3 * e3 > m * m) continue; }
      for (const q of prims(b)) {
        let t = Infinity, n = null;
        const oc = sub(ro, q.p);
        if (q.g) {
          const bb = dot(oc, rd), c = dot(oc, oc) - q.r * q.r, D = bb * bb - c;
          if (D > 0) { t = -bb - Math.sqrt(D); if (t > 0) n = scale(add(oc, scale(rd, t)), 1 / q.r); }
        } else {
          const o = q.A.map(a => dot(oc, a)), d = q.A.map(a => dot(rd, a)), e = q.e;
          let tn = -Infinity, tf = Infinity, k = -1;
          for (let i = 0; i < 4; i++) {
            if (Math.abs(d[i]) < 1e-12) { if (Math.abs(o[i]) > e[i]) { tn = Infinity; break; } continue; }
            let t1 = (-e[i] - o[i]) / d[i], t2 = (e[i] - o[i]) / d[i];
            if (t1 > t2) [t1, t2] = [t2, t1];
            if (t1 > tn) { tn = t1; k = i; }
            tf = Math.min(tf, t2);
          }
          if (tn < tf && tn > 0) { t = tn; n = scale(q.A[k], -Math.sign(d[k])); }
        }
        if (n && t < tMax && (!best || t < best.t)) best = { body: b, t, n };
      }
    }
    return best;
  }

  // The player's capsule (segment a–b, radius) against every body: contact points, normals (body -> capsule).
  capsuleContacts(a, b, radius) {
    const out = [], ab = sub(b, a), L2 = dot(ab, ab);
    for (const B of this.bodies) {
      if (B.held || B.ghostly) continue;
      const t = Math.max(0, Math.min(1, dot(sub(B.pos, a), ab) / L2)), q0 = add(a, scale(ab, t)), dq0 = sub(q0, B.pos);
      if (dot(dq0, dq0) > (B.bound + radius + 0.05) ** 2) continue;
      for (const P of prims(B)) {
        const tp = Math.max(0, Math.min(1, dot(sub(P.p, a), ab) / L2)), q = add(a, scale(ab, tp)), dq = sub(q, P.p);
        if (dot(dq, dq) > (primBound(P) + radius + 0.05) ** 2) continue;
        if (P.g) {
          const l = len(dq);
          if (l < P.r + radius && l > 1e-9) out.push({ body: B, point: add(P.p, scale(dq, P.r / l)), n: scale(dq, 1 / l), depth: P.r + radius - l, q });
          continue;
        }
        if (P.cap) {
          let x = onSeg(P.p0, P.p1, q), y = onSeg(a, b, x);
          for (let it = 0; it < 4; it++) { x = onSeg(P.p0, P.p1, y); y = onSeg(a, b, x); }
          const dd = sub(y, x), l = len(dd);
          if (l < P.r + radius && l > 1e-9) out.push({ body: B, point: add(x, scale(dd, P.r / l)), n: scale(dd, 1 / l), depth: P.r + radius - l, q: y });
          continue;
        }
        // the nearest point of the box to the nearest point of the segment (refined once)
        const Ax = P.A, e = P.e, loc = v => { const d = sub(v, P.p); return [dot(d, Ax[0]), dot(d, Ax[1]), dot(d, Ax[2]), dot(d, Ax[3])]; };
        let qq = q;
        for (let it = 0; it < 2; it++) {
          const l4 = loc(qq).map((v, i) => Math.max(-e[i], Math.min(e[i], v)));
          const pb = add(P.p, add(add(scale(Ax[0], l4[0]), scale(Ax[1], l4[1])), add(scale(Ax[2], l4[2]), scale(Ax[3], l4[3]))));
          const tt = Math.max(0, Math.min(1, dot(sub(pb, a), ab) / L2));
          qq = add(a, scale(ab, tt));
          if (it === 1) {
            const dd = sub(qq, pb), l = len(dd);
            if (l < radius && l > 1e-9) out.push({ body: B, point: pb, n: scale(dd, 1 / l), depth: radius - l, q: qq });
            else if (l <= 1e-9) {                                  // the axis is inside the box: out through the nearest face
              const lq = loc(qq);
              let k = 0; for (let i = 1; i < 4; i++) if (e[i] - Math.abs(lq[i]) < e[k] - Math.abs(lq[k])) k = i;
              const n = scale(Ax[k], Math.sign(lq[k]) || 1);
              out.push({ body: B, point: qq, n, depth: radius + e[k] - Math.abs(lq[k]), q: qq });
            }
          }
        }
      }
    }
    return out;
  }

  // Look-ahead: a deep copy to simulate forward (the ghost of a released object).
  clone() {
    const w = new World({ accel: this.accel, env: this.env, dt: this.dt, iterations: 8 });
    w.water = this.water;
    w.bodies = this.bodies.map(b => ({ ...b, pos: b.pos.slice(), vel: b.vel.slice(), omega: b.omega.slice(), rot: { l: b.rot.l.slice(), r: b.rot.r.slice() } }));
    return w;
  }
}
export { applyImpulse, axesOf, vertsOf };
