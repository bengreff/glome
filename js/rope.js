// Rope: a chain of particles joined by distance constraints, solved by position-based dynamics (PBD), colliding
// with the ground and with itself. In four dimensions a 1D strand can always pass another one (or itself) by moving
// through ana: two curves in 4D generically miss each other, so a knot has nothing to hold on to and falls open.
// The rope is not told this; it follows from its contacts being 4D.

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
  // points: initial positions; radius: the strand's thickness; env(p) -> { d, n } the ground's signed distance
  constructor(points, { radius = 0.035, accel = () => [0, 0, 0, 0], env = null, damping = 0.995 } = {}) {
    this.x = points.map(p => p.slice()); this.v = points.map(() => [0, 0, 0, 0]);
    this.L0 = []; for (let i = 0; i + 1 < points.length; i++) this.L0.push(len(sub(points[i + 1], points[i])));
    this.r = radius; this.accel = accel; this.env = env; this.damping = damping;
    this.pins = new Map();          // particle index -> position it is held at
    this.planar = null;             // for comparison only: confine to a 3D slice (normal vector), as a 3D rope would be
    this.iterations = 10;
  }
  get length() { return this.L0.reduce((a, b) => a + b, 0); }
  step(dt) {
    const n = this.x.length, prev = this.x.map(p => p.slice());
    for (let i = 0; i < n; i++) {
      const a = this.accel(this.x[i]);
      for (let k = 0; k < 4; k++) { this.v[i][k] = (this.v[i][k] + a[k] * dt) * this.damping; this.x[i][k] += this.v[i][k] * dt; }
    }
    for (let it = 0; it < this.iterations; it++) {
      for (const [i, p] of this.pins) this.x[i] = p.slice();
      // stretch: each link keeps its length
      for (let i = 0; i + 1 < n; i++) {
        const d = sub(this.x[i + 1], this.x[i]), l = len(d);
        if (l < 1e-9) continue;
        const wi = this.pins.has(i) ? 0 : 1, wj = this.pins.has(i + 1) ? 0 : 1;
        if (wi + wj === 0) continue;
        const corr = scale(d, (l - this.L0[i]) / l / (wi + wj));
        if (wi) this.x[i] = add(this.x[i], corr);
        if (wj) this.x[i + 1] = sub(this.x[i + 1], corr);
      }
      // self-contact: non-neighbouring links are kept two radii apart, pushed along the line between their nearest points
      for (let i = 0; i + 1 < n; i++) for (let j = i + 2; j + 1 < n; j++) {
        const [s, t] = segSeg(this.x[i], this.x[i + 1], this.x[j], this.x[j + 1]);
        const pi = add(this.x[i], scale(sub(this.x[i + 1], this.x[i]), s)), pj = add(this.x[j], scale(sub(this.x[j + 1], this.x[j]), t));
        const d = sub(pi, pj), l = len(d), want = 2 * this.r;
        if (l >= want || l < 1e-12) continue;
        const push = scale(d, (want - l) / l * 0.5);
        const mv = (k, w, sgn) => { if (!this.pins.has(k)) this.x[k] = add(this.x[k], scale(push, sgn * w)); };
        mv(i, 1 - s, 1); mv(i + 1, s, 1); mv(j, 1 - t, -1); mv(j + 1, t, -1);
      }
      // the ground
      if (this.env) for (let i = 0; i < n; i++) {
        const e = this.env(this.x[i]);
        if (e.d < this.r) this.x[i] = add(this.x[i], scale(e.n, this.r - e.d));
      }
      if (this.planar) for (let i = 0; i < n; i++) this.x[i] = sub(this.x[i], scale(this.planar, dot(this.x[i], this.planar)));
    }
    for (let i = 0; i < n; i++) {
      if (this.env) {                                       // friction on the ground: slide slowly
        const e = this.env(this.x[i]);
        if (e.d < this.r + 0.01) { const dx = sub(this.x[i], prev[i]), dn = dot(dx, e.n); this.x[i] = add(prev[i], add(scale(e.n, dn), scale(sub(dx, scale(e.n, dn)), 0.6))); }
      }
      this.v[i] = scale(sub(this.x[i], prev[i]), 1 / dt);
    }
  }
}
