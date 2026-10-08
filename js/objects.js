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
// Mouse: hold to charge a throw, release to throw. G: draw an impulse stone from the pouch.
// Throwing conserves momentum exactly: you recoil by m_object·v / (m_you + m_object).
import { G } from './game.js';
import { LAWS } from './laws.js';
import { vec4 } from './player.js';
import { PLANET_R } from './world.js';
import { World, makeBody, DENSITY, applyImpulse } from './bodies.js';
import { rot as R4, log as rotLog, qnorm, bivApply } from './so4.js';
import { tangents } from './env.js';

export const MAXO = 16, MAXL = 4;
// What the shader draws: the nearest objects, the ones your slice cuts first.
export const gpuObj = { C: new Float32Array(MAXO * 4), M: new Float32Array(MAXO * 16), P: new Float32Array(MAXO * 4), n: 0, cut: 0,
                        LP: new Float32Array(MAXL * 4), LC: new Float32Array(MAXL * 4), ln: 0, ghost: -1 };

// The kinds of object. Densities are 4D (kg per m⁴); stone sinks in water (1000), wood floats.
export const KINDS = {
  glomeS: { shape: 'glome', size: 0.18, density: DENSITY.stone, mat: 0 },
  glomeL: { shape: 'glome', size: 0.32, density: DENSITY.stone, mat: 0 },
  tessS: { shape: 'tesseract', size: 0.3, density: DENSITY.stone, mat: 0 },
  tessL: { shape: 'tesseract', size: 0.5, density: DENSITY.stone, mat: 1 },
  stone: { shape: 'glome', size: 0.09, mass: 2.5, mat: 2, glow: 0.35 },          // an impulse stone
  lantern: { shape: 'glome', size: 0.12, mass: 3, mat: 1, glow: 0.9, light: [1.9, 1.35, 0.75] },
  part: { shape: 'tesseract', size: 0.26, mass: 14, mat: 2, glow: 0.25 },          // a launcher part (tiers I–IV): it doesn't roll
  raft: { shape: 'tesseract', size: 1.3, density: 60, mat: 6 },                  // a hollow crate of planks (171 kg): a uniform cube floats flat
                                                                                   // only below about a fifth of water's density
  sail: { shape: 'tesseract', size: 0.4, density: DENSITY.wood, mat: 2, glow: 0.2 }, // set on a raft, it catches the wind
  key: { shape: 'tesseract', size: 0.32, density: DENSITY.metal / 4, mat: 4 },     // the mirror key: handed (two marked cells)
};
export const STONE_SPEED = 80;     // an impulse stone always leaves your hand at 80 m/s (relative to you)
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
export function spawn(kind, n, { lift = 0, rot = null, extra = {} } = {}) {
  const K = KINDS[kind], p = G.player, h = p.hf.heightAt(n);
  rot = rot || groundFrame(n);
  const r = K.shape === 'tesseract' ? K.size / 2 : K.size;
  const body = makeBody({ shape: K.shape, size: K.size, density: K.density, mass: K.mass, pos: vec4.scale(n, PLANET_R + h + r + 0.02 + lift), rot, kind, ...extra });
  body.mat = K.mat; body.glow = K.glow || 0; body.light = K.light || null;
  objects.world.add(body);
  return body;
}
// The first objects: a loose cairn a few steps from where you arrive, and a few impulse stones and a lantern
// further off (more are found in the artifacts).
export function placeStart(rand) {
  const p = G.player, home = p.up(), T = tangents(home);
  const at = (a, b, c, m) => vec4.norm(vec4.add(vec4.scale(home, Math.cos(m / PLANET_R)), vec4.scale(vec4.norm([0, 1, 2, 3].map(i => a * T[0][i] + b * T[1][i] + c * T[2][i])), Math.sin(m / PLANET_R))));
  const ahead = (side, ana, m) => vec4.norm(vec4.add(vec4.scale(home, Math.cos(m / PLANET_R)), vec4.scale(vec4.norm(vec4.add(vec4.add(p.F, vec4.scale(p.R, side)), vec4.scale(p.A, ana))), Math.sin(m / PLANET_R))));
  spawn('tessL', ahead(0.75, 0, 6));
  spawn('tessS', ahead(1.1, 0, 4.6));
  spawn('tessS', ahead(0.55, 0.06, 7.5));
  spawn('glomeS', ahead(-0.55, 0, 4.2));
  spawn('glomeL', ahead(-0.95, 0, 6.5));
  spawn('glomeS', ahead(-0.3, 0.35, 5.5));                // just off your slice: turn toward ana to find it
  spawn('lantern', ahead(-0.15, -0.05, 3.2));
  for (let i = 0; i < 3; i++) spawn('stone', at(rand() - 0.5, rand() - 0.5, rand() - 0.5, 9 + 14 * rand()));
}

// ---------- each step ----------
// Bodies far from you are frozen (they would only be resting anyway); the held one is driven toward your hands.
// cam and kick (which gives you the drive's reaction) are in this world's frame. B's world runs while you are on B.
export function stepObjects(cam, kick, w = objects.world, far = 150, gone = 1500) {
  if (!w) return;
  const eye = cam.eye, h = objects.held && worldOf(objects.held) === w ? objects.held : null;
  for (const b of w.bodies) {
    if (b.fixed) continue;
    if (!b.sleeping && !b.held && vec4.len(vec4.sub(b.pos, eye)) > far) { b.sleeping = true; b.vel = [0, 0, 0, 0]; b.omega = [0, 0, 0, 0, 0, 0]; }
    if (vec4.len(b.pos) > gone && !b.held) w.remove(b);        // flown off into space: gone
  }
  if (h) holdDrive(h, cam, w, kick);
  w.step();
  if (h) holdRecord(h, cam);
  soundImpacts(w);
}
// What a body sounds like when it strikes something: a glome rings (its overtones a 3-sphere's, audio.js), metal
// pings, wood knocks, a stone block clacks; louder for a faster strike and a heavier body.
function soundImpacts(w) {
  if (!G.audio || !w.impacts) return;
  const where = w === objects.worldB && objects.toA ? q => objects.toA(q, R4.identity()).pos : q => q;
  for (const im of w.impacts) for (const b of [im.a, im.b]) {
    if (!b || b.fixed || b.ghostly || G.simT - (b.soundT ?? -9) < 0.08) continue;
    b.soundT = G.simT;
    const gain = Math.min(1.2, im.speed / 5) * Math.max(0.3, Math.min(1.2, 0.4 + 0.25 * Math.log10(b.m)));
    const [kind, opts] = b.shape === 'glome' ? ['ring', { size: b.size, metal: b.mat === 1 }] : b.mat === 1 ? ['ping', { size: b.size }]
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
export const HOLD_F = 2600, HOLD_T = 400;        // the drive's strength: newtons (about lifting 265 kg), newton-metres
const HOLD_TAU = 0.04, HOLD_TAU_R = 0.05;        // how fast it closes a gap, in position and in attitude (s)
export const hold = { last: null, snag: 0, snapped: false, rel: null, relPrev: null };
// Your body's frame (the camera's without the head's tilt: forward level, right, ana, up), as a proper rotation.
// What you hold keeps its attitude in this frame: it turns as you turn and twist through ana, and stays level when
// you only look up or down, so things go down square.
function bodyRot(c) {
  const f = vec4.norm(vec4.sub(c.F, vec4.scale(c.up, vec4.dot(c.F, c.up))));
  return camRot({ F: f, R: c.R, A: c.A, U: c.up });
}
function handTarget(b, cam) {
  const C = bodyRot(cam);
  if (!b.holdRel || !b.holdRel.l) b.holdRel = R4.compose(R4.inverse(C), b.rot);   // (a save from before keeps the attitude it has)
  // in front of you, a bigger thing lower down (carried at the chest, not held up before your eyes)
  return { pos: vec4.add(vec4.add(cam.eye, vec4.scale(cam.F, 0.55 + b.bound)), vec4.scale(cam.up, -(0.22 + 0.9 * b.half))), rot: R4.compose(C, b.holdRel) };
}
function holdDrive(b, cam, w, kick) {
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
  const T = handTarget(b, cam);
  b.pos = T.pos.slice(); b.rot = T.rot; b.omega = [0, 0, 0, 0, 0, 0];
  hold.last = T; hold.snapped = true; hold.rel = hold.relPrev = null;
}

// ---------- picking up, dropping, throwing ----------
// The object under your gaze, within reach (a ray from the eye; a near miss of 0.3 m also counts).
export function lookedAt(cam, reach = 3.2, w = hereWorld()) {
  const hit = w.raycast(cam.eye, cam.F, reach, objects.held);
  if (hit) return hit.body.fixed ? null : hit.body;
  let best = null, bd = 0.3;
  for (const b of w.bodies) {
    if (b === objects.held || b.fixed) continue;
    const d = vec4.sub(b.pos, cam.eye), t = vec4.dot(d, cam.F);
    if (t < 0 || t > reach) continue;
    const miss = vec4.len(vec4.sub(d, vec4.scale(cam.F, t))) - b.bound;
    if (miss < bd) { bd = miss; best = b; }
  }
  return best;
}
export function pickUp(b, cam) {
  if (b.kind === 'stone') {                     // impulse stones go into the pouch
    worldOf(b).remove(b); objects.pouch++;
    G.audio?.emit('clack', b.pos, 0.6);
    return;
  }
  takeHold(b, cam);
  G.audio?.emit('clack', b.pos, 0.4);
}
function takeHold(b, cam) {
  objects.held = b; b.held = true; b.kinematic = false; b.sleeping = false; b.sleepT = 0;
  b.holdRel = R4.compose(R4.inverse(bodyRot(cam)), b.rot);  // its attitude to your body, kept while you hold it
  hold.snag = 0; hold.gap = null; hold.snapped = false; hold.rel = hold.relPrev = null;
  hold.last = handTarget(b, cam);
}
function release(b, vel) {
  b.held = false; b.kinematic = false; b.sleeping = false; b.sleepT = 0;
  if (vel) b.vel = vel.slice();
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
  const mp = LAWS.PLAYER_M, mo = b.m;
  const u = b.kind === 'stone' ? STONE_SPEED : Math.min(THROW_VMAX, (0.15 + 0.85 * charge) * THROW_MAX / mo);   // speed relative to you
  const dir = cam.F;
  release(b, vec4.add(b.vel, vec4.scale(dir, u * mp / (mp + mo))));             // on top of the motion it has
  const dv = vec4.scale(dir, -u * mo / (mp + mo));
  kickPlayer(dv);
  G.audio?.emit(b.kind === 'stone' ? 'launch' : 'throw', b.pos, b.kind === 'stone' ? 0.5 : 0.6);
  return { body: b, dv, u };
}
export function drawStone(cam) {
  if (objects.held || objects.pouch <= 0) return false;
  objects.pouch--;
  const b = spawnAt('stone', vec4.add(cam.eye, vec4.scale(cam.F, 0.7)), G.player.onB != null);
  b.vel = G.player.vel.slice();
  takeHold(b, cam);                               // into the hand (not the pouch)
  return true;
}
function spawnAt(kind, pos, inB = false) {
  const K = KINDS[kind];
  const body = makeBody({ shape: K.shape, size: K.size, density: K.density, mass: K.mass, pos, kind });
  body.mat = K.mat; body.glow = K.glow || 0; body.light = K.light || null; body.inB = inB;
  worldOf(body).add(body);
  return body;
}

// Where the held object would come to rest if you let it go here: simulate a copy of the nearby world forward.
export function computeGhost(cam) {
  const b = objects.held;
  if (!b) { objects.ghost = null; return; }
  const w = worldOf(b).clone();
  w.bodies = w.bodies.filter(o => vec4.len(vec4.sub(o.pos, b.pos)) < 12);
  const g = w.bodies.find(o => o.id === b.id);
  if (!g) return;
  g.held = false; g.kinematic = false; g.sleeping = false; g.vel = [0, 0, 0, 0]; g.omega = [0, 0, 0, 0, 0, 0];
  for (const o of w.bodies) if (o !== g) o.sleeping = true;          // the others stay put while we look ahead
  for (let i = 0; i < 480 && !g.sleeping; i++) w.step();
  objects.ghost = { pos: g.pos, rot: g.rot, shape: b.shape, half: b.half, inB: !!b.inB };
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
  const cap = p.capsule(), up = p.up();
  for (const c of w.capsuleContacts(cap.a, cap.b, cap.r)) {
    const B = c.body, cu = vec4.dot(c.n, up);
    // footing (a surface within about 53° of level) holds you as friction would: its support is straight up, and
    // you move with the point under your feet (a push along a tilted top, a raft leaning under you, would slide you off)
    const foot = cu > 0.6, dir = foot ? up : c.n;
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
    const r = vec4.sub(c.point, B.pos), K = 1 / LAWS.PLAYER_M + B.invM + (vec4.dot(r, r) - vec4.dot(r, dir) ** 2) * B.invI;
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
  if (b.held && hold.rel) {
    const C = camRot(cam), r0 = hold.relPrev || hold.rel, r1 = hold.rel;
    return { pos: vec4.add(cam.eye, R4.apply(C, lerp4(r0.p, r1.p, alpha))), rot: R4.compose(C, lerpRot(r0.R, r1.R, alpha)) };
  }
  if (alpha < 1 && b.prevPos && vec4.len(vec4.sub(b.pos, b.prevPos)) < 1) return { pos: lerp4(b.prevPos, b.pos, alpha), rot: lerpRot(b.prevRot, b.rot, alpha) };
  return b;
}
export function uploadObjects(cam, alpha = 1) {
  const w = objects.world;
  gpuObj.n = 0; gpuObj.cut = 0; gpuObj.ln = 0; gpuObj.ghost = -1;
  if (!w) return;
  const list = [];
  for (const b of w.bodies) {
    const d = vec4.len(vec4.sub(b.pos, cam.eye));
    if (d > 120) continue;
    // does your slice cut it? (its centre's distance from the slice against its support along the ana axis)
    const a = Math.abs(vec4.dot(vec4.sub(b.pos, cam.eye), cam.A));
    let reach = b.size;
    if (b.shape === 'tesseract') { const M = R4.toRows(b.rot); reach = 0; for (let j = 0; j < 4; j++) reach += b.half * Math.abs(M[0][j] * cam.A[0] + M[1][j] * cam.A[1] + M[2][j] * cam.A[2] + M[3][j] * cam.A[3]); }
    list.push({ b, d, cut: a < reach, pose: drawPose(b, cam, alpha) });
  }
  for (const it of G.creatureItems || []) {                  // the creatures near you (creatures.js)
    const a = Math.abs(vec4.dot(vec4.sub(it.pos, cam.eye), cam.A));
    list.push({ b: it, d: it.d, cut: a < (it.shape === 'tesseract' ? it.half * 2 : it.size * 1.42) });
  }
  if (objects.ghost) {
    const g = objects.ghost, q = g.inB && objects.toA ? objects.toA(g.pos, g.rot) : g;
    list.push({ b: { pos: q.pos, rot: q.rot, shape: g.shape, half: g.half, size: g.half, mat: 3, glow: 0.4, ghost: true }, d: 0, cut: true });
  }
  list.sort((x, y) => (y.cut - x.cut) || (x.d - y.d));
  const shown = list.slice(0, MAXO);
  shown.forEach(({ b, cut, pose }, i) => {
    gpuObj.C.set((pose || b).pos, 4 * i);
    gpuObj.M.set(R4.toMatrix((pose || b).rot), 16 * i);
    gpuObj.P.set([b.shape === 'tesseract' ? 1 : b.shape === 'duo' ? 2 : 0, b.shape === 'tesseract' ? b.half : b.size, b.mat || 0, b.glow || 0], 4 * i);
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
export const objectsSave = {
  save() {
    const r5 = v => Math.round(v * 1e5) / 1e5;
    return {
      pouch: objects.pouch,
      held: objects.held ? objects.held.id : null,
      bodies: objects.world.bodies.concat(objects.worldB ? objects.worldB.bodies : []).filter(b => !b.fixed).map(b => ({ id: b.id, kind: b.kind, tier: b.tier, pos: b.pos.slice(), vel: b.vel.map(r5), rot: { l: b.rot.l.map(r5), r: b.rot.r.map(r5) }, omega: b.omega.map(r5), sleeping: b.sleeping, holdRel: b.holdRel || null, tag: b.tag || null, inB: !!b.inB })),
    };
  },
  load(s) {
    const w = objects.world;
    w.bodies = w.bodies.filter(b => b.fixed);                        // fixed things (the launcher) are rebuilt, not saved
    if (objects.worldB) objects.worldB.bodies = objects.worldB.bodies.filter(b => b.fixed);
    objects.held = null;
    objects.pouch = s.pouch || 0;
    for (const o of s.bodies) {
      if (!KINDS[o.kind]) continue;
      const b = spawnAt(o.kind, o.pos, !!o.inB && !!objects.worldB);
      b.vel = o.vel; b.rot = o.rot; b.omega = o.omega; b.sleeping = o.sleeping; b.tag = o.tag; b.tier = o.tier;
      if (o.id === s.held) { objects.held = b; b.held = true; b.holdRel = o.holdRel && o.holdRel.l ? o.holdRel : null; hold.last = null; }
    }
  },
};
