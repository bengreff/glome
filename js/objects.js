// Objects you can pick up, carry, throw and stack: 4D balls ("glomes") and tesseracts in two sizes, impulse
// stones, and lanterns. Their physics is in bodies.js; this module is the game side: what exists, what you hold,
// the pouch, and what goes to the GPU.
//
// Holding: one object at a time, and it stays a physical body. Each step a drive of limited strength pulls it toward
// a point in front of your eyes and turns it toward a fixed attitude to your body, so it turns as you turn (hold a
// handed object, twist through ana, set it down, turn back, and it is its own mirror image). It knocks into things,
// stops at the ground, swings when you turn fast and sags if it is heavy, and you feel every impulse the drive
// gives it (momentum is conserved). If it snags, a metre from your hands for a moment, you let go.
// F: pick up / drop. Hold F: a ghost shows where the object will come to rest; release to set it down there.
// Mouse: hold to charge a throw, release to throw. G: put the impulse stone you hold in the pouch (it holds nine), or
// with empty hands, draw one out.
// Throwing conserves momentum exactly: you recoil by m_object·v / (m_you + m_object).
import { G } from './game.js';
import { LAWS } from './laws.js';
import { vec4 } from './player.js';
import { PLANET_R } from './world.js';
import { World, makeBody, DENSITY, applyImpulse, kEff } from './bodies.js';
import { rot as R4, log as rotLog, qnorm, bivApply } from './so4.js';
import { tangents } from './env.js';
import { hoopAxisBody } from './cosmos.js';

export const MAXO = 16, MAXL = 4;
// What the shader draws: the nearest objects, the ones your slice cuts first.
export const gpuObj = { C: new Float32Array(MAXO * 4), M: new Float32Array(MAXO * 16), P: new Float32Array(MAXO * 4), E: new Float32Array(MAXO * 4), n: 0, cut: 0,
                        LP: new Float32Array(MAXL * 4), LC: new Float32Array(MAXL * 4), ln: 0, ghost: -1 };

// The kinds of object. Densities are 4D (kg per m⁴); stone sinks in water (1000), wood floats.
export const KINDS = {
  glomeS: { shape: 'glome', size: 0.18, density: DENSITY.stone, mat: 0 },
  glomeL: { shape: 'glome', size: 0.32, density: DENSITY.stone, mat: 0 },
  tessS: { shape: 'tesseract', size: 0.3, density: DENSITY.stone, mat: 0 },
  tessL: { shape: 'tesseract', size: 0.5, density: DENSITY.stone, mat: 1 },
  stone: { shape: 'glome', size: 0.09, mass: 2.5, mat: 2, glow: 0.35 },          // an impulse stone
  lantern: { shape: 'glome', size: 0.12, mass: 3, mat: 7, glow: 0.9, light: [1.9, 1.35, 0.75] },   // warm glass, glowing its light's colour
  raft: { shape: 'tesseract', size: 1.3, density: 60, mat: 6 },                  // a hollow crate of planks (171 kg): a uniform cube floats flat
                                                                                   // only below about a fifth of water's density
  sail: { shape: 'tesseract', size: 0.4, density: DENSITY.wood, mat: 2, glow: 0.2 }, // set on a raft, it catches the wind
  crab: { shape: 'glome', size: 0.21, mass: 4, mat: 7 },                          // a small crab you took: its shell (creatures.js draws it)
};
export const STONE_SPEED = 80;     // an impulse stone always leaves your hand at 80 m/s (relative to you)
export const POUCH_MAX = 9;        // the pouch holds nine
const THROW_MAX = 260, THROW_VMAX = 14;   // a full charge is a 260 N·s impulse, at most 14 m/s

export const objects = { world: null, worldB: null, toA: null, held: null, pouch: 0, charge: -1, fDown: -1, ghost: null, ghostT: 0, discovered: new Set() };
// Two worlds of bodies: A's, in A's spinning frame (objects.world), and B's, in B's own frame (objects.worldB, made by
// console.js with B's crystal ground and gravity; objects.toA draws its bodies in A's frame). A body lives in the
// world of the planet it is on; what you hold, in the world of the planet you stand on (it moves across with you).
export const worldOf = b => b.inB ? objects.worldB : objects.world;
export const hereWorld = () => G.player.onB != null && objects.worldB ? objects.worldB : objects.world;

// ---------- the world of bodies ----------
export function initObjects(accel, env, water) {
  const w = objects.world = new World({ accel, env, dt: 1 / 120, iterations: 14 });
  w.water = water;
  return w;
}
// A rotation that sets a body square on the ground at unit n: its last axis along the local up.
const det = (m) => { let d = 0; for (let j = 0; j < 4; j++) { const minor = [1, 2, 3].map(i => m[i].filter((_, k) => k !== j)); const [a, b, c] = minor; d += (j % 2 ? -1 : 1) * m[0][j] * (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])); } return d; };
function groundFrame(n) {
  const T = tangents(n), rows = [0, 1, 2, 3].map(r => [T[0][r], T[1][r], T[2][r], n[r]]);
  if (det(rows) < 0) rows.forEach(r => { r[0] = -r[0]; });
  return R4.fromMatrix(rows);
}
// The body of a kind.
export function bodyOf(kind, pos, rot, extra) {
  const K = KINDS[kind];
  return makeBody({ shape: K.shape, size: K.size, density: K.density, mass: K.mass, pos, rot: rot || undefined, kind, ...extra });
}
export function spawn(kind, n, { lift = 0, rot = null, extra = {} } = {}) {
  const K = KINDS[kind], p = G.player, h = p.hf.heightAt(n);
  rot = rot || groundFrame(n);
  const r = K.shape === 'tesseract' ? K.size / 2 : K.size;
  const body = bodyOf(kind, vec4.scale(n, PLANET_R + h + r + 0.02 + lift), rot, extra);
  body.mat = K.mat; body.glow = K.glow || 0; body.light = K.light || null;
  objects.world.add(body);
  return body;
}
// The first objects: a loose cairn a few steps from where you arrive, and a few impulse stones and a lantern
// further off (more are found in caches, and grow on the monuments' pedestals: nooks.js).
export function placeStart(rand) {
  const p = G.player, home = p.up(), T = tangents(home);
  const at = (a, b, c, m) => vec4.norm(vec4.add(vec4.scale(home, Math.cos(m / PLANET_R)), vec4.scale(vec4.norm([0, 1, 2, 3].map(i => a * T[0][i] + b * T[1][i] + c * T[2][i])), Math.sin(m / PLANET_R))));
  const ahead = (side, ana, m) => vec4.norm(vec4.add(vec4.scale(home, Math.cos(m / PLANET_R)), vec4.scale(vec4.norm(vec4.add(vec4.add(p.F, vec4.scale(p.R, side)), vec4.scale(p.A, ana))), Math.sin(m / PLANET_R))));
  spawn('tessL', ahead(-0.42, 0, 5.8));                  // (on the left: the radar covers the lower right)
  spawn('tessS', ahead(-0.2, 0, 4.4));
  spawn('tessS', ahead(-0.65, 0.06, 7.2));
  spawn('glomeS', ahead(0.3, 0, 4.2));
  spawn('glomeL', ahead(0.5, 0, 6.3));
  spawn('glomeS', ahead(0.2, 0.35, 5.5));                 // just off your slice: turn toward ana to find it
  spawn('lantern', ahead(0.05, -0.05, 3.2));
  for (let i = 0; i < 3; i++) spawn('stone', at(rand() - 0.5, rand() - 0.5, rand() - 0.5, 9 + 14 * rand()));
}

// ---------- each step ----------
// Bodies far from you are frozen (they would only be resting anyway); the held one is driven toward your hands.
// cam and kick (which gives you the drive's reaction) are in this world's frame. B's world runs while you are on B.
export function stepObjects(cam, kick, w = objects.world, far = 150, gone = 1500) {
  if (!w) return;
  const eye = cam.eye, h = objects.held && worldOf(objects.held) === w ? objects.held : null;
  const hoop = w === objects.world ? hoopAxisBody(G.state.time) : null, L = LAWS.L;
  for (const b of w.bodies) {
    if (b.fixed) continue;
    // thrown past halfway round the hoop: it is nearer A's other side, so it lives by that copy (accelBodyA)
    if (hoop && !b.sleeping) { const wb = vec4.dot(b.pos, hoop); if (Math.abs(wb) > L / 2) { const s = L * Math.round(wb / L); b.pos = vec4.sub(b.pos, vec4.scale(hoop, s)); b.prevPos = b.pos.slice(); } }
    if (!b.sleeping && !b.held && vec4.len(vec4.sub(b.pos, eye)) > far) { b.sleeping = true; b.vel = [0, 0, 0, 0]; b.omega = [0, 0, 0, 0, 0, 0]; }
    if (vec4.len(b.pos) > gone && !b.held) w.remove(b);        // flown off into space: gone
  }
  if (h) holdDrive(h, cam, w, kick);
  w.step();
  if (h && !h.mounted) holdRecord(h, cam);
  soundImpacts(w);
}
// What a body sounds like when it strikes something: a glome rings (its overtones a 3-sphere's, audio.js), metal
// pings, wood knocks, a stone block clacks; louder for a faster strike and a heavier body.
function soundImpacts(w) {
  if (!G.audio || !w.impacts) return;
  const where = w === objects.worldB && objects.toA ? q => objects.toA(q, R4.identity()).pos : q => q;
  // into the water: a splash, as a body first gets wet coming down
  for (const b of w.bodies) {
    if (b.wet > 0 && !(b.wasWet > 0) && !b.held) {
      const vd = -vec4.dot(b.vel, vec4.norm(b.pos));
      if (vd > 1.2) G.audio.emit('splash', where(b.pos), Math.min(1.3, vd / 5) * Math.max(0.4, Math.min(1.2, 0.4 + 0.25 * Math.log10(b.m))));
    }
    b.wasWet = b.wet;
  }
  for (const im of w.impacts) for (const b of [im.a, im.b]) {
    if (!b || b.fixed || b.ghostly || G.simT - (b.soundT ?? -9) < 0.08) continue;
    b.soundT = G.simT;
    const gain = Math.min(1.2, im.speed / 5) * Math.max(0.3, Math.min(1.2, 0.4 + 0.25 * Math.log10(b.m)));
    const [kind, opts] = b.shape === 'glome' ? ['ring', { size: b.size, metal: b.mat === 1 || !!b.light }] : b.mat === 1 ? ['ping', { size: b.size }]
      : b.mat === 6 ? ['knock', { size: b.size }] : ['block', { size: b.size }];
    G.audio.emit(kind, where(im.p), gain, opts);
  }
}
// Landing on B or leaving it: what you hold crosses into the other world (it is brought to your hands next step).
export function moveHeld(toB) {
  const b = objects.held;
  if (!b || !objects.worldB || !!b.inB === toB) return;
  worldOf(b).remove(b);
  b.inB = toB;
  worldOf(b).add(b);
  hold.last = null; hold.rel = hold.relPrev = null;
}
// The camera's frame as a rotation: columns forward, right, ana, up (with ana reversed if that set is left-handed,
// which is fixed for a whole game, so that it is a proper rotation).
export function camRot(c) {
  const M = [0, 1, 2, 3].map(r => [c.F[r], c.R[r], c.A[r], c.U[r]]);
  if (det(M) < 0) for (const r of M) r[2] = -r[2];
  return R4.fromMatrix(M);
}
export const HOLD_F = 4200, HOLD_T = 400;        // the drive's strength: newtons (lifting about 265 kg at sea level), newton-metres
const HOLD_TAU = 0.04, HOLD_TAU_R = 0.05;        // how fast it closes a gap, in position and in attitude (s)
const HINGED_V = 2.0;                            // the fastest your hand moves a thing on a hinge (m/s)
const STEP_UP = 0.26;                            // the highest edge you step up onto as you walk (m)
export const hold = { last: null, snag: 0, snapped: false, rel: null, relPrev: null };
// Your body's frame (the camera's without the head's tilt: forward level, right, ana, up), as a proper rotation.
// What you hold keeps its attitude in this frame: it turns as you turn and twist through ana, and stays level when
// you only look up or down, so things go down square.
function bodyRot(c) {
  const f = vec4.norm(vec4.sub(c.F, vec4.scale(c.up, vec4.dot(c.F, c.up))));
  return camRot({ F: f, R: c.R, A: c.A, U: c.up });
}
// How far a compound body at attitude rot reaches from its centre along unit direction dir.
export function reachAlong(b, rot, dir) {
  const M = R4.toRows(rot), ax = [0, 1, 2, 3].map(j => vec4.dot([M[0][j], M[1][j], M[2][j], M[3][j]], dir));
  let r = 0;
  for (const q of b.parts) {
    const c = q.c[0] * ax[0] + q.c[1] * ax[1] + q.c[2] * ax[2] + q.c[3] * ax[3];
    const e = q.shape === 'glome' ? q.r : q.shape === 'cap' ? q.r + q.h * Math.abs(ax[3]) : q.e[0] * Math.abs(ax[0]) + q.e[1] * Math.abs(ax[1]) + q.e[2] * Math.abs(ax[2]) + q.e[3] * Math.abs(ax[3]);
    r = Math.max(r, c + e);
  }
  return r;
}
function handTarget(b, cam) {
  const C = bodyRot(cam);
  if (!b.holdRel || !b.holdRel.l) b.holdRel = R4.compose(R4.inverse(C), b.rot);   // (a save from before keeps the attitude it has)
  // in front of you, a bigger thing lower down (carried at the chest, not held up before your eyes); a compound one
  // (a ring) by how far it really reaches along your gaze and how deep it is, so a wide flat ring is carried level
  // before you, not far out and low where its edge would dig into a slope
  const rot = R4.compose(C, b.holdRel);
  const out = b.parts ? reachAlong(b, rot, cam.F) : b.bound, down = b.parts ? reachAlong(b, rot, cam.up) : b.half;
  return { pos: vec4.add(vec4.add(cam.eye, vec4.scale(cam.F, 0.55 + out)), vec4.scale(cam.up, -(0.22 + 0.9 * down))), rot };
}
// A thing on a hinge (the fold's plates): your hand draws the point you took toward where your hand is, with the
// drive's strength, and the hinge decides how it moves; it doesn't turn it (the hinge does that too).
function hingedDrive(b, cam, w, kick) {
  const dt = w.dt, r = R4.apply(b.rot, hold.point), P = vec4.add(b.pos, r), o = hold.off;
  const T = [cam.F, cam.R, cam.U, cam.A].reduce((q, e, k) => vec4.add(q, vec4.scale(e, o[k])), cam.eye);
  const vT = hold.last ? vec4.scale(vec4.sub(T, hold.last), 1 / dt) : [0, 0, 0, 0]; hold.last = T;
  const err = vec4.sub(T, P), vP = vec4.add(b.vel, bivApply(b.omega, r));
  let want = vec4.add(vT, vec4.scale(err, 1 / HOLD_TAU)); const wl = vec4.len(want);
  if (wl > HINGED_V) want = vec4.scale(want, HINGED_V / wl);           // (hands don't swing a heavy plate faster than this)
  const dv = vec4.sub(want, vP), l = vec4.len(dv);
  if (l > 1e-9) {
    const k = kEff(b, r, vec4.scale(dv, 1 / l));
    let J = vec4.scale(dv, 1 / Math.max(k, 1e-9)); const Jl = vec4.len(J), Jmax = HOLD_F * dt;
    if (Jl > Jmax) J = vec4.scale(J, Jmax / Jl);
    hold.strain = 0.9 * (hold.strain || 0) + 0.1 * Math.min(1, Jl / Jmax);
    applyImpulse(b, J, P); kick(vec4.scale(J, -1 / LAWS.PLAYER_M));
  }
  const gap = vec4.len(err);                                // drawn a metre from your hand and not coming: let go
  hold.snag = gap > 1.0 ? hold.snag + dt : 0;
  if (hold.snag > 0.4) { drop(); G.audio?.emit('clack', P, 0.3); }
}
// A slider's knob: it follows your hand along its rail (at most 1.5 m/s, as a hand slides a heavy knob), and stays
// where you leave it. Drawn a metre from it, your hand lets go.
function sliderDrive(b, cam, w) {
  const S = b.slider, o = hold.off, dt = w.dt;
  const T = [cam.F, cam.R, cam.U, cam.A].reduce((q, e, k) => vec4.add(q, vec4.scale(e, o[k])), cam.eye);
  const want = Math.max(0, Math.min(1, vec4.dot(vec4.sub(T, S.a), S.dir) / S.len)), step = 1.5 * dt / S.len;
  S.x += Math.max(-step, Math.min(step, want - S.x));
  b.pos = vec4.add(S.a, vec4.scale(S.dir, S.x * S.len)); b.vel = [0, 0, 0, 0];
  hold.snag = vec4.len(vec4.sub(T, b.pos)) > 1.0 ? hold.snag + dt : 0;
  if (hold.snag > 0.4) { drop(); G.audio?.emit('clack', b.pos, 0.3); }
}
function holdDrive(b, cam, w, kick) {
  if (b.slider) return sliderDrive(b, cam, w);
  if (b.hinged) { b.sleeping = false; b.sleepT = 0; return hingedDrive(b, cam, w, kick); }
  const T = handTarget(b, cam), L = hold.last, dt = w.dt;
  b.sleeping = false; b.sleepT = 0;
  hold.last = T;
  // a jump (a fade home, a landing on B): the object comes with you, and next step takes your velocity
  if (!L || vec4.len(vec4.sub(T.pos, L.pos)) > 3) { b.pos = T.pos.slice(); b.rot = T.rot; b.omega = [0, 0, 0, 0, 0, 0]; hold.snapped = true; return; }
  const vT = vec4.scale(vec4.sub(T.pos, L.pos), 1 / dt);                       // how your hands are moving
  const wT = rotLog(R4.compose(T.rot, R4.inverse(L.rot))).map(x => x / dt);
  if (hold.snapped) { b.vel = vT; b.omega = wT; hold.snapped = false; return; }
  // the pull: the impulse that would bring it to your hands' velocity plus a share of the gap, after gravity,
  // no more than the drive's strength
  const a = w.accel(b.pos, b.vel), err = vec4.sub(T.pos, b.pos);
  let J = vec4.scale(vec4.sub(vec4.add(vT, vec4.scale(err, 1 / HOLD_TAU)), vec4.add(b.vel, vec4.scale(a, dt))), b.m);
  const Jl = vec4.len(J), Jmax = HOLD_F * dt;
  if (Jl > Jmax) J = vec4.scale(J, Jmax / Jl);
  hold.strain = 0.9 * (hold.strain || 0) + 0.1 * Math.min(1, Jl / Jmax);   // how hard you are working (for the HUD)
  b.vel = vec4.add(b.vel, vec4.scale(J, b.invM));
  kick(vec4.scale(J, -1 / LAWS.PLAYER_M));
  // the turn: toward the attitude it should have in your view
  const e = rotLog(R4.compose(T.rot, R4.inverse(b.rot)));
  let dw = e.map((x, i) => wT[i] + x / HOLD_TAU_R - b.omega[i]);
  const dl = Math.hypot(...dw) * b.I, dmax = HOLD_T * dt;
  if (dl > dmax) dw = dw.map(x => x * dmax / dl);
  b.omega = b.omega.map((x, i) => x + dw[i]);
  // snagged (a metre from your hands and not coming closer): let go
  const gap = vec4.len(err), closing = hold.gap != null && (hold.gap - gap) / dt > 0.5;
  hold.snag = gap > 1.0 && !closing ? hold.snag + dt : gap > 1.0 ? hold.snag : 0;
  hold.gap = gap;
  if (hold.snag > 0.4) { drop(); G.audio?.emit('clack', b.pos, 0.3); }
}
// Turning over what you hold, in your hands (R and the mouse): a gesture turns it in one plane of your body's frame,
// chosen by its first motion: up and down, forward and back (forward and up); left and right, rolling it (right
// and up); with the right button, up and down tips it through ana (ana and up), left and right turns it through ana
// (forward and ana) without turning you. Let go of R and it settles to the nearest quarter turn, as a hand squares a
// thing up. Your hands turn it: the drive brings it round (with its limited torque), and what it meets stops it.
const tilt = { base: null, plane: null, angle: 0, px: 0, py: 0 };
const TILT_PLANES = { pitch: [0, 3], roll: [1, 3], anaTip: [2, 3], anaTurn: [0, 2] };   // (body axes: forward 0, right 1, ana 2, up 3)
export function tiltHeld(dx, dy, alt, sens) {
  const b = objects.held;
  if (!b || b.mounted) return;
  if (!tilt.base) { tilt.base = b.holdRel || null; tilt.plane = null; tilt.angle = 0; tilt.px = tilt.py = 0; }
  if (!tilt.base) return;
  if (!tilt.plane) {                                   // the first 6 px of motion choose the plane
    tilt.px += dx; tilt.py += dy;
    if (Math.hypot(tilt.px, tilt.py) < 6) return;
    const vert = Math.abs(tilt.py) > Math.abs(tilt.px);
    tilt.plane = alt ? (vert ? 'anaTip' : 'anaTurn') : (vert ? 'pitch' : 'roll');
    dx = tilt.px; dy = tilt.py;
  }
  const vert = tilt.plane === 'pitch' || tilt.plane === 'anaTip';
  tilt.angle += (vert ? -dy : dx) * sens;
  const [i, j] = TILT_PLANES[tilt.plane];
  b.holdRel = R4.compose(R4.planeRotation(i, j, tilt.angle), tilt.base);
}
export function endTilt() {
  const b = objects.held;
  if (b && tilt.base && tilt.plane) {
    const q = Math.round(tilt.angle / (Math.PI / 2)) * Math.PI / 2, [i, j] = TILT_PLANES[tilt.plane];
    b.holdRel = R4.compose(R4.planeRotation(i, j, q), tilt.base);
  }
  tilt.base = null; tilt.plane = null;
}
// Where it is in your view after the step (for drawing it between steps, against your latest turn).
function holdRecord(b, cam) {
  const C = camRot(cam);
  hold.relPrev = hold.rel;
  hold.rel = { p: R4.applyInv(C, vec4.sub(b.pos, cam.eye)), R: R4.compose(R4.inverse(C), b.rot) };
}
// After a teleport of yours: what you hold comes too.
export function carryHeld(cam) {
  const b = objects.held;
  if (!b) return;
  if (b.mounted) { drop(); return; }              // (a thing on a hinge or a rail stays on it)
  const T = handTarget(b, cam);
  b.pos = T.pos.slice(); b.rot = T.rot; b.omega = [0, 0, 0, 0, 0, 0];
  hold.last = T; hold.snapped = true; hold.rel = hold.relPrev = null;
}

// ---------- picking up, dropping, throwing ----------
// The object under your gaze, within reach (a ray from the eye; a near miss of 0.3 m also counts).
// Not what you stand on (picking up the raft under your feet would pull you after it).
export function lookedAt(cam, reach = 3.2, w = hereWorld()) {
  const hit = w.raycast(cam.eye, cam.F, reach, objects.held);
  if (hit && !hit.body.fixed && !hit.body.noTake && hit.body !== G.player.ride) { objects.lookPoint = vec4.add(cam.eye, vec4.scale(cam.F, hit.t)); return hit.body; }
  // nothing to take where the ray strikes: the nearest thing it passes close by, short of anything fixed it meets (a
  // ring looked at through its hole, at the wall behind)
  const lim = hit ? hit.t : reach;
  let best = null, bd = 0.3;
  for (const b of w.bodies) {
    if (b === objects.held || b.fixed || b.noTake || b === G.player.ride) continue;
    const e0 = b.pos[0] - cam.eye[0], e1 = b.pos[1] - cam.eye[1], e2 = b.pos[2] - cam.eye[2], e3 = b.pos[3] - cam.eye[3], m = reach + b.bound + 0.3;
    if (e0 * e0 + e1 * e1 + e2 * e2 + e3 * e3 > m * m) continue;
    const d = vec4.sub(b.pos, cam.eye), t = vec4.dot(d, cam.F);
    if (t < 0 || t > lim) continue;
    const miss = vec4.len(vec4.sub(d, vec4.scale(cam.F, t))) - b.bound;
    if (miss < bd) { bd = miss; best = b; objects.lookPoint = vec4.add(cam.eye, vec4.scale(cam.F, t)); }
  }
  return best;
}
export function pickUp(b, cam) {
  takeHold(b, cam);
  G.audio?.emit('clack', b.pos, 0.4);
}
function takeHold(b, cam) {
  objects.held = b; b.held = true; b.kinematic = !!b.slider; b.sleeping = false; b.sleepT = 0;   // (a slider's knob stays on its rail)
  b.holdRel = R4.compose(R4.inverse(bodyRot(cam)), b.rot);  // its attitude to your body, kept while you hold it
  hold.snag = 0; hold.gap = null; hold.snapped = false; hold.rel = hold.relPrev = null;
  if (b.mounted) {                                 // a thing on a hinge or a rail: held by the point you took, where you took it
    const P = objects.lookPoint || b.pos, d = vec4.sub(P, cam.eye);
    hold.point = R4.applyInv(b.rot, vec4.sub(P, b.pos)); hold.off = [cam.F, cam.R, cam.U, cam.A].map(e => vec4.dot(d, e));
    hold.last = null; return;
  }
  hold.last = handTarget(b, cam);
}
function release(b, vel) {
  b.held = false; b.kinematic = !!b.slider; b.sleeping = false; b.sleepT = 0;
  if (vel && !b.slider) b.vel = vel.slice();
  objects.held = null; hold.last = null; hold.rel = hold.relPrev = null;
}
export function drop() {                          // let go: it keeps the motion it has
  const b = objects.held;
  if (b) release(b, null);
}
// Throw what you hold along your line of sight. charge 0..1. Momentum is conserved between you and the object.
export function throwHeld(cam, charge, kickPlayer) {
  const b = objects.held;
  if (!b) return null;
  if (b.mounted) { drop(); return null; }
  const mp = LAWS.PLAYER_M, mo = b.m;
  const u = b.kind === 'stone' ? STONE_SPEED : Math.min(THROW_VMAX, (0.15 + 0.85 * charge) * THROW_MAX / mo);   // speed relative to you
  const dir = cam.F;
  release(b, vec4.add(b.vel, vec4.scale(dir, u * mp / (mp + mo))));             // on top of the motion it has
  const dv = vec4.scale(dir, -u * mo / (mp + mo));
  kickPlayer(dv);
  G.audio?.emit(b.kind === 'stone' ? 'launch' : 'throw', b.pos, b.kind === 'stone' ? 0.5 : 0.6);
  return { body: b, dv, u };
}
// G: the stone in your hand goes into the pouch (if it has room); with empty hands, one comes out.
export function pouchKey(cam) {
  const b = objects.held;
  if (!b) return drawStone(cam);
  if (b.kind !== 'stone' || objects.pouch >= POUCH_MAX) return false;
  release(b, null); b.pouched = true; worldOf(b).remove(b); objects.pouch++;
  G.audio?.emit('clack', b.pos, 0.6);
  return true;
}
export function drawStone(cam) {
  if (objects.held || objects.pouch <= 0) return false;
  objects.pouch--;
  const b = spawnAt('stone', vec4.add(cam.eye, vec4.scale(cam.F, 0.7)), G.player.onB != null);
  b.vel = G.player.vel.slice();
  takeHold(b, cam);                               // into the hand (not the pouch)
  return true;
}
export function spawnAt(kind, pos, inB = false, tier = null) {
  const K = KINDS[kind];
  const body = bodyOf(kind, pos, null, tier ? { tier } : {});
  body.mat = K.mat; body.glow = K.glow || 0; body.light = K.light || null; body.inB = inB;
  worldOf(body).add(body);
  return body;
}

// Where the held object would come to rest if you let it go here: simulate a copy of the nearby world forward.
export function computeGhost(cam) {
  const b = objects.held;
  if (!b || b.mounted) { objects.ghost = null; return; }
  const w = worldOf(b).clone();
  w.bodies = w.bodies.filter(o => vec4.len(vec4.sub(o.pos, b.pos)) < 12);
  const g = w.bodies.find(o => o.id === b.id);
  if (!g) return;
  g.held = false; g.kinematic = false; g.sleeping = false; g.vel = [0, 0, 0, 0]; g.omega = [0, 0, 0, 0, 0, 0];
  for (const o of w.bodies) if (o !== g) o.sleeping = true;          // the others stay put while we look ahead
  for (let i = 0; i < 480 && !g.sleeping; i++) w.step();
  objects.ghost = { pos: g.pos, rot: g.rot, shape: b.shape, half: b.half, shapes: drawShapes(b), inB: !!b.inB };
}
export function setDown() {
  const b = objects.held, gh = objects.ghost;
  if (!b) return;
  if (gh) { b.pos = gh.pos.slice(); b.rot = gh.rot; }
  release(b, [0, 0, 0, 0]);
  b.sleeping = true;                                                   // gently: it is already at rest
  objects.ghost = null;
  G.audio?.emit('clack', b.pos, 0.3);
}

// ---------- the player among the objects ----------
// The capsule stands on objects and is stopped by them; walking into one pushes it (momentum exchanged with you,
// treated as a body of your mass).
export function playerContacts(p, w = hereWorld(), input = null) {
  if (!w) return;
  const cap = p.capsule(), up = p.up(), cs = w.capsuleContacts(cap.a, cap.b, cap.r);
  const standing = p.grounded || cs.some(c => vec4.dot(c.n, up) > 0.6);
  for (const c of cs) {
    const B = c.body, cu = vec4.dot(c.n, up);
    // footing (a surface within about 53° of level) holds you as friction would: its support is straight up, and
    // you move with the point under your feet (a push along a tilted top, a raft leaning under you, would slide you off)
    const foot = cu > 0.6, dir = foot ? up : c.n;
    // a step: an edge met low at your feet (under 26 cm) while you walk on level footing into it lifts you onto it,
    // as your legs would (a stair, a platform's step, a sill)
    const rise = vec4.dot(vec4.sub(c.point, p.pos), up);
    if (!foot && standing && rise > 0.01 && rise < STEP_UP && cu > -0.2 && vec4.dot(p.vel, c.n) < -0.05) {
      p.pos = vec4.add(p.pos, vec4.scale(up, rise + 0.015)); p.supported = true; continue;
    }
    p.pos = vec4.add(p.pos, vec4.scale(dir, Math.min(foot ? c.depth / cu : c.depth, 0.2)));
    // scramble up the side of something big (a large block, the raft, the built blocks), as up a boulder: holding
    // jump while walking into it, along the steepest way up its face (pressing on it a little, to stay against it)
    if (input && input.jump && cu < 0.6 && cu > -0.3 && (input.fwd || input.right || input.ana) && (B.size >= 0.45 || B.fixed)) {
      const climb = vec4.sub(up, vec4.scale(c.n, cu)), cl = vec4.len(climb);
      if (cl > 1e-3) { p.vel = vec4.add(vec4.add(vec4.scale(climb, LAWS.CLIMB / cl), vec4.scale(c.n, -0.15)), vec4.scale(B.vel, 1)); p.climbUntil = G.simT + 0.35; continue; }
    }
    const vb = B.kinematic ? B.vel : vec4.add(B.vel, bivApply(B.omega, vec4.sub(c.point, B.pos)));
    if (foot) { p.supported = true; p.ride = B; p.rideVel = vb; }            // standing on it: you move with it
    const vrel = vec4.dot(vec4.sub(p.vel, vb), dir);
    if (vrel >= 0) continue;
    if (B.kinematic) { p.vel = vec4.sub(p.vel, vec4.scale(dir, vrel)); continue; }
    // an inelastic push between you (mass m_p) and the body at the contact point
    const r = vec4.sub(c.point, B.pos), K = 1 / LAWS.PLAYER_M + kEff(B, r, dir);
    const lam = -vrel / K;
    p.vel = vec4.add(p.vel, vec4.scale(dir, lam / LAWS.PLAYER_M));
    applyImpulse(B, vec4.scale(dir, -lam), c.point);
    B.sleeping = false; B.sleepT = 0;
  }
}

// ---------- to the GPU ----------
// Where to draw a body this frame: between its last two steps (alpha); what you hold, where it sits in your view
// now, so it turns exactly with you however the frames and steps fall.
const lerp4 = (a, b, t) => [0, 1, 2, 3].map(i => a[i] + (b[i] - a[i]) * t);
function lerpRot(A, B, t) {
  const s = A.l[0] * B.l[0] + A.l[1] * B.l[1] + A.l[2] * B.l[2] + A.l[3] * B.l[3] < 0 ? -1 : 1;   // (l, r) and (−l, −r) are one rotation
  return { l: qnorm(A.l.map((x, i) => s * x * (1 - t) + B.l[i] * t)), r: qnorm(A.r.map((x, i) => s * x * (1 - t) + B.r[i] * t)) };
}
function drawPose(b, cam, alpha) {
  if (b.held && hold.rel && !b.mounted) {
    const C = camRot(cam), r0 = hold.relPrev || hold.rel, r1 = hold.rel;
    return { pos: vec4.add(cam.eye, R4.apply(C, lerp4(r0.p, r1.p, alpha))), rot: R4.compose(C, lerpRot(r0.R, r1.R, alpha)) };
  }
  if (alpha < 1 && !b.sleeping && b.prevPos && vec4.len(vec4.sub(b.pos, b.prevPos)) < 1) return { pos: lerp4(b.prevPos, b.pos, alpha), rot: lerpRot(b.prevRot, b.rot, alpha) };   // (asleep: still, and not stepped)
  return b;
}
// What a body is drawn as: one or more shapes in its own frame. A ball (code 0, radius), a box (1, half-extents),
// a duocylinder (2) or a frame (3: a box with a square hole through it along its fourth axis, the hole's half-width
// in place of the radius). A compound body draws its own list (a ring is one frame) or else its parts.
const SHAPE_CODE = { glome: 0, tesseract: 1, box: 1, duo: 2, frame: 3 };
function drawShapes(b) {
  if (b.shape !== 'compound') return null;
  return b.draws || (b.draws = (b.draw || b.parts.map(q => q.shape === 'glome' ? { shape: 'glome', c: q.c, r: q.r } : { shape: 'box', c: q.c, e: q.e }))
    .map(q => ({ ...q, c: [0, 1, 2, 3].map(i => q.c[i] - (b.draw ? b.com[i] : 0)) })));   // (a drawing given about the parts' origin: moved to the centre)
}
export function uploadObjects(cam, alpha = 1) {
  const w = objects.world;
  gpuObj.n = 0; gpuObj.cut = 0; gpuObj.ln = 0; gpuObj.ghost = -1;
  if (!w) return;
  const list = [];
  // its support along ana (does your slice cut it?)
  const support = (rot, e) => { const M = R4.toRows(rot); let r = 0; for (let j = 0; j < 4; j++) r += e[j] * Math.abs(M[0][j] * cam.A[0] + M[1][j] * cam.A[1] + M[2][j] * cam.A[2] + M[3][j] * cam.A[3]); return r; };
  for (const b of w.bodies) {
    if (b.kind === 'crab') continue;                       // (a crab in hand is drawn as a crab: creatures.js)
    if (b.hidden) continue;                                  // (drawn otherwise: the pillar, as props)
    const d = vec4.len(vec4.sub(b.pos, cam.eye));
    if (d > 120) continue;
    const pose = drawPose(b, cam, alpha), shapes = drawShapes(b);
    if (shapes) {
      for (const q of shapes) {
        const pos = vec4.add(pose.pos, R4.apply(pose.rot, q.c)), e = q.shape === 'glome' ? [q.r, q.r, q.r, q.r] : q.e;
        const a = Math.abs(vec4.dot(vec4.sub(pos, cam.eye), cam.A));
        list.push({ b, d, cut: a < (q.shape === 'glome' ? q.r : support(pose.rot, e)), pose: { pos, rot: pose.rot }, code: SHAPE_CODE[q.shape], h: q.shape === 'glome' ? q.r : q.shape === 'frame' ? q.a : Math.max(...e), e });
      }
      continue;
    }
    // does your slice cut it? (its centre's distance from the slice against its support along the ana axis)
    const a = Math.abs(vec4.dot(vec4.sub(b.pos, cam.eye), cam.A));
    const reach = b.shape === 'tesseract' ? support(b.rot, [b.half, b.half, b.half, b.half]) : b.size;
    list.push({ b, d, cut: a < reach, pose });
  }
  for (const it of G.creatureItems || []) {                  // the creatures near you (creatures.js)
    const a = Math.abs(vec4.dot(vec4.sub(it.pos, cam.eye), cam.A));
    list.push({ b: it, d: it.d, cut: a < (it.shape === 'tesseract' ? it.half * 2 : it.size * 1.42) });
  }
  if (objects.ghost) {
    const g = objects.ghost, q = g.inB && objects.toA ? objects.toA(g.pos, g.rot) : g;
    const sh = g.shapes && g.shapes[0];                      // (a compound's ghost: its first shape)
    if (sh) list.push({ b: { mat: 3, glow: 0.4, ghost: true }, d: 0, cut: true, pose: { pos: vec4.add(q.pos, R4.apply(q.rot, sh.c)), rot: q.rot }, code: SHAPE_CODE[sh.shape], h: sh.shape === 'frame' ? sh.a : sh.shape === 'glome' ? sh.r : Math.max(...sh.e), e: sh.e || [sh.r, sh.r, sh.r, sh.r] });
    else list.push({ b: { pos: q.pos, rot: q.rot, shape: g.shape, half: g.half, size: g.half, mat: 3, glow: 0.4, ghost: true }, d: 0, cut: true });
  }
  list.sort((x, y) => (y.cut - x.cut) || (x.d - y.d));
  const shown = list.slice(0, MAXO);
  shown.forEach(({ b, cut, pose, code, h, e }, i) => {
    gpuObj.C.set((pose || b).pos, 4 * i);
    gpuObj.M.set(R4.toMatrix((pose || b).rot), 16 * i);
    if (code != null) { gpuObj.P.set([code, h, b.mat || 0, b.glow || 0], 4 * i); gpuObj.E.set(e, 4 * i); }
    else {
      gpuObj.P.set([b.shape === 'tesseract' ? 1 : b.shape === 'duo' ? 2 : 0, b.shape === 'tesseract' ? b.half : b.size, b.mat || 0, b.glow || 0], 4 * i);
      const hh = b.shape === 'tesseract' ? b.half : b.size; gpuObj.E.set([hh, hh, hh, hh], 4 * i);
    }
    if (cut) gpuObj.cut = i + 1;
    if (b.ghost) gpuObj.ghost = i;
  });
  gpuObj.n = shown.length;
  // lanterns: the nearest few light the world (held ones too)
  const lamps = w.bodies.filter(b => b.light).map(b => ({ pos: drawPose(b, cam, alpha).pos, light: b.light }))
    .concat((G.creatureItems || []).filter(it => it.light))          // (lanterns on B come with B's things)
    .map(l => ({ ...l, d: vec4.len(vec4.sub(l.pos, cam.eye)) })).sort((x, y) => x.d - y.d).slice(0, MAXL);
  lamps.forEach((l, i) => { gpuObj.LP.set(l.pos, 4 * i); gpuObj.LC.set([...l.light, 0], 4 * i); });
  gpuObj.ln = lamps.length;
}

// ---------- saving ----------
// The things found about the planet (finds.js) are numbered (gen) and rebuilt with the world, so a save holds only
// those you have moved (and which are gone), with everything else.
export const objectsSave = {
  save() {
    const r5 = v => Math.round(v * 1e5) / 1e5;
    let all = objects.world.bodies.concat(objects.worldB ? objects.worldB.bodies : []);
    const moved = b => b.gen == null || b.held || b.inB || !b.spawnPos || vec4.len(vec4.sub(b.pos, b.spawnPos)) > 0.02;
    all = all.filter(b => b.nook == null);           // (a stone on a monument's pedestal belongs to the monument: nooks.js)
    const present = new Set(all.filter(b => b.gen != null).map(b => b.gen)), gone = [];
    for (let k = 0; k < (G.genCount || 0); k++) if (!present.has(k)) gone.push(k);
    return {
      pouch: objects.pouch,
      held: objects.held ? objects.held.id : null,
      gone, gens: G.genCount || 0,
      bodies: all.filter(b => !b.fixed && !b.keep && moved(b)).map(b => ({ id: b.id, gen: b.gen ?? null, kind: b.kind, tier: b.tier, pos: b.pos.slice(), vel: b.vel.map(r5), rot: { l: b.rot.l.map(r5), r: b.rot.r.map(r5) }, omega: b.omega.map(r5), sleeping: b.sleeping, holdRel: b.holdRel || null, tag: b.tag || null, inB: !!b.inB })),
    };
  },
  load(s) {
    const w = objects.world;
    // fixed things (the launcher) are rebuilt, not saved; the found things stay as the world made them unless saved
    const gens = new Map(w.bodies.filter(b => b.gen != null).map(b => [b.gen, b]));
    w.bodies = w.bodies.filter(b => b.nook == null && (b.fixed || b.keep || (b.gen != null && s.gens === G.genCount)));   // (keep: built with the world, saved by its own part: the knot gate's leaf)
    if (objects.worldB) objects.worldB.bodies = objects.worldB.bodies.filter(b => b.fixed);
    if (s.gens === G.genCount) for (const k of s.gone || []) { const b = gens.get(k); if (b) w.remove(b); }
    else for (const b of gens.values()) w.add(b), b.sleeping = true;   // (a save from before they existed: keep them all)
    objects.held = null;
    objects.pouch = Math.min(POUCH_MAX, s.pouch || 0);
    for (const o of s.bodies) {
      if (!KINDS[o.kind]) continue;
      // a found thing from a world whose finds were made differently: theirs stand in its place (unless in your hand)
      if (o.gen != null && s.gens !== G.genCount && o.id !== s.held) continue;
      let b = o.gen != null && s.gens === G.genCount ? gens.get(o.gen) : null;
      if (b && (!!o.inB && !!objects.worldB)) { w.remove(b); b = null; }
      if (b) { b.pos = o.pos.slice(); b.prevPos = b.pos.slice(); }
      else { b = spawnAt(o.kind, o.pos, !!o.inB && !!objects.worldB, o.tier); if (o.gen != null && s.gens === G.genCount) b.gen = o.gen; }
      b.vel = o.vel; b.rot = o.rot; b.omega = o.omega; b.sleeping = o.sleeping; b.tag = o.tag; b.tier = o.tier;
      if (o.id === s.held) { objects.held = b; b.held = true; b.holdRel = o.holdRel && o.holdRel.l ? o.holdRel : null; hold.last = null; }
    }
  },
};
