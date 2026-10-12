// Creatures: geometric bodies with real 4D body plans, and an ecosystem running behind the scenes.
//
// Walkers: a long tawny body and a head with two eyes, on eight legs, which hang from the corners of its bottom cell. Those eight
// corners form two tetrahedra, and a tetrahedron of feet is the smallest stable stance on 3D ground, so a walker
// walks on two alternating tetrapods, the way a six-legged insect alternates tripods. Most walkers are curious: they
// keep a few metres off, come into your slice and turn to look at you, and only bolt if you rush at them. The rest are
// shy: come close and they trot away, and some leave your slice, walking off through ana.
// Only what you can see is simulated closely: creatures within 70 m move every frame; the rest move in coarse steps
// when they think (twice a second), which is all the ecosystem needs.
// Rollers: duocylinders, rolling by turning in two planes at once (a way of moving with no 3D counterpart). They are
// curious: they come and circle you, and they play: a ball rolling nearby, they chase and knock on.
// Behind the scenes: walkers graze where there is grass, keep together in herds, are born when well fed and die when
// starved or old; rollers live on sunlight. You never see a number; you see herds, and empty valleys.
// (Gaits are kinematic: feet are placed by rule and the body is carried by them. PHYSICS.md says so.)
import { G } from './game.js';
import { vec4 } from './player.js';
import { PLANET_R } from './world.js';
import { tangents } from './env.js';
import { rot as R4 } from './so4.js';
import { bodyProp, SHAPE, MAT } from './props.js';

export const creatures = { list: [], t: 0, nextId: 1, seed: 99 };
const rnd = () => ((creatures.seed = (Math.imul(creatures.seed, 1103515245) + 12345) >>> 0) / 4294967296);
const WALKER = { height: 0.8, stride: 0.5, legR: 0.07 };
const ROLLER = { a: 0.48 };
const proj = (v, n) => vec4.sub(v, vec4.scale(n, vec4.dot(v, n)));
const along = (n, d, m) => vec4.norm(vec4.add(vec4.scale(n, Math.cos(m / PLANET_R)), vec4.scale(d, Math.sin(m / PLANET_R))));

function make(kind, n) {
  const T = tangents(n), a = rnd() * 6.283, b = rnd() * 6.283;
  const h = vec4.norm(vec4.add(vec4.add(vec4.scale(T[0], Math.cos(a)), vec4.scale(T[1], Math.sin(a) * Math.cos(b))), vec4.scale(T[2], Math.sin(a) * Math.sin(b))));
  return { id: creatures.nextId++, kind, n, v: vec4.scale(h, 0.3), heading: h, energy: 0.8 + 0.4 * rnd(), age: rnd() * 300, phase: rnd(), th1: 0, th2: 0, alarm: 0, curious: kind === 'walker' && rnd() < 0.6, slip: rnd() < 0.35 };
}
// Herds of walkers on grassland, and rollers scattered: the same planet for everyone. Herds live near where you
// arrive, along the way up to the summit, by the artifacts, and all over the grassland; rollers too.
export function initCreatures(hf, places = []) {
  creatures.list.length = 0; creatures.seed = 99;
  const grass = n => { const h = hf.heightAt(n); return h > 2 && h < 22 && hf.waterAt(n) < 0.01; };
  const randomUnit = () => vec4.norm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]);
  const randDir = c => { const T = tangents(c); return vec4.norm(vec4.add(vec4.add(vec4.scale(T[0], rnd() - 0.5), vec4.scale(T[1], rnd() - 0.5)), vec4.scale(T[2], rnd() - 0.5))); };
  const herd = (c, size, spread = 10) => { let k = 0; for (let i = 0; i < size * 3 && k < size; i++) { const n = along(c, randDir(c), 2 + spread * rnd()); if (grass(n)) { creatures.list.push(make('walker', n)); k++; } } return k; };
  // where you will go first: places = [[unit, radius around it to look for grass, herd size]]
  for (const [c, R, size] of places) for (let i = 0; i < 60; i++) { const n = along(c, randDir(c), R * Math.sqrt(rnd())); if (grass(n)) { herd(n, size); break; } }
  let herds = 0;
  for (let k = 0; k < 3000 && herds < 18; k++) { const c = randomUnit(); if (grass(c)) { herds++; herd(c, 5 + Math.floor(rnd() * 7)); } }
  const home = G.player.up();
  for (let k = 0, made = 0; k < 600 && made < 6; k++) { const n = along(home, randDir(home), 15 + 45 * rnd()); if (grass(n)) { creatures.list.push(make('roller', n)); made++; } }
  for (let k = 0, made = 0; k < 2000 && made < 34; k++) { const n = randomUnit(); if (grass(n)) { creatures.list.push(make('roller', n)); made++; } }
}

// A walker set down at unit n (the few in your first view).
export function addWalker(n, curious) { const c = make('walker', n); c.curious = curious; creatures.list.push(c); return c; }

// ---------- the ecosystem and their minds (a few times a second) ----------
function think(c, all, hf, p, dt) {
  const n = c.n, h = hf.heightAt(n);
  const onGrass = h > 2 && h < 22 && hf.waterAt(n) < 0.01;
  c.age += dt;
  let want = [0, 0, 0, 0], speed;
  const me = p && p.onB == null ? vec4.norm(p.pos) : null, dMe = me ? Math.acos(Math.max(-1, Math.min(1, vec4.dot(me, n)))) * PLANET_R : 1e9;
  if (c.kind === 'walker') {
    c.energy += dt * ((onGrass ? 0.022 : 0) - 0.011);
    // herd: keep near neighbours, move with them, don't crowd
    let coh = [0, 0, 0, 0], ali = [0, 0, 0, 0], sep = [0, 0, 0, 0], k = 0;
    for (const o of neighbours(c)) {
      if (o === c || o.kind !== 'walker') continue;
      const d = Math.acos(Math.max(-1, Math.min(1, vec4.dot(o.n, n)))) * PLANET_R;
      if (d > 30) continue;
      k++;
      coh = vec4.add(coh, proj(vec4.sub(o.n, n), n));
      ali = vec4.add(ali, o.v);
      if (d < 2.5) sep = vec4.sub(sep, vec4.scale(proj(vec4.sub(o.n, n), n), 4 / Math.max(d, 0.3)));
    }
    if (k) want = vec4.add(want, vec4.add(vec4.add(vec4.scale(coh, 0.6 * PLANET_R / k / 15), vec4.scale(ali, 0.6 / k)), sep));
    // graze toward grass: off it, climb or descend toward it
    if (!onGrass) {
      const T = tangents(n); let g = [0, 0, 0, 0];
      for (const t of T) { const dh = hf.heightAt(along(n, t, 2)) - hf.heightAt(along(n, t, -2)); g = vec4.add(g, vec4.scale(t, dh)); }
      want = vec4.add(want, vec4.scale(vec4.norm(vec4.add(g, [1e-9, 0, 0, 0])), h < 2 ? 1 : -1));
    }
    speed = 0.45;
    // startled by anything flying past fast: away from it
    const fly = toys(o => vec4.len(o.vel) > 3 && vec4.dot(vec4.norm(o.pos), n) > Math.cos(8 / PLANET_R), true)[0];
    if (fly) { want = vec4.add(want, vec4.scale(vec4.norm(proj(vec4.sub(n, vec4.norm(fly.pos)), n)), 2)); speed = 1.8; c.alarm = 1; }
    // rushed at (you coming at it faster than a walk, within 10 m): it bolts, curious or not
    const toIt = me ? vec4.norm(proj(vec4.sub(n, me), me)) : null;
    if (me && dMe < 10 && vec4.dot(p.vel, toIt) > 3.2) c.spooked = G.simT + 6;
    // curious: it keeps 6–9 m off, turns to face you, and comes into your slice (its offset toward ana shrinks)
    if (c.curious && dMe < 30 && !(G.simT < c.spooked)) {
      const a = vec4.dot(vec4.sub(n, me), p.A);                  // how far it lies from your slice, toward ana
      let w = vec4.scale(proj(p.A, n), -a * PLANET_R * 0.3);     // into your slice (a: its offset, on the unit sphere)
      const away = vec4.norm(proj(vec4.sub(n, me), n));
      w = vec4.add(w, vec4.scale(away, dMe < 6 ? 1.2 : dMe > 9 ? -0.6 : 0));   // at a respectful distance
      want = w; speed = Math.min(1.1, 0.25 + vec4.len(w) * 0.5); c.alarm = Math.max(c.alarm, 0.25);
      c.heading = vec4.norm(vec4.add(c.heading, vec4.scale(away, -0.2)));       // looking at you
    }
    // shy: within 14 m of you they trot away; some slip out of your slice, through ana
    else if (dMe < 14) {
      const away = vec4.norm(proj(vec4.sub(n, me), n)), side = vec4.dot(vec4.sub(n, me), p.A) >= 0 ? 1 : -1;
      want = c.slip ? vec4.add(vec4.scale(away, 0.6), vec4.scale(proj(p.A, n), 1.6 * side)) : away;
      speed = c.slip ? 2.2 : 1.6; c.alarm = 1;
    }
  } else {
    // rollers live on sunlight
    const day = G.sun ? Math.max(0, Math.min(1, (vec4.dot(G.sun, n) + 0.1) / 0.4)) : 0.5;
    c.energy += dt * (0.03 * day - 0.008);
    want = c.heading;
    speed = 0.7;
    // playful: a ball that is rolling (or was, a few seconds ago) within 25 m, they chase and knock on (below)
    let toy = null, td = 25;
    for (const o of toys(o => o.shape === 'glome' && !o.light && (o.toyUntil || 0) > G.simT)) {
      const d = Math.acos(Math.max(-1, Math.min(1, vec4.dot(vec4.norm(o.pos), n)))) * PLANET_R;
      if (d < td) { td = d; toy = o; }
    }
    if (toy && !c.toy && G.audio && dMe < 40) G.audio.emit('chirp', vec4.scale(n, PLANET_R + h + 0.5), 0.8);   // a roller takes an interest
    c.toy = toy;
    if (toy) { want = proj(vec4.sub(vec4.norm(toy.pos), n), n); speed = Math.min(3.4, 1 + td); c.alarm = 1; }
    // curious: within 30 m they come and circle you, in your slice, where you can see them
    else if (dMe < 30) {
      c.orbit = (c.orbit || rnd() * 6.283) + dt * 0.35;
      const tgt = vec4.norm(vec4.add(vec4.scale(me, Math.cos(5.5 / PLANET_R)), vec4.scale(vec4.norm(vec4.add(vec4.scale(p.F, Math.cos(c.orbit)), vec4.scale(p.R, Math.sin(c.orbit)))), Math.sin(5.5 / PLANET_R))));
      want = proj(vec4.sub(tgt, n), n); speed = Math.min(3, 0.5 + vec4.len(want) * PLANET_R * 0.6); c.alarm = 1;
    } else if (rnd() < 0.05 * dt) c.heading = vec4.norm(vec4.add(c.heading, [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]));
    if (h < 1 || hf.waterAt(n) > 0.01) want = vec4.scale(want, -1);
  }
  const wl = vec4.len(want);
  c.target = wl > 1e-9 ? vec4.scale(proj(want, n), speed / Math.max(1e-9, vec4.len(proj(want, n)))) : [0, 0, 0, 0];
}
// Neighbours for herding: walkers in the same or adjacent 30 m cells (a grid on the unit 3-sphere, rebuilt as they think).
const CELLN = PLANET_R / 30, grid = new Map();
const cellOf = n => n.map(v => Math.floor(v * CELLN));
function buildGrid(all) {
  grid.clear();
  for (const o of all) if (o.kind === 'walker') { const k = cellOf(o.n).join(); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(o); }
}
function neighbours(c) {
  const k = cellOf(c.n), out = [];
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) for (let e = -1; e <= 1; e++) {
    const L = grid.get([k[0] + a, k[1] + b, k[2] + d, k[3] + e].join()); if (L) for (const o of L) out.push(o);
  }
  return out;
}
// The loose things in A's world that creatures notice (G.objects is set by main.js).
function toys(test, first = false) {
  const w = G.objects && G.objects.world, out = [];
  if (!w) return out;
  for (const o of w.bodies) if (!o.fixed && !o.held && !o.inB && test(o)) { out.push(o); if (first) break; }
  return out;
}
function lifeAndDeath(hf) {
  const L = creatures.list, born = [];
  let walkers = L.filter(c => c.kind === 'walker').length, rollers = L.length - walkers;
  for (const c of L) {
    if (c.energy > 1.6 && (c.kind === 'walker' ? walkers < 220 : rollers < 50)) {
      // crowding: a herd of more than eight within 30 m has no room for more young
      if (c.kind === 'walker' && neighbours(c).filter(o => o !== c && vec4.dot(o.n, c.n) > Math.cos(30 / PLANET_R)).length > 8) continue;
      if (c.kind === 'walker') walkers++; else rollers++;
      c.energy /= 2;
      const T = tangents(c.n), d = vec4.norm(vec4.add(vec4.scale(T[0], rnd() - 0.5), vec4.scale(T[1], rnd() - 0.5)));
      const k = make(c.kind, along(c.n, d, 1.5)); k.energy = c.energy; k.age = 0; k.curious = c.curious; born.push(k);
    }
  }
  creatures.list = L.filter(c => c.energy > 0 && c.age < (c.kind === 'walker' ? 1500 : 2600)).concat(born);
}

// Each frame: move everything (on the 3-sphere), and think a few times a second.
export function stepCreatures(dt, hf) {
  const p = G.player;
  creatures.t += dt;
  for (const o of toys(o => o.shape === 'glome' && vec4.len(o.vel) > 0.4)) o.toyUntil = G.simT + 6;   // a rolling ball is a toy a while
  const me = p && p.onB == null && p.pos ? vec4.norm(p.pos) : null, nearCos = Math.cos(70 / PLANET_R);
  const thinkNow = creatures.t > 0.5;
  if (thinkNow) {
    const tt = creatures.t;
    buildGrid(creatures.list);
    for (const c of creatures.list) {
      think(c, creatures.list, hf, p, tt);
      c.near = !!me && vec4.dot(me, c.n) > nearCos;
      if (!c.near && c.target) {                               // out of sight: a coarse step, as far as it would go
        const sp = vec4.len(c.target);
        c.v = c.target;
        if (sp > 1e-4) { c.n = along(c.n, vec4.scale(c.target, 1 / sp), sp * tt); c.heading = vec4.norm(proj(c.target, c.n)); c.v = proj(c.v, c.n); }
      }
    }
    creatures.tLife = (creatures.tLife || 0) + tt; creatures.t = 0;
  }
  if ((creatures.tLife || 0) > 5) { lifeAndDeath(hf); creatures.tLife = 0; }
  for (const c of creatures.list) {
    if (!c.target || !c.near) continue;
    c.v = vec4.add(c.v, vec4.scale(vec4.sub(c.target, c.v), Math.min(1, dt * 2)));
    c.v = proj(c.v, c.n);
    const sp = vec4.len(c.v);
    if (sp > 1e-4) {
      c.n = along(c.n, vec4.scale(c.v, 1 / sp), sp * dt);
      c.v = proj(c.v, c.n);
      c.heading = vec4.norm(vec4.add(vec4.scale(c.heading, 0.9), vec4.scale(c.v, 0.1 / sp)));
    }
    c.heading = vec4.norm(proj(c.heading, c.n));
    const ph0 = c.phase;
    c.phase = (c.phase + dt * sp / (2 * WALKER.stride)) % 1;
    // a walker's tetrapod lands twice a stride: a tick, if you are near enough to hear it
    if (c.kind === 'walker' && G.audio && p && p.onB == null && (Math.floor(ph0 * 2) !== Math.floor(c.phase * 2) || c.phase < ph0)) {
      const pos = vec4.scale(c.n, PLANET_R + hf.heightAt(c.n)), dd = vec4.len(vec4.sub(pos, p.pos));
      if (dd < 18) G.audio.emit('tick', pos, 0.5 + 0.3 * Math.random());   // (not the ecosystem's own random stream)
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
  const near = creatures.list.filter(c => c.near).map(c => ({ c, d: vec4.len(vec4.sub(vec4.scale(c.n, PLANET_R), eye)) })).filter(x => x.d < 90).sort((x, y) => x.d - y.d);
  let detailed = 0;
  for (const { c, d } of near.slice(0, 32)) {
    const n = c.n, g = PLANET_R + hf.heightAt(n), up = n;
    const f = c.heading, T = tangents(n);
    // the two sideways directions: s (kept from frame to frame) and an, perpendicular to it
    let s = proj(proj(c.side || T[0], f), up); if (vec4.len(s) < 0.2) s = proj(proj(T[1], f), up); s = vec4.norm(s);
    const a0 = proj(proj(proj(T[2], f), up), s), an0 = vec4.norm(vec4.len(a0) < 1e-6 ? proj(proj(proj(T[0], f), up), s) : a0);
    if (c.kind === 'walker' && d < 40 && dt > 0) {
      // the roll that shows itself: v, the sideways direction most toward ana, and w across it, in your slice;
      // s at 45° between them
      const v0 = vec4.add(vec4.scale(s, vec4.dot(A, s)), vec4.scale(an0, vec4.dot(A, an0))), lv = vec4.len(v0);
      if (lv > 1e-3) {
        const v = vec4.scale(v0, 1 / lv), w = vec4.add(vec4.scale(s, -vec4.dot(an0, v)), vec4.scale(an0, vec4.dot(s, v)));
        let want = null, best = -2;                             // of the four such rolls, the nearest
        for (const [x, y] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const q = vec4.norm(vec4.add(vec4.scale(w, x), vec4.scale(v, y))), dq = vec4.dot(q, s); if (dq > best) { best = dq; want = q; } }
        const k = Math.min(1, dt * 1.5);
        s = vec4.norm(vec4.add(vec4.scale(s, 1 - k), vec4.scale(want, k)));
      }
    }
    c.side = s;
    let an = proj(proj(proj(an0, f), up), s); an = vec4.norm(vec4.len(an) < 1e-6 ? an0 : an);
    if (c.kind === 'walker') {
      const ctr = vec4.scale(n, g + WALKER.height), wv = vec4.norm(vec4.add(s, an)), rot = frameRot([f, s, an, up]);
      items.push(bodyProp(ctr, rot, [0.5, 0.3, 0.3, 0.27], SHAPE.ball, MAT.hide, 0.6 * c.alarm));
      const head = vec4.add(ctr, vec4.add(vec4.scale(f, 0.52), vec4.scale(up, 0.2)));
      items.push(bodyProp(head, rot, [0.2, 0.18, 0.18, 0.18], SHAPE.ball, MAT.hide, 0.6 * c.alarm));
      if (d < 35 && detailed < 10) {                          // eyes, for the nearer ones
        detailed++;
        for (const sg of [-1, 1]) {
          const e = vec4.add(head, vec4.add(vec4.add(vec4.scale(f, 0.13), vec4.scale(up, 0.06)), vec4.scale(wv, 0.1 * sg)));
          items.push(bodyProp(e, rot, [0.07, 0.07, 0.07, 0.07], SHAPE.ball, MAT.eye, 0));
          items.push(bodyProp(vec4.add(e, vec4.scale(f, 0.05)), rot, [0.038, 0.038, 0.038, 0.038], SHAPE.ball, MAT.pupil, 0));
        }
      }
      // legs are thin: drawn only for the nearest few walkers (they share one bounding ball in the shader)
      const lg = { caps: [], c: vec4.scale(n, g + 0.45), R: 1.8 };
      if (d < 45 && caps.length < 12) { caps.push(lg); for (let i = 0; i < 8; i++) {
        const cx = i & 1 ? 1 : -1, cy = i & 2 ? 1 : -1, cz = i & 4 ? 1 : -1, tetA = cx * cy * cz > 0;
        const hip = vec4.add(ctr, vec4.add(vec4.scale(up, -0.12), vec4.add(vec4.add(vec4.scale(f, cx * 0.3), vec4.scale(s, cy * 0.15)), vec4.scale(an, cz * 0.15))));
        const out = vec4.add(vec4.add(vec4.scale(f, cx * 0.5), vec4.scale(s, cy * 0.26)), vec4.scale(an, cz * 0.26));   // feet a little outside the hips
        // the gait: a tetrapod swings while the other stands; standing feet keep still on the ground
        const ph = (c.phase + (tetA ? 0 : 0.5)) % 1, swing = ph < 0.5;
        const off = swing ? -0.5 + 2 * ph : 0.5 - 2 * (ph - 0.5), sp = vec4.len(c.v) > 0.05 ? 1 : 0;
        let foot = vec4.add(vec4.add(vec4.scale(n, g), out), vec4.scale(f, off * WALKER.stride * sp));
        const fn = vec4.norm(foot);
        foot = vec4.scale(fn, PLANET_R + hf.heightAt(fn) + (swing ? Math.sin(Math.PI * 2 * ph) * 0.14 * sp : 0) + 0.02);
        const knee = vec4.add(vec4.scale(vec4.add(hip, foot), 0.5), vec4.add(vec4.scale(up, 0.04), vec4.scale(f, cx * 0.12)));
        lg.caps.push([hip, knee, WALKER.legR, 3], [knee, foot, WALKER.legR * 0.8, 3]);
      } }
    } else {
      const a = ROLLER.a, ctr = vec4.scale(n, g + a * Math.SQRT2);
      const e0 = vec4.scale(vec4.sub(f, up), Math.SQRT1_2), e2 = vec4.scale(vec4.add(f, up), -Math.SQRT1_2);
      const R0 = frameRot([e0, s, e2, an]);
      const rot = R4.compose(R0, R4.compose(R4.planeRotation(0, 1, c.th1), R4.planeRotation(2, 3, c.th2)));
      items.push(bodyProp(ctr, rot, [a, a, a, a], SHAPE.duo, MAT.roller, 0.15 + 0.55 * c.alarm));
    }
  }
  return { items, caps };
}

// ---------- saving ----------
export const creaturesSave = {
  save: () => ({ seed: creatures.seed, next: creatures.nextId, list: creatures.list.map(c => ({ k: c.kind, n: c.n.map(x => Math.round(x * 1e6) / 1e6), e: Math.round(c.energy * 1000) / 1000, a: Math.round(c.age), c: c.curious ? 1 : 0 })) }),
  load: s => {
    if (!s || !s.list) return;
    creatures.seed = s.seed; creatures.nextId = s.next || 1;
    creatures.list = s.list.map(o => { const c = make(o.k, vec4.norm(o.n)); c.energy = o.e; c.age = o.a; c.curious = o.k === 'walker' && (o.c === 1 || (o.c == null && c.curious)); return c; });
  },
};
