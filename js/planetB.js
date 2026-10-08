// Planet B: a crystal. Its ground is a 120-cell, the regular 4D polytope bounded by 120 dodecahedra: from its surface
// you walk on dodecahedral floors, flat 3D lands about 40 m across, meeting their neighbours at 36° creases. The
// floor normals are the 120 vertices of its dual, the 600-cell. B does not spin; its frame is the inertial one,
// carried round its orbit.
import { LAWS } from './laws.js';
import { vec4 } from './player.js';
import { G } from './game.js';
import { gravityInertial, orbitOf, toBody, dirToBody, dirToInertial, toInertial } from './cosmos.js';

const PHI = (1 + Math.sqrt(5)) / 2;
export const NORMALS = [];
for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { const v = [0, 0, 0, 0]; v[i] = s; NORMALS.push(v); }
for (let m = 0; m < 16; m++) NORMALS.push([0, 1, 2, 3].map(i => (m >> i & 1 ? 0.5 : -0.5)));
{
  const perms = [], a = [0, 1, 2, 3];
  const permute = k => {
    if (k === 4) { let inv = 0; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (a[i] > a[j]) inv++; if (inv % 2 === 0) perms.push(a.slice()); return; }
    for (let i = k; i < 4; i++) { [a[k], a[i]] = [a[i], a[k]]; permute(k + 1); [a[k], a[i]] = [a[i], a[k]]; }
  };
  permute(0);
  const base = [PHI / 2, 0.5, 1 / (2 * PHI), 0];          // even permutations of (φ, 1, 1/φ, 0)/2, all signs
  for (const p of perms) for (let s = 0; s < 8; s++) {
    const v = [0, 0, 0, 0]; let k = 0;
    for (let i = 0; i < 4; i++) v[p[i]] = base[i];
    for (let i = 0; i < 4; i++) if (v[i] !== 0) { if (s >> k & 1) v[i] = -v[i]; k++; }
    NORMALS.push(v);
  }
}
export const B_IN = () => LAWS.R_B * 0.96;               // the floors' distance from the centre (corners reach 1.08 of it)

// The ground's distance from B's centre along unit direction u (in B's frame): the nearest floor's plane.
export function groundRadiusB(u) {
  let m = -1;
  for (const n of NORMALS) { const d = u[0] * n[0] + u[1] * n[1] + u[2] * n[2] + u[3] * n[3]; if (d > m) m = d; }
  return B_IN() / m;
}
export function floorOf(u) {
  let m = -1, k = 0;
  NORMALS.forEach((n, i) => { const d = vec4.dot(u, n); if (d > m) { m = d; k = i; } });
  return k;
}

// The nearest copy of B round the hoop to an inertial point, and the point's offset from it (B's frame = inertial axes).
export function nearB(x, t) {
  const c = orbitOf('B', t).c;
  let best = null;
  for (let k = -1; k <= 1; k++) {
    const d = [x[0] - c[0], x[1] - c[1], x[2] - c[2], x[3] - c[3] - k * LAWS.L];
    const r = vec4.len(d);
    if (!best || r < best.r) best = { d, r, k };
  }
  return best;
}
// The acceleration of a free particle in B's frame (non-rotating, carried round B's orbit): all the gravity there is,
// less B's own orbital acceleration.
export function accelB(xB, vB, t, k = 0) {
  const o = orbitOf('B', t), x = [o.c[0] + xB[0], o.c[1] + xB[1], o.c[2] + xB[2], o.c[3] + xB[3] + k * LAWS.L];
  const g = gravityInertial(x, t);
  return [g[0] - o.acc[0], g[1] - o.acc[1], g[2] - o.acc[2], g[3] - o.acc[3]];
}
// For the renderer: B's centre in A's body frame (and which hoop copy you are on), and the rotation into B's frame.
export function bUniforms(t) {
  const c = toBody(orbitOf('B', t).c, t);
  const M = new Float32Array(16);                         // columns: A-body axes expressed in B's (inertial) frame
  for (let j = 0; j < 4; j++) { const e = [0, 0, 0, 0]; e[j] = 1; M.set(dirToInertial(e, t), 4 * j); }
  return { c, M, rin: B_IN() };
}
export const NORMAL_DATA = new Float32Array(NORMALS.flat());
