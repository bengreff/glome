// Boats. A raft is a wooden tesseract: it floats on the 4-volume it displaces (bodies.js), and here it gets what
// makes it a boat:
// - a keel: water resists its motion sideways, in both sideways directions (its right and its ana), far more than
//   along its heading;
// - the wind: a slowly turning 4D field over the whole planet (built from the 3-sphere's pole-free frame, so it is
//   smooth everywhere), pushing on the raft itself a little, and on a sail a lot once a sail rests on the raft;
// - a tiller: standing on it, it turns toward where you face.
// The sail is square-rigged: it takes the part of the relative wind along the heading (no tacking).
import { G } from './game.js';
import { vec4 } from './player.js';
import { tangents } from './env.js';
import { rot as R4, step as rotStep } from './so4.js';
import { objects } from './objects.js';

const WIND = 6;                       // m/s
// The wind at unit n and time t: a combination of the three global fields n·i, n·j, n·k, turning slowly.
export function windAt(n, t) {
  const T = tangents(n), a = 0.0021 * t + 0.7, b = 0.0013 * t + 2.1;
  const d = [0, 1, 2, 3].map(i => Math.cos(a) * T[0][i] + Math.sin(a) * Math.cos(b) * T[1][i] + Math.sin(a) * Math.sin(b) * T[2][i]);
  return vec4.scale(d, WIND * (0.75 + 0.25 * Math.sin(0.011 * t)));
}
const axes = b => { const M = R4.toRows(b.rot); return [0, 1, 2, 3].map(j => [M[0][j], M[1][j], M[2][j], M[3][j]]); };
// Each physics step, for every raft afloat.
export function stepBoats(dt, t) {
  const p = G.player;
  for (const b of objects.world.bodies) {
    if (b.kind !== 'raft') continue;
    b.boat = true;
    if (!b.wet || b.held) continue;
    b.sleeping = false;
    const up = vec4.norm(b.pos), Ax = axes(b);
    // the raft's three horizontal axes: whichever three of its own are most nearly level; heading = the first
    const lv = Ax.map(a => vec4.norm(vec4.sub(a, vec4.scale(up, vec4.dot(a, up))))).filter((a, i) => Math.abs(vec4.dot(Ax[i], up)) < 0.7);
    if (lv.length < 3) continue;
    const [h, s1, s2] = lv;
    const v = vec4.sub(b.vel, vec4.scale(up, vec4.dot(b.vel, up)));
    const m = b.m, frac = b.wet;
    // the keel and the hull
    const dv = vec4.add(vec4.scale(h, -0.15 * vec4.dot(v, h)), vec4.add(vec4.scale(s1, -1.6 * vec4.dot(v, s1)), vec4.scale(s2, -1.6 * vec4.dot(v, s2))));
    let F = vec4.scale(dv, m * frac * 2);
    // the wind on the raft, and on a sail resting on it
    // a sail set on the raft is rigged: it rides on top, turning with the raft, until you take it off
    let sailed = false;
    for (const o of objects.world.bodies) {
      if (o.kind !== 'sail' || o.held) { if (o.kind === 'sail' && o.held) { o.rigged = false; o.ghostly = false; } continue; }
      if (!o.rigged && vec4.len(vec4.sub(o.pos, b.pos)) < b.size && vec4.dot(vec4.sub(o.pos, b.pos), up) > b.half * 0.8) o.rigged = b.id;
      if (o.rigged === b.id) {
        o.kinematic = true; o.ghostly = true; o.sleeping = false; o.rot = b.rot; o.vel = b.vel.slice();   // part of the boat now: no contacts of its own
        o.pos = vec4.add(b.pos, vec4.scale(up, b.half + o.half + 0.01));
        sailed = true;
      }
    }
    const w = vec4.sub(windAt(up, t), v);
    const wh = vec4.dot(w, h);
    F = vec4.add(F, vec4.scale(w, 3 * vec4.len(w)));                                  // windage of the raft
    if (sailed) F = vec4.add(F, vec4.scale(h, 34 * wh * Math.abs(wh)));                 // the sail
    for (let i = 0; i < 4; i++) b.vel[i] += F[i] / m * dt;
    b.sailed = sailed;
    // the tiller: standing on the raft, it turns to your heading, in the plane of its heading and yours
    if (p && p.ride === b) {
      const f = vec4.norm(vec4.sub(p.F, vec4.scale(up, vec4.dot(p.F, up)))), c = vec4.dot(f, h);
      if (c < 0.999) {
        const ang = Math.min(0.35 * dt, Math.acos(Math.max(-1, c)));
        const wv = vec4.norm(vec4.sub(f, vec4.scale(h, c)));
        // rotate the raft by ang in the (h, wv) plane: a world-frame bivector ω with ω·h = wv
        const om = [0, 1, 2, 3].flatMap((i, _, arr) => arr.slice(i + 1).map(j => h[j] * wv[i] - h[i] * wv[j]));
        b.rot = R4.renorm(rotStep(b.rot, om.map(x => x * ang / dt), dt));
      }
    }
  }
}
