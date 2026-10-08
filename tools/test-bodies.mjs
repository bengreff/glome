// Tests for js/bodies.js (Node, no packages): node tools/test-bodies.mjs
import { World, makeBody, ballSubmerged, VOLUME, ROLL_RES } from '../js/bodies.js';
import { rot as R4, wedge, bivApply } from '../js/so4.js';
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), len = a => Math.hypot(...a);
const sub = (a, b) => a.map((v, i) => v - b[i]), add = (a, b) => a.map((v, i) => v + b[i]), scale = (a, s) => a.map(v => v * s);
const results = [];
const check = (name, ok, info) => { results.push([ok ? 'PASS' : 'FAIL', name, info]); };
const RP = 250, g0 = 9.8;
const planet = () => new World({ accel: p => scale(p, -g0 / len(p)), env: p => ({ d: len(p) - RP, n: scale(p, 1 / len(p)) }) });
const up = [0, 0, 0, 1], onGround = h => [0, 0, 0, RP + h];

// 1. free tumble: energy and angular momentum conserved
{
  const w = new World({ accel: () => [0, 0, 0, 0], env: () => ({ d: 1e9, n: up }) });
  const b = w.add(makeBody({ shape: 'tesseract', size: 0.6, density: 2600, pos: [0, 0, 0, 0], omega: [0.7, -0.3, 1.1, 0.2, -0.9, 0.4] }));
  const L0 = scale(b.omega, b.I), E0 = 0.5 * b.I * dot(b.omega, b.omega);
  for (let i = 0; i < 12000; i++) w.step();
  const M = R4.toRows(b.rot); let orth = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) orth = Math.max(orth, Math.abs(M.reduce((s, r) => s + r[i] * r[j], 0) - (i === j ? 1 : 0)));
  check('free tumble: L and E conserved, orthonormal', len(sub(scale(b.omega, b.I), L0)) < 1e-9 && Math.abs(0.5 * b.I * dot(b.omega, b.omega) - E0) < 1e-9 && orth < 1e-9, `orth err ${orth.toExponential(1)}`);
}
// 2. a tesseract dropped from 1 m, tumbling, comes to rest on a face and sleeps
{
  const w = planet();
  const b = w.add(makeBody({ shape: 'tesseract', size: 0.5, density: 2600, pos: onGround(1.3), rot: R4.compose(R4.planeRotation(0, 3, 0.4), R4.planeRotation(1, 2, 0.3)), omega: [0.5, 0.2, 0.8, -0.4, 0.3, 0.6] }));
  let t = 0; for (; t < 8 && !b.sleeping; t += w.dt) w.step();
  const M = R4.toRows(b.rot), ax = [0, 1, 2, 3].map(j => Math.abs(M[3][j]));
  const tilt = Math.acos(Math.min(1, Math.max(...ax))) * 180 / Math.PI;
  check('dropped tesseract sleeps on a face', b.sleeping && tilt < 1, `slept at ${t.toFixed(2)} s, tilt ${tilt.toFixed(2)}°, height ${(len(b.pos) - RP).toFixed(3)} m`);
}
// 3. a stack of three tesseracts stands for 30 s
{
  const w = planet(), s = 0.6, bs = [];
  for (let k = 0; k < 3; k++) bs.push(w.add(makeBody({ shape: 'tesseract', size: s, density: 2600, pos: onGround(s / 2 + k * (s + 0.002)) })));
  const top0 = bs[2].pos.slice();
  for (let i = 0; i < 30 * 120; i++) w.step();
  const drift = len(sub(bs[2].pos, top0));
  check('three-tesseract stack stands 30 s', drift < 0.01, `top drift ${(drift * 100).toFixed(2)} cm, asleep: ${bs.map(b => b.sleeping).join(',')}`);
}
// 3b. the same with each box turned 30° in a plane through ana (the stack is still face-on-face)
{
  const w = planet(), s = 0.6, bs = [];
  for (let k = 0; k < 3; k++) bs.push(w.add(makeBody({ shape: 'tesseract', size: s, density: 2600, pos: onGround(s / 2 + k * (s + 0.002)), rot: R4.planeRotation(0, 2, 0.5 * k) })));
  const top0 = bs[2].pos.slice();
  for (let i = 0; i < 30 * 120; i++) w.step();
  check('stack of twisted tesseracts stands 30 s', len(sub(bs[2].pos, top0)) < 0.01, `top drift ${(len(sub(bs[2].pos, top0)) * 100).toFixed(2)} cm`);
}
// 4. glome collisions in free space conserve momentum and angular momentum
{
  const w = new World({ accel: () => [0, 0, 0, 0], env: () => ({ d: 1e9, n: up }) });
  const A = w.add(makeBody({ shape: 'glome', size: 0.3, mass: 5, pos: [-1, 0.1, 0.05, 0], vel: [2, 0, 0, 0.1], mu: 0.6 }));
  const B = w.add(makeBody({ shape: 'glome', size: 0.4, mass: 9, pos: [1, -0.15, 0, 0.1], vel: [-1, 0.2, 0, 0], omega: [0, 0, 1, 0, 0, 0], mu: 0.6 }));
  const P = bs => bs.reduce((s, b) => add(s, scale(b.vel, b.m)), [0, 0, 0, 0]);
  const Lt = bs => bs.reduce((s, b) => add(s, add(scale(wedge(b.vel, b.pos), b.m), scale(b.omega, b.I))), [0, 0, 0, 0, 0, 0]);
  // note: orbital angular momentum in the same convention as the spin term: m·wedge(v, x) (see bodies.js header)
  const P0 = P([A, B]), L0 = Lt([A, B]);
  for (let i = 0; i < 240; i++) w.step();
  const dP = len(sub(P([A, B]), P0)) / len(P0), dL = len(sub(Lt([A, B]), L0)) / len(L0);
  check('collision conserves P and L', dP < 1e-9 && dL < 1e-9, `dP ${dP.toExponential(1)}, dL ${dL.toExponential(1)}`);
}
// 5. a glome rolls down a 20° slope without slipping: a = g sinθ / (1 + I/(m r²)) = g sinθ · 3/4, less the
//    soil's rolling resistance (a deceleration ROLL_RES·g cosθ)
{
  const th = 20 * Math.PI / 180, n = [Math.sin(th), 0, 0, Math.cos(th)];   // the slope's normal, tilted in x
  const w = new World({ accel: () => [0, 0, 0, -g0], env: p => ({ d: dot(p, n), n }) });
  const r = 0.3, b = w.add(makeBody({ shape: 'glome', size: r, density: 2600, pos: scale(n, r) }));
  for (let i = 0; i < 120; i++) w.step();
  const v0 = len(b.vel); for (let i = 0; i < 120; i++) w.step(); const a = (len(b.vel) - v0) / 1;
  const want = g0 * Math.sin(th) * 0.75 - ROLL_RES * g0 * Math.cos(th);
  check('rolling ball: a = (3/4) g sin θ − c·g cos θ', Math.abs(a - want) / want < 0.02, `a ${a.toFixed(4)} vs ${want.toFixed(4)}`);
}
// 6. buoyancy: a ball of density 500 floats with half its 4-volume under water
{
  const r = 0.3;
  const half = ballSubmerged(r, 0) / VOLUME.glome(r);
  const w = new World({ accel: () => [0, 0, 0, -g0], env: () => ({ d: 1e9, n: up }) });
  w.water = { height: p => p[3], up: () => up, density: 1000 };
  const b = w.add(makeBody({ shape: 'glome', size: r, density: 500, pos: [0, 0, 0, 0.2] }));
  for (let i = 0; i < 120 * 40; i++) w.step();
  const frac = ballSubmerged(r, -b.pos[3]) / VOLUME.glome(r);
  check('buoyancy: density 500 floats half-submerged', Math.abs(half - 0.5) < 1e-12 && Math.abs(frac - 0.5) < 0.01, `submerged ${(frac * 100).toFixed(2)}% (cap formula at y=0: ${(half * 100).toFixed(4)}%)`);
}
// 7. raycast hits a rotated tesseract at the analytic distance
{
  const w = new World({ accel: () => [0, 0, 0, 0], env: () => ({ d: 1e9, n: up }) });
  const b = w.add(makeBody({ shape: 'tesseract', size: 1, density: 1, pos: [5, 0, 0, 0], rot: R4.planeRotation(0, 3, Math.PI / 4) }));
  const hit = w.raycast([0, 0, 0, 0], [1, 0, 0, 0]);
  const want = 5 - 0.5 * Math.SQRT2;   // turned 45° in x–w: the nearest edge is h·√2 from the centre along x
  check('raycast on a rotated tesseract', hit && Math.abs(hit.t - want) < 1e-9, `t ${hit && hit.t.toFixed(6)} vs ${want.toFixed(6)}`);
}
// 8. timing: 40 awake bodies in a heap
{
  const w = planet();
  for (let k = 0; k < 40; k++) w.add(makeBody({ shape: k % 2 ? 'glome' : 'tesseract', size: 0.3 + 0.1 * (k % 3), density: 2600, pos: add(onGround(0.5 + 0.7 * Math.floor(k / 8)), [(k % 8 - 4) * 0.45, ((k * 7) % 5 - 2) * 0.4, ((k * 3) % 4 - 2) * 0.4, 0]) }));
  for (let i = 0; i < 60; i++) w.step();
  const t0 = performance.now(); for (let i = 0; i < 120; i++) w.step(); const ms = (performance.now() - t0) / 120;
  check('40 bodies: ms per step', ms < 4, `${ms.toFixed(2)} ms/step`);
}
for (const [s, n, i] of results) console.log(`${s}  ${n.padEnd(46)} ${i || ''}`);
const fails = results.filter(r => r[0] === 'FAIL').length;
console.log(fails ? `${fails} FAILED` : 'All checks passed.');
process.exit(fails ? 1 : 0);
