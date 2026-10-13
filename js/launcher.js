// The launcher: a metal pad on the level top of the highest summit (world.js), where gravity is lightest. Its aim is a barrel on a gimbal beside
// the pad, set by three sliders (gimbal.js). Stand on the pad and jump: it throws you along the barrel at its speed,
// anything up to 72 m/s (enough to reach planet B: see DECISIONS.md).
import { G } from './game.js';
import { vec4 } from './player.js';
import { PLANET_R, SUMMIT } from './world.js';
import { tangents } from './env.js';
import { rot as R4 } from './so4.js';
import { makeBody } from './bodies.js';
import { objects } from './objects.js';
import { makeProp, addRock, SHAPE, MAT } from './props.js';
import { GIMBAL, aim, angleAt, placeOf, barrelRot, anglesFor } from './gimbal.js';

export const SPEED_MAX = 72;                          // m/s: the most the launcher gives (lands on B; PHYSICS.md)
export const launcher = { site: null, n: null, pad: null, speed: 43, onPad: false };

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
  const s = { p: SUMMIT, h: hf.heightAt(SUMMIT) };
  launcher.n = s.p; launcher.h = s.h;
  // the pad: a tesseract slab of side 2.4 m, its top face 0.15 m above the ground (a step up), a fixed body, metal
  const side = 2.4, c = vec4.scale(s.p, PLANET_R + s.h + 0.15 - side / 2);
  const pad = makeBody({ shape: 'tesseract', size: side, mass: 1e9, pos: c, rot: squareOn(s.p), kind: 'launcher' });
  pad.kinematic = true; pad.fixed = true; pad.mat = 1; pad.glow = 0.25;
  objects.world.add(pad);
  launcher.pad = pad;
  launcher.site = vec4.scale(s.p, PLANET_R + s.h + 0.15);
  const T = tangents(s.p);
  // the aim: a post 3.2 m from the pad's centre (along +T[0]), the barrel on a ball at its top; and the sliders'
  // stand beside it, toward the pad (gimbal.js). Each stands on its own ground (the summit falls away).
  const R = squareOn(s.p), fs = vec4.dot(R4.apply(R, [1, 0, 0, 0]), T[0]) > 0 ? 1 : -1;
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
// Each step: the barrel follows the sliders; are you standing on the pad (your feet on its top face, within its square)?
export function updateLauncher(p) {
  if (!launcher.pad) return;
  if (launcher.aim) aimFromKnobs();
  const d = vec4.sub(p.pos, launcher.site), up = vec4.norm(launcher.site);
  const hgt = vec4.dot(d, up), lat = vec4.len(vec4.sub(d, vec4.scale(up, hgt)));
  launcher.onPad = Math.abs(hgt) < 0.4 && lat < 1.2;
  launcher.pad.glow = launcher.onPad ? 0.5 : 0.25;              // (it wakes as you step on)
}
// Jumping on the pad launches you along the barrel.
export function tryLaunch(p, cam, jump) {
  if (!jump || !launcher.onPad || !(launcher.speed > 0) || G.simT - (launcher.last || -9) < 1.5) return false;
  launcher.last = G.simT;
  const u = p.up(), dir = launcher.aim ? launcher.aim.dir : vec4.dot(cam.F, u) > 0.05 ? cam.F : u;
  p.vel = vec4.scale(dir, Math.min(SPEED_MAX, launcher.speed));
  p.pos = vec4.add(p.pos, vec4.scale(u, 0.3));
  p.grounded = false; p.airborneUntil = G.simT + 0.5;          // no footing for a moment: you are flying
  G.audio?.emit('launch', p.pos, 1.2);
  G.flags.launches = (G.flags.launches || 0) + 1;
  return true;
}
launcher.setAim = setAim; launcher.aimAt = aimAt;     // (for the scripted playthroughs)
