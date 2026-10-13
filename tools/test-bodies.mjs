// Tests for js/bodies.js (Node, no packages): node tools/test-bodies.mjs
import { World, makeBody, ballSubmerged, VOLUME, ROLL_RES, IApply, hinge } from '../js/bodies.js';
import { ringParts, pillarParts, seatHeight, RING, PILLAR } from '../js/keys.js';
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
// 6b. a floating tesseract: a uniform cube floats square only below about 0.21 of water's density (BM = s²/12d
// against KG − KB = (s − d)/2, the same rule in 4D as in 3D): at 60 kg/m⁴, given a 20° tilt, it rights itself and
// draws 0.06 of its side; at 450 it settles tilted (on an edge)
for (const [rho, wantFlat] of [[60, true], [450, false]]) {
  const w = new World({ accel: () => [0, 0, 0, -g0], env: () => ({ d: 1e9, n: up }) });
  w.water = { height: p => p[3], up: () => up, density: 1000 };
  const b = w.add(makeBody({ shape: 'tesseract', size: 1.3, density: rho, pos: [0, 0, 0, 0.6], rot: R4.planeRotation(0, 3, 0.35) }));
  for (let i = 0; i < 120 * 60; i++) w.step();
  const M = R4.toRows(b.rot), tilt = Math.acos(Math.max(...[0, 1, 2, 3].map(j => Math.abs(M[3][j])))) * 180 / Math.PI;
  const draft = 0.65 - b.pos[3];
  check(`floating tesseract at ${rho} kg/m⁴: ${wantFlat ? 'square' : 'tilted'}`, wantFlat ? tilt < 1 && Math.abs(draft / 1.3 - rho / 1000) < 0.01 : tilt > 10,
    `tilt ${tilt.toFixed(1)}°, draft ${(draft / 1.3).toFixed(3)} of its side`);
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
// 9. compound bodies: a tesseract built of 16 cubes has a tesseract's inertia exactly
{
  const parts = []; for (let i = 0; i < 16; i++) parts.push({ shape: 'box', c: [0, 1, 2, 3].map(k => (i >> k & 1 ? 0.15 : -0.15)), e: [0.15, 0.15, 0.15, 0.15] });
  const b = makeBody({ shape: 'compound', parts, density: 2600, pos: [0, 0, 0, 0] }), t = makeBody({ shape: 'tesseract', size: 0.6, density: 2600, pos: [0, 0, 0, 0] });
  let err = Math.abs(b.m - t.m) / t.m;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) err = Math.max(err, Math.abs(b.I6[r][c] - (r === c ? t.I : 0)) / t.I);
  check('compound of 16 cubes = one tesseract', err < 1e-12, `relative error ${err.toExponential(1)}`);
}
// 10. an asymmetric compound tumbling freely keeps its L exactly and its energy closely, while its ω changes
{
  const w = new World({ accel: () => [0, 0, 0, 0], env: () => ({ d: 1e9, n: up }) });
  const parts = [{ shape: 'box', c: [0, 0, 0, 0], e: [0.3, 0.1, 0.1, 0.1] }, { shape: 'box', c: [0.2, 0.2, 0, 0], e: [0.1, 0.1, 0.1, 0.1] }, { shape: 'box', c: [0.2, 0.2, 0.2, 0], e: [0.1, 0.1, 0.1, 0.1] }, { shape: 'glome', c: [-0.2, 0, 0, 0.15], r: 0.08 }];
  const b = w.add(makeBody({ shape: 'compound', parts, density: 2600, pos: [0, 0, 0, 0], omega: [0.7, -0.3, 1.1, 0.2, -0.9, 0.4] }));
  const L0 = IApply(b, b.omega), E0 = 0.5 * dot(b.omega, L0), w0 = b.omega.slice();
  for (let i = 0; i < 120 * 60; i++) w.step();
  const L1 = IApply(b, b.omega), E1 = 0.5 * dot(b.omega, L1);
  const dL = len(sub(L1, L0)) / len(L0), dE = Math.abs(E1 - E0) / E0, dw = len(sub(b.omega, w0)) / len(w0);
  check('asymmetric tumble: L kept, E close, ω turns', dL < 1e-9 && dE < 2e-3 && dw > 0.05, `dL ${dL.toExponential(1)}, dE ${dE.toExponential(1)} over 60 s, ω changed ${(100 * dw).toFixed(0)}%`);
}
// 11. a compound against a ball in free space: momentum and angular momentum conserved
{
  const w = new World({ accel: () => [0, 0, 0, 0], env: () => ({ d: 1e9, n: up }) });
  const A = w.add(makeBody({ shape: 'compound', parts: ringParts(1), mass: 14, pos: [-1, 0.05, 0.02, 0], vel: [2, 0, 0, 0.1], mu: 0.6, omega: [0, 0.3, 0, 0, 0.2, 0] }));
  const B = w.add(makeBody({ shape: 'glome', size: 0.3, mass: 9, pos: [1, -0.25, 0, 0.03], vel: [-1, 0.2, 0, 0], mu: 0.6 }));
  const P = bs => bs.reduce((s, b) => add(s, scale(b.vel, b.m)), [0, 0, 0, 0]);
  const Lt = bs => bs.reduce((s, b) => add(s, add(scale(wedge(b.vel, b.pos), b.m), IApply(b, b.omega))), [0, 0, 0, 0, 0, 0]);
  const P0 = P([A, B]), L0 = Lt([A, B]), v0 = B.vel.slice();
  for (let i = 0; i < 240; i++) w.step();
  const dP = len(sub(P([A, B]), P0)) / len(P0), dL = len(sub(Lt([A, B]), L0)) / len(L0);
  check('ring hits ball: P and L conserved', dP < 1e-9 && dL < 1e-6 && len(sub(B.vel, v0)) > 0.1, `dP ${dP.toExponential(1)}, dL ${dL.toExponential(1)}`);
}
// 12. the launcher's pillar: each ring, dropped level over it, threads the spindle, passes the smaller balls and
// rests on its own; ring II dropped first sits on ball II, and ring I then rests on ring II (they go on in order)
{
  const pillar = (w) => { const b = makeBody({ shape: 'compound', parts: pillarParts(), mass: 1e9, mu: PILLAR.mu, pos: onGround(0) }); b.pos = add(onGround(0), b.com); b.kinematic = b.fixed = true; return w.add(b); };
  const drop = (w, k, tilt = 0) => w.add(makeBody({ shape: 'compound', parts: ringParts(k), mass: RING.mass, mu: RING.mu, pos: onGround(PILLAR.top + 0.25 + 0.3 * k), rot: R4.planeRotation(0, 3, tilt) }));
  const settle = (w, bs) => { for (let t = 0; t < 12 && !bs.every(b => b.sleeping); t += w.dt) w.step(); };
  const seated = (b, k) => ({ dz: len(b.pos) - RP - seatHeight(k), off: len(sub(b.pos, scale(up, dot(b.pos, up)))) });
  const out = [];
  for (let k = 0; k < 4; k++) {
    const w = planet(); pillar(w); const r = drop(w, k, k === 2 ? 0.08 : 0); settle(w, [r]);
    const s = seated(r, k); out.push(s); 
  }
  // (friction holds a ring where it lands on its ball, up to a few cm off the axis: real, and it still rests on its own)
  const ok = out.every(s => Math.abs(s.dz) < 0.01 && s.off < 0.05);
  check('each ring rests on its own ball', ok, out.map((s, k) => `${'I II III IV'.split(' ')[k]} dz ${(100 * s.dz).toFixed(1)} cm off ${(100 * s.off).toFixed(1)} cm`).join(', '));
  const w = planet(); pillar(w); const r2 = drop(w, 1); settle(w, [r2]); const r1 = drop(w, 0); r1.pos = add(r1.pos, scale(up, 0.5)); settle(w, [r1, r2]);
  const s2 = seated(r2, 1), h1 = len(r1.pos) - RP;
  check('in order: ring I rests on a seated ring II', Math.abs(s2.dz) < 0.01 && h1 > seatHeight(1), `II dz ${(100 * s2.dz).toFixed(1)} cm, I at ${h1.toFixed(2)} m`);
}
// 13. a ring on the ground lies flat and sleeps
{
  const w = planet(), r = w.add(makeBody({ shape: 'compound', parts: ringParts(0), mass: RING.mass, pos: onGround(0.6), rot: R4.compose(R4.planeRotation(0, 3, 0.3), R4.planeRotation(1, 3, 0.2)) }));
  let t = 0; for (; t < 10 && !r.sleeping; t += w.dt) w.step();
  const M = R4.toRows(r.rot), tilt = Math.acos(Math.min(1, Math.max(...[0, 1, 2, 3].map(j => Math.abs(M[3][j]))))) * 180 / Math.PI;
  check('a dropped ring lies flat and sleeps', r.sleeping && tilt < 1.5, `slept at ${t.toFixed(2)} s, tilt ${tilt.toFixed(2)}°`);
}
// 14. a hinge: a slab hung by its foot from the world, leaning 6° off upright, falls in its plane of turning only,
// the hinge's point stays put, and it comes to rest flat on the ground; with a tumbling start it still turns only in
// the hinge's plane (the other five rates held to nothing)
{
  const w = planet(), H = 2.0, T = 0.08, foot = onGround(0.02);
  const parts = [{ shape: 'box', c: [-T / 2, 0, 0, H / 2], e: [T / 2, 0.6, 0.95, H / 2] }];   // (hung by the edge it falls toward)
  const lean = R4.planeRotation(0, 3, -0.105);
  const b = makeBody({ shape: 'compound', parts, density: 450, pos: foot, rot: lean });
  b.pos = add(foot, R4.apply(lean, b.com)); w.add(b); b.noSleep = true;
  const j = hinge({ b, ca: foot, cb: scale(b.com, -1), Fa: R4.identity(), plane: [0, 3] }); w.joints.push(j);
  b.omega = [0.3, 0.2, 0, -0.4, 0.1, 0.5];                     // a knock in every plane
  let maxOff = 0, maxDrift = 0, t = 0;
  for (; t < 6; t += w.dt) {
    w.step();
    const M = R4.toRows(b.rot);
    maxOff = Math.max(maxOff, Math.abs(M[1][1] - 1), Math.abs(M[2][2] - 1));      // s and a stay themselves
    maxDrift = Math.max(maxDrift, len(sub(add(b.pos, R4.apply(b.rot, j.cb)), foot)));
  }
  const ang = j.angle * 180 / Math.PI;
  check('hinge: turns in its plane only, lands flat', maxOff < 2e-3 && maxDrift < 5e-3 && Math.abs(Math.abs(ang) - 90) < 3, `fell to ${ang.toFixed(1)}°, off-plane ${maxOff.toExponential(1)}, point drift ${(maxDrift * 1000).toFixed(1)} mm`);
}
// 15. two bodies hinged to each other in free space: momentum and angular momentum are kept
{
  const w = new World({ accel: () => [0, 0, 0, 0], env: () => ({ d: 1e9, n: up }) });
  const A = w.add(makeBody({ shape: 'tesseract', size: 0.4, density: 2600, pos: [0, 0, 0, 0], omega: [0.4, 0, 0.3, 0, 0, 0.2], vel: [0.1, 0, 0, 0] }));
  const B = w.add(makeBody({ shape: 'tesseract', size: 0.4, density: 2600, pos: [0.4, 0, 0, 0], omega: [-0.5, 0.2, 0, 0.6, 0, 0] }));
  w.joints.push(hinge({ a: A, b: B, ca: [0.2, 0, 0, 0.2], cb: [-0.2, 0, 0, 0.2], Fa: R4.identity(), plane: [0, 3] }));
  const P = bs => bs.reduce((s, b) => add(s, scale(b.vel, b.m)), [0, 0, 0, 0]);
  const Lt = bs => bs.reduce((s, b) => add(s, add(scale(wedge(b.vel, b.pos), b.m), IApply(b, b.omega))), [0, 0, 0, 0, 0, 0]);
  for (let i = 0; i < 120; i++) w.step();                      // (settle the knock onto the hinge)
  const P0 = P([A, B]), L0 = Lt([A, B]);
  for (let i = 0; i < 1200; i++) w.step();
  const dP = len(sub(P([A, B]), P0)), dL = len(sub(Lt([A, B]), L0)) / len(L0);
  check('hinged pair keeps P and L', dP < 1e-9 && dL < 1e-2, `dP ${dP.toExponential(1)}, dL ${dL.toExponential(1)}`);
}
// 16. a hinge's stop: a plate lifted by its far edge (pushed up at a steady rate) turns up on its hinge, and past
// upright it comes to rest on its stop at 94° and stays; let go, a plate short of upright falls back flat
{
  const w = planet(), L = 0.8, T = 0.04, at = onGround(0.06);
  const parts = [{ shape: 'box', c: [0.01 + L / 2, 0, 0, -T / 2], e: [L / 2, L / 2, L / 2, T / 2] }];
  const b = makeBody({ shape: 'compound', parts, density: 7800, pos: at }); b.pos = add(at, b.com); w.add(b);
  const stop = 94 * Math.PI / 180, j = hinge({ b, ca: at, cb: scale(b.com, -1), Fa: R4.identity(), plane: [0, 3], lo: -0.05, hi: stop }); w.joints.push(j);
  const angle = () => { const m = R4.toRows(b.rot); return Math.atan2(m[3][0] - m[0][3], m[0][0] + m[3][3]); };
  // turn it up by an angular push in the hinge's plane until past its balance (2.8° past upright: it hangs below its hinge), then leave it
  let t = 0;
  for (; t < 6 && angle() < Math.PI / 2 + 0.06; t += w.dt) { b.omega[2] = -0.8; b.sleeping = false; w.step(); }
  let maxA = 0; for (let i = 0; i < 600; i++) { w.step(); maxA = Math.max(maxA, angle()); }
  const rest = angle();
  const b2 = makeBody({ shape: 'compound', parts, density: 7800, pos: at }); b2.pos = add(at, b2.com); b2.rot = R4.planeRotation(0, 3, 1.2); b2.pos = add(at, R4.apply(b2.rot, b2.com));
  const w2 = planet(); w2.add(b2); w2.joints.push(hinge({ b: b2, ca: at, cb: scale(b2.com, -1), Fa: R4.identity(), plane: [0, 3], lo: -0.05, hi: stop }));
  for (let i = 0; i < 600; i++) w2.step();
  const m2 = R4.toRows(b2.rot), back = Math.atan2(m2[3][0] - m2[0][3], m2[0][0] + m2[3][3]);
  check('a hinge stop holds a plate past upright', Math.abs(rest - stop) < 0.01 && maxA < stop + 0.02 && Math.abs(back) < 0.06, `rests at ${(rest * 57.3).toFixed(2)}° (most ${(maxA * 57.3).toFixed(2)}°), short of upright falls back to ${(back * 57.3).toFixed(1)}°`);
}
for (const [s, n, i] of results) console.log(`${s}  ${n.padEnd(46)} ${i || ''}`);
const fails = results.filter(r => r[0] === 'FAIL').length;
console.log(fails ? `${fails} FAILED` : 'All checks passed.');
process.exit(fails ? 1 : 0);
