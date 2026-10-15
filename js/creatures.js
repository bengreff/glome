// Creatures: geometric bodies with real 4D body plans, living all over the grassland.
//
// Walkers (crabs, since run eight): a round body flattened top to bottom, a small head with two eyes, and six legs, one
// along each of the ground's six directions (forward and back, to either side, toward ana and kata), all one smooth
// skin (drawn as one surface: the trees' pieces blended, trees.js and shaders.js). Square to your slice it stands on
// four; turned through ana its side pair shrinks to stubs as the ana pair comes in. It walks a pair at a time, each
// pair swinging in turn while the other four stand.
// Rollers: duocylinders, rolling by turning in two planes at once (a way of moving with no 3D counterpart). They roll
// loops about their home, and they play: a ball rolling nearby, they chase and knock on.
// Where: like the plants (flora.js), they are found where you are. Herds are spread evenly over the 3-sphere by a
// hash of a 4D grid (16 m cells), each about its own home on the grass, and kept (and moved) only within 64 m of you;
// the same herds are there when you come back. Your slice shows a thin sheet of the 3D ground, so a planet where you
// meet animals as often as on a 3D meadow takes far more of them than could all be simulated: some 300,000. Which
// places have herds drifts slowly with time, so the herds move about the planet over the days.
// How they behave: they graze, wandering about their home; come near and the shy ones trot off (some through ana, out
// of your slice), the curious ones stop and turn to watch you; rush one and it bolts. None leaves its home ground to
// follow you: you meet them where they live.
// (Gaits are kinematic: feet are placed by rule and the body is carried by them. PHYSICS.md says so.)
import { G } from './game.js';
import { vec4 } from './player.js';
import { PLANET_R } from './world.js';
import { tangents } from './env.js';
import { rot as R4 } from './so4.js';
import { bodyProp, SHAPE, MAT } from './props.js';
import { fbm4 } from './noise.js';

export const creatures = { list: [], cells: new Map(), at: null, hf: null, keep: () => false, fixed: [], clock: 0, nextId: 1 };
const CELL = 16, RANGE = 64, LEASH = 14, NEAR = 45;
const WALKER = { k: 1.2, height: 0.6 * 1.2, stride: 0.45 * 1.2, legR: 0.09 * 1.2 };   // (k: its size, against the concept's)
const ROLLER = { a: 0.48 };
const proj = (v, n) => vec4.sub(v, vec4.scale(n, vec4.dot(v, n)));
const along = (n, d, m) => vec4.norm(vec4.add(vec4.scale(n, Math.cos(m / PLANET_R)), vec4.scale(d, Math.sin(m / PLANET_R))));
const arc = (a, b) => Math.acos(Math.max(-1, Math.min(1, vec4.dot(a, b)))) * PLANET_R;
const OFF = 20, cellKey = (i, j, k, l) => (((i + OFF) * 41 + (j + OFF)) * 41 + (k + OFF)) * 41 + (l + OFF);
function rng(i, j, k, l) {                              // a small generator seeded by the cell
  let a = (Math.imul(i, 0x2c1b3c6d) ^ Math.imul(j, 0x297a2d39) ^ Math.imul(k, 0x7feb352d) ^ Math.imul(l, 0x846ca68b) ^ 0x6a09e667) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const dirAt = (n, r) => { const T = tangents(n); let w; do { w = [r() - 0.5, r() - 0.5, r() - 0.5]; } while (Math.hypot(...w) < 0.05 || Math.hypot(...w) > 0.5); return vec4.norm([0, 1, 2, 3].map(q => w[0] * T[0][q] + w[1] * T[1][q] + w[2] * T[2][q])); };
// where herds are, this while: a slow drift over the planet (a herd's cell is grown as it comes into range, so a
// place that had none may have one the next time you pass, days later)
const presence = n => { const t = ((G.state && G.state.time) || 0) / 2400; return 0.75 + 0.2 * Math.min(1, Math.max(0, (fbm4(n[0] * 2.1 + t, n[1] * 2.1 - 0.6 * t, n[2] * 2.1 + 3.7, n[3] * 2.1 - 1.9, 2) + 0.25) / 0.5)); };   // (never thin: 0.75 at least)

function make(kind, n, home, r) {
  return { id: creatures.nextId++, kind, n: n.slice(), home, v: [0, 0, 0, 0], heading: dirAt(n, r), phase: r(), th1: 0, th2: 0, alarm: 0,
           curious: kind === 'walker' && r() < 0.45, slip: r() < 0.35, ring: kind === 'roller' ? [dirAt(home, r), 3 + 4 * r(), r() * 6.283] : null };
}
// The herds of one cell: two points to a cell, each kept if within half a cell of the sphere (a herd's chance to every
// 2,000 m³ of ground), on dry ground: mostly a herd of crabs (three to nine), now and then a roller.
function cellGroups(i, j, k, l, hf) {
  const r = rng(i, j, k, l), out = [];
  for (let q = 0; q < 2; q++) {
    const p = [(i + r()) * CELL, (j + r()) * CELL, (k + r()) * CELL, (l + r()) * CELL], len = Math.hypot(...p);
    if (Math.abs(len - PLANET_R) > CELL / 2) continue;
    const home = vec4.scale(p, 1 / len), h = hf.heightAt(home), u = r();
    if (h < 0.8 || h > 30 || hf.waterAt(home) > 0.01 || creatures.keep(home)) continue;
    if (u < presence(home)) {                                  // (crabs on any dry ground, the beach to the hills)
      const size = 3 + Math.floor(r() * 7);
      for (let m = 0; m < size; m++) { const n = m ? along(home, dirAt(home, r), 1 + 5 * r()) : home; if (hf.waterAt(n) < 0.01) out.push(make('walker', n, home, r)); }
    } else if (u > 0.8) out.push(make('roller', home, home, r));
  }
  return out;
}
// Keep the herds within range of you: when you cross into another cell, grow the cells that came into range, and
// let go of those that left it (they will be back, at home, when you return).
function updateCells(eye) {
  const hf = creatures.hf, ci = eye.map(v => Math.floor(v / CELL));
  if (creatures.at && ci.every((v, q) => v === creatures.at[q])) return;
  creatures.at = ci;
  const m = Math.ceil((RANGE + CELL / 2) / CELL), seen = new Set(), lim = (RANGE + CELL) ** 2;
  for (let a = -m; a <= m; a++) for (let b = -m; b <= m; b++) for (let c = -m; c <= m; c++) for (let d = -m; d <= m; d++) {
    const i = ci[0] + a, j = ci[1] + b, k = ci[2] + c, l = ci[3] + d;
    const x = (i + 0.5) * CELL, y = (j + 0.5) * CELL, z = (k + 0.5) * CELL, w = (l + 0.5) * CELL;
    const dx = x - eye[0], dy = y - eye[1], dz = z - eye[2], dw = w - eye[3];
    if (dx * dx + dy * dy + dz * dz + dw * dw > lim || Math.abs(Math.sqrt(x * x + y * y + z * z + w * w) - PLANET_R) > CELL) continue;
    const kk = cellKey(i, j, k, l); seen.add(kk);
    if (!creatures.cells.has(kk)) creatures.cells.set(kk, cellGroups(i, j, k, l, hf));
  }
  for (const kk of creatures.cells.keys()) if (!seen.has(kk)) creatures.cells.delete(kk);
  creatures.list = [...creatures.fixed, ...[...creatures.cells.values()].flat()];
}
export function initCreatures(hf, keep) { creatures.hf = hf; creatures.keep = keep || (() => false); creatures.cells.clear(); creatures.at = null; creatures.fixed = []; creatures.list = []; }
// A walker set down at unit n, at home there (the few in your first view).
export function addWalker(n, curious) { let s = creatures.fixed.length * 7 + 1; const r = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296); const c = make('walker', n, n, r); c.curious = curious; creatures.fixed.push(c); creatures.list.unshift(c); return c; }

// ---------- their minds (twice a second near you, less often farther off) ----------
function think(c, p, dt, me, flyers, balls) {
  const n = c.n, dMe = me ? arc(me, n) : 1e9, fromHome = arc(n, c.home), now = creatures.clock;
  let want = null, speed = 0;
  const toward = q => { const d = proj(vec4.sub(q, n), n); return vec4.len(d) > 1e-9 ? d : null; };
  if (c.kind === 'walker') {
    // grazing: now and then to another spot about home, or standing a while
    if (!c.goal || now > c.goalUntil) { c.goal = along(c.home, dirAt(c.home, Math.random), 6 * Math.random()); c.goalUntil = now + 4 + 8 * Math.random(); c.rest = Math.random() < 0.35; }
    if (!c.rest && arc(n, c.goal) > 0.4) { want = toward(c.goal); speed = 0.4; }
    // startled by anything flying past fast: away from it
    const fly = flyers.find(o => vec4.dot(vec4.norm(o.pos), n) > Math.cos(8 / PLANET_R));
    if (fly) { want = toward(vec4.sub(vec4.scale(n, 2), vec4.norm(fly.pos))); speed = 1.8; c.alarm = 1; c.spooked = G.simT + 4; }
    if (me && dMe < 12) {
      const away = vec4.norm(proj(vec4.sub(n, me), n));
      if (dMe < 10 && vec4.dot(p.vel, vec4.norm(proj(vec4.sub(n, me), me))) > 3.2) c.spooked = G.simT + 6;   // rushed at: it bolts
      if (c.curious && !(G.simT < c.spooked)) {
        // it stops and turns to watch you (and backs off if you come within 5 m)
        want = dMe < 5 ? away : null; speed = 0.8; c.alarm = Math.max(c.alarm, 0.25);
        c.heading = vec4.norm(vec4.add(c.heading, vec4.scale(away, -0.4)));
      } else if (!fly) {
        // shy (or rushed): it trots off, some of them out of your slice, through ana
        const side = vec4.dot(vec4.sub(n, me), p.A) >= 0 ? 1 : -1;
        want = c.slip ? vec4.add(vec4.scale(away, 0.6), vec4.scale(proj(p.A, n), 1.6 * side)) : away;
        speed = c.slip ? 2.2 : 1.6; c.alarm = 1;
      }
    }
  } else {
    // a roller rolls a loop about its home; a ball rolling nearby, it chases and knocks on
    let toy = null, td = 20;
    for (const o of balls) { const d = arc(vec4.norm(o.pos), n); if (d < td && arc(vec4.norm(o.pos), c.home) < 30) { td = d; toy = o; } }
    if (toy && !c.toy && G.audio && dMe < 40) G.audio.emit('chirp', vec4.scale(n, PLANET_R + creatures.hf.heightAt(n) + 0.5), 0.8);   // it takes an interest
    c.toy = toy;
    if (toy) { want = toward(vec4.norm(toy.pos)); speed = Math.min(3.4, 1 + td); c.alarm = 1; }
    else {
      const [d0, rad, ph] = c.ring, T = tangents(c.home), d1 = vec4.norm(proj(proj(T[(Math.floor(ph * 10) % 3)], d0), c.home)), a = ph + now * 0.12;
      want = toward(along(c.home, vec4.norm(vec4.add(vec4.scale(d0, Math.cos(a)), vec4.scale(d1, Math.sin(a)))), rad)); speed = 0.7;
    }
  }
  // the leash: none strays more than 14 m from home (a roller after a ball, 30 m)
  if (fromHome > (c.toy ? 30 : LEASH)) { want = toward(c.home); speed = Math.max(speed, 1.2); }
  c.target = want && vec4.len(want) > 1e-9 ? vec4.scale(want, speed / vec4.len(want)) : [0, 0, 0, 0];
}
// The loose things in A's world that creatures notice (G.objects is set by main.js).
function toys(test) {
  const w = G.objects && G.objects.world, out = [];
  if (!w) return out;
  for (const o of w.bodies) if (!o.fixed && !o.held && !o.inB && test(o)) out.push(o);
  return out;
}

// Each frame: keep the herds in range up to date, let each think when its turn comes, and move those near you.
export function stepCreatures(dt, hf) {
  const p = G.player, now = creatures.clock = creatures.clock + dt;
  const me = p && p.onB == null && p.pos ? vec4.norm(p.pos) : null;
  if (me) updateCells(p.pos);
  // what they notice, found once a frame: balls rolling (a toy a while), and things flying past fast
  const flyers = [], balls = [];
  for (const o of toys(o => o.shape === 'glome' || vec4.len(o.vel) > 3)) {
    const v = vec4.len(o.vel);
    if (o.shape === 'glome' && v > 0.4) o.toyUntil = G.simT + 6;
    if (o.shape === 'glome' && !o.light && (o.toyUntil || 0) > G.simT) balls.push(o);
    if (v > 3) flyers.push(o);
  }
  const nearCos = Math.cos(NEAR / PLANET_R);
  for (const c of creatures.list) {
    if (now < (c.tNext ?? 0)) continue;
    const tt = Math.min(3, now - (c.tLast ?? now - 0.5)); c.tLast = now;
    c.near = !!me && vec4.dot(me, c.n) > nearCos;
    c.tNext = now + (c.near ? 0.5 : 1.5) * (0.85 + 0.3 * ((c.id * 0.6180339887) % 1));   // (spread out over the frames)
    think(c, p, tt, me, flyers, balls);
    c.g = creatures.hf.heightAt(c.n);                        // (the ground under it, kept for the next half second)
  }
  // every one in range moves every frame (in place: some thousands of them, so no new arrays)
  const R = PLANET_R;
  for (const c of creatures.list) {
    const T = c.target; if (!T) continue;
    const v = c.v, n = c.n, h = c.heading, k = Math.min(1, dt * 2);
    let vn = 0;
    for (let q = 0; q < 4; q++) { v[q] += (T[q] - v[q]) * k; vn += v[q] * n[q]; }
    for (let q = 0; q < 4; q++) v[q] -= vn * n[q];
    const sp = Math.hypot(v[0], v[1], v[2], v[3]);
    if (sp > 1e-4) {
      for (let q = 0; q < 4; q++) n[q] += v[q] * dt / R;
      const l = Math.hypot(n[0], n[1], n[2], n[3]); let vn2 = 0;
      for (let q = 0; q < 4; q++) { n[q] /= l; vn2 += v[q] * n[q]; }
      for (let q = 0; q < 4; q++) { v[q] -= vn2 * n[q]; h[q] = h[q] * 0.9 + v[q] * 0.1 / sp; }
    }
    let hn = 0; for (let q = 0; q < 4; q++) hn += h[q] * n[q];
    for (let q = 0; q < 4; q++) h[q] -= hn * n[q];
    const hl = Math.hypot(h[0], h[1], h[2], h[3]) || 1; for (let q = 0; q < 4; q++) h[q] /= hl;
    const ph0 = c.phase;
    c.phase = (c.phase + dt * sp / (1.5 * WALKER.stride)) % 1;      // (a pair's stance, two thirds of a cycle, is a stride)
    // a pair of feet lands three times a cycle: a tick, if you are near enough to hear it
    if (c.near && c.kind === 'walker' && G.audio && p && p.onB == null && (Math.floor(ph0 * 3) !== Math.floor(c.phase * 3) || c.phase < ph0)) {
      const pos = vec4.scale(c.n, PLANET_R + hf.heightAt(c.n)), dd = vec4.len(vec4.sub(pos, p.pos));
      if (dd < 18) G.audio.emit('tick', pos, 0.5 + 0.3 * Math.random());
    }
    c.th1 += dt * sp / ROLLER.a; c.th2 += dt * sp / ROLLER.a * 0.81;
    c.alarm = Math.max(0, c.alarm - dt * 0.5);
    // a roller that reaches its ball knocks it on: a collision with something much heavier (it bounces off at the
    // roller's speed, a little more), pushed clear of the roller's body
    const b = c.toy;
    if (b && !b.held) {
      const ctr = vec4.scale(c.n, PLANET_R + hf.heightAt(c.n) + ROLLER.a * Math.SQRT2), d = vec4.sub(b.pos, ctr), l = vec4.len(d), R = ROLLER.a * 1.25 + b.size;
      if (l < R && l > 1e-6) {
        const nn = vec4.scale(d, 1 / l), vr = vec4.dot(vec4.sub(c.v, b.vel), nn);
        b.pos = vec4.add(b.pos, vec4.scale(nn, R - l));
        if (vr > 0) { b.vel = vec4.add(b.vel, vec4.scale(nn, vr * 1.4)); b.sleeping = false; b.sleepT = 0; }
      }
    }
  }
}

// ---------- drawing ----------
// The direction perpendicular to three others in 4D (the cofactors of their 3×4 matrix).
function cross4(a, b, c) {
  const m = (i, j, k) => a[i] * (b[j] * c[k] - b[k] * c[j]) - a[j] * (b[i] * c[k] - b[k] * c[i]) + a[k] * (b[i] * c[j] - b[j] * c[i]);
  return [m(1, 2, 3), -m(0, 2, 3), m(0, 1, 3), -m(0, 1, 2)];
}
// A rotation with columns (f, s, a, up): the body square to the ground and facing its heading.
function frameRot(cols) {
  const rows = [0, 1, 2, 3].map(r => cols.map(c => c[r]));
  const M = rows, det = (() => { let d = 0; for (let j = 0; j < 4; j++) { const m = [1, 2, 3].map(i => M[i].filter((_, k) => k !== j)); d += (j % 2 ? -1 : 1) * M[0][j] * (m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])); } return d; })();
  if (det < 0) rows.forEach(r => { r[2] = -r[2]; });
  return R4.fromMatrix(rows);
}
// The objects and leg capsules to draw for the creatures near you.
// A walker: a long body, a head with two eyes, and eight legs from the corners of its bottom cell. Round its heading
// it can roll its body (the plane of its two sideways directions); near you, minding you, it rolls until its eyes and
// four of its legs lie in your slice, the other four out of it (one pair from each tetrapod), so that in your slice it
// stands like a four-legged animal. Far off, they keep the roll they had.
export function creatureDraw(eye, A, hf, dt = 0) {
  const items = [], caps = [];
  // the ones within range that your slice can cut (or nearly: a walker's body reaches 0.6 m from its centre), nearest first
  const near = [];
  for (const c of creatures.list) {
    const r = PLANET_R + (c.g ?? 0) + 0.8, q0 = c.n[0] * r - eye[0], q1 = c.n[1] * r - eye[1], q2 = c.n[2] * r - eye[2], q3 = c.n[3] * r - eye[3];
    const d = Math.hypot(q0, q1, q2, q3); if (d < RANGE && Math.abs(q0 * A[0] + q1 * A[1] + q2 * A[2] + q3 * A[3]) < 1.2) near.push({ c, d });
  }
  near.sort((x, y) => x.d - y.d);
  let detailed = 0;
  for (const { c, d } of near.slice(0, 32)) {
    const n = c.n, g = PLANET_R + hf.heightAt(n), up = n;
    const f = c.heading, T = tangents(n);
    // the two sideways directions: s (kept from frame to frame) and an, perpendicular to it
    let s = proj(proj(c.side || T[0], f), up); if (vec4.len(s) < 0.2) s = proj(proj(T[1], f), up); s = vec4.norm(s);
    const a0 = proj(proj(proj(T[2], f), up), s), an0 = vec4.norm(vec4.len(a0) < 1e-6 ? proj(proj(proj(T[0], f), up), s) : a0);
    if (c.kind === 'walker' && d < 40 && dt > 0) {
      // the roll that shows itself: v, the sideways direction most toward ana, and w across it, in your slice; its
      // side pair along w (square to your slice: four legs stand in it), its ana pair along v
      const v0 = vec4.add(vec4.scale(s, vec4.dot(A, s)), vec4.scale(an0, vec4.dot(A, an0))), lv = vec4.len(v0);
      if (lv > 1e-3) {
        const v = vec4.scale(v0, 1 / lv), w = vec4.add(vec4.scale(s, -vec4.dot(an0, v)), vec4.scale(an0, vec4.dot(s, v)));
        const want = vec4.dot(w, s) >= 0 ? w : vec4.scale(w, -1);  // (of the two such rolls, the nearer)
        const k = Math.min(1, dt * 1.5);
        s = vec4.norm(vec4.add(vec4.scale(s, 1 - k), vec4.scale(want, k)));
      }
    }
    c.side = s;
    let an = proj(proj(proj(an0, f), up), s); an = vec4.norm(vec4.len(an) < 1e-6 ? an0 : an);
    if (c.kind === 'walker') {
      const K = WALKER.k, ctr = vec4.scale(n, g + WALKER.height), rot = frameRot([f, s, an, up]), alarm = 0.6 * c.alarm;
      const head = vec4.add(ctr, vec4.add(vec4.scale(f, 0.4 * K), vec4.scale(up, 0.12 * K)));
      if (d < 35 && detailed < 10) {                          // eyes, for the nearer ones: on the head's front, either side
        detailed++;
        for (const sg of [-1, 1]) {
          const e = vec4.add(head, vec4.add(vec4.add(vec4.scale(f, 0.09 * K), vec4.scale(up, 0.08 * K)), vec4.scale(s, 0.07 * K * sg)));
          items.push(bodyProp(e, rot, [0.055 * K, 0.055 * K, 0.055 * K, 0.055 * K], SHAPE.ball, MAT.eye, 0));
          items.push(bodyProp(vec4.add(e, vec4.scale(f, 0.04 * K)), rot, [0.03 * K, 0.03 * K, 0.03 * K, 0.03 * K], SHAPE.ball, MAT.pupil, 0));
        }
      }
      // one skin (body, head and legs blended), for the nearest few; further off, the body and head alone, as props
      if (d < 45 && caps.length < 12) {
        const sk = { caps: [], c: vec4.scale(n, g + 0.45 * K), R: 1.25 * K, skin: true, glow: alarm };
        caps.push(sk);
        sk.caps.push([ctr, vec4.add(ctr, vec4.scale(up, 0.3 * K)), 0.46 * K, 10]);   // the body: flattened along up
        sk.caps.push([head, head, 0.13 * K, 11]);
        const sp = vec4.len(c.v) > 0.05 ? 1 : 0, dirs = [f, vec4.scale(f, -1), s, vec4.scale(s, -1), an, vec4.scale(an, -1)];
        dirs.forEach((D, i) => {
          // the gait: the pairs (forward and back, the sides, ana and kata) swing in turn, a third of a cycle each;
          // a standing foot keeps still on the ground while the body goes on
          const ph = (c.phase + Math.floor(i / 2) / 3) % 1, swing = ph < 1 / 3, u = swing ? 3 * ph : 1.5 * (ph - 1 / 3);
          const off = (swing ? -0.5 + u : 0.5 - u) * sp;
          const hip = vec4.add(ctr, vec4.add(vec4.scale(D, 0.3 * K), vec4.scale(up, -0.05 * K)));
          const knee = vec4.add(hip, vec4.add(vec4.scale(D, 0.35 * K), vec4.scale(up, 0.25 * K)));
          const fn = vec4.norm(vec4.add(vec4.add(vec4.scale(n, g), vec4.scale(D, 0.9 * K)), vec4.scale(f, off * WALKER.stride)));
          const foot = vec4.scale(fn, PLANET_R + hf.heightAt(fn) + (swing ? Math.sin(Math.PI * u) * 0.12 * K * sp : 0) + 0.03);
          sk.caps.push([hip, knee, WALKER.legR, 11], [knee, foot, WALKER.legR * 0.78, 11]);
        });
      } else {
        items.push(bodyProp(ctr, rot, [0.46 * K, 0.46 * K, 0.46 * K, 0.3 * K], SHAPE.ball, MAT.hide, alarm));
        items.push(bodyProp(head, rot, [0.13 * K, 0.13 * K, 0.13 * K, 0.13 * K], SHAPE.ball, MAT.hide, alarm));
      }
    } else {
      const a = ROLLER.a, ctr = vec4.scale(n, g + a * Math.SQRT2);
      const e0 = vec4.scale(vec4.sub(f, up), Math.SQRT1_2), e2 = vec4.scale(vec4.add(f, up), -Math.SQRT1_2);
      const R0 = frameRot([e0, s, e2, an]);
      const rot = R4.compose(R0, R4.compose(R4.planeRotation(0, 1, c.th1), R4.planeRotation(2, 3, c.th2)));
      items.push(bodyProp(ctr, rot, [a, a, a, a], SHAPE.duo, MAT.roller, 0.02 + 0.06 * c.alarm));
      if (d < 35 && detailed < 10) {                          // and two eyes on the face it rolls toward, which don't turn with it
        detailed++;
        const x = cross4(up, f, A), sw = vec4.len(x) > 0.2 ? vec4.norm(x) : s;   // sideways in your slice
        for (const sg of [-1, 1]) {
          const e = vec4.add(ctr, vec4.add(vec4.add(vec4.scale(f, a * 1.28), vec4.scale(up, 0.12)), vec4.scale(sw, 0.13 * sg)));
          items.push(bodyProp(e, rot, [0.075, 0.075, 0.075, 0.075], SHAPE.ball, MAT.eye, 0));
          items.push(bodyProp(vec4.add(e, vec4.scale(f, 0.05)), rot, [0.04, 0.04, 0.04, 0.04], SHAPE.ball, MAT.pupil, 0));
        }
      }
    }
  }
  return { items, caps };
}

// ---------- saving ----------
// Nothing to keep: the herds are found where they live, the same each time. (An older save's list of creatures is
// ignored.)
export const creaturesSave = { save: () => ({ v: 3 }), load: () => {} };
