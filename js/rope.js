// Rope: a chain of particles joined by distance constraints, solved by position-based dynamics (PBD), colliding
// with the ground and with itself. In four dimensions a 1D strand can always pass another one (or itself) by moving
// through ana: two curves in 4D generically miss each other, so a knot has nothing to hold on to and falls open.
// The rope is not told this; it follows from its contacts being 4D.
// A rope may close on itself (extra links: an eye spliced into its end), and may be tied to a body: the tied
// particle is that body's point, and moves it as a particle of the body's own effective mass there would move, so a
// heavy thing on a rope pulls it taut and is held by it (the correction it takes becomes an impulse on the body).
import { kEff, applyImpulse } from './bodies.js';
import { bivApply } from './so4.js';
import { rot as R4 } from './so4.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s, a[3] * s];
const len = a => Math.sqrt(dot(a, a));

// Closest points between segments p1–q1 and p2–q2 (any dimension): returns parameters s, t in [0, 1].
export function segSeg(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  if (a < 1e-12 && e < 1e-12) return [0, 0];
  if (a < 1e-12) { s = 0; t = Math.max(0, Math.min(1, f / e)); }
  else {
    const c = dot(d1, r);
    if (e < 1e-12) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
    else {
      const b = dot(d1, d2), den = a * e - b * b;
      s = den > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }
  return [s, t];
}

export class Rope {
  // points: initial positions; radius: the strand's thickness; env(p) -> { d, n } the ground's signed distance;
  // links: extra links [i, j] beyond the chain's (their rest length as laid out); mass: of each particle (kg)
  constructor(points, { radius = 0.035, accel = () => [0, 0, 0, 0], env = null, damping = 0.995, links = [], mass = 1 } = {}) {
    this.x = points.map(p => p.slice()); this.v = points.map(() => [0, 0, 0, 0]);
    this.E = []; for (let i = 0; i + 1 < points.length; i++) this.E.push([i, i + 1]);
    for (const l of links) this.E.push(l.slice());
    this.L0 = this.E.map(([i, j]) => len(sub(points[j], points[i])));
    this.r = radius; this.accel = accel; this.env = env; this.damping = damping; this.mass = mass;
    this.pins = new Map();          // particle index -> position it is held at
    this.ties = [];                 // { i, body, c }: particle i is the point c (in the body's frame, from its centre)
    this.planar = null;             // for comparison only: confine to a 3D slice (normal vector), as a 3D rope would be
    this.iterations = 10;
  }
  get length() { return this.L0.slice(0, this.x.length - 1).reduce((a, b) => a + b, 0); }
  // One step of dt, in substeps (small steps converge far better than more iterations: a heavy body on a light rope
  // needs them). A tied particle is its body's point, moving with it; it takes corrections as the body would,
  // weighed by the body's effective inverse mass there along the link against a particle's own, and what it takes
  // is given to the body at once as an impulse, so the next substep sees the body moving as the rope has made it.
  step(dt) {
    const n = this.x.length, E = this.E, k = this.substeps || 1, h = dt / k, wp = 1 / this.mass;
    this.prevX = this.x.map(p => p.slice());              // (for drawing between steps)
    const tie = new Map();
    for (const t of this.ties) { const r = R4.apply(t.body.rot, t.c); tie.set(t.i, { t, r, p: add(t.body.pos, r) }); }
    const w = (i, d) => { if (this.pins.has(i)) return 0; const q = tie.get(i); if (!q) return 1; const l = len(d); return l < 1e-9 ? 0 : kEff(q.t.body, q.r, scale(d, 1 / l)) / wp; };
    this.pull = 0;
    const envAt = new Array(n).fill(null);
    for (let sub_ = 0; sub_ < k; sub_++) {
      const prev = this.x.map(p => p.slice());
      for (let i = 0; i < n; i++) {
        const q = tie.get(i);
        if (q) { const v = add(q.t.body.vel, bivApply(q.t.body.omega, q.r)); prev[i] = q.p.slice(); q.p = add(q.p, scale(v, h)); this.x[i] = q.p.slice(); q.moved = [0, 0, 0, 0]; continue; }
        const a = this.accel(this.x[i]);
        for (let c = 0; c < 4; c++) { this.v[i][c] = (this.v[i][c] + a[c] * h) * this.damping ** (1 / k); this.x[i][c] += this.v[i][c] * h; }
      }
      for (let it = 0; it < this.iterations; it++) {
        for (const [i, p] of this.pins) this.x[i] = p.slice();
        // stretch: each link keeps its length
        for (let e = 0; e < E.length; e++) {
          const [i, j] = E[e], d = sub(this.x[j], this.x[i]), l = len(d);
          if (l < 1e-9) continue;
          const wi = w(i, d), wj = w(j, d);
          if (wi + wj === 0) continue;
          const corr = scale(d, (l - this.L0[e]) / l / (wi + wj));
          if (wi) { this.x[i] = add(this.x[i], scale(corr, wi)); const q = tie.get(i); if (q) q.moved = add(q.moved, scale(corr, wi)); }
          if (wj) { this.x[j] = sub(this.x[j], scale(corr, wj)); const q = tie.get(j); if (q) q.moved = sub(q.moved, scale(corr, wj)); }
        }
        // self-contact (every substep, or every few): links that share no particle are kept two radii apart, pushed
        // along the line between their nearest points (a cheap test first: links whose middles are far apart can't touch)
        const want = 2 * this.r, every = this.selfEvery || 1;
        if ((sub_ + 1) % every === 0 || sub_ === k - 1) for (let e = 0; e < E.length; e++) for (let f = e + 1; f < E.length; f++) {
          const [i, i1] = E[e], [j, j1] = E[f];
          if (i === j || i === j1 || i1 === j || i1 === j1) continue;
          const xi = this.x[i], xi1 = this.x[i1], xj = this.x[j], xj1 = this.x[j1];
          const m0 = (xi[0] + xi1[0] - xj[0] - xj1[0]) / 2, m1 = (xi[1] + xi1[1] - xj[1] - xj1[1]) / 2, m2 = (xi[2] + xi1[2] - xj[2] - xj1[2]) / 2, m3 = (xi[3] + xi1[3] - xj[3] - xj1[3]) / 2;
          const reachE = (this.L0[e] + this.L0[f]) / 2 + want;
          if (m0 * m0 + m1 * m1 + m2 * m2 + m3 * m3 > reachE * reachE) continue;
          const [s, t] = segSeg(xi, xi1, xj, xj1);
          const pi = add(xi, scale(sub(xi1, xi), s)), pj = add(xj, scale(sub(xj1, xj), t));
          const d = sub(pi, pj), l = len(d);
          if (l >= want || l < 1e-12) continue;
          const push = scale(d, (want - l) / l * 0.5);
          const mv = (q, wt, sgn) => { if (!this.pins.has(q) && !tie.has(q)) this.x[q] = add(this.x[q], scale(push, sgn * wt)); };
          mv(i, 1 - s, 1); mv(i1, s, 1); mv(j, 1 - t, -1); mv(j1, t, -1);
        }
        // the ground
        if (this.env) for (let i = 0; i < n; i++) {
          if (tie.has(i) || this.pins.has(i)) { envAt[i] = null; continue; }
          const e = envAt[i] = this.env(this.x[i]);
          if (e.d < this.r) { this.x[i] = add(this.x[i], scale(e.n, this.r - e.d)); e.d = this.r; }
        }
      }
      if (this.planar) for (let i = 0; i < n; i++) this.x[i] = sub(this.x[i], scale(this.planar, dot(this.x[i], this.planar)));
      // what the rope did to a body it is tied to: an impulse there, now
      for (const q of tie.values()) {
        const l = len(q.moved); if (l < 1e-12) continue;
        const dir = scale(q.moved, 1 / l), kk = kEff(q.t.body, q.r, dir);
        if (kk <= 0) continue;
        const J = scale(dir, l / (kk * h));
        applyImpulse(q.t.body, J, q.p); q.p = add(q.p, q.moved);
        this.pull = Math.max(this.pull, len(J) / dt);
      }
      for (let i = 0; i < n; i++) {
        const e = envAt[i];
        if (e) {                                            // friction on the ground: slide slowly
          if (e.d < this.r + 0.01) { const dx = sub(this.x[i], prev[i]), dn = dot(dx, e.n); this.x[i] = add(prev[i], add(scale(e.n, dn), scale(sub(dx, scale(e.n, dn)), 0.6 ** (1 / k)))); }
        }
        this.v[i] = scale(sub(this.x[i], prev[i]), 1 / h);
      }
    }
  }
  // how far the rope is drawn out past its length, all told (what a hand holding it feels: pulled hard, it slips)
  strain() { let m = 0; this.E.forEach(([a, b], e) => { m += Math.max(0, len(sub(this.x[b], this.x[a])) - this.L0[e]); }); return m; }
}
