// Things to find, along any walk: ruins of worked stone, cairns of blocks you can knock down, and caches of things to
// carry (balls, blocks, lanterns, impulse stones). The ruins are built for a 4D world: a ring of pillars stands on a
// sphere round its centre (your slice cuts the sphere in a circle, a different circle of pillars as you turn); a room's
// walls are 3D cells, six of them, of which ruin has taken some; a gate is two pillars and a lintel. Lines of cairns
// lead out from where you arrive toward the launcher.
// The ruins are props (solid, climbable); the cairns and caches are ordinary bodies, numbered (gen) so that a save
// keeps only the ones you have moved.
import { G } from './game.js';
import { vec4 } from './player.js';
import { PLANET_R } from './world.js';
import { tangents } from './env.js';
import { rot as R4 } from './so4.js';
import { makeProp, addRock, rocksAt, SHAPE, MAT } from './props.js';
import { spawn } from './objects.js';

export const finds = { ruins: [], caches: [], cairns: [], nooks: [], gen: 0 };
let seed = 4711;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
const off = (u, t, m) => vec4.norm(vec4.add(vec4.scale(u, Math.cos(m / PLANET_R)), vec4.scale(t, Math.sin(m / PLANET_R))));
const proj = (v, n) => vec4.norm(vec4.sub(v, vec4.scale(n, vec4.dot(v, n))));
const det4 = m => { let d = 0; for (let j = 0; j < 4; j++) { const mm = [1, 2, 3].map(i => m[i].filter((_, k) => k !== j)); d += (j % 2 ? -1 : 1) * m[0][j] * (mm[0][0] * (mm[1][1] * mm[2][2] - mm[1][2] * mm[2][1]) - mm[0][1] * (mm[1][0] * mm[2][2] - mm[1][2] * mm[2][0]) + mm[0][2] * (mm[1][0] * mm[2][1] - mm[1][1] * mm[2][0])); } return d; };
// A frame of the ground at n turned about up at random: three ground axes and up, as columns of a proper rotation.
function frameAt(n) {
  const T = tangents(n), a = rnd() * 6.283, b = rnd() * 6.283, c = rnd() * 6.283;
  // a random rotation of the three ground axes (two turns in two planes, then a third)
  const rotP = (u, v, th) => [vec4.add(vec4.scale(u, Math.cos(th)), vec4.scale(v, Math.sin(th))), vec4.sub(vec4.scale(v, Math.cos(th)), vec4.scale(u, Math.sin(th)))];
  let [x, y] = rotP(T[0], T[1], a); let z = T[2]; [y, z] = rotP(y, z, b); [x, y] = rotP(x, y, c);
  const cols = [x, y, z, n], rows = [0, 1, 2, 3].map(r => cols.map(col => col[r]));
  if (det4(rows) < 0) rows.forEach(r => { r[0] = -r[0]; });
  return { rot: R4.fromMatrix(rows), ax: [0, 1, 2].map(k => rows.map(r => r[k])), up: n };
}
// A block of worked stone at ground point n, its bottom h0 below the ground, half-extents e (last: half its height).
function stone(n, fr, e, hf, { sink = 0.15, lift = 0 } = {}) {
  const h = hf.heightAt(n), c = vec4.scale(n, PLANET_R + h - sink + lift + e[3]);
  const p = makeProp({ c, rot: fr.rot, e, shape: SHAPE.box, mat: MAT.worked });
  p.kind = 'ruin'; addRock(p);
  return p;
}
const at = (n, fr, x, y, z) => { let d = [0, 0, 0, 0]; for (let i = 0; i < 4; i++) d[i] = x * fr.ax[0][i] + y * fr.ax[1][i] + z * fr.ax[2][i]; const l = vec4.len(d); return l < 1e-9 ? n : off(n, vec4.scale(d, 1 / l), l); };
// the twelve vertices of an icosahedron: directions spread evenly over the 2-sphere of the ground's three directions
const PHI = (1 + Math.sqrt(5)) / 2, ICO = [];
for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) ICO.push([0, s1, s2 * PHI], [s1, s2 * PHI, 0], [s2 * PHI, 0, s1]);
const RUINS = {
  // a ring of pillars on a sphere of radius 4.5 m round the centre, some broken short
  ring(n, fr, hf) { const R = 4.5; for (const v of ICO) { const l = Math.hypot(...v), q = at(n, fr, R * v[0] / l, R * v[1] / l, R * v[2] / l); stone(q, fr, [0.3, 0.3, 0.3, rnd() < 0.3 ? 0.5 + 0.4 * rnd() : 1.1 + 0.5 * rnd()], hf); } },
  // a room: six walls (3D cells: thin along one ground direction, wide along the other two), some fallen
  room(n, fr, hf) {
    const L = 3.2, hgt = 0.9 + 0.5 * rnd();
    for (let k = 0; k < 3; k++) for (const sg of [-1, 1]) {
      if (rnd() < 0.3) continue;                               // fallen
      const v = [0, 0, 0]; v[k] = sg * L; const e = [L, L, L, rnd() < 0.3 ? hgt * 0.5 : hgt]; e[k] = 0.22;
      stone(at(n, fr, ...v), fr, e, hf);
    }
  },
  // a gate: two pillars and a lintel over them
  gate(n, fr, hf) {
    const w = 1.4, hgt = 1.3;
    stone(at(n, fr, w, 0, 0), fr, [0.3, 0.3, 0.3, hgt], hf); stone(at(n, fr, -w, 0, 0), fr, [0.3, 0.3, 0.3, hgt], hf);
    stone(n, fr, [w + 0.35, 0.32, 0.32, 0.25], hf, { lift: 2 * hgt - 0.15 });
  },
  // steps up to a platform
  steps(n, fr, hf) { for (let k = 0; k < 3; k++) stone(n, fr, [2.2 - 0.6 * k, 2.2 - 0.6 * k, 2.2 - 0.6 * k, 0.2], hf, { lift: 0.4 * k }); },
};
// A low pedestal of worked stone at ground point q, on which the monument grows an impulse stone (nooks.js); the
// stone's centre rests on its top. (It draws no random numbers, so the rest of the world is made as before.)
function pedestal(q, fr, hf, lift = 0) {
  const p = stone(q, fr, [0.2, 0.2, 0.2, 0.2], hf, { lift });
  finds.nooks.push({ p: vec4.scale(q, PLANET_R + hf.heightAt(q) - 0.15 + lift + 0.4 + 0.09 + 0.01), prop: p });
}
const nextGen = () => finds.gen++;
const KINDS = ['glomeS', 'glomeS', 'glomeL', 'tessS', 'tessS', 'tessL', 'lantern', 'stone', 'stone'];
function cache(n, hf, size = 2 + Math.floor(rnd() * 3), lift = 0) {
  const T = tangents(n);
  for (let i = 0; i < size; i++) {
    const q = i ? off(n, vec4.norm(vec4.add(vec4.add(vec4.scale(T[0], rnd() - 0.5), vec4.scale(T[1], rnd() - 0.5)), vec4.scale(T[2], rnd() - 0.5))), 0.7 + 1.2 * rnd()) : n;
    const b = spawn(KINDS[Math.floor(rnd() * KINDS.length)], q, { lift, extra: { gen: nextGen() } });
    b.spawnPos = b.pos.slice(); b.sleeping = true; b.find = 'cache'; b.cache = finds.caches.length;
  }
  finds.caches.push({ n });
}
function cairn(n, hf, h = 3) {
  const fr = frameAt(n);
  let lift = 0;
  for (let i = 0; i < h; i++) {
    const kind = i === h - 1 && rnd() < 0.4 ? 'glomeS' : 'tessS';
    const b = spawn(kind, n, { lift, rot: kind === 'tessS' ? fr.rot : null, extra: { gen: nextGen() } });
    b.spawnPos = b.pos.slice(); b.sleeping = true; b.find = 'cairn';
    lift += kind === 'tessS' ? 0.3 : 0.36;
  }
  pedestal(at(n, fr, 0.9, 0, 0), fr, hf);
  finds.cairns.push({ n });
}
const slope = (hf, n) => { const T = tangents(n), e = 2; let s = 0; for (const t of T) s += ((hf.heightAt(off(n, t, e)) - hf.heightAt(off(n, t, -e))) / (2 * e)) ** 2; return Math.sqrt(s); };
const flatDry = (hf, n, maxSlope = 0.3) => { const h = hf.heightAt(n); return h > 1.5 && h < 24 && hf.waterAt(n) < 0.01 && slope(hf, n) < maxSlope; };
const clear = (n, r) => !rocksAt(vec4.scale(n, PLANET_R)).some(p => vec4.len(vec4.sub(vec4.norm(p.c), n)) * PLANET_R < p.R + r);

// home: where you arrive; trails: unit points that lines of cairns lead toward; keepOut(n, r) as for the rocks.
export function makeFinds(hf, home, trails, keepOut) {
  seed = 4711; finds.ruins.length = finds.caches.length = finds.cairns.length = finds.nooks.length = 0;
  const gauss = () => rnd() + rnd() + rnd() + rnd() - 2, randomUnit = () => vec4.norm([gauss(), gauss(), gauss(), gauss()]);
  const T0 = tangents(home), randDir = n => { const T = tangents(n); return vec4.norm(vec4.add(vec4.add(vec4.scale(T[0], rnd() - 0.5), vec4.scale(T[1], rnd() - 0.5)), vec4.scale(T[2], rnd() - 0.5))); };
  const ruinAt = (n, kind) => {
    const fr = frameAt(n); RUINS[kind](n, fr, hf);
    finds.ruins.push({ n, kind });
    // (on the steps: on the top platform, whose top is 1.05 m above the ground at the centre)
    if (kind === 'steps') { const q = at(n, fr, 0, 0.55, 0); pedestal(q, fr, hf, 1.2 + hf.heightAt(n) - hf.heightAt(q)); } else pedestal(at(n, fr, 0, 2.6, 0), fr, hf);
    if (kind !== 'gate' && rnd() < 0.8) cache(n, hf, 2 + Math.floor(rnd() * 3), kind === 'steps' ? 1.07 : 0);   // (on the steps: on their top)
  };
  const kinds = Object.keys(RUINS);
  // near where you arrive: a ring of pillars, a room and a gate within a short walk, and a cache or two
  const nearTry = (lo, hi, test, make) => { for (let i = 0; i < 400; i++) { const n = off(home, randDir(home), lo + (hi - lo) * rnd()); if (test(n)) { make(n); return true; } } return false; };
  nearTry(28, 45, n => flatDry(hf, n) && !keepOut(n, 6) && clear(n, 5), n => ruinAt(n, 'ring'));
  nearTry(40, 60, n => flatDry(hf, n) && !keepOut(n, 5) && clear(n, 4), n => ruinAt(n, 'room'));
  nearTry(20, 35, n => flatDry(hf, n, 0.4) && !keepOut(n, 3) && clear(n, 2.5), n => ruinAt(n, 'gate'));
  nearTry(12, 25, n => flatDry(hf, n, 0.45) && !keepOut(n, 2) && clear(n, 1.5), n => cache(n, hf, 3));
  // lines of cairns from where you arrive toward each place, one every 45 m for the first four
  for (const t of trails) {
    const dir = proj(vec4.sub(t, vec4.scale(home, vec4.dot(t, home))), home), dist = Math.acos(Math.max(-1, Math.min(1, vec4.dot(home, t)))) * PLANET_R;
    for (let k = 1; k <= 4 && 22 + 45 * (k - 1) < dist - 15; k++) {
      let n = off(home, dir, 22 + 45 * (k - 1));
      for (let i = 0; i < 20 && !(flatDry(hf, n, 0.6) && !keepOut(n, 1.5) && clear(n, 1.2)); i++) n = off(n, randDir(n), 2);
      if (flatDry(hf, n, 0.6)) cairn(n, hf, 2 + (k % 2));
    }
  }
  // and over the whole planet
  for (let i = 0, made = 0; i < 40000 && made < 70; i++) { const n = randomUnit(); if (flatDry(hf, n) && !keepOut(n, 6) && clear(n, 5)) { ruinAt(n, kinds[Math.floor(rnd() * kinds.length)]); made++; } }
  for (let i = 0, made = 0; i < 40000 && made < 90; i++) { const n = randomUnit(); if (flatDry(hf, n, 0.45) && !keepOut(n, 2) && clear(n, 1.5)) { cache(n, hf); made++; } }
  for (let i = 0, made = 0; i < 40000 && made < 110; i++) { const n = randomUnit(); const h = hf.heightAt(n); if (h > 6 && flatDry(hf, n, 0.5) && !keepOut(n, 2) && clear(n, 1.5)) { cairn(n, hf, 2 + Math.floor(rnd() * 3)); made++; } }
  return { ruins: finds.ruins.length, caches: finds.caches.length, cairns: finds.cairns.length, bodies: finds.gen };
}
