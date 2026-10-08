// The static environment as a signed distance: the ground (a heightfield on the 3-sphere), the boulders, and later
// the carved landforms. Used to keep the body capsule (and objects) out of rock.
import { PLANET_R } from './world.js';
import { vec4, CAP_R } from './player.js';
import { G } from './game.js';
import { boulders } from './boulders.js';
import { carves, carveSD } from './landforms.js';
import { treeSD } from './trees.js';

// Three perpendicular directions along the ground at unit u, defined everywhere (multiply u, as a unit quaternion,
// by i, j and k): the 3-sphere has no poles to dodge.
export const tangents = ([a, b, c, d]) => [[-b, a, d, -c], [-c, -d, a, b], [-d, c, -b, a]];

// Distance from p to the ground surface r = R + h(n), to first order (the vertical gap times the cosine of the
// slope), and the outward normal. Above the ground it is positive.
export function terrainSD(p) {
  let s = heightSD(p);
  if (carves.length) {
    const c = carveSD(p);                                            // the rock, less the carved hollows
    if (-c.d > s.d) s = { d: -c.d, n: c.n };
  }
  const t = treeSD(p);                                               // and the trees' branches
  return t.d < s.d ? t : s;
}
function heightSD(p) {
  const hf = G.player.hf, r = vec4.len(p), u = vec4.scale(p, 1 / r), h = hf.heightAt(u), gap = r - PLANET_R - h;
  if (gap > 3) return { d: gap, n: u };                              // far above: the gap is close enough
  const e = 0.5 / PLANET_R, T = tangents(u), rg = PLANET_R + h;
  let N = u;
  for (const t of T) {
    const dh = (hf.heightAt(vec4.norm(vec4.add(u, vec4.scale(t, e)))) - hf.heightAt(vec4.norm(vec4.sub(u, vec4.scale(t, e))))) / (2 * e * rg);
    N = vec4.sub(N, vec4.scale(t, dh));
  }
  N = vec4.norm(N);
  return { d: gap * vec4.dot(N, u), n: N };
}

// Distance to the nearest boulder (exact: they are 4D balls).
export function boulderSD(p) {
  let best = { d: Infinity, n: null };
  for (const b of boulders.near) {
    const d = vec4.sub(p, b.c), l = vec4.len(d);
    if (l - b.r < best.d) best = { d: l - b.r, n: vec4.scale(d, 1 / Math.max(l, 1e-9)) };
  }
  return best;
}
export function envSD(p) {
  const t = terrainSD(p), b = boulderSD(p);
  return b.d < t.d ? b : t;
}

// Keep the upper body out of the ground: walk into a steep bank or under a bulge and your chest and head stop
// against it. (The feet stand on the heightfield directly; boulders are handled with friction in boulders.js.)
const UPPER = [0.8, 1.3, 1.75];
export function capsuleTerrain(p) {
  const up = p.up();
  for (const y of UPPER) {
    const q = vec4.add(p.pos, vec4.scale(up, y)), s = terrainSD(q);
    if (s.d >= CAP_R) continue;
    let n = s.n;
    const nu = vec4.dot(n, up);
    if (nu > 0) n = vec4.sub(n, vec4.scale(up, nu));                    // never lift you: push sideways (or down)
    const nl = vec4.len(n);
    if (nl < 0.2) continue;                                             // gentle ground: the feet handle it
    n = vec4.scale(n, 1 / nl);
    const push = (CAP_R - s.d) / Math.max(0.2, vec4.dot(n, s.n));
    p.pos = vec4.add(p.pos, vec4.scale(n, Math.min(push, 0.5)));
    const vn = vec4.dot(p.vel, n);
    if (vn < 0) p.vel = vec4.sub(p.vel, vec4.scale(n, vn));
  }
}
