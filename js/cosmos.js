// The universe at large: space is R³ × S¹ (the fourth direction closes every L metres, "the hoop"), with one star
// and two planets. This module knows where everything is at a given time, how the home planet spins, and the
// exact gravity of every mass together with all of its images round the hoop.
//
// Frames. The INERTIAL frame has the star at the origin and the hoop along its fourth axis (e_w). Planets A and B
// move on prescribed circles in the x–y plane (w = 0). Planet A's BODY frame turns with its double spin: a point
// fixed on A has body coordinates x_b and inertial coordinates  x = c_A(t) + M0 · S(t) · x_b,  where S(t) turns the
// body planes (0,1) and (2,3) by w1·t and w2·t. The game lives in A's body frame while you are on A (the terrain
// is static there); flight is integrated in the inertial frame.
import { LAWS, TRUE_LAWS } from './laws.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const TAU = 2 * Math.PI;

// ---------- the exact field of a mass and all its images round the hoop ----------
// Summing a 4D point mass over its images at w + kL has a closed form (PHYSICS.md):
//   Φ(ρ, w) = −(π G₄M / (2Lρ)) · sinh(2πρ/L) / (cosh(2πρ/L) − cos(2πw/L)),
// where ρ is the distance in the three open directions and w the offset round the hoop. This returns the
// acceleration −∇Φ at displacement d from the mass (any frame), given the unit hoop axis h in that frame.
// Checked against a direct sum over 4·10⁵ images to 1e-14 (tools: scratch grav.py).
export function gHoop(d, GM, h, L = LAWS.L, out = [0, 0, 0, 0]) {
  const w0 = dot(d, h), w = w0 - L * Math.round(w0 / L);
  const p0 = d[0] - w0 * h[0], p1 = d[1] - w0 * h[1], p2 = d[2] - w0 * h[2], p3 = d[3] - w0 * h[3];
  const rho = Math.hypot(p0, p1, p2, p3), k = TAU / L, pref = Math.PI * GM / (2 * L);
  const x = k * rho, S = Math.sinh(x), C = Math.cosh(x), c = Math.cos(k * w), s = Math.sin(k * w), D = C - c;
  let gr = 0, gw;
  if (rho > 1e-9) {
    // kC/ρ − S/ρ² cancels badly for small ρ: use its series (k/ρ)(x²/3 + x⁴/30 + x⁶/840) there
    const f = x < 0.1 ? (k / rho) * x * x * (1 / 3 + x * x * (1 / 30 + x * x / 840)) : k * C / rho - S / (rho * rho);
    gr = pref * (f / D - k * S * S / (rho * D * D));             // along the open directions (negative: inward)
    gw = -pref * k * S * s / (rho * D * D);                       // along the hoop
  } else gw = -pref * k * k * s / (D * D);                        // on the axis: the limit S/ρ → k
  const ir = rho > 1e-9 ? gr / rho : 0;
  out[0] = p0 * ir + gw * h[0]; out[1] = p1 * ir + gw * h[1]; out[2] = p2 * ir + gw * h[2]; out[3] = p3 * ir + gw * h[3];
  return out;
}

// The same with the 3D law (1/r², the console's alternative): the image sum of r̂/r² has no elementary closed
// form, so sum 2K+1 images exactly and add the far tail as a uniform line density (error ~ (ρ/KL)², below 1e-6).
function gHoop3D(d, GM, h, L, out) {
  const w0 = dot(d, h), w = w0 - L * Math.round(w0 / L);
  const p = [d[0] - w0 * h[0], d[1] - w0 * h[1], d[2] - w0 * h[2], d[3] - w0 * h[3]], rho = Math.hypot(...p);
  const K = 40;
  let gr = 0, gw = 0;
  for (let j = -K; j <= K; j++) {
    const dw = w - j * L, r2 = rho * rho + dw * dw, r3 = r2 * Math.sqrt(r2);
    gr -= GM * rho / r3; gw -= GM * dw / r3;
  }
  // tail |j| > K: a line of density GM/L from |w| = (K+½)L outward pulls in ρ by 2(GM/L)·(1/ρ)·(1 − cos α) ≈ (GM/L)·ρ/((K+½)L)²
  const Lt = (K + 0.5) * L;
  gr -= (GM / L) * rho / (Lt * Lt);
  const ir = rho > 1e-9 ? gr / rho : 0;
  for (let i = 0; i < 4; i++) out[i] = p[i] * ir + gw * h[i];
  return out;
}

// The field of a uniform ball (radius R) and its images. Inside the ball the 4D shell theorem gives g = −G₄M r/R⁴
// for the ball itself; its images still act as point masses.
const tmp = [0, 0, 0, 0];
export function gBall(d, GM, R, h, out = [0, 0, 0, 0]) {
  GM *= LAWS.G_SCALE;
  const L = LAWS.L, dim = LAWS.GRAV_DIM;
  const r = Math.sqrt(dot(d, d));
  const field = dim === 3 ? (dd, o) => gHoop3D(dd, GM, h, L, o) : (dd, o) => gHoop(dd, GM, h, L, o);
  // GM for the 3D law is chosen so the pull at the surface is unchanged: g = GM₄/R³ = GM₃/R², GM₃ = GM₄/R
  if (dim === 3) GM = GM / R;
  if (r >= R) return field(d, out);
  field(d, out);
  const k = dim === 3 ? GM / (r * r * r) : GM / (r * r * r * r);    // remove the point mass's own term ...
  const kin = dim === 3 ? GM / (R * R * R) : GM / (R * R * R * R);  // ... and put in the uniform ball's interior field
  for (let i = 0; i < 4; i++) out[i] += (k - kin) * d[i];
  return out;
}

// ---------- the bodies ----------
export const GM = {
  A: () => LAWS.G_SURF * LAWS.R_A ** 3,
  star: () => LAWS.STAR_G_SURF * LAWS.STAR_R ** 3,
  B: () => LAWS.B_G_SURF * LAWS.R_B ** 3,
};
const E_W = [0, 0, 0, 1];

// Circular speed round the star at radius a, from the exact field (images included): v²/a = |g(a)|. The planets'
// orbits are prescribed from the TRUE laws, so the console's dials move you and your objects, not the planets.
const rates = {};
function orbitRate(a) {
  if (!(a in rates)) {
    const saved = { ...LAWS }; Object.assign(LAWS, TRUE_LAWS);
    rates[a] = Math.sqrt(-gBall([a, 0, 0, 0], GM.star(), LAWS.STAR_R, E_W)[0] / a);
    Object.assign(LAWS, saved);
  }
  return rates[a];
}
export function orbitOf(which, t) {
  const a = which === 'A' ? LAWS.ORBIT_A : LAWS.ORBIT_B, ph = which === 'A' ? 0 : LAWS.B_PHASE;
  const W = orbitRate(a), th = W * t + ph, c = Math.cos(th), s = Math.sin(th);
  return { c: [a * c, a * s, 0, 0], v: [-a * W * s, a * W * c, 0, 0], acc: [-a * W * W * c, -a * W * W * s, 0, 0], rate: W };
}

// A's orientation at t = 0: maps body axes to inertial ones. Chosen so the star starts in the body direction
// (1, 0, 1, 0)/√2 (as before the hoop sky existed) and the hoop axis lies at a slant to both spin planes.
const a = Math.SQRT1_2, ch = Math.cos(0.62), sh = Math.sin(0.62);
// rows of M0ᵀ: the body coordinates of the inertial axes e_x, e_y, e_z, e_w
const M0T = (() => {
  const ex = [-a, 0, -a, 0];                    // A starts at (+2000, 0, 0, 0), so the star lies along −e_x
  const ew = [0, ch, 0, sh];                    // the hoop axis, in the body frame, at t = 0
  const ey = [0, sh, 0, -ch];                   // A's orbital velocity direction
  let ez = [a, 0, -a, 0];
  // make M0 a proper rotation (determinant +1)
  const M = [ex, ey, ez, ew];
  const det = det4(M);
  if (det < 0) ez = ez.map(v => -v);
  return [ex, ey, ez, ew];
})();
function det4(m) {
  const s = (a, b, c, d, e, f, g, h, i) => a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  let r = 0;
  for (let j = 0; j < 4; j++) {
    const minor = [1, 2, 3].map(i => m[i].filter((_, k) => k !== j));
    r += (j % 2 ? -1 : 1) * m[0][j] * s(...minor[0], ...minor[1], ...minor[2]);
  }
  return r;
}

export const spinRates = () => { const w1 = TAU / LAWS.DAY1; return [w1, w1 * LAWS.RATIO]; };
// S(t)ᵀ v: undo the spin (inertial-aligned -> body)
function unspin(v, t, out = [0, 0, 0, 0]) {
  const [w1, w2] = spinRates(), c1 = Math.cos(w1 * t), s1 = Math.sin(w1 * t), c2 = Math.cos(w2 * t), s2 = Math.sin(w2 * t);
  out[0] = c1 * v[0] + s1 * v[1]; out[1] = -s1 * v[0] + c1 * v[1];
  out[2] = c2 * v[2] + s2 * v[3]; out[3] = -s2 * v[2] + c2 * v[3];
  return out;
}
function spin(v, t, out = [0, 0, 0, 0]) {
  const [w1, w2] = spinRates(), c1 = Math.cos(w1 * t), s1 = Math.sin(w1 * t), c2 = Math.cos(w2 * t), s2 = Math.sin(w2 * t);
  out[0] = c1 * v[0] - s1 * v[1]; out[1] = s1 * v[0] + c1 * v[1];
  out[2] = c2 * v[2] - s2 * v[3]; out[3] = s2 * v[2] + c2 * v[3];
  return out;
}
// inertial direction -> A's body frame, and back
export function dirToBody(v, t) {
  return unspin([0, 1, 2, 3].map(i => M0T[0][i] * v[0] + M0T[1][i] * v[1] + M0T[2][i] * v[2] + M0T[3][i] * v[3]), t);
}
export function dirToInertial(vb, t) {
  const u = spin(vb, t);
  return M0T.map(row => dot(row, u));
}
export function toBody(x, t) { const o = orbitOf('A', t).c; return dirToBody([x[0] - o[0], x[1] - o[1], x[2] - o[2], x[3] - o[3]], t); }
export function toInertial(xb, t) { const o = orbitOf('A', t).c, d = dirToInertial(xb, t); return [o[0] + d[0], o[1] + d[1], o[2] + d[2], o[3] + d[3]]; }
// velocities: v = v_A + M0·S·(W·x_b + v_b), with W the spin generator (W x = (−w1 x1, w1 x0, −w2 x3, w2 x2))
const spinVel = (xb, [w1, w2]) => [-w1 * xb[1], w1 * xb[0], -w2 * xb[3], w2 * xb[2]];
export function velToInertial(xb, vb, t) {
  const o = orbitOf('A', t), sv = spinVel(xb, spinRates());
  const d = dirToInertial([vb[0] + sv[0], vb[1] + sv[1], vb[2] + sv[2], vb[3] + sv[3]], t);
  return [o.v[0] + d[0], o.v[1] + d[1], o.v[2] + d[2], o.v[3] + d[3]];
}
export function velToBody(x, v, t) {
  const o = orbitOf('A', t), xb = toBody(x, t), d = dirToBody([v[0] - o.v[0], v[1] - o.v[1], v[2] - o.v[2], v[3] - o.v[3]], t);
  const sv = spinVel(xb, spinRates());
  return [d[0] - sv[0], d[1] - sv[1], d[2] - sv[2], d[3] - sv[3]];
}
export const hoopAxisBody = t => dirToBody(E_W, t);

// Unit direction from A's centre to the star, in A's body frame.
export function starDirBody(t) {
  const o = orbitOf('A', t).c, l = Math.hypot(...o);
  return dirToBody(o.map(v => -v / l), t);
}

// ---------- gravity ----------
// The total gravitational acceleration at an inertial point: the star, A and B, each with all its images.
export function gravityInertial(x, t, out = [0, 0, 0, 0]) {
  const A = orbitOf('A', t).c, B = orbitOf('B', t).c, g = [0, 0, 0, 0];
  gBall(x, GM.star(), LAWS.STAR_R, E_W, g);
  gBall([x[0] - A[0], x[1] - A[1], x[2] - A[2], x[3] - A[3]], GM.A(), LAWS.R_A, E_W, tmp); for (let i = 0; i < 4; i++) g[i] += tmp[i];
  gBall([x[0] - B[0], x[1] - B[1], x[2] - B[2], x[3] - B[3]], GM.B(), LAWS.R_B, E_W, tmp); for (let i = 0; i < 4; i++) g[i] += tmp[i];
  for (let i = 0; i < 4; i++) out[i] = g[i];
  return out;
}

// The acceleration of a free particle as seen in A's spinning body frame, exactly:
//   a_b = (M0·S)ᵀ (g(x) − a_A) − W²x_b − 2W v_b
// (gravity of all three bodies with their images, minus A's own orbital acceleration, plus the centrifugal and
// Coriolis terms of the spin). A's own field is computed directly in the body frame, where it is large and smooth;
// the star's and B's arrive as tides (the star's is about 0.09 m/s² on the surface).
export function accelBodyA(xb, vb, t, out = [0, 0, 0, 0]) {
  const h = hoopAxisBody(t);
  gBall(xb, GM.A(), LAWS.R_A, h, out);
  const x = toInertial(xb, t), o = orbitOf('A', t), B = orbitOf('B', t).c;
  const gs = gBall(x, GM.star(), LAWS.STAR_R, E_W), gb = gBall([x[0] - B[0], x[1] - B[1], x[2] - B[2], x[3] - B[3]], GM.B(), LAWS.R_B, E_W);
  const tide = dirToBody([0, 1, 2, 3].map(i => gs[i] + gb[i] - o.acc[i]), t);
  const [w1, w2] = spinRates();
  out[0] += tide[0] + w1 * w1 * xb[0] + 2 * w1 * vb[1];
  out[1] += tide[1] + w1 * w1 * xb[1] - 2 * w1 * vb[0];
  out[2] += tide[2] + w2 * w2 * xb[2] + 2 * w2 * vb[3];
  out[3] += tide[3] + w2 * w2 * xb[3] - 2 * w2 * vb[2];
  return out;
}

// ---------- the sky, for the renderer ----------
// Everything the shaders need to draw the hoop sky from A's body frame at time t: the star's main image, the hoop
// axis, each image's direction and share of the light from A's centre, and the rotation to the inertial frame.
export const NIMG = 7;
export function skyUniforms(t, eye) {
  const h = hoopAxisBody(t), s0 = toBody([0, 0, 0, 0], t), L = LAWS.L;
  const D = new Float32Array(4 * (2 * NIMG + 1)), W = new Float32Array(16);
  let sum = 0;
  const ws = [], mean = [0, 0, 0, 0];
  for (let k = -NIMG; k <= NIMG; k++) {
    const c = s0.map((v, i) => v + k * L * h[i]), d = Math.hypot(...c), w = 1 / (d * d * d);
    ws.push(w); sum += w;
    D.set(c.map(v => v / d), 4 * (k + NIMG));
  }
  ws.forEach((w, i) => { W[i] = w / sum; });
  const sumLit = ws.slice(NIMG - 5, NIMG + 6).reduce((a, b) => a + b, 0);   // the 11 images that light surfaces
  // the light's mean direction, as seen from the eye (shadow rays and the sky's colour use it): weight each
  // image by its share and by how far it stands above the eye's horizon, so the shadows follow the suns that are up
  const up = eye ? (() => { const l = Math.hypot(...eye); return eye.map(v => v / l); })() : [1, 0, 0, 0];
  for (let k = 0; k <= 2 * NIMG; k++) {
    const d = [D[4 * k], D[4 * k + 1], D[4 * k + 2], D[4 * k + 3]], el = dot(d, up);
    const w = W[k] * Math.max(0, Math.min(1, (el + 0.05) / 0.25));
    for (let i = 0; i < 4; i++) mean[i] += w * d[i];
  }
  let ml = Math.hypot(...mean);
  const sun = ml > 1e-6 ? mean.map(v => v / ml) : [D[4 * NIMG], D[4 * NIMG + 1], D[4 * NIMG + 2], D[4 * NIMG + 3]];
  // body -> inertial rotation (columns: the body axes in inertial coordinates)
  const M = new Float32Array(16);
  for (let j = 0; j < 4; j++) { const e = [0, 0, 0, 0]; e[j] = 1; M.set(dirToInertial(e, t), 4 * j); }
  // how much of the row's light is above the eye's horizon, softened like the shader's dayFactor
  const ss = x => { const t = Math.max(0, Math.min(1, (x + 0.14) / 0.32)); return t * t * (3 - 2 * t); };
  let dayE = 0;
  for (let k = 0; k <= 2 * NIMG; k++) dayE += W[k] * ss(D[4 * k] * up[0] + D[4 * k + 1] * up[1] + D[4 * k + 2] * up[2] + D[4 * k + 3] * up[3]);
  return { star0: s0, hoop: h, L, starR: LAWS.STAR_R, starI: 1 / sumLit, D, W, M, sun, dayE };
}
