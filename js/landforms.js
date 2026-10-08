// Landforms: the few places where the ground is more than a heightfield. Each is a 4D shape carved out of the rock
// (capsules, and balls as capsules of zero length), subtracted from the ground in the renderer and in the physics
// alike. There are three: a cave whose only tunnel leaves its chamber toward ana (from the path that leads to it,
// the hill looks solid), an arch through an island, and an overhang on the massif.
import { PLANET_R, MASSIF, ISLANDS } from './world.js';
import { vec4 } from './player.js';
import { G } from './game.js';

export const MAXC = 6;
export const carves = [];            // { a, b, r, name }: positions in the planet's frame (m)
const off = (u, t, m) => vec4.norm(vec4.add(vec4.scale(u, Math.cos(m / PLANET_R)), vec4.scale(t, Math.sin(m / PLANET_R))));
const proj = (v, u) => vec4.norm(vec4.sub(v, vec4.scale(u, vec4.dot(v, u))));

// Built after the terrain and the start are known (the cave lies between where you arrive and the summit).
export function buildLandforms(hf, home, homeA) {
  carves.length = 0;
  // the cave: a chamber under the massif's flank, 40 m from the start toward the summit; its tunnel climbs out
  // toward ana (your starting ana direction), 16 m long
  const f = proj(vec4.sub(MASSIF, home), home);
  const c = off(home, f, 40), hc = hf.heightAt(c);
  const a = proj(homeA, c);
  const chamber = vec4.scale(c, PLANET_R + hc - 7.5);
  let mouthN = off(c, a, 15), mh = hf.heightAt(mouthN);
  const mouth = vec4.scale(mouthN, PLANET_R + mh + 0.4);
  carves.push({ a: chamber, b: chamber, r: 6.5, name: 'cave' });
  carves.push({ a: vec4.add(chamber, vec4.scale(vec4.norm(chamber), -3.5)), b: mouth, r: 2.4, name: 'tunnel' });
  G.cave = { chamber, mouth, floor: vec4.scale(vec4.norm(chamber), PLANET_R + hc - 7.5 - 6.5) };
  // the arch: a tunnel straight through island 5, at head height above the sea
  const I = ISLANDS[5].n, T = [[-I[1], I[0], I[3], -I[2]], [-I[2], -I[3], I[0], I[1]], [-I[3], I[2], -I[1], I[0]]];
  const span = ISLANDS[5].r * 1.6;
  carves.push({ a: vec4.scale(off(I, T[0], -span), PLANET_R + 1.2), b: vec4.scale(off(I, T[0], span), PLANET_R + 1.2), r: 3.4, name: 'arch' });
  // the overhang: a hollow under the massif's opposite flank, half below the ground
  const g = off(MASSIF, vec4.scale(f, -1), 34), hg = hf.heightAt(g);
  carves.push({ a: vec4.scale(g, PLANET_R + hg - 2), b: vec4.scale(g, PLANET_R + hg - 2), r: 8, name: 'overhang' });
}

// Signed distance to the nearest carved space (positive outside it).
function sdCapsule(p, a, b, r) {
  const ab = vec4.sub(b, a), ap = vec4.sub(p, a), L2 = vec4.dot(ab, ab);
  const t = L2 > 0 ? Math.max(0, Math.min(1, vec4.dot(ap, ab) / L2)) : 0;
  return vec4.len(vec4.sub(ap, vec4.scale(ab, t))) - r;
}
export function carveSD(p) {
  let d = Infinity, n = null;
  for (const c of carves) {
    const s = sdCapsule(p, c.a, c.b, c.r);
    if (s < d) {
      d = s;
      const ab = vec4.sub(c.b, c.a), L2 = vec4.dot(ab, ab), t = L2 > 0 ? Math.max(0, Math.min(1, vec4.dot(vec4.sub(p, c.a), ab) / L2)) : 0;
      n = vec4.norm(vec4.sub(vec4.add(c.a, vec4.scale(ab, t)), p));   // into the rock: away from the hollow's axis
    }
  }
  return { d, n };
}
export const inCarve = p => carveSD(p).d < 0;
export function nearCarves(p, R) { return carves.some(c => sdCapsule(p, c.a, c.b, c.r) < R); }

// The floor under a point: the heightfield's surface, unless the point is inside the hill above a hollow, in which
// case it is the hollow's floor (the highest solid point at most 0.6 m above the feet).
export function floorRadius(n, rFeet, hf) {
  const rTop = PLANET_R + hf.heightAt(n);
  if (!carves.length || rFeet + 0.6 >= rTop) {
    if (!carves.length) return rTop;
    // standing on the heightfield's surface, unless the surface itself was carved away (a cave mouth, an arch)
    if (!inCarve(vec4.scale(n, rTop - 0.05))) return rTop;
  }
  for (let r = Math.min(rFeet + 0.6, rTop); r > rFeet - 30; r -= 0.04) if (!inCarve(vec4.scale(n, r))) return r;
  return rTop;
}
// For the renderer: the hollows near the eye.
export function carveUniforms(eye) {
  const A = new Float32Array(MAXC * 4), B = new Float32Array(MAXC * 4), R = new Float32Array(MAXC);
  let k = 0;
  const act = [];
  for (const c of carves) {
    if (k >= MAXC || sdCapsule(eye, c.a, c.b, c.r) > 160) continue;
    A.set(c.a, 4 * k); B.set(c.b, 4 * k); R[k] = c.r; k++; act.push(c);
  }
  // a ball round all of them, padded by a metre (samples outside it skip the hollows)
  let C = [0, 0, 0, 0];
  for (const c of act) C = vec4.add(C, vec4.scale(vec4.add(c.a, c.b), 0.5 / act.length));
  let Rb = 0;
  for (const c of act) Rb = Math.max(Rb, vec4.len(vec4.sub(c.a, C)) + c.r + 1, vec4.len(vec4.sub(c.b, C)) + c.r + 1);
  return { A, B, R, n: k, C, Rb };
}
