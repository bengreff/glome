// III, the knot gate. A small stone house, closed in all four directions, its doorway shut by a heavy wooden leaf
// hung by its foot on a hinge, leaning in: its weight would swing it open. A rope tied to its top runs out to a
// stone pillar and ends in a loop over a peg sticking out of the pillar, and the peg's end has a knob too big for
// the loop to pass. In 3D the loop is captive (round the peg, the knob at its end, the pillar at the other). In 4D
// the peg is round toward ana as well, as thin that way as it is in the slice, so the loop can be lifted off it
// sideways through ana: the rope falls slack, and the leaf swings open under its own weight (part III inside).
// The rope lies in one upright plane (it runs from the leaf to the peg, and the loop hangs round the peg in that
// plane), so from beside it a twist of your slice brings the whole of it into view; a horizontal loop round an
// upright post could be seen whole only from its own slice, to within the rope's thickness.
// Pure geometry and its physics; artifacts.js builds it into the world and main.js steps the rope.
import { rot as R4 } from './so4.js';
import { makeBody, hinge } from './bodies.js';
import { Rope } from './rope.js';

const add = (a, b) => a.map((v, i) => v + b[i]), sub = (a, b) => a.map((v, i) => v - b[i]), scale = (a, s) => a.map(v => v * s);
const len = a => Math.hypot(a[0], a[1], a[2], a[3]), norm = a => scale(a, 1 / len(a));
// The site's frame: axis 0 f (toward the house), 1 s, 2 a, 3 up; origin at the front wall's outer face, on the
// platform's top. The house: walls 0.2 m thick round a room 3.2 m deep and 2.2 m across in s and in a, 2.5 m high;
// its doorway 1.0 m across, 1.7 m deep toward ana and 2.2 m high (you are 2.05 m tall). The leaf stands against the
// wall's inner face, 1.2 × 1.9 × 2.28 m, 8 cm thick, its foot's inner edge on the hinge (it turns over that edge
// when it falls in, and lies flat clear of the plinth at the back).
export const GATE = {
  lean: 0.105,                                                  // 6° in from upright, held so by the rope
  hinge: [0.28, 0, 0, 0.02],
  leaf: [{ shape: 'box', c: [-0.04, 0, 0, 1.14], e: [0.04, 0.6, 0.95, 1.14] }],   // in the hinge's frame
  tie: [-0.08, 0, 0, 1.9],                                      // where the rope is tied: the leaf's outer face, high up
  peg: [-2.4, 0, 0, 1.25], pegE: 0.06, knob: 0.17,              // where the loop hangs on the square iron peg (out of the pillar along s, its knob at s 0.72)
  eye: 0.9, rope: 0.035, run: 0.165, mass: 0.03,                // the loop's length (it can't pass a knob of 2π·0.205 = 1.29 m round); the rope: hemp, 1000 kg/m⁴ over a 3-ball of radius 3.5 cm, 0.18 kg/m
  part: [3.0, 0, 0, 0.5],                                       // ring III on a plinth at the back
};
// Its fixed parts (site frame): the platform it all stands on, the house, the plinth inside, the pillar and its peg.
export function gateParts() {
  const B = (c, e) => ({ shape: 'box', c, e });
  return [
    B([0, 0, 0, -0.35], [3.9, 1.7, 1.7, 0.35]),                                              // the platform
    B([0.1, -0.9, 0, 1.25], [0.1, 0.4, 1.3, 1.25]), B([0.1, 0.9, 0, 1.25], [0.1, 0.4, 1.3, 1.25]),   // the front wall: either side of the doorway
    B([0.1, 0, -1.075, 1.25], [0.1, 0.5, 0.225, 1.25]), B([0.1, 0, 1.075, 1.25], [0.1, 0.5, 0.225, 1.25]),   // ... kata and ana of it
    B([0.15, 0, 0, 2.35], [0.15, 0.5, 0.85, 0.15]),                                          // ... and over it, reaching in: the leaf's stop, 2.5° short of upright
    B([3.5, 0, 0, 1.25], [0.1, 1.3, 1.3, 1.25]),                                             // the back wall
    B([1.8, 1.2, 0, 1.25], [1.6, 0.1, 1.3, 1.25]), B([1.8, -1.2, 0, 1.25], [1.6, 0.1, 1.3, 1.25]),   // the side walls
    B([1.8, 0, 1.2, 1.25], [1.6, 1.1, 0.1, 1.25]), B([1.8, 0, -1.2, 1.25], [1.6, 1.1, 0.1, 1.25]),   // the walls toward ana and kata
    B([1.8, 0, 0, 2.6], [1.8, 1.3, 1.3, 0.1]),                                               // the roof
    B([3.0, 0, 0, 0.25], [0.3, 0.4, 0.4, 0.25]),                                             // the plinth
    B([-2.4, -0.45, 0, 0.8], [0.18, 0.18, 0.3, 0.8]),                                        // the pillar
    B([-2.4, 0.17, 0, 1.25], [0.06, 0.44, 0.06, 0.06]),                                      // the peg (s −0.27 to 0.61: the loop hangs clear of both ends)
    { shape: 'glome', c: [-2.4, 0.72, 0, 1.25], r: 0.17 },                                    // its knob
  ];
}
// Signed distance to the fixed parts for the rope, in the world: boxes and balls in the site's frame (rows M of its
// rotation, origin o), written out without allocating (it is called for every particle in every substep). Over the
// platform the ground lies under it and is skipped.
function partsSD(parts, M, o, ground) {
  const P = parts.map(q => ({ g: q.shape === 'glome', c: q.c, e: q.e || [q.r, q.r, q.r, q.r], r: q.r || 0, b: q.r || Math.hypot(...q.e) }));
  const plat = parts[0];
  return p => {
    const d0 = p[0] - o[0], d1 = p[1] - o[1], d2 = p[2] - o[2], d3 = p[3] - o[3];
    const l = [M[0][0] * d0 + M[1][0] * d1 + M[2][0] * d2 + M[3][0] * d3, M[0][1] * d0 + M[1][1] * d1 + M[2][1] * d2 + M[3][1] * d3,
               M[0][2] * d0 + M[1][2] * d1 + M[2][2] * d2 + M[3][2] * d3, M[0][3] * d0 + M[1][3] * d1 + M[2][3] * d2 + M[3][3] * d3];
    let bd = Infinity, bn = null;
    for (let q = 0; q < P.length; q++) {
      const Q = P[q], u0 = l[0] - Q.c[0], u1 = l[1] - Q.c[1], u2 = l[2] - Q.c[2], u3 = l[3] - Q.c[3];
      if (Q.g) { const L = Math.sqrt(u0 * u0 + u1 * u1 + u2 * u2 + u3 * u3), d = L - Q.r; if (d < bd) { bd = d; bn = L > 1e-9 ? [u0 / L, u1 / L, u2 / L, u3 / L] : [0, 0, 0, 1]; } continue; }
      if (Math.sqrt(u0 * u0 + u1 * u1 + u2 * u2 + u3 * u3) - Q.b > bd) continue;
      const k0 = Math.abs(u0) - Q.e[0], k1 = Math.abs(u1) - Q.e[1], k2 = Math.abs(u2) - Q.e[2], k3 = Math.abs(u3) - Q.e[3];
      const m0 = Math.max(k0, 0), m1 = Math.max(k1, 0), m2 = Math.max(k2, 0), m3 = Math.max(k3, 0), out = Math.sqrt(m0 * m0 + m1 * m1 + m2 * m2 + m3 * m3);
      const d = out > 0 ? out : Math.max(k0, k1, k2, k3);
      if (d >= bd) continue;
      bd = d;
      if (out > 0) bn = [m0 / out * Math.sign(u0), m1 / out * Math.sign(u1), m2 / out * Math.sign(u2), m3 / out * Math.sign(u3)];
      else { const m = d; bn = [0, 0, 0, 0]; const i = m === k0 ? 0 : m === k1 ? 1 : m === k2 ? 2 : 3; bn[i] = Math.sign([u0, u1, u2, u3][i]) || 1; }
    }
    const w = [M[0][0] * bn[0] + M[0][1] * bn[1] + M[0][2] * bn[2] + M[0][3] * bn[3], M[1][0] * bn[0] + M[1][1] * bn[1] + M[1][2] * bn[2] + M[1][3] * bn[3],
               M[2][0] * bn[0] + M[2][1] * bn[1] + M[2][2] * bn[2] + M[2][3] * bn[3], M[3][0] * bn[0] + M[3][1] * bn[1] + M[3][2] * bn[2] + M[3][3] * bn[3]];
    const over = Math.abs(l[0] - plat.c[0]) < plat.e[0] - 0.05 && Math.abs(l[1] - plat.c[1]) < plat.e[1] - 0.05 && Math.abs(l[2] - plat.c[2]) < plat.e[2] - 0.05;
    if (!over) { const g = ground(p); if (g.d < bd) return g; }
    return { d: bd, n: w };
  };
}
// Build the leaf, its hinge and the rope in world w, the site at foot with frame R. ground(q) -> { d, n } is the
// planet's own surface. Returns { leaf, joint, rope, angle() }.
export function gateBuild(w, foot, R, ground) {
  const at = c => add(foot, R4.apply(R, c));
  const hp = at(GATE.hinge);
  const leaf = makeBody({ shape: 'compound', parts: GATE.leaf, density: 450, mu: 0.6, pos: hp, kind: 'gate' });
  const rot = R4.compose(R, R4.planeRotation(0, 3, -GATE.lean));
  leaf.rot = rot; leaf.pos = add(hp, R4.apply(rot, leaf.com));
  Object.assign(leaf, { mat: 6, glow: 0, noSleep: true, noTake: true, keep: true, tag: 'leaf3' });
  w.add(leaf);
  const joint = hinge({ b: leaf, ca: hp, cb: scale(leaf.com, -1), Fa: R, plane: [0, 3] });
  w.joints.push(joint);
  // the rope, taut: from the tie straight to the loop's join, and the loop round the peg (in the plane of f and up)
  const tieC = sub(GATE.tie, leaf.com), tie = add(leaf.pos, R4.apply(rot, tieC)), peg = at(GATE.peg);
  const dir = norm(sub(tie, peg)), f = R4.apply(R, [1, 0, 0, 0]);
  const perp = norm(sub(f, scale(dir, f.reduce((s, v, i) => s + v * dir[i], 0))));
  const er = GATE.eye / (2 * Math.PI), C = add(peg, scale(dir, er - (GATE.pegE + GATE.rope))), J = add(C, scale(dir, er));
  const N = Math.ceil(len(sub(J, tie)) / GATE.run), pts = [];
  for (let i = 0; i <= N; i++) pts.push(add(tie, scale(sub(J, tie), i / N)));
  const M = 12;
  for (let m = 1; m < M; m++) { const t = 2 * Math.PI * m / M; pts.push(add(C, add(scale(dir, er * Math.cos(t)), scale(perp, er * Math.sin(t))))); }
  const env = partsSD(gateParts(), R4.toRows(R), foot, ground);
  const rope = new Rope(pts, { radius: GATE.rope, accel: x => w.accel(x, [0, 0, 0, 0]), env, damping: 0.995, links: [[N + M - 1, N]], mass: GATE.mass });
  rope.iterations = 1; rope.substeps = 16; rope.selfEvery = 4;
  rope.ties.push({ i: 0, body: leaf, c: tieC });
  rope.loop = [N, N + M - 1];                       // the loop's particles (first, last)
  return {
    leaf, joint, rope, R, foot,
    // how far the leaf has swung in from upright (radians)
    angle() { const m = R4.toRows(R4.compose(R4.inverse(R), leaf.rot)); return Math.atan2(m[0][3] - m[3][0], m[0][0] + m[3][3]); },
  };
}
// One step of the rope (after the world's): pinned where a hand holds it. The leaf and the rope rest together: when
// neither has moved for a second (and no hand holds the rope) both sleep, and they wake together, when the rope is
// taken or the leaf is struck (the leaf never sleeps on its own: only the rope knows whether it is held). Far from
// you they rest as they are. Returns whether it moved.
export function stepGate(k, dt, eye, hand) {
  const r = k.rope, leaf = k.leaf;
  r.pins.clear();
  if (hand) r.pins.set(hand.i, hand.p);
  const near = !!hand || len(sub(r.x[0], eye)) < 120;
  if (!near || (!hand && k.asleep && leaf.sleeping)) {
    if (!leaf.sleeping) { leaf.sleeping = true; leaf.vel = [0, 0, 0, 0]; leaf.omega = [0, 0, 0, 0, 0, 0]; }
    return false;
  }
  if (leaf.sleeping) { leaf.sleeping = false; leaf.sleepT = 0; }
  k.asleep = false;
  r.step(dt);
  let vmax = 0; for (let i = 0; i < r.x.length; i++) vmax = Math.max(vmax, len(sub(r.x[i], r.prevX[i])) / dt);   // (over the whole step: a taut rope hums in its substeps)
  const ang = k.angle(), turn = Math.abs(ang - (k.lastAngle ?? ang)) / dt; k.lastAngle = ang;   // (its rate between steps: the rope's pull and its weight trade impulses within one)
  const still = !hand && vmax < 0.03 && turn < 0.01;
  k.stillT = still ? (k.stillT || 0) + dt : 0;
  if (k.stillT > 1) { k.asleep = true; leaf.sleeping = true; leaf.vel = [0, 0, 0, 0]; leaf.omega = [0, 0, 0, 0, 0, 0]; for (const v of r.v) v.fill(0); }
  return true;
}
