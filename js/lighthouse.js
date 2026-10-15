// The lighthouse: a tower on a headland with a lamp that flashes (two flashes every 8 s). A place to see the hoop:
// the planet's copies round the hoop are this planet, so its lamp flashes on each of them too, a point of light on
// every copy down the row (shaders.js: the lamp's glow, here and on the copies). Your slice must pass within a few
// metres of the lamp for its light to reach you: step through ana until it does.
// Built of props (solid, like the ruins): a stone tower in bands, the lamp room's cap of metal, the lamp a glowing
// ball whose glow is the flash.
import { G } from './game.js';
import { vec4 } from './player.js';
import { PLANET_R } from './world.js';
import { tangents } from './env.js';
import { rot as R4 } from './so4.js';
import { makeProp, addRock, SHAPE, MAT } from './props.js';

export const lighthouse = { n: null, lamp: null, prop: null, I: 0, light: null };
const off = (u, t, m) => vec4.norm(vec4.add(vec4.scale(u, Math.cos(m / PLANET_R)), vec4.scale(t, Math.sin(m / PLANET_R))));
const dirs = n => { const T = tangents(n), out = []; for (let i = 0; i < 26; i++) { const a = i * 2.39996, b = Math.acos(1 - 2 * ((i * 0.618034 + 0.5) % 1)); out.push(vec4.norm([0, 1, 2, 3].map(k => Math.sin(b) * Math.cos(a) * T[0][k] + Math.sin(b) * Math.sin(a) * T[1][k] + Math.cos(b) * T[2][k]))); } return out; };

// A headland: dry ground 7–16 m up, level enough for the tower, with the sea within 40 m in as many directions as can
// be found (a point standing out into the sea), 150–600 m from where you arrive. A seeded search of its own.
export function findHeadland(hf, home, keepOut) {
  let s = 1907; const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296), g = () => rnd() + rnd() + rnd() + rnd() - 2;
  let best = null, bs = 0;
  for (let i = 0; i < 6000; i++) {
    const T = tangents(home), d = vec4.norm([0, 1, 2, 3].map(k => g() * T[0][k] + g() * T[1][k] + g() * T[2][k])), n = off(home, d, 150 + 450 * rnd());
    const h = hf.heightAt(n); if (h < 7 || h > 16 || hf.waterAt(n) > h - 0.05 || keepOut(n, 6)) continue;
    const D = dirs(n);
    if (D.some(e => Math.abs(hf.heightAt(off(n, e, 2)) - h) > 0.9)) continue;      // (level enough under the tower)
    const sea = D.filter(e => [15, 25, 40].some(m => hf.heightAt(off(n, e, m)) < -0.5)).length;
    if (sea > bs) { bs = sea; best = n; if (sea >= 12) break; }
  }
  return best;
}
function frameAt(n) {
  const T = tangents(n), rows = [0, 1, 2, 3].map(r => [T[0][r], T[1][r], T[2][r], n[r]]);
  const det = m => { let d = 0; for (let j = 0; j < 4; j++) { const mm = [1, 2, 3].map(i => m[i].filter((_, k) => k !== j)); d += (j % 2 ? -1 : 1) * m[0][j] * (mm[0][0] * (mm[1][1] * mm[2][2] - mm[1][2] * mm[2][1]) - mm[0][1] * (mm[1][0] * mm[2][2] - mm[1][2] * mm[2][0]) + mm[0][2] * (mm[1][0] * mm[2][1] - mm[1][1] * mm[2][0])); } return d; };
  if (det(rows) < 0) rows.forEach(r => { r[0] = -r[0]; });
  return R4.fromMatrix(rows);
}
// The tower: four stacked blocks (4D: as wide in each of the ground's three directions), in pale and dark bands,
// 19.4 m to the lamp room; the lamp a ball 0.7 m round at 20.2 m, under a metal cap.
export function buildLighthouse(hf, n) {
  if (!n) return;
  lighthouse.n = n;
  const rot = frameAt(n), D = dirs(n);
  let lo = hf.heightAt(n); for (const e of D) lo = Math.min(lo, hf.heightAt(off(n, e, 1.9)));
  const base = PLANET_R + lo - 0.4, at = h => vec4.scale(n, base + h);
  const block = (h0, h1, half, mat) => { const p = makeProp({ c: at((h0 + h1) / 2), rot, e: [half, half, half, (h1 - h0) / 2], shape: SHAPE.box, mat }); p.kind = 'ruin'; addRock(p); return p; };
  block(0, 2.8, 1.8, MAT.worked); block(2.8, 8.4, 1.4, MAT.basalt); block(8.4, 14.4, 1.15, MAT.worked); block(14.4, 19.4, 0.95, MAT.basalt);
  block(19.4, 19.55, 1.05, MAT.metal);                                                          // the lamp room's floor
  const cap = makeProp({ c: at(21.25), rot, e: [0.9, 0.9, 0.9, 0.2], shape: SHAPE.box, mat: MAT.metal }); cap.kind = 'ruin'; addRock(cap);
  const lamp = makeProp({ c: at(20.3), rot, e: [0.7, 0.7, 0.7, 0.7], shape: SHAPE.ball, mat: MAT.eye, glow: 0 }); lamp.kind = 'ruin'; lamp.visual = true; addRock(lamp);
  lighthouse.lamp = at(20.3); lighthouse.prop = lamp;
}
// Its flash at time t: two flashes of 0.5 s, 1.2 s apart, every 8 s.
export function updateLighthouse(t) {
  if (!lighthouse.lamp) return;
  const ph = ((t % 8) + 8) % 8, pulse = x => Math.max(0, Math.min(1, x / 0.08, (0.5 - x) / 0.15));
  const I = ph < 0.5 ? pulse(ph) : ph >= 1.2 && ph < 1.7 ? pulse(ph - 1.2) : 0;
  lighthouse.I = I;
  lighthouse.prop.glow = 0.05 + 0.95 * I;
  lighthouse.light = I > 0.02 ? { pos: lighthouse.lamp, light: [2.6 * I * 6, 2.2 * I * 6, 1.6 * I * 6] } : null;
}
