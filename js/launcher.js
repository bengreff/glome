// The launcher: a stone pad on the highest summit, where gravity is lightest. Its power comes in tiers; each tier is
// a part (I–IV) found elsewhere and carried back to lie in the pad's ring. Stand on the pad and jump: it throws you
// along your line of sight at its tier's speed. (Speeds re-derived for the summit: see DECISIONS.md.)
import { G } from './game.js';
import { vec4 } from './player.js';
import { PLANET_R, MASSIF } from './world.js';
import { tangents } from './env.js';
import { rot as R4 } from './so4.js';
import { makeBody } from './bodies.js';
import { objects, spawn, KINDS } from './objects.js';

export const TIERS = [0, 24, 35, 43, 52];             // m/s for tiers 0 (no parts) .. IV
export const launcher = { site: null, n: null, pad: null, tier: 0, onPad: false, ring: 3.6 };

// The summit, found by climbing from the massif's centre in many directions (the same every time).
export function findSummit(hf) {
  let best = { h: -1 }, seed = 5;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296) - 0.5;
  const off = (u, t, m) => vec4.norm(vec4.add(vec4.scale(u, Math.cos(m / PLANET_R)), vec4.scale(t, Math.sin(m / PLANET_R))));
  for (let i = 0; i < 40; i++) {
    const T = tangents(MASSIF), d = vec4.norm([0, 1, 2, 3].map(k => rnd() * T[0][k] + rnd() * T[1][k] + rnd() * T[2][k]));
    let p = off(MASSIF, d, 60 * Math.abs(rnd())), h = hf.heightAt(p), st = 6;
    for (let it = 0; it < 300 && st > 0.03; it++) {
      let mv = false;
      for (const t of tangents(p)) for (const s of [-1, 1]) { const q = off(p, t, s * st), hq = hf.heightAt(q); if (hq > h) { h = hq; p = q; mv = true; } }
      if (!mv) st /= 2;
    }
    if (h > best.h) best = { p, h };
  }
  return best;
}
// A rotation that sets a body square on the ground at unit n.
function squareOn(n) {
  const T = tangents(n), rows = [0, 1, 2, 3].map(r => [T[0][r], T[1][r], T[2][r], n[r]]);
  // the tangents i, j, k with the outward normal form a proper frame or its mirror; fix the handedness
  const M = rows, det = M[0][0] * (M[1][1] * (M[2][2] * M[3][3] - M[2][3] * M[3][2]) - M[1][2] * (M[2][1] * M[3][3] - M[2][3] * M[3][1]) + M[1][3] * (M[2][1] * M[3][2] - M[2][2] * M[3][1]))
    - M[0][1] * (M[1][0] * (M[2][2] * M[3][3] - M[2][3] * M[3][2]) - M[1][2] * (M[2][0] * M[3][3] - M[2][3] * M[3][0]) + M[1][3] * (M[2][0] * M[3][2] - M[2][2] * M[3][0]))
    + M[0][2] * (M[1][0] * (M[2][1] * M[3][3] - M[2][3] * M[3][1]) - M[1][1] * (M[2][0] * M[3][3] - M[2][3] * M[3][0]) + M[1][3] * (M[2][0] * M[3][1] - M[2][1] * M[3][0]))
    - M[0][3] * (M[1][0] * (M[2][1] * M[3][2] - M[2][2] * M[3][1]) - M[1][1] * (M[2][0] * M[3][2] - M[2][2] * M[3][0]) + M[1][2] * (M[2][0] * M[3][1] - M[2][1] * M[3][0]));
  if (det < 0) rows.forEach(r => { r[0] = -r[0]; });
  return R4.fromMatrix(rows);
}
export function buildLauncher(hf) {
  const s = findSummit(hf);
  launcher.n = s.p; launcher.h = s.h;
  // the pad: a tesseract slab of side 2.4 m, its top face 0.25 m above the summit (a fixed body, metal)
  const side = 2.4, c = vec4.scale(s.p, PLANET_R + s.h + 0.25 - side / 2);
  const pad = makeBody({ shape: 'tesseract', size: side, mass: 1e9, pos: c, rot: squareOn(s.p), kind: 'launcher' });
  pad.kinematic = true; pad.fixed = true; pad.mat = 1; pad.glow = 0;
  objects.world.add(pad);
  launcher.pad = pad;
  launcher.site = vec4.scale(s.p, PLANET_R + s.h + 0.25);
}
// The four parts, placed now at the places the artifacts will guard (DESIGN.md: carried back by hand).
export function placeParts(spots) {
  spots.forEach((n, i) => { const b = spawn('part', n); b.tier = i + 1; b.tag = `part${i + 1}`; });
}
// The tier: the highest k such that parts I..k all lie in the pad's ring.
export function updateLauncher(p) {
  if (!launcher.pad) return;
  const near = new Set();
  for (const b of objects.world.bodies) if (b.kind === 'part' && !b.held && vec4.len(vec4.sub(b.pos, launcher.site)) < launcher.ring) near.add(b.tier);
  let k = 0; while (near.has(k + 1)) k++;
  launcher.tier = k;
  launcher.pad.glow = 0.15 * k;
  for (const b of objects.world.bodies) if (b.kind === 'part') b.glow = near.has(b.tier) && b.tier <= k ? 1 : 0.25;
  // standing on the pad: your feet on its top face, within its square
  const d = vec4.sub(p.pos, launcher.site), up = vec4.norm(launcher.site);
  const hgt = vec4.dot(d, up), lat = vec4.len(vec4.sub(d, vec4.scale(up, hgt)));
  launcher.onPad = Math.abs(hgt) < 0.4 && lat < 1.2;
}
// Jumping on the pad launches you along your line of sight (if it points above the horizon).
export function tryLaunch(p, cam, jump) {
  if (!jump || !launcher.onPad || launcher.tier === 0 || G.simT - (launcher.last || -9) < 1.5) return false;
  launcher.last = G.simT;
  const u = p.up(), dir = vec4.dot(cam.F, u) > 0.05 ? cam.F : u;
  p.vel = vec4.scale(dir, TIERS[launcher.tier]);
  p.pos = vec4.add(p.pos, vec4.scale(u, 0.3));
  p.grounded = false;
  G.audio?.emit('launch', p.pos, 1.2);
  G.flags.launches = (G.flags.launches || 0) + 1;
  return true;
}
