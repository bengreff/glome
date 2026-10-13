// Tests for js/tides.js (Node, no packages): node tools/test-tides.mjs
// 1. The copies' potential the tide is drawn from has as its slope exactly the field the game's gravity uses (gHoop).
// 2. The equilibrium tide's size, and that it averages to nothing over the sea.
import { gHoop } from '../js/cosmos.js';
import { LAWS } from '../js/laws.js';
import { tides, updateTides } from '../js/tides.js';
const results = [], check = (name, ok, info) => results.push([ok ? 'PASS' : 'FAIL', name, info]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
{
  const L = LAWS.L, GM = LAWS.G_SURF * LAWS.R_A ** 3 * LAWS.G_SCALE, h = [0.3, -0.5, 0.6, 0.548].map((v, _, a) => v / Math.hypot(...a));
  const phi = x => { const w0 = dot(x, h), w = w0 - L * Math.round(w0 / L), k = 2 * Math.PI / L, rho = Math.hypot(...x.map((v, i) => v - w0 * h[i])), e = Math.exp(-k * rho), q = 1 + e * e - 2 * e * Math.cos(k * w); return -(Math.PI * GM / (2 * L)) / rho * (1 - e * e) / q; };
  let worst = 0;
  for (const x of [[100, 50, -80, 120], [-200, 30, 90, 10], [5, 240, -20, 30], [0, 0, 250, 3]]) {
    const a = gHoop(x, GM, h, L), g = [0, 1, 2, 3].map(i => { const e = [0, 0, 0, 0]; e[i] = 1e-3; return -(phi(x.map((v, j) => v + e[j])) - phi(x.map((v, j) => v - e[j]))) / 2e-3; });
    worst = Math.max(worst, Math.hypot(...a.map((v, i) => v - g[i])) / Math.hypot(...a));
  }
  check('the tide\'s potential slopes as gravity pulls', worst < 1e-8, `worst relative difference ${worst.toExponential(1)}`);
}
{
  tides.on = true; let seed = 5; const r = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296) * 2 - 1;
  const ns = []; while (ns.length < 3000) { const v = [r(), r(), r(), r()], l = Math.hypot(...v); if (l > 0.2 && l < 1) ns.push(v.map(x => x / l)); }
  const ranges = [], means = [];
  for (const t of [0, 50, 100, 150, 200]) { updateTides(t); const e = ns.map(n => tides.at(n)); ranges.push(Math.max(...e) - Math.min(...e)); means.push(e.reduce((a, b) => a + b, 0) / e.length); }
  check('equilibrium tide: about 11.7 m across the sea, mean nil', ranges.every(x => x > 10 && x < 13) && means.every(m => Math.abs(m) < 0.3), `range ${ranges.map(x => x.toFixed(2)).join(', ')} m; means ${means.map(x => x.toFixed(2)).join(', ')}`);
}
for (const [s, n, i] of results) console.log(`${s}  ${n.padEnd(52)} ${i || ''}`);
const fails = results.filter(r => r[0] === 'FAIL').length;
console.log(fails ? `${fails} FAILED` : 'All checks passed.');
process.exit(fails ? 1 : 0);
