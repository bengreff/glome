// Impulse stones grow again at the monuments. Every ruin and cairn has a low pedestal of worked stone (finds.js) where
// a stone forms: taken, the next one kindles in its place over three minutes, a dark stone whose glow grows until it
// is whole (pale, like any impulse stone); only a whole one can be taken. Stones are made only within reach of you
// (the pedestals' timers run everywhere), and one on its pedestal belongs to the monument: it is not saved, but made
// again when you come near.
import { G } from './game.js';
import { vec4 } from './player.js';
import { objects, spawnAt, KINDS } from './objects.js';
import { finds } from './finds.js';

export const GROW = 180;                  // seconds for a stone to form
const NEAR = 70, FAR = 85;                // made within 70 m of you, let go beyond 85 m
const live = new Map();                   // pedestal index -> its stone body
const FULL = KINDS.stone.glow;

export function updateNooks() {
  const p = G.player, w = objects.world;
  if (!p || !w || p.onB != null || !finds.nooks.length) return;
  const now = G.state.time, ready = G.flags.nooks || (G.flags.nooks = {});
  for (const [i, b] of live) {
    const k = finds.nooks[i];
    if (b.held || b.pouched || vec4.len(vec4.sub(b.pos, k.p)) > 0.3) {          // taken (or knocked off): another begins
      if (!b.fixed) { ready[i] = now + GROW; b.nook = null; live.delete(i); continue; }
    }
    if (!w.bodies.includes(b)) { live.delete(i); continue; }                     // (the world was loaded afresh)
    if (vec4.len(vec4.sub(k.p, p.pos)) > FAR) { w.remove(b); live.delete(i); continue; }
    if (b.fixed) grow(b, ready[i], now, i);
  }
  for (let i = 0; i < finds.nooks.length; i++) {
    if (live.has(i)) continue;
    const k = finds.nooks[i];
    if (vec4.len(vec4.sub(k.p, p.pos)) > NEAR) continue;
    const b = spawnAt('stone', k.p);
    b.nook = i; b.sleeping = true; b.vel = [0, 0, 0, 0];
    live.set(i, b);
    if (ready[i] != null && now < ready[i]) { b.fixed = b.kinematic = true; b.mat = 3; grow(b, ready[i], now, i); }
  }
}
// A forming stone is held fast, dark and kindling; whole, it is an impulse stone like any other.
function grow(b, at, now, i) {
  const f = at == null ? 1 : Math.max(0, Math.min(1, 1 - (at - now) / GROW));
  b.glow = 0.01 + 0.17 * f * f * f;                // (a faint kindling: the whole stone's pale glaze is what says ready)
  if (f >= 1) { b.fixed = b.kinematic = false; b.sleeping = true; b.mat = KINDS.stone.mat; b.glow = FULL; delete G.flags.nooks[i]; }
}
