// 4D rigid bodies: 4D balls ("glomes") and tesseracts, any orientation in SO(4), with contacts, Coulomb friction,
// sleeping and buoyancy. Fixed step; sequential impulses with warm starting.
//
// Facts used:
// - Angular velocity is a bivector ω (a rate in each of the six planes); a point at offset r from the centre moves
//   at v = Ω·r (so4.bivApply). The rotational energy is ½·I·|ω|², and for our shapes the inertia is isotropic:
//   a ball has I = m r²/3 and a tesseract I = m s²/6 (twice the second moment per axis). So torque-free bodies
//   spin at a constant ω, which may be a double rotation in two planes at once, and so4.step integrates it exactly.
// - An impulse J at offset r changes ω by wedge(J, r)/I (checked: the energy change equals J·v).
// - Friction acts in the 3D tangent space of the contact normal: the tangential impulse is a vector there,
//   clamped in length to μ times the normal impulse.
import { rot as R4, wedge, bivApply, step as rotStep } from './so4.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s, a[3] * s];
const len = a => Math.sqrt(dot(a, a));

let nextId = 1;
export const ROLL_RES = 0.08;   // rolling resistance coefficient of the ground (soft soil and grass)
export const DENSITY = { stone: 2600, metal: 7800, wood: 450, water: 1000 };   // kg per m⁴ (4D densities)
export const VOLUME = { glome: r => Math.PI * Math.PI / 2 * r ** 4, tesseract: s => s ** 4 };

export function makeBody({ shape, size, mass, density, pos, vel = [0, 0, 0, 0], rot = R4.identity(), omega = [0, 0, 0, 0, 0, 0], mu = 0.9, restitution = 0.15, kind = shape, ...extra }) {
  const m = mass ?? density * VOLUME[shape](size);
  const I = shape === 'glome' ? m * size * size / 3 : m * size * size / 6;
  return {
    id: nextId++, shape, size, half: shape === 'tesseract' ? size / 2 : size, kind,
    m, invM: 1 / m, I, invI: 1 / I, pos: pos.slice(), vel: vel.slice(), rot, omega: omega.slice(), mu, e: restitution,
    bound: shape === 'tesseract' ? size : size,            // bounding radius (a tesseract's circumradius is its side)
    sleeping: false, sleepT: 0, kinematic: false, ...extra,
  };
}
// The 16 vertices of a tesseract in its own frame (±h on every axis).
const CORNERS = [];
for (let i = 0; i < 16; i++) CORNERS.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
const axesOf = b => { const M = R4.toRows(b.rot); return [0, 1, 2, 3].map(j => [M[0][j], M[1][j], M[2][j], M[3][j]]); };   // columns
const vertsOf = b => { const A = axesOf(b), h = b.half; return CORNERS.map(c => [0, 1, 2, 3].map(i => b.pos[i] + h * (c[0] * A[0][i] + c[1] * A[1][i] + c[2] * A[2][i] + c[3] * A[3][i]))); };
// point -> body frame coordinates (the transpose of the rotation)
const toLocal = (b, A, p) => { const d = sub(p, b.pos); return [dot(d, A[0]), dot(d, A[1]), dot(d, A[2]), dot(d, A[3])]; };

// Velocity of the material point of b at world point p.
const pointVel = (b, p) => b ? add(b.vel, bivApply(b.omega, sub(p, b.pos))) : [0, 0, 0, 0];
function applyImpulse(b, J, p) {
  if (!b || b.kinematic || b.invM === 0) return;
  for (let i = 0; i < 4; i++) b.vel[i] += J[i] * b.invM;
  const dw = wedge(J, sub(p, b.pos));
  for (let i = 0; i < 6; i++) b.omega[i] += dw[i] * b.invI;
}
// Effective inverse mass along unit direction n at offset r: 1/m + (|r|² − (r·n)²)/I.
const kEff = (b, r, n) => (!b || b.kinematic) ? 0 : b.invM + (dot(r, r) - dot(r, n) ** 2) * b.invI;

// ---------- contact generation ----------
// A contact: bodies a (may be null for the environment) and b, the point, the normal from a to b, the depth.
function envContacts(b, env, out) {
  if (b.shape === 'glome') {
    const s = env(b.pos);
    if (s.d < b.size + 0.02) out.push({ a: null, b, p: sub(b.pos, scale(s.n, b.size)), n: s.n, depth: b.size - s.d, key: `e${b.id}` });
    return;
  }
  const s0 = env(b.pos);
  if (s0.d > b.bound + 0.05) return;                        // far from everything
  const V = vertsOf(b), found = [];
  V.forEach((p, i) => { const s = env(p); if (s.d < 0.02) found.push({ a: null, b, p, n: s.n, depth: -s.d, key: `e${b.id}v${i}` }); });
  found.sort((x, y) => y.depth - x.depth);
  for (const c of found.slice(0, 8)) out.push(c);
}
function pairContacts(A, B, out) {
  const d = sub(B.pos, A.pos);
  if (dot(d, d) > (A.bound + B.bound + 0.05) ** 2) return;
  if (A.shape === 'glome' && B.shape === 'glome') {
    const l = len(d), depth = A.size + B.size - l;
    if (depth > -0.02 && l > 1e-9) { const n = scale(d, 1 / l); out.push({ a: A, b: B, p: add(A.pos, scale(n, A.size - depth / 2)), n, depth, key: `${A.id}g${B.id}` }); }
    return;
  }
  if (A.shape === 'glome' || B.shape === 'glome') {
    const [g, x] = A.shape === 'glome' ? [A, B] : [B, A];
    const Ax = axesOf(x), q = toLocal(x, Ax, g.pos), h = x.half;
    const c = q.map(v => Math.max(-h, Math.min(h, v)));
    const inside = c.every((v, i) => v === q[i]);
    let n, depth, p;
    if (!inside) {
      const cw = add(x.pos, add(add(scale(Ax[0], c[0]), scale(Ax[1], c[1])), add(scale(Ax[2], c[2]), scale(Ax[3], c[3]))));
      const dd = sub(g.pos, cw), l = len(dd);
      if (l > g.size + 0.02 || l < 1e-9) return;
      n = scale(dd, 1 / l); depth = g.size - l; p = cw;           // n: box -> glome
    } else {                                                       // centre inside the box: push out the nearest face
      let k = 0; for (let i = 1; i < 4; i++) if (h - Math.abs(q[i]) < h - Math.abs(q[k])) k = i;
      n = scale(Ax[k], Math.sign(q[k]) || 1); depth = g.size + h - Math.abs(q[k]); p = g.pos;
    }
    if (g === B) out.push({ a: x, b: g, p, n, depth, key: `${x.id}x${g.id}` });
    else out.push({ a: g, b: x, p, n: scale(n, -1), depth, key: `${g.id}x${x.id}` });
    return;
  }
  // tesseract–tesseract: separating axes among the eight face normals; the box owning the least-overlap axis is the
  // reference, and the other's vertices that reach below its face (clamped onto the face) are the contact points.
  // (Edge–edge axes are not tested: an approximation that matters only for boxes meeting edge-on.)
  const AA = axesOf(A), AB = axesOf(B), hA = A.half, hB = B.half;
  let best = null;
  for (const [axes, owner] of [[AA, 'A'], [AB, 'B']]) for (let k = 0; k < 4; k++) {
    const ax = axes[k], s = dot(d, ax);
    let rA = 0, rB = 0;
    for (let j = 0; j < 4; j++) { rA += hA * Math.abs(dot(AA[j], ax)); rB += hB * Math.abs(dot(AB[j], ax)); }
    const ov = rA + rB - Math.abs(s);
    if (ov < -0.02) return;                                        // separated
    const score = ov * (owner === 'A' ? 1 : 1.0001);
    if (!best || score < best.score) best = { score, ov, ax: scale(ax, s >= 0 ? 1 : -1), owner, k };
  }
  const n = best.ax;                                               // from A to B
  const [ref, inc, Aref, hr, sign] = best.owner === 'A' ? [A, B, AA, hA, 1] : [B, A, AB, hB, -1];
  const nr = scale(n, sign);                                       // the reference face's outward normal, toward inc
  const found = [];
  vertsOf(inc).forEach((v, i) => {
    const q = toLocal(ref, Aref, v);
    const depth = hr - dot(sub(v, ref.pos), nr);
    if (depth < -0.02) return;
    // clamp the tangential coordinates onto the reference face
    const k = best.k;
    for (let j = 0; j < 4; j++) if (j !== k) q[j] = Math.max(-hr, Math.min(hr, q[j]));
    const pf = add(ref.pos, add(add(scale(Aref[0], q[0]), scale(Aref[1], q[1])), add(scale(Aref[2], q[2]), scale(Aref[3], q[3]))));
    found.push({ a: A, b: B, p: pf, n, depth, key: `${A.id}t${B.id}${best.owner}${best.k}v${i}` });
  });
  found.sort((x, y) => y.depth - x.depth);
  for (const c of found.slice(0, 8)) out.push(c);
}

// ---------- buoyancy ----------
// ∫(r² − x²)^{3/2} dx, for the 4-ball's cross-sections (3-balls of volume (4π/3)(r² − x²)^{3/2})
const capF = (x, r) => (x / 8) * (5 * r * r - 2 * x * x) * Math.sqrt(Math.max(0, r * r - x * x)) + (3 * r ** 4 / 8) * Math.asin(Math.max(-1, Math.min(1, x / r)));
export function ballSubmerged(r, y) {          // volume of a 4-ball of radius r below a plane y above its centre
  const yy = Math.max(-r, Math.min(r, y));
  return (4 * Math.PI / 3) * (capF(yy, r) - capF(-r, r));
}
const GRID = []; for (let i = 0; i < 256; i++) GRID.push([(i & 3) - 1.5, ((i >> 2) & 3) - 1.5, ((i >> 4) & 3) - 1.5, ((i >> 6) & 3) - 1.5].map(v => v / 2));
function buoyancy(b, water, g, dt) {
  const up = water.up(b.pos), y = -water.height(b.pos);      // water surface height above the centre
  if (y < -b.bound) return 0;
  let V, cb = b.pos;
  if (b.shape === 'glome') V = ballSubmerged(b.size, y);
  else {
    // tesseract: 4⁴ sub-cells against the water's surface, taken as flat across the body (its curvature over a
    // metre is a millimetre). Each cell is wet in proportion to how deep it sits (exact for a level cell, close for a
    // tilted one), so the volume changes smoothly however shallow the draft; the wet part's centre lies below the
    // cell's by the dry share of its height.
    const Ax = axesOf(b), h = b.half, a = Ax.map(A => dot(A, up));
    const e = (h / 4) * (Math.abs(a[0]) + Math.abs(a[1]) + Math.abs(a[2]) + Math.abs(a[3]));   // a cell's half-height
    let n = 0, c = [0, 0, 0, 0];
    for (const q of GRID) {
      const z = h * (q[0] * a[0] + q[1] * a[1] + q[2] * a[2] + q[3] * a[3]);
      const f = Math.max(0, Math.min(1, (y - z + e) / (2 * e)));
      if (f <= 0) continue;
      const p = add(b.pos, add(add(scale(Ax[0], q[0] * h), scale(Ax[1], q[1] * h)), add(scale(Ax[2], q[2] * h), scale(Ax[3], q[3] * h))));
      n += f; c = add(c, scale(sub(p, scale(up, e * (1 - f))), f));
    }
    V = (n / 256) * b.size ** 4;
    if (n) cb = scale(c, 1 / n);
  }
  if (V <= 0) return 0;
  const F = water.density * g * V;
  applyImpulse(b, scale(up, F * dt), cb);
  const frac = V / VOLUME[b.shape](b.size);
  // water's drag (an approximation): a rate set by the mass of water displaced against the body's own, so anything
  // afloat settles alike however light it is, and a sinking stone is slowed less. Boats keep their own drag across
  // the water (boats.js) and get only this one's damping of bobbing and rolling.
  const damp = Math.exp(-1.5 * water.density * V * b.invM * dt);
  if (!b.boat) b.vel = b.vel.map(v => v * damp);
  else { const vu = dot(b.vel, up); b.vel = sub(b.vel, scale(up, vu * (1 - damp))); }
  b.omega = b.omega.map(v => v * damp);
  return frac;
}

// ---------- the world ----------
export class World {
  constructor({ accel, env, dt = 1 / 120, iterations = 12 }) {
    this.accel = accel; this.env = env; this.dt = dt; this.iterations = iterations;
    this.bodies = []; this.water = null; this.warm = new Map();
  }
  add(b) { this.bodies.push(b); b.sleeping = false; b.sleepT = 0; return b; }
  remove(b) { const i = this.bodies.indexOf(b); if (i >= 0) this.bodies.splice(i, 1); }
  wake(b) { if (b) { b.sleeping = false; b.sleepT = 0; } }

  step() {
    const dt = this.dt, bodies = this.bodies;
    for (const b of bodies) { b.prevPos = b.pos.slice(); b.prevRot = b.rot; }     // (for drawing between steps)
    // 1. forces
    for (const b of bodies) {
      if (b.sleeping || b.kinematic) continue;
      const a = this.accel(b.pos, b.vel);
      for (let i = 0; i < 4; i++) b.vel[i] += a[i] * dt;
      if (this.water) b.wet = buoyancy(b, this.water, len(a), dt);
    }
    // 2. contacts
    const cs = [];
    for (const b of bodies) if (!b.sleeping && !b.kinematic) envContacts(b, this.env, cs);
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const A = bodies[i], B = bodies[j];
      if ((A.sleeping || A.kinematic) && (B.sleeping || B.kinematic)) continue;
      if (A.ghostly || B.ghostly) continue;
      pairContacts(A, B, cs);
    }
    // a moving body wakes a sleeping one it touches
    for (const c of cs) for (const [s, o] of [[c.a, c.b], [c.b, c.a]]) {
      if (s && s.sleeping && o && !o.sleeping && (len(o.vel) > 0.05 || len(o.omega) > 0.05)) this.wake(s);
    }
    // 3. prepare (warm start from last step's impulses on the same features)
    const warm = new Map();
    this.impacts = [];                    // new contacts that strike (for sound): one per pair, the hardest
    const struck = new Map();
    for (const c of cs) {
      c.ra = c.a ? sub(c.p, c.a.pos) : null; c.rb = sub(c.p, c.b.pos);
      c.kn = kEff(c.a, c.ra, c.n) + kEff(c.b, c.rb, c.n);
      const vn = dot(sub(pointVel(c.b, c.p), pointVel(c.a, c.p)), c.n);
      if (vn < -0.8 && !this.warm.has(c.key)) {
        const k = `${c.a ? c.a.id : 'e'}:${c.b.id}`, prev = struck.get(k);
        if (!prev || -vn > prev.speed) struck.set(k, { a: c.a, b: c.b, p: c.p, speed: -vn });
      }
      c.target = vn < -1 ? -Math.min(c.a ? c.a.e : 0.2, c.b.e) * vn : 0;
      c.bias = Math.min(0.8, 0.2 / dt * Math.max(0, c.depth - 0.004));   // capped: deep overlaps ease out, never explode
      c.mu = c.a ? Math.sqrt(c.a.mu * c.b.mu) : Math.sqrt(0.9 * c.b.mu);
      const w = this.warm.get(c.key);
      c.ln = 0; c.lt = [0, 0, 0, 0];
      if (w && c.kn > 0) {
        c.ln = w.ln * 0.9; c.lt = scale(w.lt, 0.9);
        const J = add(scale(c.n, c.ln), c.lt);
        applyImpulse(c.b, J, c.p); applyImpulse(c.a, scale(J, -1), c.p);
      }
    }
    // 4. sequential impulses
    for (let it = 0; it < this.iterations; it++) for (const c of cs) {
      if (c.kn <= 0) continue;
      if ((!c.a || c.a.sleeping || c.a.kinematic) && (c.b.sleeping || c.b.kinematic)) continue;
      let vrel = sub(pointVel(c.b, c.p), pointVel(c.a, c.p));
      const vn = dot(vrel, c.n);
      const ln = Math.max(0, c.ln + (c.target + c.bias - vn) / c.kn), dln = ln - c.ln;
      c.ln = ln;
      if (dln) { const J = scale(c.n, dln); applyImpulse(c.b, J, c.p); applyImpulse(c.a, scale(J, -1), c.p); }
      // friction in the 3D tangent space
      vrel = sub(pointVel(c.b, c.p), pointVel(c.a, c.p));
      const vt = sub(vrel, scale(c.n, dot(vrel, c.n))), vtl = len(vt);
      if (vtl < 1e-9) continue;
      const t = scale(vt, 1 / vtl), kt = kEff(c.a, c.ra, t) + kEff(c.b, c.rb, t);
      let lt = sub(c.lt, scale(t, vtl / kt));
      const lim = c.mu * c.ln, ltl = len(lt);
      if (ltl > lim) lt = scale(lt, lim / ltl);
      const dJ = sub(lt, c.lt); c.lt = lt;
      applyImpulse(c.b, dJ, c.p); applyImpulse(c.a, scale(dJ, -1), c.p);
    }
    for (const c of cs) warm.set(c.key, { ln: c.ln, lt: c.lt });
    for (const v of struck.values()) this.impacts.push(v);
    // Rolling resistance of soft ground (soil and grass give under a rolling ball): a force c·N against the rolling
    // velocity of a ball on the environment. An approximation of the ground's deformation, which we don't model.
    // (On stone, a fixed block, it is a hard surface's: 0.02.)
    for (const c of cs) {
      if (c.ln <= 0) continue;
      const onFixed = c.a && c.a.fixed && c.b.shape === 'glome' ? 1 : c.a && c.b.fixed && c.a.shape === 'glome' ? 2 : 0;
      if ((c.a && !onFixed) || (!c.a && c.b.shape !== 'glome')) continue;
      const b = onFixed === 2 ? c.a : c.b, rr = onFixed ? 0.02 : ROLL_RES;
      if (b.kinematic) continue;
      const vt = sub(b.vel, scale(c.n, dot(b.vel, c.n))), l = len(vt);
      if (l < 1e-6) continue;
      const dv = Math.min(l, rr * c.ln * b.invM);
      b.vel = sub(b.vel, scale(vt, dv / l));
      const k = 1 - dv / l;
      for (let i = 0; i < 6; i++) b.omega[i] *= k;            // and the spin with it (it keeps rolling without slipping)
    }
    this.warm = warm;
    this.contacts = cs;
    // 5. integrate, and sleep
    for (const b of bodies) {
      if (b.sleeping || b.kinematic) continue;
      for (let i = 0; i < 4; i++) b.pos[i] += b.vel[i] * dt;
      b.rot = R4.renorm(rotStep(b.rot, b.omega, dt));
      const floating = b.wet > 0 && b.wet < 0.999;               // a floating body bobs; it never sleeps
      const still = !floating && !b.held && len(b.vel) < 0.06 && len(b.omega) < 0.08;
      b.sleepT = still ? b.sleepT + dt : 0;
      if (b.sleepT > 0.6) { b.sleeping = true; b.vel = [0, 0, 0, 0]; b.omega = [0, 0, 0, 0, 0, 0]; }
    }
  }

  // Analytic ray casts: ray–ball, and ray–tesseract by a 4D slab test in the body's frame.
  raycast(ro, rd, tMax = Infinity, skip = null) {
    let best = null;
    for (const b of this.bodies) {
      if (b === skip) continue;
      let t = Infinity, n = null;
      const oc = sub(ro, b.pos);
      if (b.shape === 'glome') {
        const bb = dot(oc, rd), c = dot(oc, oc) - b.size * b.size, D = bb * bb - c;
        if (D > 0) { t = -bb - Math.sqrt(D); if (t > 0) n = scale(add(oc, scale(rd, t)), 1 / b.size); }
      } else {
        const Ax = axesOf(b), o = Ax.map(a => dot(oc, a)), d = Ax.map(a => dot(rd, a)), h = b.half;
        let tn = -Infinity, tf = Infinity, k = -1;
        for (let i = 0; i < 4; i++) {
          if (Math.abs(d[i]) < 1e-12) { if (Math.abs(o[i]) > h) { tn = Infinity; break; } continue; }
          let t1 = (-h - o[i]) / d[i], t2 = (h - o[i]) / d[i];
          if (t1 > t2) [t1, t2] = [t2, t1];
          if (t1 > tn) { tn = t1; k = i; }
          tf = Math.min(tf, t2);
        }
        if (tn < tf && tn > 0) { t = tn; n = scale(Ax[k], -Math.sign(d[k])); }
      }
      if (n && t < tMax && (!best || t < best.t)) best = { body: b, t, n };
    }
    return best;
  }

  // The player's capsule (segment a–b, radius) against every body: contact points, normals (body -> capsule).
  capsuleContacts(a, b, radius) {
    const out = [], ab = sub(b, a), L2 = dot(ab, ab);
    for (const B of this.bodies) {
      if (B.held || B.ghostly) continue;
      const t = Math.max(0, Math.min(1, dot(sub(B.pos, a), ab) / L2)), q = add(a, scale(ab, t));
      const dq = sub(q, B.pos);
      if (dot(dq, dq) > (B.bound + radius + 0.05) ** 2) continue;
      if (B.shape === 'glome') {
        const l = len(dq);
        if (l < B.size + radius && l > 1e-9) out.push({ body: B, point: add(B.pos, scale(dq, B.size / l)), n: scale(dq, 1 / l), depth: B.size + radius - l, q });
      } else {
        // the nearest point of the box to the nearest point of the segment (refined once)
        const Ax = axesOf(B), h = B.half;
        let qq = q;
        for (let it = 0; it < 2; it++) {
          const loc = toLocal(B, Ax, qq).map(v => Math.max(-h, Math.min(h, v)));
          const pb = add(B.pos, add(add(scale(Ax[0], loc[0]), scale(Ax[1], loc[1])), add(scale(Ax[2], loc[2]), scale(Ax[3], loc[3]))));
          const tt = Math.max(0, Math.min(1, dot(sub(pb, a), ab) / L2));
          qq = add(a, scale(ab, tt));
          if (it === 1) {
            const dd = sub(qq, pb), l = len(dd);
            if (l < radius && l > 1e-9) out.push({ body: B, point: pb, n: scale(dd, 1 / l), depth: radius - l, q: qq });
            else if (l <= 1e-9) {                                  // the axis is inside the box: out through the nearest face
              const loc = toLocal(B, Ax, qq);
              let k = 0; for (let i = 1; i < 4; i++) if (h - Math.abs(loc[i]) < h - Math.abs(loc[k])) k = i;
              const n = scale(Ax[k], Math.sign(loc[k]) || 1);
              out.push({ body: B, point: qq, n, depth: radius + h - Math.abs(loc[k]), q: qq });
            }
          }
        }
      }
    }
    return out;
  }

  // Look-ahead: a deep copy to simulate forward (the ghost of a released object).
  clone() {
    const w = new World({ accel: this.accel, env: this.env, dt: this.dt, iterations: 8 });
    w.water = this.water;
    w.bodies = this.bodies.map(b => ({ ...b, pos: b.pos.slice(), vel: b.vel.slice(), omega: b.omega.slice(), rot: { l: b.rot.l.slice(), r: b.rot.r.slice() } }));
    return w;
  }
}
export { applyImpulse, axesOf, vertsOf };
