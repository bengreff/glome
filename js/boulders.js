// Boulders: scattered 4D balls, partly buried. The nearest MAXB go to the GPU each frame; the far ones shrink to
// nothing before they drop out of the list, so they never pop.
import { PLANET_R } from './world.js';
import { vec4, CAP_LO, CAP_HI, CAP_R } from './player.js';
import { LAWS } from './laws.js';
import { G, sunDir } from './game.js';
import { carveSD } from './landforms.js';

export const MAXB = 32;
const B_FAR = 140;
export const boulders = { all: [], near: [], cut: 0, shadow: 0, C: new Float32Array(MAXB * 4), R: new Float32Array(MAXB) };

export function makeBoulders(rand) {
  const player = G.player;
  const gauss = () => rand() + rand() + rand() + rand() - 2, home = player.up();
  // The first thing you see: a boulder a few steps ahead, its centre a little toward ana, so it swells and
  // shrinks to nothing as you turn.
  {
    const ahead = vec4.norm(vec4.add(vec4.scale(home, Math.cos(9 / PLANET_R)), vec4.scale(player.F, Math.sin(9 / PLANET_R))));
    const n = vec4.norm(vec4.add(ahead, vec4.scale(player.A, 0.7 / PLANET_R))), r = 1.7;
    boulders.all.push({ n, r, c: vec4.scale(n, PLANET_R + player.hf.heightAt(n) + 0.3 * r) });
  }
  for (let i = 0; i < 3400; i++) {
    const n = vec4.norm([gauss(), gauss(), gauss(), gauss()]), h = player.hf.heightAt(n);
    if (h < 0.8) continue;
    const r = 1.4 + 3.6 * rand() ** 2;
    if (Math.acos(Math.min(1, vec4.dot(n, home))) * PLANET_R < r + 6) continue;   // keep the start clear
    const c = vec4.scale(n, PLANET_R + h + 0.3 * r);
    if (carveSD(c).d < r + 2) continue;                                              // and the landforms
    boulders.all.push({ n, r, c });
  }
}

export function updateBoulders(eye) {
  const player = G.player;
  const cand = [];
  for (const b of boulders.all) {
    const d = vec4.len(vec4.sub(b.c, eye));
    if (d < B_FAR + b.r) cand.push({ b, d });
  }
  cand.sort((x, y) => x.d - y.d);
  const near = cand.slice(0, MAXB);
  const cut = Math.min(B_FAR, near.length === MAXB ? near[MAXB - 1].d : B_FAR);
  // A ray of the slice view never leaves your slice, so it can only hit boulders the slice cuts: they go first.
  // A shadow ray from a point p of the slice toward the sun has ana coordinate s·(sun·A) at distance s (p·A = 0),
  // so a boulder at ana coordinate a can only shade the slice if that line passes it within 200 m: next go those.
  const A = player.A, sa = vec4.dot(G.sun || sunDir(G.state.time), A);
  const rank = x => {
    const a = vec4.dot(x.b.c, A), r = x.b.r;
    if (Math.abs(a) < r) return 2;
    return a > Math.min(0, 200 * sa) - r && a < Math.max(0, 200 * sa) + r ? 1 : 0;
  };
  near.forEach(x => { x.rank = rank(x); });
  near.sort((x, y) => y.rank - x.rank);
  boulders.cut = near.filter(x => x.rank === 2).length;
  boulders.shadow = near.filter(x => x.rank >= 1).length;
  boulders.C.fill(0); boulders.R.fill(0);
  near.forEach(({ b, d }, i) => {
    boulders.C.set(b.c, 4 * i);
    boulders.R[i] = b.r * Math.min(1, Math.max(0, (cut - d) / (0.15 * cut)));   // fade out toward the cut-off
  });
  boulders.near = near.map(x => x.b);
}

// Contact with boulders, in full 4D, for the body capsule (PHYSICS.md: sphere centres 0.3 m and 1.75 m above the
// feet, radius 0.3 m). The contact normal points from the boulder's centre to the nearest point of the capsule's
// axis, so it has an ana component whenever the centre is off your slice. Coulomb friction (body and feet against
// rock, μ = 0.9) acts on the whole horizontal part of your velocity, ana included: push into a boulder within
// about 42° of head-on and you stick; only a glancing push slides you around it, through ana if that is where its
// surface leans. Holding Space against one scrambles you up its surface; near the top you can stand on it.
export function boulderContact(p, dt, input) {
  if (p.onB != null) return;                                  // boulders are on planet A
  const up = p.up(), MU = LAWS.MU;
  for (const b of boulders.near) {
    const ca = vec4.dot(vec4.sub(b.c, p.pos), up);                       // the nearest point of the capsule's axis
    const y = Math.min(CAP_HI, Math.max(CAP_LO, ca));
    const d = vec4.sub(vec4.add(p.pos, vec4.scale(up, y)), b.c), l = vec4.len(d), R = b.r + CAP_R;
    if (l > R + 0.03 || l < 1e-6) continue;
    const n = vec4.scale(d, 1 / l), nu = vec4.dot(n, up);
    if (l < R) p.pos = vec4.add(p.pos, vec4.scale(n, R - l));            // undo any overlap along the 4D normal
    if (nu > 0.5) p.supported = true;                                     // you are on top of it
    if (input.jump && nu < 0.85 && nu > -0.3 && (input.fwd || input.right || input.ana)) {
      // scramble: climb along the steepest way up the 4D surface (up, minus its normal part)
      const climb = vec4.sub(up, vec4.scale(n, nu)), cl = vec4.len(climb);
      if (cl > 1e-3) { p.vel = vec4.scale(climb, LAWS.CLIMB / cl); p.supported = true; p.climbUntil = G.simT + 0.35; continue; }
    }
    const vn = vec4.dot(p.vel, n);
    if (vn >= 0) continue;
    let v = vec4.sub(p.vel, vec4.scale(n, vn));                // the boulder cancels the approach ...
    const vr = vec4.dot(v, up), vt = vec4.sub(v, vec4.scale(up, vr)), vtl = vec4.len(vt);
    const stop = MU * -vn;                                     // ... and friction resists sliding along it
    v = vtl <= stop ? vec4.scale(up, vr) : vec4.add(vec4.scale(up, vr), vec4.scale(vt, 1 - stop / vtl));
    p.vel = v;
  }
}
