// The launcher: a stone pad on the highest summit, where gravity is lightest. Its power comes in tiers; each tier is
// a key (a ring, I–IV) found elsewhere and carried back to the pillar beside the pad, where it drops onto the ball
// that fits it (keys.js). Its aim is a barrel on a gimbal beside the pad, set by three sliders (gimbal.js). Stand on
// the pad and jump: it throws you along the barrel at its tier's speed.
// (Speeds re-derived for the summit: see DECISIONS.md.)
import { G } from './game.js';
import { vec4 } from './player.js';
import { PLANET_R, MASSIF } from './world.js';
import { tangents } from './env.js';
import { rot as R4 } from './so4.js';
import { makeBody } from './bodies.js';
import { objects, spawn, KINDS } from './objects.js';
import { makeProp, addRock, SHAPE, MAT } from './props.js';
import { PILLAR, RING, seatHeight, pillarParts, ringParts, ringDraw } from './keys.js';
import { GIMBAL, aim, angleAt, placeOf, barrelRot, anglesFor } from './gimbal.js';

export const TIERS = [0, 28, 43, 53, 72];             // m/s for tiers 0 (no parts) .. IV (derived by integration: PHYSICS.md)
export const launcher = { site: null, n: null, pad: null, tier: 0, onPad: false, ring: 3.6, pillar: null };

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
  // the pillar, 4 m from the pad's centre: a thin square spindle of metal with four balls on it, smaller going up,
  // onto which the rings drop (keys.js). Solid as a fixed body, drawn as props (so the balls can light).
  const T = tangents(s.p), dir = T[0].map(v => -v), off = 4;
  const pn = vec4.norm(vec4.add(vec4.scale(s.p, Math.cos(off / PLANET_R)), vec4.scale(dir, Math.sin(off / PLANET_R))));
  const prot = squareOn(pn), foot = vec4.scale(pn, PLANET_R + hf.heightAt(pn) - 0.03);
  const body = makeBody({ shape: 'compound', parts: pillarParts(), mass: 1e9, mu: PILLAR.mu, pos: foot, kind: 'pillar' });
  body.pos = vec4.add(foot, R4.apply(prot, body.com)); body.rot = prot;
  body.kinematic = body.fixed = body.hidden = true; body.mat = 1;
  objects.world.add(body);
  const show = (c, e, shape, glow) => { const p = makeProp({ c, rot: prot, e, shape, mat: MAT.metal, glow }); p.kind = 'socket'; p.visual = true; addRock(p); return p; };
  launcher.pillar = {
    n: pn, foot, up: pn, rot: prot, body,
    spindle: show(vec4.add(foot, vec4.scale(pn, PILLAR.top / 2)), [PILLAR.p, PILLAR.p, PILLAR.p, PILLAR.top / 2], SHAPE.box, 0.04),
    balls: PILLAR.R.map((r, k) => show(vec4.add(foot, vec4.scale(pn, PILLAR.z[k])), [r, r, r, r], SHAPE.ball, 0.04)),
    seat: k => vec4.add(foot, vec4.scale(pn, seatHeight(k))),
    top: vec4.add(foot, vec4.scale(pn, PILLAR.top + 0.25)),
  };
  // the aim: a post 3.2 m from the pad's centre on the side away from the pillar, the barrel on a ball at its top;
  // and the sliders' stand beside it, toward the pad (gimbal.js). Each stands on its own ground (the summit falls away).
  const R = squareOn(s.p), fs = vec4.dot(R4.apply(R, [1, 0, 0, 0]), T[0]) > 0 ? 1 : -1;   // (+f away from the pillar: it stands along −T[0])
  const ground = (f, sd) => { const q = vec4.norm(vec4.add(vec4.scale(s.p, PLANET_R), R4.apply(R, [f, sd, 0, 0]))); return vec4.scale(q, PLANET_R + hf.heightAt(q)); };
  const up0 = s.p, P0 = ground(3.2 * fs, 0), top = vec4.add(P0, vec4.scale(up0, 1.45));
  const fixedBox = (c, e, rot = R) => { const b = makeBody({ shape: 'compound', parts: [{ shape: 'box', c: [0, 0, 0, 0], e }], mass: 1e9, mu: 0.5, pos: c, kind: 'aim' }); b.pos = c; b.rot = rot; b.kinematic = b.fixed = b.hidden = true; objects.world.add(b); return b; };
  const showAim = (c, e, shape, mat, rot = R) => { const p = makeProp({ c, rot, e, shape, mat }); p.kind = 'socket'; p.visual = true; addRock(p); return p; };
  fixedBox(vec4.add(P0, vec4.scale(up0, 0.65)), [0.12, 0.12, 0.12, 0.65]); showAim(vec4.add(P0, vec4.scale(up0, 0.65)), [0.12, 0.12, 0.12, 0.65], SHAPE.box, MAT.basalt);
  showAim(top, [0.14, 0.14, 0.14, 0.14], SHAPE.ball, MAT.metal);
  const barrel = makeBody({ shape: 'compound', parts: [{ shape: 'box', c: [0.35, 0, 0, 0], e: [0.55, 0.07, 0.07, 0.07] }], mass: 1e9, mu: 0.5, pos: top, kind: 'barrel' });
  barrel.kinematic = barrel.fixed = true; barrel.mat = 1; barrel.glow = 0.05; objects.world.add(barrel);
  const S0 = ground(2.0 * fs, 1.7), stand = vec4.add(S0, vec4.scale(up0, 0.45));
  fixedBox(stand, [0.42, 0.55, 0.3, 0.45]); showAim(stand, [0.42, 0.55, 0.3, 0.45], SHAPE.box, MAT.basalt);
  const sdir = R4.apply(R, [0, 1, 0, 0]), knobs = [-0.25, 0, 0.25].map((df, k) => {
    const mid = vec4.add(vec4.add(S0, vec4.scale(up0, 0.93)), R4.apply(R, [df * fs, 0, 0, 0])), a = vec4.sub(mid, vec4.scale(sdir, GIMBAL.rail / 2));
    showAim(mid, [0.02, GIMBAL.rail / 2, 0.02, 0.02], SHAPE.box, MAT.metal);
    const b = makeBody({ shape: 'glome', size: 0.06, mass: 1, pos: a, kind: 'knob' });
    Object.assign(b, { kinematic: true, mat: 1, glow: 0.05, keep: true, mounted: true, slider: { k, a: vec4.add(a, vec4.scale(up0, 0.06)), dir: sdir, len: GIMBAL.rail, x: placeOf(k, GIMBAL.start[k]) } });
    objects.world.add(b); b.sleeping = true; return b;
  });
  launcher.aim = { R, top, barrel, knobs, angles: GIMBAL.start.slice(), dir: vec4.norm(R4.apply(R, aim(GIMBAL.start))) };
  setAim(GIMBAL.start);
}
// Point the barrel (and set the sliders) to the angles [turn, toward ana, up].
export function setAim(angles) {
  const A = launcher.aim; if (!A) return;
  A.knobs.forEach((b, k) => { b.slider.x = Math.max(0, Math.min(1, placeOf(k, angles[k]))); });
  aimFromKnobs();
}
// The barrel follows the sliders.
function aimFromKnobs() {
  const A = launcher.aim;
  A.knobs.forEach(b => { const S = b.slider; b.pos = vec4.add(S.a, vec4.scale(S.dir, S.x * S.len)); b.prevPos = b.pos.slice(); b.prevRot = b.rot; });
  A.angles = A.knobs.map((b, k) => angleAt(k, b.slider.x));
  A.dir = vec4.norm(R4.apply(A.R, aim(A.angles)));
  const rot = R4.compose(A.R, barrelRot(A.angles));
  A.barrel.rot = rot; A.barrel.pos = vec4.add(A.top, R4.apply(rot, A.barrel.com)); A.barrel.prevPos = A.barrel.pos.slice(); A.barrel.prevRot = rot;
}
// For the scripted flights: aim along a world direction.
export const aimAt = dir => setAim(anglesFor(R4.applyInv(launcher.aim.R, dir)));
// The four keys, placed now at the places the artifacts will guard (DESIGN.md: carried back by hand).
export function placeParts(spots) {
  spots.forEach((n, i) => { const b = spawn('part', n, { extra: { tier: i + 1 } }); b.tag = `part${i + 1}`; });
}
// Is ring k (1–4) resting on its ball? (Friction holds it where it landed, up to a few cm off the axis.)
export function seated(b) {
  const P = launcher.pillar;
  if (!P || b.kind !== 'part' || b.held) return false;
  const d = vec4.sub(b.pos, P.foot), h = vec4.dot(d, P.up), off = vec4.len(vec4.sub(d, vec4.scale(P.up, h)));
  return Math.abs(h - seatHeight(b.tier - 1)) < 0.03 && off < 0.08;
}
// For tests and the scripted flights: set ring b on its ball.
export function seat(b) { const P = launcher.pillar; b.pos = P.seat(b.tier - 1); b.rot = P.rot; b.vel = [0, 0, 0, 0]; b.omega = [0, 0, 0, 0, 0, 0]; b.kinematic = false; b.sleeping = true; }
// The tier: the highest k such that rings I..k all rest on their balls.
export function updateLauncher(p) {
  if (!launcher.pad) return;
  if (launcher.aim) aimFromKnobs();
  const on = new Set();
  let held = null;
  for (const b of objects.world.bodies) if (b.kind === 'part') { if (seated(b)) on.add(b.tier); if (b.held) held = b.tier; }
  let k = 0; while (on.has(k + 1)) k++;
  launcher.tier = k;
  launcher.pad.glow = k === 4 ? 0.9 : 0.12 * k;                 // a full set lights the pad
  const P = launcher.pillar, pulse = 0.5 + 0.5 * Math.sin(G.simT * 5);
  P.balls.forEach((ball, i) => {                                 // each ball lights as its ring comes to rest, with a chime;
    const lit = on.has(i + 1);                                   // the one whose ring you hold answers, pulsing
    if (lit && !ball.lit && G.simT > 2) G.audio?.emit('chime', ball.c, on.size === 4 ? 1.0 : 0.55);
    ball.lit = lit; ball.glow = lit ? 0.9 : held === i + 1 ? 0.25 + 0.45 * pulse : 0.04;
  });
  if (held && held !== launcher.answering && G.simT > 2) G.audio?.emit('chime', P.balls[held - 1].c, 0.3);   // (it answers once as you take it)
  launcher.answering = held;
  for (const b of objects.world.bodies) if (b.kind === 'part') b.glow = on.has(b.tier) && b.tier <= k ? 0.12 : 0;   // (a seated ring warms a little: still brass)
  // standing on the pad: your feet on its top face, within its square
  const d = vec4.sub(p.pos, launcher.site), up = vec4.norm(launcher.site);
  const hgt = vec4.dot(d, up), lat = vec4.len(vec4.sub(d, vec4.scale(up, hgt)));
  launcher.onPad = Math.abs(hgt) < 0.4 && lat < 1.2;
}
// Jumping on the pad launches you along the barrel.
export function tryLaunch(p, cam, jump) {
  if (!jump || !launcher.onPad || launcher.tier === 0 || G.simT - (launcher.last || -9) < 1.5) return false;
  launcher.last = G.simT;
  const u = p.up(), dir = launcher.aim ? launcher.aim.dir : vec4.dot(cam.F, u) > 0.05 ? cam.F : u;
  p.vel = vec4.scale(dir, TIERS[launcher.tier]);
  p.pos = vec4.add(p.pos, vec4.scale(u, 0.3));
  p.grounded = false; p.airborneUntil = G.simT + 0.5;          // no footing for a moment: you are flying
  G.audio?.emit('launch', p.pos, 1.2);
  G.flags.launches = (G.flags.launches || 0) + 1;
  return true;
}
launcher.seat = seat; launcher.seated = seated; launcher.setAim = setAim; launcher.aimAt = aimAt;     // (for the scripted playthroughs)
