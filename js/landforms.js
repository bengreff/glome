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
  // the cave: a chamber under the massif's flank, 40 m from the start toward the summit, and its one way in: a passage
  // that leaves the chamber level with its floor toward ana (your starting ana direction), then a tunnel that climbs at
  // no more than 30° to its mouth on the hillside, a hollow you step down into. (A passage leaving a round chamber
  // partway up its side meets it in a concave wall steeper than 60°, which stops your knees: you were trapped.)
  const f = proj(vec4.sub(MASSIF, home), home);
  const c = off(home, f, 40), hc = hf.heightAt(c);
  const a = proj(homeA, c);
  const RC = 5, RT = 2.4, chamber = vec4.scale(c, PLANET_R + hc - 6.5), floorR = PLANET_R + hc - 6.5 - RC;
  const p1 = vec4.scale(c, floorR + RT), p2 = vec4.scale(off(c, a, 7), floorR + RT);
  // the mouth: the nearest place along ana where the climb from the passage's end is no steeper than 30°
  let d = 14, mouthN = off(c, a, d);
  for (; d < 60; d += 0.5) { mouthN = off(c, a, d); if (PLANET_R + hf.heightAt(mouthN) + 1.4 - (floorR + RT) <= Math.tan(Math.PI / 6) * (d - 7)) break; }
  const mh = hf.heightAt(mouthN), mouth = vec4.scale(mouthN, PLANET_R + mh + 1.4);   // (its axis 1.4 m up: the hollow is 1 m deep, its sides gentle)
  carves.push({ a: chamber, b: chamber, r: RC, name: 'cave' });
  carves.push({ a: p1, b: p2, r: RT, name: 'passage' });
  carves.push({ a: p2, b: mouth, r: RT, name: 'tunnel' });
  const outN = off(mouthN, proj(vec4.sub(mouthN, c), mouthN), 4.5);
  G.cave = { chamber, mouth, floor: vec4.scale(c, floorR), pit: vec4.scale(mouthN, PLANET_R + mh - 0.9),
             out: vec4.scale(outN, PLANET_R + hf.heightAt(outN)), parts: ['cave', 'passage', 'tunnel'] };
  // the arch: a tunnel straight through island 5, at head height above the sea
  const I = ISLANDS[5].n, T = [[-I[1], I[0], I[3], -I[2]], [-I[2], -I[3], I[0], I[1]], [-I[3], I[2], -I[1], I[0]]];
  const span = ISLANDS[5].r * 1.6;
  carves.push({ a: vec4.scale(off(I, T[0], -span), PLANET_R + 1.2), b: vec4.scale(off(I, T[0], span), PLANET_R + 1.2), r: 3.4, name: 'arch' });
  // the overhang: a rock shelter cut level into the massif's opposite flank, open downhill, its floor a hand below the
  // ground where it opens, so you walk in and out. (It was a ball half under the ground: a pit whose sides curved
  // over you at 68° and more, and walked into from above, you could not climb out.)
  const g = off(MASSIF, vec4.scale(f, -1), 34);
  let dn = null, lowest = Infinity;                       // downhill there: the lowest ground 6 m off, of 64 ways round
  { const T3 = [[-g[1], g[0], g[3], -g[2]], [-g[2], -g[3], g[0], g[1]], [-g[3], g[2], -g[1], g[0]]];
    for (let i = 0; i < 64; i++) {
      const az = i * 2.39996, el = Math.acos(1 - 2 * ((i * 0.618034 + 0.5) % 1));
      const d = vec4.norm([0, 1, 2, 3].map(k => Math.sin(el) * Math.cos(az) * T3[0][k] + Math.sin(el) * Math.sin(az) * T3[1][k] + Math.cos(el) * T3[2][k]));
      const h = hf.heightAt(off(g, d, 6)); if (h < lowest) { lowest = h; dn = d; }
    } }
  const RO = 3.2, ohMouth = off(g, dn, 9), floorH = hf.heightAt(ohMouth) - 0.12;
  carves.push({ a: vec4.scale(off(g, dn, -3), PLANET_R + floorH + RO), b: vec4.scale(ohMouth, PLANET_R + floorH + RO), r: RO, name: 'overhang' });
  G.overhang = { floor: vec4.scale(g, PLANET_R + floorH), mouth: vec4.scale(ohMouth, PLANET_R + floorH + 0.12) };
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
// Only the hollows your slice cuts matter to what you see (a view ray never leaves your slice), and only within 120 m.
export function carveUniforms(eye, sliceA) {
  const A = new Float32Array(MAXC * 4), B = new Float32Array(MAXC * 4), R = new Float32Array(MAXC);
  let k = 0;
  const act = [];
  for (const c of carves) {
    if (k >= MAXC || sdCapsule(eye, c.a, c.b, c.r) > 120) continue;
    if (sliceA) { const a1 = vec4.dot(vec4.sub(c.a, eye), sliceA), a2 = vec4.dot(vec4.sub(c.b, eye), sliceA); if (Math.min(a1, a2) > c.r + 0.5 || Math.max(a1, a2) < -c.r - 0.5) continue; }
    A.set(c.a, 4 * k); B.set(c.b, 4 * k); R[k] = c.r; k++; act.push(c);
  }
  // a ball round all of them, padded by a metre (samples outside it skip the hollows)
  let C = [0, 0, 0, 0];
  for (const c of act) C = vec4.add(C, vec4.scale(vec4.add(c.a, c.b), 0.5 / act.length));
  let Rb = 0;
  for (const c of act) Rb = Math.max(Rb, vec4.len(vec4.sub(c.a, C)) + c.r + 1, vec4.len(vec4.sub(c.b, C)) + c.r + 1);
  return { A, B, R, n: k, C, Rb };
}
