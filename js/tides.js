// The tide (a switch, off unless chosen: ≈ in the console, or ?tides in the page's address). The sea's surface is a
// surface of equal potential, so where something pulls along the ground the sea stands higher. Here that is mostly
// A's own copies round the hoop, 800 m off on either side along the hoop's axis, which stretch the planet's field
// along it; the star and B add a little. Their potential over the sea has a closed form (PHYSICS.md: the field of a
// mass and all its images); less its mean over the sphere, over the surface gravity, it is the sea's height above its
// mean level. A's own pull is the same all round, so it drops out; so does the spin's (the planet's figure is already
// shaped to it: only what turns with the day makes a tide). This is the equilibrium tide: the sea standing where the
// pull would hold it still. A real sea would slosh as well, the forcing turning about as fast as a wave crosses it.
import { LAWS } from './laws.js';
import { hoopAxisBody, tideStarB } from './cosmos.js';

export const tides = { on: false, hoop: [0, 0, 0, 1], pref: 0, mean: 0, ig: 0, Q: new Float32Array(16), q: [], at: () => 0 };
const DIRS = []; { let s = 7; const r = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296) * 2 - 1;
  while (DIRS.length < 4096) { const v = [r(), r(), r(), r()], l = Math.hypot(...v); if (l > 0.2 && l < 1) DIRS.push(v.map(x => x / l)); } }
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
// The copies' potential at body point x (the closed form of a mass and all its images, A's own term included: it is
// constant over the sphere, and the mean takes it away).
function phiCopies(x) {
  const T = tides, L = LAWS.L, w0 = dot(x, T.hoop), w = w0 - L * Math.round(w0 / L), k = 2 * Math.PI / L;
  const rho = Math.max(1e-3, Math.hypot(x[0] - w0 * T.hoop[0], x[1] - w0 * T.hoop[1], x[2] - w0 * T.hoop[2], x[3] - w0 * T.hoop[3]));
  const e = Math.exp(-k * rho), q = 1 + e * e - 2 * e * Math.cos(k * w);
  return -T.pref / rho * (1 - e * e) / q;
}
export function updateTides(t) {
  const T = tides;
  if (!T.on || LAWS.GRAV_DIM !== 4) { T.at = () => 0; T.ig = 0; T.qT = null; return; }
  const R = LAWS.R_A + LAWS.SEA, GM = LAWS.G_SURF * LAWS.R_A ** 3 * LAWS.G_SCALE;
  T.hoop = hoopAxisBody(t); T.pref = Math.PI * GM / (2 * LAWS.L); T.ig = 1 / (LAWS.G_SURF * LAWS.G_SCALE);
  // the copies' mean over the sphere doesn't depend on which way the hoop lies (turning the axis turns the pattern):
  // worked out once for the laws as they are
  const key = `${LAWS.L}:${GM}:${R}`;
  if (T.meanKey !== key) { let m = 0; for (const n of DIRS) m += phiCopies(n.map(v => v * R)); T.mean = m / DIRS.length; T.meanKey = key; }
  // the star's and B's tide: its gradient across the planet, a quadratic potential, trace-free (its mean over the
  // sphere is zero), scaled to a height: η = n·Q·n with Q = (R²/2g)(S − tr S/4), S the symmetric gradient. It turns
  // slowly: worked out twice a second.
  if (T.qT != null && Math.abs(t - T.qT) < 0.5) { T.at = atNow; return; }
  T.qT = t;
  const S = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let j = 0; j < 4; j++) { const e = [0, 0, 0, 0]; e[j] = R; const ap = tideStarB(e, t), am = tideStarB(e.map(v => -v), t); for (let i = 0; i < 4; i++) S[i][j] = (ap[i] - am[i]) / (2 * R); }
  const tr = (S[0][0] + S[1][1] + S[2][2] + S[3][3]) / 4, c = R * R / 2 * T.ig;
  T.q = [0, 1, 2, 3].map(i => [0, 1, 2, 3].map(j => c * ((S[i][j] + S[j][i]) / 2 - (i === j ? tr : 0))));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) T.Q[j * 4 + i] = T.q[i][j];
  T.at = atNow;
}
const atNow = n => { const T = tides, R = LAWS.R_A + LAWS.SEA; return -(phiCopies(n.map(v => v * R)) - T.mean) * T.ig + [0, 1, 2, 3].reduce((s, i) => s + n[i] * dot(T.q[i], n), 0); };
