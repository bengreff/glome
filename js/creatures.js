// Creatures: geometric bodies with real 4D body plans, and an ecosystem running behind the scenes.
//
// Walkers: a brushed-metal tesseract body on eight legs, which hang from the corners of its bottom cell. Those eight
// corners form two tetrahedra, and a tetrahedron of feet is the smallest stable stance on 3D ground, so a walker
// walks on two alternating tetrapods, the way a six-legged insect alternates tripods. Walkers are shy: come close
// and they leave your slice, walking off through ana.
// Rollers: duocylinders, rolling by turning in two planes at once (a way of moving with no 3D counterpart). They are
// curious: they come and circle you.
// Behind the scenes: walkers graze where there is grass, keep together in herds, are born when well fed and die when
// starved or old; rollers live on sunlight. You never see a number; you see herds, and empty valleys.
// (Gaits are kinematic: feet are placed by rule and the body is carried by them. PHYSICS.md says so.)
import { G } from './game.js';
import { vec4 } from './player.js';
import { PLANET_R } from './world.js';
import { tangents } from './env.js';
import { rot as R4 } from './so4.js';

export const creatures = { list: [], t: 0, nextId: 1, seed: 99 };
const rnd = () => ((creatures.seed = (Math.imul(creatures.seed, 1103515245) + 12345) >>> 0) / 4294967296);
const WALKER = { body: 0.44, height: 0.62, reach: 0.58, stride: 0.42, legR: 0.05 };
const ROLLER = { a: 0.34 };
const proj = (v, n) => vec4.sub(v, vec4.scale(n, vec4.dot(v, n)));
const along = (n, d, m) => vec4.norm(vec4.add(vec4.scale(n, Math.cos(m / PLANET_R)), vec4.scale(d, Math.sin(m / PLANET_R))));

function make(kind, n) {
  const T = tangents(n), a = rnd() * 6.283, b = rnd() * 6.283;
  const h = vec4.norm(vec4.add(vec4.add(vec4.scale(T[0], Math.cos(a)), vec4.scale(T[1], Math.sin(a) * Math.cos(b))), vec4.scale(T[2], Math.sin(a) * Math.sin(b))));
  return { id: creatures.nextId++, kind, n, v: vec4.scale(h, 0.3), heading: h, energy: 0.8 + 0.4 * rnd(), age: rnd() * 300, phase: rnd(), th1: 0, th2: 0, alarm: 0 };
}
// Herds of walkers on grassland, and rollers scattered: the same planet for everyone.
export function initCreatures(hf) {
  creatures.list.length = 0; creatures.seed = 99;
  const grass = n => { const h = hf.heightAt(n); return h > 2 && h < 22 && hf.waterAt(n) < 0.01; };
  const randomUnit = () => vec4.norm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]);
  let herds = 0;
  for (let k = 0; k < 400 && herds < 5; k++) {
    const c = randomUnit();
    if (!grass(c)) continue;
    herds++;
    const size = 5 + Math.floor(rnd() * 6);
    for (let i = 0; i < size; i++) {
      const T = tangents(c), d = vec4.norm(vec4.add(vec4.add(vec4.scale(T[0], rnd() - 0.5), vec4.scale(T[1], rnd() - 0.5)), vec4.scale(T[2], rnd() - 0.5)));
      const n = along(c, d, 2 + 10 * rnd());
      if (grass(n)) creatures.list.push(make('walker', n));
    }
  }
  for (let k = 0, made = 0; k < 400 && made < 10; k++) { const n = randomUnit(); if (grass(n)) { creatures.list.push(make('roller', n)); made++; } }
  // a small herd within sight of the start, so the first walk meets them
  const home = G.player.up();
  for (let i = 0; i < 5; i++) {
    const T = tangents(home), d = vec4.norm(vec4.add(vec4.add(vec4.scale(T[0], rnd() - 0.5), vec4.scale(T[1], rnd() - 0.5)), vec4.scale(T[2], rnd() - 0.5)));
    const n = along(home, d, 26 + 8 * rnd());
    if (grass(n)) creatures.list.push(make('walker', n));
  }
}

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
    for (const o of all) {
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
    // shy: within 14 m of you they walk away, out of your slice, through ana
    if (dMe < 14) {
      const away = vec4.norm(proj(vec4.sub(n, me), n)), side = vec4.dot(vec4.sub(n, me), p.A) >= 0 ? 1 : -1;
      want = vec4.add(vec4.scale(away, 0.6), vec4.scale(proj(p.A, n), 1.6 * side));
      speed = 2.2; c.alarm = 1;
    }
  } else {
    // rollers live on sunlight
    const day = G.sun ? Math.max(0, Math.min(1, (vec4.dot(G.sun, n) + 0.1) / 0.4)) : 0.5;
    c.energy += dt * (0.03 * day - 0.008);
    want = c.heading;
    speed = 0.7;
    // curious: within 30 m they come and circle you, in your slice, where you can see them
    if (dMe < 30) {
      c.orbit = (c.orbit || rnd() * 6.283) + dt * 0.35;
      const tgt = vec4.norm(vec4.add(vec4.scale(me, Math.cos(5.5 / PLANET_R)), vec4.scale(vec4.norm(vec4.add(vec4.scale(p.F, Math.cos(c.orbit)), vec4.scale(p.R, Math.sin(c.orbit)))), Math.sin(5.5 / PLANET_R))));
      want = proj(vec4.sub(tgt, n), n); speed = Math.min(3, 0.5 + vec4.len(want) * PLANET_R * 0.6); c.alarm = 1;
    } else if (rnd() < 0.05 * dt) c.heading = vec4.norm(vec4.add(c.heading, [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]));
    if (h < 1 || hf.waterAt(n) > 0.01) want = vec4.scale(want, -1);
  }
  const wl = vec4.len(want);
  c.target = wl > 1e-9 ? vec4.scale(proj(want, n), speed / Math.max(1e-9, vec4.len(proj(want, n)))) : [0, 0, 0, 0];
}
function lifeAndDeath(hf) {
  const L = creatures.list, born = [];
  let walkers = L.filter(c => c.kind === 'walker').length, rollers = L.length - walkers;
  for (const c of L) {
    if (c.energy > 1.6 && (c.kind === 'walker' ? walkers < 90 : rollers < 20)) {
      // crowding: a herd of more than eight within 30 m has no room for more young
      if (c.kind === 'walker' && L.filter(o => o.kind === 'walker' && vec4.dot(o.n, c.n) > Math.cos(30 / PLANET_R)).length > 8) continue;
      if (c.kind === 'walker') walkers++; else rollers++;
      c.energy /= 2;
      const T = tangents(c.n), d = vec4.norm(vec4.add(vec4.scale(T[0], rnd() - 0.5), vec4.scale(T[1], rnd() - 0.5)));
      const k = make(c.kind, along(c.n, d, 1.5)); k.energy = c.energy; k.age = 0; born.push(k);
    }
  }
  creatures.list = L.filter(c => c.energy > 0 && c.age < (c.kind === 'walker' ? 1500 : 2600)).concat(born);
}

// Each frame: move everything (on the 3-sphere), and think a few times a second.
export function stepCreatures(dt, hf) {
  const p = G.player;
  creatures.t += dt;
  const thinkNow = creatures.t > 0.5;
  if (thinkNow) { for (const c of creatures.list) think(c, creatures.list, hf, p, creatures.t); creatures.tLife = (creatures.tLife || 0) + creatures.t; creatures.t = 0; }
  if ((creatures.tLife || 0) > 5) { lifeAndDeath(hf); creatures.tLife = 0; }
  for (const c of creatures.list) {
    if (!c.target) continue;
    c.v = vec4.add(c.v, vec4.scale(vec4.sub(c.target, c.v), Math.min(1, dt * 2)));
    c.v = proj(c.v, c.n);
    const sp = vec4.len(c.v);
    if (sp > 1e-4) {
      c.n = along(c.n, vec4.scale(c.v, 1 / sp), sp * dt);
      c.v = proj(c.v, c.n);
      c.heading = vec4.norm(vec4.add(vec4.scale(c.heading, 0.9), vec4.scale(c.v, 0.1 / sp)));
    }
    c.heading = vec4.norm(proj(c.heading, c.n));
    c.phase = (c.phase + dt * sp / (2 * WALKER.stride)) % 1;
    c.th1 += dt * sp / ROLLER.a; c.th2 += dt * sp / ROLLER.a * 0.81;
    c.alarm = Math.max(0, c.alarm - dt * 0.5);
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
export function creatureDraw(eye, A, hf) {
  const items = [], caps = [];
  const near = creatures.list.map(c => ({ c, d: vec4.len(vec4.sub(vec4.scale(c.n, PLANET_R), eye)) })).filter(x => x.d < 90).sort((x, y) => x.d - y.d);
  for (const { c, d } of near.slice(0, 8)) {
    const n = c.n, g = PLANET_R + hf.heightAt(n), up = n;
    const f = c.heading, T = tangents(n);
    let s = vec4.norm(proj(proj(T[0], f), up)); if (!isFinite(s[0])) s = vec4.norm(proj(proj(T[1], f), up));
    const an = vec4.norm(proj(proj(proj(T[2], f), up), s).some(Number.isNaN) ? T[1] : proj(proj(proj(T[2], f), up), s));
    if (c.kind === 'walker') {
      const hb = WALKER.body / 2, ctr = vec4.scale(n, g + WALKER.height);
      items.push({ pos: ctr, rot: frameRot([f, s, an, up]), shape: 'tesseract', half: hb, size: WALKER.body, mat: 1, glow: 0.6 * c.alarm, d, creature: c });
      if (caps.length / 2 < 64) for (let i = 0; i < 8; i++) {
        const cx = i & 1 ? 1 : -1, cy = i & 2 ? 1 : -1, cz = i & 4 ? 1 : -1, tetA = cx * cy * cz > 0;
        const hip = vec4.add(ctr, vec4.add(vec4.scale(up, -hb), vec4.add(vec4.add(vec4.scale(f, cx * hb), vec4.scale(s, cy * hb)), vec4.scale(an, cz * hb))));
        const out = vec4.norm(vec4.add(vec4.add(vec4.scale(f, cx), vec4.scale(s, cy)), vec4.scale(an, cz)));
        // the gait: a tetrapod swings while the other stands; standing feet keep still on the ground
        const ph = (c.phase + (tetA ? 0 : 0.5)) % 1, swing = ph < 0.5;
        const off = swing ? -0.5 + 2 * ph : 0.5 - 2 * (ph - 0.5), sp = vec4.len(c.v) > 0.05 ? 1 : 0;
        let foot = vec4.add(vec4.add(vec4.scale(n, g), vec4.scale(out, WALKER.reach)), vec4.scale(f, off * WALKER.stride * sp));
        const fn = vec4.norm(foot);
        foot = vec4.scale(fn, PLANET_R + hf.heightAt(fn) + (swing ? Math.sin(Math.PI * 2 * ph) * 0.12 * sp : 0) + 0.02);
        const knee = vec4.add(vec4.scale(vec4.add(hip, foot), 0.5), vec4.add(vec4.scale(up, 0.2), vec4.scale(out, 0.08)));
        caps.push([hip, knee], [knee, foot]);
      }
    } else {
      const a = ROLLER.a, ctr = vec4.scale(n, g + a * Math.SQRT2);
      const e0 = vec4.scale(vec4.sub(f, up), Math.SQRT1_2), e2 = vec4.scale(vec4.add(f, up), -Math.SQRT1_2);
      const R0 = frameRot([e0, s, e2, an]);
      const rot = R4.compose(R0, R4.compose(R4.planeRotation(0, 1, c.th1), R4.planeRotation(2, 3, c.th2)));
      items.push({ pos: ctr, rot, shape: 'duo', half: a, size: a, mat: 0, glow: 0.15 + 0.55 * c.alarm, d, creature: c });
    }
  }
  return { items, caps };
}

// ---------- saving ----------
export const creaturesSave = {
  save: () => ({ seed: creatures.seed, next: creatures.nextId, list: creatures.list.map(c => ({ k: c.kind, n: c.n.map(x => Math.round(x * 1e6) / 1e6), e: Math.round(c.energy * 1000) / 1000, a: Math.round(c.age) })) }),
  load: s => {
    if (!s || !s.list) return;
    creatures.seed = s.seed; creatures.nextId = s.next || 1;
    creatures.list = s.list.map(o => { const c = make(o.k, vec4.norm(o.n)); c.energy = o.e; c.age = o.a; return c; });
  },
};
