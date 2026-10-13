// The way: one goal at a time, shown without words. Its column of light stands in your slice, wherever the goal
// really lies (straight above its place, moved into your slice along ana: a guide for a 3D mind, not a thing of the
// world); a mark in the view gives its distance; and when the goal lies off your slice, a cue beside the mark says
// which way to step to reach it (E toward ana, Q toward kata, in the radar's colours) and how far. At a puzzle it
// says only where, never what to do: the idea is the puzzle's. Elsewhere a cue says what the place is for: take a
// part (F), set it down at the pad (F), jump from the charged pad (Space).
// The goals follow the artifacts' chain: the next artifact (where it is, never what to do there); a part set free,
// then the pillar beside the launcher's pad to let it go over; with all four, the pad itself. Wandered into the cave
// (a place, not a puzzle), the way out.
import { G } from './game.js';
import { vec4 } from './player.js';
import { PLANET_R } from './world.js';
import { objects } from './objects.js';
import { launcher, seated } from './launcher.js';
import { artifacts } from './artifacts.js';
import { flight } from './flight.js';
import { carves } from './landforms.js';

export const guide = { goal: null };
const TIER = { room: 1, mirror: 2, knot: 3, fold: 4 };
const solved = a => !!(G.flags['solved_' + a.id] || (a.id === 'room' && G.flags.part1));
const segDist = (p, a, b) => { const ab = vec4.sub(b, a), t = Math.max(0, Math.min(1, vec4.dot(vec4.sub(p, a), ab) / Math.max(1e-9, vec4.dot(ab, ab)))); return vec4.len(vec4.sub(p, vec4.add(a, vec4.scale(ab, t)))); };

// In the cave (its chamber, passage or tunnel, below the hillside's surface)?
function inCave() {
  const p = G.player;
  if (!G.cave) return false;
  const up = vec4.norm(p.pos);
  if (vec4.len(p.pos) > PLANET_R + p.hf.heightAt(up) - 0.4) return false;
  return carves.some(c => G.cave.parts.includes(c.name) && segDist(p.pos, c.a, c.b) < c.r + 0.3);
}
// goal: { pos (4D), kind, cue: null | 'F' | 'turn' | 'E' | 'Space', thing (a ball inside the mark: bring something) }
export function updateGuide() {
  pickGoal();
  // in the cave with somewhere else to go: out the way you came, up the tunnel and out of its mouth's hollow
  const g = guide.goal;
  if (g && inCave() && vec4.len(vec4.sub(g.pos, G.cave.chamber)) > 12) guide.goal = { pos: G.cave.out, kind: 'exit', cue: null };
}
function pickGoal() {
  const p = G.player;
  guide.goal = null;
  if (!p || p.onB != null || flight.active || !G.artifacts || !launcher.site) return;
  const set = (pos, kind, o = {}) => { guide.goal = { pos, kind, cue: null, ...o }; };
  const near = (q, r) => vec4.len(vec4.sub(p.pos, q)) < r;
  const held = objects.held, bodies = objects.world.bodies;
  // carrying a key: to the pillar beside the pad (its ball answers), and let it go over the spindle
  if (held && held.kind === 'part') return set(launcher.pillar.top, 'pillar', { cue: near(launcher.pillar.top, 2.2) ? 'F' : null });
  // a key set free and not yet on the pillar: go and take it
  let free = null, fd = Infinity;
  for (const b of bodies) {
    if (b.kind !== 'part' || b.held || seated(b)) continue;
    const a = artifacts.find(x => TIER[x.id] === b.tier);
    if (a && !solved(a)) continue;
    const d = vec4.len(vec4.sub(b.pos, p.pos)); if (d < fd) { fd = d; free = b; }
  }
  if (free) return set(free.pos, 'part', { cue: G.canTake && fd < 4 ? 'F' : null });
  const next = artifacts.find(a => !solved(a));
  if (!next) return set(launcher.site, 'launch', { cue: launcher.onPad ? 'Space' : null });
  if (next.id === 'mirror') {
    const key = bodies.find(b => b.tag === 'key2');
    if (!key) return set(next.n && vec4.scale(next.n, PLANET_R), 'artifact');
    if (!key.held) return set(key.pos, 'key', { cue: G.canTake && near(key.pos, 4) ? 'F' : null });
    // holding the key: to its socket (how it must sit there is the puzzle)
    return set(next.sock, 'socket');
  }
  if (next.id === 'knot' && G.rope) {
    // the rope's loop on its peg (how to free it is the puzzle)
    const q = G.rope.x[next.loop[0]];
    return set(q, 'loop', { cue: G.ropeHeld == null && G.canTake && near(q, 3.5) ? 'F' : null });
  }
  set(vec4.scale(next.n, PLANET_R + p.hf.heightAt(next.n)), 'artifact');
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
  beam.C.set([...(g.kind === 'pillar' || g.kind === 'launch' ? WARM : ACC), 150]);
  beam.S.set([Math.min(1, Math.max(0, (Math.abs(a) - 1.0) / 1.5)), Math.min(1, Math.max(0, (dh - 3) / 9)), 1, Math.abs(a)]);
}
