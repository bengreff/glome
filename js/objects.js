// Objects you can pick up, carry, throw and stack: 4D balls ("glomes") and tesseracts in two sizes, impulse
// stones, and lanterns. Their physics is in bodies.js; this module is the game side: what exists, what you hold,
// the pouch, and what goes to the GPU.
//
// Holding: one object at a time. It stays fixed in your frame, so it turns as you turn: hold a handed object,
// twist through ana, set it down, turn back, and it is its own mirror image.
// F: pick up / drop. Hold F: a ghost shows where the object will come to rest; release to set it down there.
// Mouse: hold to charge a throw, release to throw. G: draw an impulse stone from the pouch.
// Throwing conserves momentum exactly: you recoil by m_object·v / (m_you + m_object).
import { G } from './game.js';
import { LAWS } from './laws.js';
import { vec4 } from './player.js';
import { PLANET_R } from './world.js';
import { World, makeBody, DENSITY, applyImpulse } from './bodies.js';
import { rot as R4 } from './so4.js';
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
  raft: { shape: 'tesseract', size: 1.3, density: 160, mat: 6 },                 // light wood (like balsa): a uniform cube floats flat
                                                                                   // only below about a fifth of water's density
  sail: { shape: 'tesseract', size: 0.4, density: DENSITY.wood, mat: 2, glow: 0.2 }, // set on a raft, it catches the wind
  key: { shape: 'tesseract', size: 0.32, density: DENSITY.metal / 4, mat: 4 },     // the mirror key: handed (two marked cells)
};
export const STONE_SPEED = 80;     // an impulse stone always leaves your hand at 80 m/s (relative to you)
const THROW_MAX = 260, THROW_VMAX = 14;   // a full charge is a 260 N·s impulse, at most 14 m/s

export const objects = { world: null, held: null, pouch: 0, charge: -1, fDown: -1, ghost: null, ghostT: 0, discovered: new Set() };

export function playerMass() { return LAWS.PLAYER_M + (objects.held ? objects.held.m : 0); }

// ---------- the world of bodies ----------
export function initObjects(accel, env, water) {
  const w = objects.world = new World({ accel, env, dt: 1 / 120, iterations: 14 });
  w.water = water;
  return w;
}
// A rotation that sets a body square on the ground at unit n: its last axis along the local up.
function groundFrame(n) {
  const T = tangents(n), rows = [0, 1, 2, 3].map(r => [T[0][r], T[1][r], T[2][r], n[r]]);
  const det = (m) => { let d = 0; for (let j = 0; j < 4; j++) { const minor = [1, 2, 3].map(i => m[i].filter((_, k) => k !== j)); const [a, b, c] = minor; d += (j % 2 ? -1 : 1) * m[0][j] * (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])); } return d; };
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
// Bodies far from you are frozen (they would only be resting anyway); the held one follows your frame.
export function stepObjects(cam) {
  const w = objects.world;
  if (!w) return;
  const eye = cam.eye;
  for (const b of w.bodies) {
    const far = vec4.len(vec4.sub(b.pos, eye)) > 150;
    if (far && !b.sleeping && !b.held) { b.sleeping = true; b.vel = [0, 0, 0, 0]; b.omega = [0, 0, 0, 0, 0, 0]; }
    if (vec4.len(b.pos) > 1500 && !b.held) w.remove(b);        // flown off into space: gone
  }
  if (objects.held) holdPose(objects.held, cam);
  w.step();
}
const frameRows = p => { const U = p.up(); return [0, 1, 2, 3].map(r => [p.F[r], p.R[r], p.A[r], U[r]]); };
const mul = (A, B) => A.map(row => [0, 1, 2, 3].map(j => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j] + row[3] * B[3][j]));
const T4 = A => [0, 1, 2, 3].map(i => A.map(r => r[i]));
function holdPose(b, cam) {
  const p = G.player;
  const pos = vec4.add(vec4.add(cam.eye, vec4.scale(cam.F, 0.55 + b.bound)), vec4.scale(cam.U, -0.22));
  b.vel = vec4.scale(vec4.sub(pos, b.pos), 120);   // kinematic: its velocity is how it is being carried
  b.pos = pos;
  b.rot = R4.fromMatrix(mul(frameRows(p), b.holdRel));
  b.omega = [0, 0, 0, 0, 0, 0];
}

// ---------- picking up, dropping, throwing ----------
// The object under your gaze, within reach (a ray from the eye; a near miss of 0.3 m also counts).
export function lookedAt(cam, reach = 3.2) {
  const w = objects.world;
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
export function pickUp(b) {
  if (b.kind === 'stone') {                     // impulse stones go into the pouch
    objects.world.remove(b); objects.pouch++;
    G.audio?.emit('clack', b.pos, 0.6);
    return;
  }
  objects.held = b; b.held = true; b.kinematic = true; b.sleeping = false;
  b.holdRel = mul(T4(frameRows(G.player)), R4.toRows(b.rot));
  G.audio?.emit('clack', b.pos, 0.4);
}
function release(b, vel) {
  b.held = false; b.kinematic = false; b.sleeping = false; b.sleepT = 0;
  b.vel = vel.slice(); b.omega = [0, 0, 0, 0, 0, 0];
  objects.held = null;
}
export function drop() {
  const b = objects.held;
  if (b) release(b, G.player.vel);
}
// Throw what you hold along your line of sight. charge 0..1. Momentum is conserved between you and the object.
export function throwHeld(cam, charge, kickPlayer) {
  const b = objects.held;
  if (!b) return null;
  const mp = LAWS.PLAYER_M, mo = b.m;
  const u = b.kind === 'stone' ? STONE_SPEED : Math.min(THROW_VMAX, (0.15 + 0.85 * charge) * THROW_MAX / mo);   // speed relative to you
  const dir = cam.F;
  const v0 = G.player.vel.slice();                                             // you and it, moving together
  release(b, vec4.add(v0, vec4.scale(dir, u * mp / (mp + mo))));
  const dv = vec4.scale(dir, -u * mo / (mp + mo));
  kickPlayer(dv);
  G.audio?.emit(b.kind === 'stone' ? 'launch' : 'throw', b.pos, b.kind === 'stone' ? 0.5 : 0.6);
  return { body: b, dv, u };
}
export function drawStone(cam) {
  if (objects.held || objects.pouch <= 0) return false;
  objects.pouch--;
  const b = spawnAt('stone', vec4.add(cam.eye, vec4.scale(cam.F, 0.7)));
  pickUp2(b);
  return true;
}
function spawnAt(kind, pos) {
  const K = KINDS[kind];
  const body = makeBody({ shape: K.shape, size: K.size, density: K.density, mass: K.mass, pos, kind });
  body.mat = K.mat; body.glow = K.glow || 0; body.light = K.light || null;
  objects.world.add(body);
  return body;
}
function pickUp2(b) {   // into the hand (not the pouch), even for a stone
  objects.held = b; b.held = true; b.kinematic = true;
  b.holdRel = mul(T4(frameRows(G.player)), R4.toRows(b.rot));
}

// Where the held object would come to rest if you let it go here: simulate a copy of the nearby world forward.
export function computeGhost(cam) {
  const b = objects.held;
  if (!b) { objects.ghost = null; return; }
  const w = objects.world.clone();
  w.bodies = w.bodies.filter(o => vec4.len(vec4.sub(o.pos, b.pos)) < 12);
  const g = w.bodies.find(o => o.id === b.id);
  if (!g) return;
  g.held = false; g.kinematic = false; g.sleeping = false; g.vel = [0, 0, 0, 0]; g.omega = [0, 0, 0, 0, 0, 0];
  for (const o of w.bodies) if (o !== g) o.sleeping = true;          // the others stay put while we look ahead
  for (let i = 0; i < 480 && !g.sleeping; i++) w.step();
  objects.ghost = { pos: g.pos, rot: g.rot, shape: b.shape, half: b.half };
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
export function playerContacts(p) {
  const w = objects.world;
  if (!w) return;
  const cap = p.capsule(), up = p.up();
  for (const c of w.capsuleContacts(cap.a, cap.b, cap.r)) {
    const B = c.body;
    p.pos = vec4.add(p.pos, vec4.scale(c.n, Math.min(c.depth, 0.2)));
    const vb = vec4.add(B.vel, [0, 0, 0, 0]);
    const vrel = vec4.dot(vec4.sub(p.vel, vb), c.n);
    if (vec4.dot(c.n, up) > 0.6) { p.supported = true; p.ride = B; }      // standing on it: you move with it
    if (vrel >= 0) continue;
    if (B.kinematic) { p.vel = vec4.sub(p.vel, vec4.scale(c.n, vrel)); continue; }
    // an inelastic push between you (mass m_p) and the body at the contact point
    const r = vec4.sub(c.point, B.pos), K = 1 / LAWS.PLAYER_M + B.invM + (vec4.dot(r, r) - vec4.dot(r, c.n) ** 2) * B.invI;
    const lam = -vrel / K;
    p.vel = vec4.add(p.vel, vec4.scale(c.n, lam / LAWS.PLAYER_M));
    applyImpulse(B, vec4.scale(c.n, -lam), c.point);
    B.sleeping = false; B.sleepT = 0;
  }
}

// ---------- to the GPU ----------
export function uploadObjects(cam) {
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
    list.push({ b, d, cut: a < reach });
  }
  for (const it of G.creatureItems || []) {                  // the creatures near you (creatures.js)
    const a = Math.abs(vec4.dot(vec4.sub(it.pos, cam.eye), cam.A));
    list.push({ b: it, d: it.d, cut: a < (it.shape === 'tesseract' ? it.half * 2 : it.size * 1.42) });
  }
  if (objects.ghost) {
    const g = objects.ghost;
    list.push({ b: { pos: g.pos, rot: g.rot, shape: g.shape, half: g.half, size: g.half, mat: 3, glow: 0.4, ghost: true }, d: 0, cut: true });
  }
  list.sort((x, y) => (y.cut - x.cut) || (x.d - y.d));
  const shown = list.slice(0, MAXO);
  shown.forEach(({ b, cut }, i) => {
    gpuObj.C.set(b.pos, 4 * i);
    gpuObj.M.set(R4.toMatrix(b.rot), 16 * i);
    gpuObj.P.set([b.shape === 'tesseract' ? 1 : b.shape === 'duo' ? 2 : 0, b.shape === 'tesseract' ? b.half : b.size, b.mat || 0, b.glow || 0], 4 * i);
    if (cut) gpuObj.cut = i + 1;
    if (b.ghost) gpuObj.ghost = i;
  });
  gpuObj.n = shown.length;
  // lanterns: the nearest few light the world (held ones too)
  const lamps = w.bodies.filter(b => b.light).map(b => ({ b, d: vec4.len(vec4.sub(b.pos, cam.eye)) })).sort((x, y) => x.d - y.d).slice(0, MAXL);
  lamps.forEach(({ b }, i) => { gpuObj.LP.set(b.pos, 4 * i); gpuObj.LC.set([...b.light, 0], 4 * i); });
  gpuObj.ln = lamps.length;
}

// ---------- saving ----------
export const objectsSave = {
  save() {
    const r5 = v => Math.round(v * 1e5) / 1e5;
    return {
      pouch: objects.pouch,
      held: objects.held ? objects.held.id : null,
      bodies: objects.world.bodies.filter(b => !b.fixed).map(b => ({ id: b.id, kind: b.kind, tier: b.tier, pos: b.pos.slice(), vel: b.vel.map(r5), rot: { l: b.rot.l.map(r5), r: b.rot.r.map(r5) }, omega: b.omega.map(r5), sleeping: b.sleeping, holdRel: b.holdRel || null, tag: b.tag || null })),
    };
  },
  load(s) {
    const w = objects.world;
    w.bodies = w.bodies.filter(b => b.fixed);                        // fixed things (the launcher) are rebuilt, not saved
    objects.pouch = s.pouch || 0;
    for (const o of s.bodies) {
      if (!KINDS[o.kind]) continue;
      const b = spawnAt(o.kind, o.pos);
      b.vel = o.vel; b.rot = o.rot; b.omega = o.omega; b.sleeping = o.sleeping; b.tag = o.tag; b.tier = o.tier;
      if (o.id === s.held && o.holdRel) { objects.held = b; b.held = true; b.kinematic = true; b.holdRel = o.holdRel; }
    }
  },
};
