// Flora: the small plants of the ground (bushes, flowering bushes, flowers, tufts of grass, saplings), grown afresh
// wherever you are, the same every time you come back. The planet's ground is three-dimensional and your slice shows a
// thin sheet of it, so to fill a view the ground must hold many times the plants a 3D meadow would: too many to keep,
// so they are kept only near you (within 36 m, the smallest within 22 m), in clusters grown from a hash of where
// they stand.
// Where: points spread through 4D space, two to each cell of a 4D grid, kept if they lie within half a cell of the
// ground's sphere and set down on it. Points uniform in 4D, within a shell, project to points uniform on the sphere, so the clusters are
// spread evenly over the 3-sphere, with no seams and no favoured places; each grows from its own cell's hash.
// What: a 1D stalk or blade is almost never seen in a 4D world (a slice crosses it at a point), so these plants are
// made of what a slice does cut: clumps of leaves (4D balls, porous), flower heads (small solid balls) on them, and
// tufts of grass and young conifers (4D cones), drawn with the trees (trees.js). They don't stop you; you walk through them.
import { PLANET_R } from './world.js';
import { vec4 } from './player.js';
import { tangents } from './env.js';
import { fbm4 } from './noise.js';

const F = 10;
// Two layers: bushes, saplings and flowering shrubs out to 36 m, clusters on an 8 m grid; and the ground cover
// (flowers, tufts of grass, low bushes) out to 22 m, small clusters on a 4 m grid, twice as many to the volume.
const LAYERS = [{ cell: 8, range: 36, spread: 3.6, small: false }, { cell: 4, range: 22, spread: 1.6, small: true }];
export const FLORA_RANGE = 36;
export const flora = { layers: LAYERS.map(L => ({ ...L, cells: new Map(), at: null })), list: [], hf: null, keep: () => false, plants: 0 };
const OFF = 80, key = (i, j, k, l) => (((i + OFF) * 161 + (j + OFF)) * 161 + (k + OFF)) * 161 + (l + OFF);
function rng(i, j, k, l) {                              // a small generator seeded by the cell
  let a = (Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(k, 0x61c88647) ^ Math.imul(l, 0x85ebca6b) ^ 0x2545f491) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const off = (u, t, m) => vec4.norm(vec4.add(vec4.scale(u, Math.cos(m / PLANET_R)), vec4.scale(t, Math.sin(m / PLANET_R))));
const meadow = n => fbm4(n[0] * 7.3 - 3.1, n[1] * 7.3 + 1.7, n[2] * 7.3 - 6.2, n[3] * 7.3 + 4.4, 2);   // where flowers grow thick

// The plants of one cluster round unit n, as pieces (a, b, radius, kind) like the trees': kind 1 a clump of leaves,
// 4 a conifer's needles (a cone), 7 a green stem, 8 a flower head, 9 a tuft of grass (a cone).
function grow(n, rnd, hf, L) {
  const h0 = hf.heightAt(n);
  if (h0 < 0.7 || h0 > 34 || hf.waterAt(n) > h0 - 0.25 || flora.keep(n)) return null;
  const m = meadow(n), grassy = h0 > 1.5 && h0 < 24;
  // how many plants: more on grass, most where the meadow noise is high; few up on the rock
  const want = L.small ? (grassy ? 1 + Math.floor(rnd() * (2 + 3 * Math.max(0, m + 0.3))) : Math.floor(rnd() * 2))
                       : grassy ? 2 + Math.floor(rnd() * (3 + 6 * Math.max(0, m + 0.2))) : Math.floor(rnd() * 3);
  if (!want) return null;
  const P = [], T = tangents(n);
  const randH = () => { let w; do { w = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]; } while (Math.hypot(...w) < 0.05 || Math.hypot(...w) > 0.5); const l = Math.hypot(...w); return vec4.norm([0, 1, 2, 3].map(q => (w[0] * T[0][q] + w[1] * T[1][q] + w[2] * T[2][q]) / l)); };
  const push = (a, b, r, kind) => P.push(...a, ...b, r, kind);
  // the cluster's kind: one sort of flower to a cluster (its colour comes from the cluster's seed)
  const u = rnd(), sp = L.small ? (h0 > 20 ? (u < 0.6 ? 'tuft' : 'heath') : m > 0 ? (u < 0.55 ? 'flowers' : u < 0.85 ? 'tuft' : 'low') : (u < 0.45 ? 'tuft' : u < 0.75 ? 'flowers' : 'low'))
    : h0 > 20 ? (u < 0.45 ? 'tuft' : u < 0.75 ? 'heath' : u < 0.9 ? 'sapling' : 'bush')
    : h0 < 2.5 ? (u < 0.5 ? 'tuft' : 'bush')
    : m > 0.1 ? (u < 0.5 ? 'flowers' : u < 0.75 ? 'flowerbush' : u < 0.9 ? 'tuft' : 'bush')
    : (u < 0.3 ? 'tuft' : u < 0.55 ? 'bush' : u < 0.75 ? 'flowers' : u < 0.9 ? 'flowerbush' : 'sapling');
  const starts = [];
  for (let i = 0; i < want; i++) {
    starts.push(P.length / F);
    const p = i ? off(n, randH(), L.spread * Math.cbrt(rnd())) : n, h = hf.heightAt(p);
    if (h < 0.6 || hf.waterAt(p) > h - 0.2 || (i && flora.keep(p))) continue;
    const up = p, base = vec4.scale(p, PLANET_R + h - 0.05);
    const at = (y, dir, m) => vec4.add(vec4.add(base, vec4.scale(up, y)), dir ? vec4.scale(dir, m) : [0, 0, 0, 0]);
    const kind = sp === 'flowers' && rnd() < 0.25 ? 'tuft' : sp;
    if (kind === 'bush' || kind === 'flowerbush' || kind === 'heath' || kind === 'low') {
      const s = kind === 'heath' ? 0.75 + 0.35 * rnd() : kind === 'low' ? 0.6 + 0.3 * rnd() : 0.9 + 0.7 * rnd(), k = 2 + Math.floor(rnd() * 3), clumps = [];
      for (let j = 0; j < k; j++) { const r = (0.32 + 0.25 * rnd()) * s, c = at(r * (j ? 0.45 : 0.6), j ? randH() : null, r * 0.8); push(c, c, r, 1); clumps.push([c, r]); }   // (half sunk: cut off its centre, a clump still meets the ground)
      if (kind === 'flowerbush' || kind === 'heath') {        // flowers over its outside
        const f = 4 + Math.floor(rnd() * 4);
        for (let j = 0; j < f; j++) {
          const [c, r] = clumps[Math.floor(rnd() * clumps.length)], d = vec4.norm(vec4.add(vec4.scale(randH(), 0.8), vec4.scale(up, 0.6 * rnd())));
          const q = vec4.add(c, vec4.scale(d, r * 0.92)); push(q, q, (kind === 'heath' ? 0.07 : 0.09) + 0.04 * rnd(), 8);
        }
      }
    } else if (kind === 'flowers') {
      // a low cushion of leaves with flowers on its top (a flower on a stem would float: the slice almost never
      // cuts the stem)
      const r = 0.24 + 0.16 * rnd(), c = at(r * 0.45), f = 5 + Math.floor(rnd() * 5);
      push(c, c, r, 1);
      for (let j = 0; j < f; j++) { const d = vec4.norm(vec4.add(vec4.scale(randH(), 0.75), vec4.scale(up, 0.45 + 0.5 * rnd()))), q = vec4.add(c, vec4.scale(d, r * 0.95)); push(q, q, 0.06 + 0.04 * rnd(), 8); }
    } else if (kind === 'tuft') {
      const k = 1 + Math.floor(rnd() * 3);
      for (let j = 0; j < k; j++) { const b = at(-0.05, j ? randH() : null, 0.4 * rnd()), hh = 0.5 + 0.6 * rnd(); push(b, vec4.add(b, vec4.scale(up, hh)), 0.3 + 0.25 * rnd(), 9); }
    } else {                                                  // a young conifer
      const hh = 1.3 + 1.6 * rnd(), w = hh * (0.24 + 0.06 * rnd());
      push(at(0), at(hh * 0.8), 0.06, 0);
      push(at(0.15), at(hh), w, 4);
    }
  }
  if (!P.length) return null;
  const S = new Float32Array(P), count = S.length / F;
  let c = [0, 0, 0, 0]; for (let i = 0; i < count; i++) for (let q = 0; q < 4; q++) c[q] += (S[i * F + q] + S[i * F + 4 + q]) / (2 * count);
  let R = 0; for (let i = 0; i < count; i++) for (const o of [i * F, i * F + 4]) R = Math.max(R, Math.hypot(S[o] - c[0], S[o + 1] - c[1], S[o + 2] - c[2], S[o + 3] - c[3]) + S[i * F + 8]);
  return { S, start: 0, count, c, R, n, seed: rnd(), plants: starts.filter((v, i) => v < count && v !== starts[i + 1]).concat(count) };   // (where each plant's pieces begin, and the end)
}
// The clusters of one cell: two points to a cell, each kept if it lies within half a cell of the sphere (so a cluster
// to every half cell³ of ground: 256 m³ for the bushes, 32 m³ for the ground cover), grown once and kept while the
// cell is in range.
function cellPlants(L, i, j, k, l, hf) {
  const C = L.cell, rnd = rng(i * 2 + (L.small ? 1 : 0), j, k, l), out = [];
  for (let q = 0; q < 2; q++) {
    const p = [(i + rnd()) * C, (j + rnd()) * C, (k + rnd()) * C, (l + rnd()) * C], r = Math.hypot(...p);
    if (Math.abs(r - PLANET_R) > C / 2) continue;
    const c = grow(vec4.scale(p, 1 / r), rnd, hf, L); if (c) { c.cell = i * 0.37 + j * 1.13 + k * 2.71 + l * 3.97; out.push(c); }
  }
  return out;
}
// Keep the clusters within range of eye up to date: when you move into another cell, grow the cells that came into
// range and drop those that left it (the cells near the sphere and near you, of some 30,000 round you).
export function updateFlora(eye) {
  const hf = flora.hf; if (!hf) return;
  let changed = false;
  for (const L of flora.layers) {
    const C = L.cell, ci = eye.map(v => Math.floor(v / C));
    if (L.at && ci.every((v, q) => v === L.at[q])) continue;
    L.at = ci; changed = true;
    const m = Math.ceil((L.range + C / 2) / C), seen = new Set(), lim = (L.range + C) ** 2, sh = C * 1.5;
    for (let a = -m; a <= m; a++) for (let b = -m; b <= m; b++) for (let c = -m; c <= m; c++) for (let d = -m; d <= m; d++) {
      const i = ci[0] + a, j = ci[1] + b, k = ci[2] + c, l = ci[3] + d;
      const x = (i + 0.5) * C, y = (j + 0.5) * C, z = (k + 0.5) * C, w = (l + 0.5) * C;
      const dx = x - eye[0], dy = y - eye[1], dz = z - eye[2], dw = w - eye[3];
      if (dx * dx + dy * dy + dz * dz + dw * dw > lim || Math.abs(Math.sqrt(x * x + y * y + z * z + w * w) - PLANET_R) > sh) continue;
      const kk = key(i, j, k, l); seen.add(kk);
      if (!L.cells.has(kk)) L.cells.set(kk, cellPlants(L, i, j, k, l, hf));
    }
    for (const kk of L.cells.keys()) if (!seen.has(kk)) L.cells.delete(kk);
  }
  if (changed) { flora.list = flora.layers.flatMap(L => [...L.cells.values()].flat()); flora.plants = flora.list.length; }
}
export function initFlora(hf, keep) { flora.hf = hf; flora.keep = keep || (() => false); for (const L of flora.layers) { L.cells.clear(); L.at = null; } }
