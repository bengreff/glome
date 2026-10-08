// Planet B's built things and the console of the simulation.
// The console stands among four pillars on one of B's floors. It stays dark until you have flown a full orbit of
// planet A (which only works flat across the hoop, timed as the double spin brings that direction round). Then its
// screen shows its own view, fed back: the universe, with the console in it, with the universe in it, and so on down.
// Using it opens its dials: the strength and the law of gravity, the hoop's length, time, and you. It shows the
// world's real source, and can always put the true laws back.
import { G } from './game.js';
import { LAWS, resetLaws, TRUE_LAWS } from './laws.js';
import { vec4 } from './player.js';
import { rot as R4 } from './so4.js';
import { World, makeBody } from './bodies.js';
import { NORMALS, B_IN } from './planetB.js';
import { orbitOf, toBody, dirToBody, rebaseSpin } from './cosmos.js';
import { objects } from './objects.js';

const $ = id => document.getElementById(id);
export const bworld = { world: new World({ accel: () => [0, 0, 0, 0], env: () => ({ d: 1e9, n: [0, 0, 0, 1] }) }), console: null };
const proj = (v, n) => vec4.norm(vec4.sub(v, vec4.scale(n, vec4.dot(v, n))));
const CONSOLE_FLOOR = 60;

// B's structures, in B's own frame (centre at the origin, axes inertial).
export function buildB() {
  const n = NORMALS[CONSOLE_FLOOR], floorR = B_IN();
  const t0 = proj([0.3, 0.7, -0.4, 0.5], n), t1 = proj(vec4.sub([0.6, -0.2, 0.5, 0.6], vec4.scale(t0, vec4.dot([0.6, -0.2, 0.5, 0.6], t0))), n);
  const t2 = proj(vec4.sub(vec4.sub([-0.4, 0.5, 0.6, 0.3], vec4.scale(t0, vec4.dot([-0.4, 0.5, 0.6, 0.3], t0))), vec4.scale(t1, vec4.dot([-0.4, 0.5, 0.6, 0.3], t1))), n);
  const rows = [0, 1, 2, 3].map(r => [t0[r], t1[r], t2[r], n[r]]);
  const rot = R4.fromMatrix(fixDet(rows));
  const on = (u, side, lift) => vec4.add(vec4.scale(n, floorR + side / 2 + lift), u);
  const add = (pos, side, mat, glow = 0) => { const b = makeBody({ shape: 'tesseract', size: side, mass: 1e9, pos, rot, kind: 'bblock' }); b.kinematic = true; b.fixed = true; b.mat = mat; b.glow = glow; bworld.world.add(b); return b; };
  // the console: its screen (the +x cell) faces t0's way
  bworld.console = add(on([0, 0, 0, 0], 1.0, 0), 1.0, 5);
  bworld.frame = { n, t0, t1, t2 };
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const u = vec4.add(vec4.scale(t1, 3.2 * a), vec4.scale(t2, 3.2 * b));
    for (let k = 0; k < 3; k++) add(on(u, 0.5, 0.5 * k), 0.5, 0, k === 2 ? 0.2 : 0);
  }
}
function fixDet(rows) {
  const M = rows;
  let d = 0;
  for (let j = 0; j < 4; j++) { const m = [1, 2, 3].map(i => M[i].filter((_, k) => k !== j)); d += (j % 2 ? -1 : 1) * M[0][j] * (m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])); }
  if (d < 0) rows.forEach(r => { r[2] = -r[2]; });
  return rows;
}
// For the renderer: B's structures in A's frame (B's copy k round the hoop: the one you are near).
export function bItems(eyeA, t) {
  const p = G.player, k = p.onB ?? 0, o = orbitOf('B', t).c, base = [o[0], o[1], o[2], o[3] + k * LAWS.L];
  const items = [];
  const cb = toBody(base, t);
  if (vec4.len(vec4.sub(cb, eyeA)) > 400) return items;
  const cols = [0, 1, 2, 3].map(j => { const e = [0, 0, 0, 0]; e[j] = 1; return dirToBody(e, t); });   // inertial axes in A's frame
  for (const b of bworld.world.bodies) {
    const pos = toBody(vec4.add(base, b.pos), t);
    const M = R4.toRows(b.rot), axes = [0, 1, 2, 3].map(j => { const v = [M[0][j], M[1][j], M[2][j], M[3][j]]; return [0, 1, 2, 3].map(i => cols[0][i] * v[0] + cols[1][i] * v[1] + cols[2][i] * v[2] + cols[3][i] * v[3]); });
    const rows = [0, 1, 2, 3].map(r => axes.map(a => a[r]));
    items.push({ pos, rot: R4.fromMatrix(rows), shape: 'tesseract', half: b.half, size: b.size, mat: b.mat, glow: b.glow, d: vec4.len(vec4.sub(pos, eyeA)) });
  }
  return items;
}
// On B, the pillars and the console stop you (the capsule against them, in B's frame).
export function bContacts(p) {
  if (p.onB == null) return;
  const cap = p.capsule(), up = p.up();
  for (const c of bworld.world.capsuleContacts(cap.a, cap.b, cap.r)) {
    p.pos = vec4.add(p.pos, vec4.scale(c.n, Math.min(c.depth, 0.2)));
    const vn = vec4.dot(p.vel, c.n);
    if (vn < 0) p.vel = vec4.sub(p.vel, vec4.scale(c.n, vn));
    if (vec4.dot(c.n, up) > 0.6) p.supported = true;
  }
}

// ---------- the orbit ----------
// A full turn round planet A in flight, staying clear of the ground and within its reach, opens the console.
const orbit = { last: null, swept: 0 };
export function trackOrbit(flight, t) {
  if (!flight.active) { orbit.last = null; orbit.swept = 0; return; }
  const A = orbitOf('A', t).c, r = vec4.sub(flight.x, A), d = vec4.len(r);
  if (d > 1200) { orbit.last = null; orbit.swept = 0; return; }
  if (orbit.last) orbit.swept += Math.acos(Math.max(-1, Math.min(1, vec4.dot(vec4.norm(r), orbit.last))));
  orbit.last = vec4.norm(r);
  if (orbit.swept > 2 * Math.PI && !G.flags.orbited) { G.flags.orbited = true; G.audio?.emit('chime', [0, 0, 0, 0], 0.8); }
}
export const orbitState = orbit;

// ---------- the console itself ----------
export function nearConsole(p) {
  if (p.onB == null || !bworld.console) return false;
  return vec4.len(vec4.sub(p.pos, bworld.console.pos)) < 2.6;
}
export function openConsole() {
  if (!G.flags.orbited) { G.audio?.emit('clack', [0, 0, 0, 0], 0.3); return false; }   // dark: nothing yet
  if (!G.flags.console) { G.flags.console = true; G.audio?.cue('console'); }
  $('console').hidden = false;
  document.exitPointerLock?.();
  syncDials();
  return true;
}
export function closeConsole() { $('console').hidden = true; }
G.screenOn = false;
export function updateConsole() { G.screenOn = !!G.flags.orbited; if (G.infinite) objects.pouch = Math.max(objects.pouch, 9); }

// The dials (in symbols, not words: this is the end of a wordless trail).
const DIALS = [
  ['dial-g', 'G_SCALE', v => +v, v => v],
  ['dial-l', 'L', v => +v, v => v],
  ['dial-time', 'TIME_RATE', v => +v, v => v],
  ['dial-jump', 'JUMP', v => +v, v => v],
  ['dial-speed', 'WALK', v => +v, v => v],
];
function syncDials() {
  for (const [id, key] of DIALS) $(id).value = LAWS[key];
  $('dial-law').checked = LAWS.GRAV_DIM === 3;
  $('dial-day').value = LAWS.DAY1;
  $('dial-inf').checked = !!G.infinite;
  $('dial-fly').checked = !!G.fly;
}
export function bindConsole() {
  for (const [id, key, parse] of DIALS) $(id).oninput = () => { LAWS[key] = parse($(id).value); if (key === 'WALK') LAWS.RUN = LAWS.WALK * 9.5 / 4.2; };
  $('dial-law').onchange = () => { LAWS.GRAV_DIM = $('dial-law').checked ? 3 : 4; };
  $('dial-day').oninput = () => { rebaseSpin(G.state.time, +$('dial-day').value); };
  $('dial-pause').onclick = () => { LAWS.TIME_RATE = LAWS.TIME_RATE > 0 ? 0 : 1; syncDials(); };
  $('dial-inf').onchange = () => { G.infinite = $('dial-inf').checked; };
  $('dial-fly').onchange = () => { G.fly = $('dial-fly').checked; };
  $('dial-reset').onclick = () => { rebaseSpin(G.state.time, TRUE_LAWS.DAY1); resetLaws(); G.infinite = false; G.fly = false; syncDials(); };
  $('console-close').onclick = closeConsole;
  // the world's real source: every module, fetched from where it is served
  const files = [...document.querySelector('script[type=importmap]').textContent.matchAll(/"\.\/js\/([a-z0-9-]+\.js)"/g)].map(m => m[1]);
  const list = $('console-files');
  list.innerHTML = '';
  for (const f of files) {
    const b = document.createElement('button'); b.textContent = f;
    b.onclick = async () => { $('console-src').textContent = '…'; try { $('console-src').textContent = await (await fetch('js/' + f)).text(); } catch { $('console-src').textContent = '(could not load)'; } };
    list.appendChild(b);
  }
}
