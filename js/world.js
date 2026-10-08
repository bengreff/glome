// The planet: a 4D ball whose surface is a 3-sphere. Terrain height is a function on that 3-sphere,
// stored in a "cubed 3-sphere" atlas: 8 cubic charts, one per tesseract cell (±x, ±y, ±z, ±w).
import { fbm4, ridged4 } from './noise.js?v=20261007225242';
import { LAWS } from './laws.js?v=20261007225242';

export const PLANET_R = LAWS.R_A;   // metres
export const SEA = LAWS.SEA;        // sea level, metres above PLANET_R

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const FREQ = PLANET_R / 180;   // base feature wavelength ~180 m

// Height (metres) of the ground above PLANET_R in unit direction n.
export function terrainHeight(n) {
  const x = n[0] * FREQ, y = n[1] * FREQ, z = n[2] * FREQ, w = n[3] * FREQ;
  const c = fbm4(x, y, z, w, 4);
  const m = ridged4(x * 2.1 + 11.3, y * 2.1 - 4.7, z * 2.1 + 2.9, w * 2.1 + 7.1, 4);
  const land = smoothstep(-0.02, 0.22, c);
  return 26 * c - 3 + 34 * land * m * m * m;
}

// Chart c = 2*axis + (positive ? 1 : 0). Inside a chart the other three coordinates, in increasing
// axis order and divided by |n[axis]|, give cube coordinates u in [-1, 1]^3.
export function chartVector(c, u0, u1, u2) {
  const axis = c >> 1, s = (c & 1) ? 1 : -1, v = [0, 0, 0, 0], u = [u0, u1, u2];
  for (let i = 0, j = 0; i < 4; i++) v[i] = i === axis ? s : u[j++];
  const len = Math.hypot(v[0], v[1], v[2], v[3]);
  return [v[0] / len, v[1] / len, v[2] / len, v[3] / len];
}

export function chartCoords(n) {
  let axis = 0, m = Math.abs(n[0]);
  for (let i = 1; i < 4; i++) if (Math.abs(n[i]) > m) { m = Math.abs(n[i]); axis = i; }
  const u = [];
  for (let i = 0; i < 4; i++) if (i !== axis) u.push(n[i] / m);
  return { c: 2 * axis + (n[axis] > 0 ? 1 : 0), u };
}

// CPU copy of the atlas for physics. Layout matches the GPU 3D texture:
// index = i + N*j + N*N*(c*N + l), with texture depth 8N.
const SEAM = 0.04;   // blend width across chart seams, as a fraction of the largest component

// Pre-smooth the raw samples with the cubic B-spline kernel [1, 4, 1]/6 along each axis (clamped at chart
// edges). Trilinear interpolation of the result tracks the smooth cubic surface closely (median ~1 cm)
// while costing a single texture fetch.
export function prefilter(src, N) {
  const a = new Float32Array(src.length), b = new Float32Array(src.length), NN = N * N, rows = src.length / N;
  const run = (from, to, stride, startOf) => {
    for (let r = 0; r < rows; r++) {
      const s0 = startOf(r);
      for (let i = 0; i < N; i++) {
        const lo = from[s0 + Math.max(0, i - 1) * stride], mid = from[s0 + i * stride], hi = from[s0 + Math.min(N - 1, i + 1) * stride];
        to[s0 + i * stride] = (lo + 4 * mid + hi) / 6;
      }
    }
  };
  run(src, a, 1, r => r * N);
  run(a, b, N, r => (r % N) + Math.floor(r / N) * NN);
  run(b, a, NN, r => (r % NN) + Math.floor(r / NN) * NN * N);   // z stays within its chart
  return a;
}

// CPU copy of the (prefiltered) atlas for physics. Layout matches the GPU 3D texture:
// index = i + N*j + N*N*(c*N + l), texture depth 8N. Lookups match the shader exactly.
export class HeightField {
  constructor(data, N) { this.data = data; this.N = N; }

  chartHeight(n, k) {
    const { N, data } = this, m = Math.abs(n[k]), c = 2 * k + (n[k] > 0 ? 1 : 0);
    const t = [];
    for (let i = 0; i < 4; i++) if (i !== k) t.push(Math.min(N - 1, Math.max(0, (n[i] / m * 0.5 + 0.5) * (N - 1))));
    const i0 = t.map(v => Math.min(N - 2, Math.floor(v))), f = t.map((v, j) => v - i0[j]);
    let h = 0;
    for (let q = 0; q < 8; q++) {
      const x = q & 1, y = (q >> 1) & 1, z = (q >> 2) & 1;
      h += (x ? f[0] : 1 - f[0]) * (y ? f[1] : 1 - f[1]) * (z ? f[2] : 1 - f[2]) * data[(i0[0] + x) + N * (i0[1] + y) + N * N * (c * N + i0[2] + z)];
    }
    return h;
  }

  // Blend every chart whose axis is within SEAM of the largest, with smoothly varying weights,
  // so the ground is continuous across seams and corners.
  heightAt(n) {
    const a = n.map(Math.abs), amax = Math.max(a[0], a[1], a[2], a[3]);
    let sum = 0, wsum = 0;
    for (let k = 0; k < 4; k++) {
      let w = 1 - (amax - a[k]) / (SEAM * amax);
      if (w <= 0) continue;
      w = w * w * (3 - 2 * w);
      sum += w * this.chartHeight(n, k); wsum += w;
    }
    return sum / wsum;
  }
}
