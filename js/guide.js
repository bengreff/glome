// The way: one goal at a time, shown without words. Its column of light stands in your slice, wherever the goal
// really lies (straight above its place, moved into your slice along ana: a guide for a 3D mind, not a thing of the
// world); a mark in the view gives its distance; and when the goal lies off your slice, a cue beside the mark says
// which way to step to reach it (E toward ana, Q toward kata, in the radar's colours) and how far. It says where,
// and the key for what the place is for: take a stone (F), jump from the pad (Space).
// The goals: with an empty pouch, the nearest impulse stone (in a cache, or whole on a monument's pedestal); with a
// stone in the pouch, the launcher's pad. Holding a stone, none: the cue under the dot says G stows it. Wandered
// into the cave (a place, not a puzzle), the way out. On B its own marks show the console and the pad (hud.js).
import { G } from './game.js';
import { vec4 } from './player.js';
import { PLANET_R } from './world.js';
import { objects } from './objects.js';
import { launcher } from './launcher.js';
import { flight } from './flight.js';
import { carves } from './landforms.js';

export const guide = { goal: null };
const segDist = (p, a, b) => { const ab = vec4.sub(b, a), t = Math.max(0, Math.min(1, vec4.dot(vec4.sub(p, a), ab) / Math.max(1e-9, vec4.dot(ab, ab)))); return vec4.len(vec4.sub(p, vec4.add(a, vec4.scale(ab, t)))); };

// In the cave (its chamber, passage or tunnel, below the hillside's surface)?
function inCave() {
  const p = G.player;
  if (!G.cave) return false;
  const up = vec4.norm(p.pos);
  if (vec4.len(p.pos) > PLANET_R + p.hf.heightAt(up) - 0.4) return false;
  return carves.some(c => G.cave.parts.includes(c.name) && segDist(p.pos, c.a, c.b) < c.r + 0.3);
}
// goal: { pos (4D), kind, cue: null | 'F' | 'Space' }
export function updateGuide() {
  pickGoal();
  // in the cave with somewhere else to go: out the way you came, up the tunnel and out of its mouth's hollow
  const g = guide.goal;
  if (g && inCave() && vec4.len(vec4.sub(g.pos, G.cave.chamber)) > 12) guide.goal = { pos: G.cave.out, kind: 'exit', cue: null };
}
// The nearest whole impulse stone lying on A, above any water: loose, or on its pedestal (not one still forming).
export function nearestStone(from) {
  const hf = G.player.hf;
  let best = null, bd = Infinity;
  for (const b of objects.world.bodies) {
    if (b.kind !== 'stone' || b.held || b.pouched || b.fixed || b.inB) continue;
    const d = vec4.len(vec4.sub(b.pos, from));
    if (d >= bd) continue;
    if (vec4.len(b.pos) - PLANET_R < hf.waterAt(vec4.norm(b.pos)) - 0.05) continue;     // (sunk: out of reach)
    bd = d; best = b;
  }
  return best && { b: best, d: bd };
}
function pickGoal() {
  const p = G.player;
  guide.goal = null;
  if (!p || p.onB != null || flight.active || !launcher.site) return;
  const held = objects.held;
  if (held && held.kind === 'stone' && objects.pouch < 9) return;          // (the cue under the dot: G)
  if (objects.pouch === 0) {
    const s = nearestStone(p.pos);
    if (s) { guide.goal = { pos: s.b.pos, kind: 'stone', cue: G.canTake && s.d < 4 ? 'F' : null }; return; }
  }
  guide.goal = { pos: launcher.site, kind: 'launch', cue: launcher.onPad ? 'Space' : null };
}

// ---------- the column of light ----------
// The goal's column, set into your slice: straight up from the ground at the goal's place, moved along ana into your
// slice, so that it shows wherever you face it (the hills in front still hide its foot). While the goal itself lies
// off your slice the column is dashed, its dashes rising; standing at it, it fades, and the mark takes over.
export const beam = { B: new Float32Array(4), C: new Float32Array(4), S: new Float32Array(4) };
const ACC = [0.32 * 1.5, 0.86 * 1.5, 0.78 * 1.5], WARM = [1.25, 1.2, 1.05];
export function updateBeam(cam) {
  const g = guide.goal;
  beam.S[2] = 0;
  if (!g) return;
  const hf = G.player.hf, A = cam.A, eye = cam.eye;
  const a = vec4.dot(vec4.sub(g.pos, eye), A);
  const nP = vec4.norm(vec4.sub(g.pos, vec4.scale(A, a)));          // its place, moved into your slice
  const base = vec4.scale(nP, PLANET_R + Math.max(hf.heightAt(nP), 0));
  const up = vec4.norm(eye), d = vec4.sub(base, eye), dh = vec4.len(vec4.sub(d, vec4.scale(up, vec4.dot(d, up))));
  beam.B.set(base);
  beam.C.set([...(g.kind === 'launch' ? WARM : ACC), 150]);
  beam.S.set([Math.min(1, Math.max(0, (Math.abs(a) - 1.0) / 1.5)), Math.min(1, Math.max(0, (dh - 3) / 9)), 1, Math.abs(a)]);
}
