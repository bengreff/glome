// Landmark trees: three single, striking 4D trees, each a place to find. A trunk divides into branches that spread
// in all three ground directions; your slice cuts only some of them, so from most places a tree is a scatter of
// floating pieces, and only from the right place, looking the right way, does it join up into a tree.
// Each branch is a 4D capsule (a segment with a radius), traced exactly; the foliage is balls at the twigs' ends.
import { PLANET_R } from './world.js';
import { vec4 } from './player.js';
import { tangents } from './env.js';

export const trees = [];            // { n, base, caps: [{ a, b, r, leaf }], c, R }
export const MAXT = 6;           // three trees, the rope, and the walkers' legs (drawn with the same capsules)
export const ROPE_CAPS = 40, LEG_CAPS = 128;
export const rope = { obj: null, start: 0 };
export const legs = { caps: [], start: 0 };
let seed = 777;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);

// Grow a tree at unit n (on the ground at height h): depth levels of branching, three children each.
export function growTree(n, h, { height = 7, depth = 3, spread = 0.75 } = {}) {
  const up = n, base = vec4.scale(n, PLANET_R + h - 0.3), caps = [];
  const T = tangents(n);
  const grow = (a, dir, len, r, level) => {
    const b = vec4.add(a, vec4.scale(dir, len));
    caps.push({ a, b, r, leaf: 0 });
    if (level === depth) { caps.push({ a: b, b, r: 0.9 + 0.7 * rnd(), leaf: 1 }); return; }
    const k = level === 0 ? 4 : 3;
    for (let i = 0; i < k; i++) {
      // a random horizontal direction in the 3D ground (not just left or right: toward ana and kata too)
      const w = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], wl = Math.hypot(...w);
      let hz = vec4.norm([0, 1, 2, 3].map(q => (w[0] * T[0][q] + w[1] * T[1][q] + w[2] * T[2][q]) / wl));
      const tilt = spread * (0.7 + 0.5 * rnd()) * (level === 0 ? 1.1 : 1);
      const d2 = vec4.norm(vec4.add(vec4.scale(dir, Math.cos(tilt)), vec4.scale(hz, Math.sin(tilt))));
      grow(b, vec4.norm(vec4.add(d2, vec4.scale(up, 0.25))), len * (0.62 + 0.12 * rnd()), r * 0.62, level + 1);
    }
  };
  grow(base, up, height * 0.45, 0.42, 0);
  // bounding ball
  let c = [0, 0, 0, 0]; for (const k of caps) c = vec4.add(c, vec4.scale(vec4.add(k.a, k.b), 0.5)); c = vec4.scale(c, 1 / caps.length);
  let R = 0; for (const k of caps) R = Math.max(R, vec4.len(vec4.sub(k.a, c)) + k.r, vec4.len(vec4.sub(k.b, c)) + k.r);
  const t = { n, base, caps, c, R };
  trees.push(t);
  return t;
}
// All capsules as a float texture: three texels each (a, b, [radius, leaf, 0, 0]).
export function treeTexData() {
  const all = trees.flatMap(t => t.caps), data = new Float32Array((all.length + ROPE_CAPS + LEG_CAPS) * 12);
  all.forEach((k, i) => { data.set(k.a, 12 * i); data.set(k.b, 12 * i + 4); data.set([k.r, k.leaf, 0, 0], 12 * i + 8); });
  let start = 0;
  for (const t of trees) { t.start = start; start += t.caps.length; }
  rope.start = start;                                   // the rope's capsules follow, rewritten every frame,
  legs.start = start + ROPE_CAPS;                       // and then the walkers' legs
  return { data, count: all.length + ROPE_CAPS + LEG_CAPS };
}
// The walkers' legs (leaf = 3), for the texture.
export function legTexData() {
  const out = new Float32Array(LEG_CAPS * 12);
  legs.caps.slice(0, LEG_CAPS).forEach(([a, b], i) => { out.set(a, 12 * i); out.set(b, 12 * i + 4); out.set([0.05, 3, 0, 0], 12 * i + 8); });
  return out;
}
// The rope's links as capsules (leaf = 2 marks rope), for the texture.
export function ropeTexData() {
  const r = rope.obj, out = new Float32Array(ROPE_CAPS * 12);
  if (!r) return out;
  for (let i = 0; i + 1 < r.x.length && i < ROPE_CAPS; i++) { out.set(r.x[i], 12 * i); out.set(r.x[i + 1], 12 * i + 4); out.set([r.r, 2, 0, 0], 12 * i + 8); }
  return out;
}
// The trees your slice cuts and that are near enough, for the renderer.
export function treeUniforms(eye, A) {
  const C = new Float32Array(MAXT * 4), S = new Int32Array(MAXT * 2), Rs = new Float32Array(MAXT);
  let n = 0;
  for (const t of trees) {
    if (vec4.len(vec4.sub(t.c, eye)) > 260 + t.R) continue;
    if (Math.abs(vec4.dot(vec4.sub(t.c, eye), A)) > t.R) continue;     // the slice misses it entirely
    C.set([...t.c.slice(0, 3), 0], 4 * n); C[4 * n + 3] = 0;
    C.set(t.c, 4 * n); S[2 * n] = t.start; S[2 * n + 1] = t.caps.length; Rs[n] = t.R;
    n++;
  }
  const r = rope.obj;
  if (r && n < MAXT) {
    let c = [0, 0, 0, 0]; for (const p of r.x) c = vec4.add(c, p); c = vec4.scale(c, 1 / r.x.length);
    let R = 0; for (const p of r.x) R = Math.max(R, vec4.len(vec4.sub(p, c)) + r.r);
    if (vec4.len(vec4.sub(c, eye)) < 150 + R && Math.abs(vec4.dot(vec4.sub(c, eye), A)) < R) {
      C.set(c, 4 * n); S[2 * n] = rope.start; S[2 * n + 1] = Math.min(ROPE_CAPS, r.x.length - 1); Rs[n] = R; n++;
    }
  }
  if (legs.caps.length && n < MAXT) {
    let c = [0, 0, 0, 0]; for (const [a] of legs.caps) c = vec4.add(c, a); c = vec4.scale(c, 1 / legs.caps.length);
    let R = 0; for (const [a, b] of legs.caps) R = Math.max(R, vec4.len(vec4.sub(a, c)), vec4.len(vec4.sub(b, c)));
    C.set(c, 4 * n); S[2 * n] = legs.start; S[2 * n + 1] = Math.min(LEG_CAPS, legs.caps.length); Rs[n] = R + 0.05; n++;
  }
  return { C, S, R: Rs, n, list: trees };
}
// Distance from p to the nearest branch (for collisions).
export function treeSD(p) {
  let best = { d: Infinity, n: null };
  for (const t of trees) {
    if (vec4.len(vec4.sub(p, t.c)) > t.R + 2) continue;
    for (const k of t.caps) {
      if (k.leaf) continue;                                   // foliage doesn't stop you
      const ab = vec4.sub(k.b, k.a), ap = vec4.sub(p, k.a), L2 = vec4.dot(ab, ab);
      const s = L2 > 0 ? Math.max(0, Math.min(1, vec4.dot(ap, ab) / L2)) : 0;
      const dv = vec4.sub(ap, vec4.scale(ab, s)), l = vec4.len(dv), d = l - k.r;
      if (d < best.d) best = { d, n: vec4.scale(dv, 1 / Math.max(l, 1e-9)) };
    }
  }
  return best;
}
