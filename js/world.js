// The planet: a 4D ball whose surface is a 3-sphere. Terrain height is a function on that 3-sphere,
// stored in a "cubed 3-sphere" atlas: 8 cubic charts, one per tesseract cell (±x, ±y, ±z, ±w).
import { fbm4, ridged4 } from './noise.js';

export const PLANET_R = 250;   // metres
export const SEA = 0;          // sea level, metres above PLANET_R

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

export class HeightField {
  constructor(data, N) { this.data = data; this.N = N; }

  // Height via a cubic B-spline inside one chart (axis k), clamped at the chart's edges.
  chartHeight(n, k) {
    const { N, data } = this, m = Math.abs(n[k]), c = 2 * k + (n[k] > 0 ? 1 : 0);
    const u = []; for (let i = 0; i < 4; i++) if (i !== k) u.push(n[i] / m);
    const idx = u.map(v => (v * 0.5 + 0.5) * (N - 1));
    const i0 = idx.map(Math.floor), f = idx.map((v, j) => v - i0[j]);
    const w = f.map(t => { const g = 1 - t; const w0 = g * g * g / 6, w1 = (4 - 6 * t * t + 3 * t * t * t) / 6, w3 = t * t * t / 6; return [w0, w1, 1 - w0 - w1 - w3, w3]; });
    const cl = v => v < 0 ? 0 : v > N - 1 ? N - 1 : v;
    let h = 0;
    for (let dz = 0; dz < 4; dz++) {
      const z = cl(i0[2] + dz - 1), wz = w[2][dz];
      for (let dy = 0; dy < 4; dy++) {
        const y = cl(i0[1] + dy - 1), wyz = wz * w[1][dy], base = N * y + N * N * (c * N + z);
        for (let dx = 0; dx < 4; dx++) h += wyz * w[0][dx] * data[base + cl(i0[0] + dx - 1)];
      }
    }
    return h;
  }

  // Blend every chart whose axis is within SEAM of the largest, with weights that vary smoothly.
  // The ground is then continuous across seams and corners (matches the shader).
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
