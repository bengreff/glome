// The artifacts: wordless puzzles in the same geometric language as everything else, matte stone and brushed metal,
// with the one accent colour for what responds. Each opens only to a genuinely 4D idea, and holds a launcher part
// (in a stone vault) and a couple of impulse stones. Solving one marks the next on your radar.
//   I    the closed room: the cave, whose only way in leaves its chamber toward ana (part I lies inside).
//   II   the mirror key: a mould on a plinth, four of its eight cells solid, and a brass key that is the empty cells'
//        mirror image. No turn in 3D makes a thing its mirror image; half a turn through ana does, and then the key
//        slides in, completing the cube, and the house beside it opens.
//   III  the knot gate (knot.js): a heavy leaf hung by its foot, leaning in, held shut by a rope whose loop hangs
//        over a peg with a knob on its end. In 3D the loop is captive; in 4D it lifts off the peg through ana.
//   IV   the antipode: what you leave in the bowl on the summit opens the vault at the planet's opposite point.
//        (The bowl is carved, in landforms' way: a 4D ball taken out of the summit.)
import { G } from './game.js';
import { vec4 } from './player.js';
import { PLANET_R } from './world.js';
import { tangents } from './env.js';
import { rot as R4 } from './so4.js';
import { makeBody } from './bodies.js';
import { objects, spawn, KINDS } from './objects.js';
import { launcher } from './launcher.js';
import { carves } from './landforms.js';
import { makeProp, addRock, SHAPE, MAT } from './props.js';
import { mouldParts, MOULD, cellCentre, RING } from './keys.js';
import { reachAlong, bodyOf, spawnAt } from './objects.js';
import { gateParts, gateBuild, GATE } from './knot.js';
import { terrainSD } from './env.js';

export const artifacts = [];        // { id, name, n (unit position), solved(), vault, part, ... }
const off = (u, t, m) => vec4.norm(vec4.add(vec4.scale(u, Math.cos(m / PLANET_R)), vec4.scale(t, Math.sin(m / PLANET_R))));
const proj = (v, n) => vec4.norm(vec4.sub(v, vec4.scale(n, vec4.dot(v, n))));
function rotFromCols(cols) {
  const rows = [0, 1, 2, 3].map(r => cols.map(c => c[r]));
  const M = rows;
  let d = 0;
  for (let j = 0; j < 4; j++) { const m = [1, 2, 3].map(i => M[i].filter((_, k) => k !== j)); d += (j % 2 ? -1 : 1) * M[0][j] * (m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])); }
  if (d < 0) rows.forEach(r => { r[3] = -r[3]; });
  return R4.fromMatrix(rows);
}
// A ground frame at unit n: three tangents and up, as a proper rotation (columns).
function frameAt(n, f0) {
  const T = tangents(n), f = proj(f0 || T[0], n);
  let s = proj(vec4.sub(T[1], vec4.scale(f, vec4.dot(T[1], f))), n); if (Math.abs(vec4.dot(f, T[1])) > 0.95) s = proj(vec4.sub(T[2], vec4.scale(f, vec4.dot(T[2], f))), n);
  let a = vec4.sub(vec4.sub(T[2], vec4.scale(f, vec4.dot(T[2], f))), vec4.scale(s, vec4.dot(T[2], s)));
  if (vec4.len(a) < 0.3) a = vec4.sub(vec4.sub(T[0], vec4.scale(f, vec4.dot(T[0], f))), vec4.scale(s, vec4.dot(T[0], s)));
  a = proj(a, n);
  return { f, s, a, up: n };
}
// A fixed block of the builder's dark stone (or metal), a tesseract of the given side, resting on the ground: unlike
// the pale things you can carry, its edges are faintly lit.
function block(n, side, { lift = 0, mat = 3, glow = 0, rot = null, tag = null } = {}) {
  const h = G.player.hf.heightAt(n), fr = frameAt(n);
  const b = makeBody({ shape: 'tesseract', size: side, mass: 1e9, pos: vec4.scale(n, PLANET_R + h + side / 2 + lift - 0.04), rot: rot || rotFromCols([fr.f, fr.s, fr.a, n]), kind: 'block' });
  b.kinematic = true; b.fixed = true; b.mat = mat; b.glow = glow; b.tag = tag;
  objects.world.add(b);
  return b;
}
const partOf = k => objects.world.bodies.find(b => b.kind === 'part' && b.tier === k);
// A rotation from four columns (the body's axes in the world), made proper by turning the third if need be.
function properRot(cols) {
  const rows = [0, 1, 2, 3].map(r => cols.map(c => c[r]));
  const d = (m => { let r = 0; for (let j = 0; j < 4; j++) { const mm = [1, 2, 3].map(i => m[i].filter((_, k) => k !== j)); r += (j % 2 ? -1 : 1) * m[0][j] * (mm[0][0] * (mm[1][1] * mm[2][2] - mm[1][2] * mm[2][1]) - mm[0][1] * (mm[1][0] * mm[2][2] - mm[1][2] * mm[2][0]) + mm[0][2] * (mm[1][0] * mm[2][1] - mm[1][1] * mm[2][0])); } return r; })(rows);
  if (d < 0) rows.forEach(r => { r[2] = -r[2]; });
  return R4.fromMatrix(rows);
}
// The frame R (its fourth axis up at its own place) carried to unit point q: its first three axes laid onto the
// ground at q and squared up, q its fourth. Returns the four columns.
function carry(R, q) {
  const c = [0, 1, 2].map(j => { const e = [0, 0, 0, 0]; e[j] = 1; return R4.apply(R, e); }), out = [];
  for (const v of c) { let w = vec4.sub(v, vec4.scale(q, vec4.dot(v, q))); for (const u of out) w = vec4.sub(w, vec4.scale(u, vec4.dot(w, u))); out.push(vec4.norm(w)); }
  return [...out, q];
}
const colsRot = cols => R4.fromMatrix([0, 1, 2, 3].map(r => cols.map(c => c[r])));
// A fixed body of parts (in a frame with origin o and rotation R), solid but drawn otherwise (as props).
function fixedCompound(parts, o, R, kind) {
  const b = makeBody({ shape: 'compound', parts, mass: 1e9, mu: 0.4, pos: o, kind });
  b.pos = vec4.add(o, R4.apply(R, b.com)); b.rot = R;
  b.kinematic = b.fixed = b.hidden = true;
  objects.world.add(b);
  return b;
}
// A place near n for a built artifact: dry within 9 m (no water above the ground: waterAt is the water's surface
// height, where there is water), between 1.5 and 24 m up, and as level as can be found within 7 m; the nearest one
// level to tol (0.8 m), or failing that the levellest dry one within 250 m.
function siteNear(n, tol = 0.8) {
  const hf = G.player.hf;
  const score = q => { const T = tangents(q); let lo = Infinity, hi = -Infinity;
    for (const d of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0.7, 0.7, 0], [-0.7, 0, 0.7], [0, -0.7, -0.7], [0.6, -0.6, 0.6], [-0.6, 0.6, -0.6]]) for (const r of [3.5, 7, 9]) {
      const dir = [0, 1, 2, 3].map(i => d[0] * T[0][i] + d[1] * T[1][i] + d[2] * T[2][i]), l = Math.hypot(...dir);
      const p = l < 1e-9 ? q : off(q, vec4.scale(dir, 1 / l), r * l), h = hf.heightAt(p);
      if (hf.waterAt(p) > h - 0.05 || h < 1.5 || h > 24) return Infinity;
      if (r < 8) { lo = Math.min(lo, h); hi = Math.max(hi, h); }
    }
    return hi - lo; };
  let best = n, bs = score(n);
  if (bs < tol) return n;
  for (let i = 0; i < 5000; i++) {
    const T = tangents(n), a = i * 2.39996, b = Math.acos(1 - 2 * ((i * 0.618034) % 1)), r = 2 + i * 0.05;
    const dir = [0, 1, 2, 3].map(k => Math.sin(b) * Math.cos(a) * T[0][k] + Math.sin(b) * Math.sin(a) * T[1][k] + Math.cos(b) * T[2][k]);
    const q = off(n, vec4.norm(dir), r), sc = score(q);
    if (sc < tol) return q;
    if (sc < bs) { bs = sc; best = q; }
  }
  return best;
}
// A part of a built thing drawn as a prop (its solid shape is a fixed body): a box or a ball.
function showPart(c, q, mat, rot) {
  const g = q.shape === 'glome', p = makeProp({ c, rot, e: g ? [q.r, q.r, q.r, q.r] : q.e, shape: g ? SHAPE.ball : SHAPE.box, mat });
  p.kind = 'ruin'; p.visual = true; addRock(p); return p;
}
function freeze(b) { if (b) { b.kinematic = true; b.sleeping = true; b.vel = [0, 0, 0, 0]; b.omega = [0, 0, 0, 0, 0, 0]; } }

export function buildArtifacts() {
  artifacts.length = 0;
  const hf = G.player.hf;
  // I. the closed room: eight posts of dark stone, faintly lit, ring the tunnel's mouth across the tunnel's way (so a
  // slice through the mouth that the tunnel leaves, toward kata, shows them all round it); the cave itself is in
  // landforms.js
  if (G.cave) {
    const m = vec4.norm(G.cave.mouth), toward = proj(vec4.sub(vec4.norm(G.cave.chamber), m), m), fr = frameAt(m, toward);
    for (let i = 0; i < 8; i++) {
      const ang = i * Math.PI / 4, dir = vec4.norm(vec4.add(vec4.scale(fr.s, Math.cos(ang)), vec4.scale(fr.a, Math.sin(ang))));
      const q = off(m, dir, 3.6), f2 = frameAt(q, toward);
      const p = makeProp({ c: vec4.scale(q, PLANET_R + hf.heightAt(q) + 0.55), rot: rotFromCols([f2.f, f2.s, f2.a, q]), e: [1.6, 0.18, 0.18, 0.75], shape: SHAPE.box, mat: MAT.basalt, glow: 0.14 });   // (long along the tunnel's way: seen within 1.6 m of its slice)
      p.kind = 'ruin'; addRock(p);
    }
    artifacts.push({ id: 'room', name: 'the closed room', n: m, solved: () => !!G.flags.part1 });
  }
  // II. the mirror key: on open, level, dry ground near where part II was put (by the river's mouth), a plinth with
  // the mould at chest height, open toward −f; a small stone house 4.2 m to its side (+s) with its door toward it
  // (part II on its floor); and the key lying 2.4 m to the other side. The house and the mould are fixed bodies
  // (their solid shapes), drawn as props.
  {
    const p = partOf(2), n = siteNear(vec4.norm(p.pos)), fr = frameAt(n), R = properRot([fr.f, fr.s, fr.a, n]);
    const at = (o, c) => vec4.add(o, R4.apply(R, c));                    // a point of the site's frame from origin o
    const foot = vec4.scale(n, PLANET_R + hf.heightAt(n) - 0.08);
    const mould = fixedCompound(mouldParts(), foot, R, 'mould');
    const mp = mouldParts().map(q => showPart(at(foot, q.c), q, q.shape === 'glome' ? MAT.metal : MAT.basalt, R));
    const balls = mp.filter(q => q.shape === SHAPE.ball);
    // the house: walls 0.2 m thick round a room 2.2 m each way and 2.5 m high, its door (2.2 m high: you are 2.05 m
    // tall) in the wall toward the plinth
    const hn = off(n, fr.s, 4.2), hc = carry(R, hn), hfoot = vec4.scale(hn, PLANET_R + hf.heightAt(hn) - 0.05);
    const HR = colsRot([hc[1], vec4.scale(hc[0], -1), hc[2], hn]);     // (its own −f, where the door is, toward the mould)
    const house = [
      { c: [-1.2, -0.9, 0, 1.25], e: [0.1, 0.4, 1.3, 1.25] }, { c: [-1.2, 0.9, 0, 1.25], e: [0.1, 0.4, 1.3, 1.25] }, { c: [-1.2, 0, 0, 2.35], e: [0.1, 0.5, 1.3, 0.15] },
      { c: [1.2, 0, 0, 1.25], e: [0.1, 1.3, 1.3, 1.25] }, { c: [0, 1.2, 0, 1.25], e: [1.1, 0.1, 1.3, 1.25] }, { c: [0, -1.2, 0, 1.25], e: [1.1, 0.1, 1.3, 1.25] },
      { c: [0, 0, 1.2, 1.25], e: [1.3, 1.3, 0.1, 1.25] }, { c: [0, 0, -1.2, 1.25], e: [1.3, 1.3, 0.1, 1.25] }, { c: [0, 0, 0, 2.6], e: [1.4, 1.4, 1.4, 0.1] },
    ].map(q => ({ shape: 'box', ...q }));
    fixedCompound(house, hfoot, HR, 'house');
    for (const q of house) showPart(vec4.add(hfoot, R4.apply(HR, q.c)), q, MAT.basalt, HR);
    const door = fixedCompound([{ shape: 'box', c: [0, 0, 0, 0], e: [0.08, 0.5, 1.3, 1.1] }], vec4.add(hfoot, R4.apply(HR, [-1.2, 0, 0, 1.1])), HR, 'door');
    door.hidden = false; door.mat = 3; door.tag = 'vault2';
    // part II on the house's floor, lying flat
    p.pos = vec4.add(hfoot, vec4.scale(hn, RING.t + 0.07)); p.rot = HR; p.vel = [0, 0, 0, 0]; freeze(p);
    // the key, lying 2.4 m off to the side as found: its cells the mould's empty cells mirrored (its three directions
    // along f, s and up, its thickness along −a)
    const kn = off(n, fr.s, -2.4), kup = kn, kc = carry(R, kn), kr = colsRot([kc[0], kc[1], kn, vec4.scale(kc[2], -1)]);
    let key = objects.world.bodies.find(b => b.tag === 'key2');
    if (!key) { key = bodyOf('key', vec4.scale(kn, PLANET_R), kr, {}); key.mat = 8; key.tag = 'key2'; objects.world.add(key); }
    key.rot = kr; key.pos = vec4.add(vec4.scale(kn, PLANET_R + hf.heightAt(kn) + 0.05), vec4.scale(kup, reachAlong(key, kr, vec4.scale(kup, -1)))); key.sleeping = false;   // (it settles: it stands on two cells)
    const free = MOULD.free.map(c => at(foot, cellCentre(c)));
    artifacts.push({ id: 'mirror', name: 'the mirror key', n, vault: door, part: p, balls, R, foot, clear: 6, house: hfoot, sock: at(foot, [-0.7, 0, 0, MOULD.P0 + 0.4]),
      // solved when the key rests in the mould, each of its four cells in one of the empty ones (within 15 cm: any
      // other way of lying there is 40 cm off somewhere)
      check() {
        const k = objects.world.bodies.find(b => b.tag === 'key2');
        if (!k || k.held) return false;
        const used = new Set();
        return k.parts.slice(0, 4).every(q => {
          const c = vec4.add(k.pos, R4.apply(k.rot, q.c)), j = free.findIndex((f, i) => !used.has(i) && vec4.len(vec4.sub(c, f)) < 0.15);
          if (j < 0) return false; used.add(j); return true;
        });
      } });
  }
  // III. the knot gate (knot.js): on open, level, dry ground near where part III was put, a stone platform a little
  // over the highest ground under it, with the house on it, the leaf in its doorway and the pillar and peg in front
  {
    const p = partOf(3), n = siteNear(vec4.norm(p.pos), 0.5), fr = frameAt(n), R = properRot([fr.f, fr.s, fr.a, n]);
    const at = (o, c) => vec4.add(o, R4.apply(R, c));
    let top = -Infinity;
    for (const x of [-3.8, -1.9, 0, 1.9, 3.8]) for (const y of [-1.6, 0, 1.6]) for (const z of [-1.6, 0, 1.6]) top = Math.max(top, hf.heightAt(vec4.norm(at(vec4.scale(n, PLANET_R), [x, y, z, 0]))));
    const foot = vec4.scale(n, PLANET_R + top + 0.04), parts = gateParts();
    fixedCompound(parts, foot, R, 'gatehouse');
    parts.forEach((q, i) => showPart(at(foot, q.c), q, i === 0 ? MAT.worked : i >= parts.length - 2 ? MAT.metal : MAT.basalt, R));
    const k = G.knot = gateBuild(objects.world, foot, R, terrainSD);
    G.rope = k.rope;
    p.pos = vec4.add(at(foot, GATE.part), vec4.scale(n, RING.t + 0.005)); p.rot = R; p.vel = [0, 0, 0, 0]; freeze(p);
    artifacts.push({ id: 'knot', name: 'the knot gate', n, vault: null, part: p, clear: 5, loop: k.rope.loop,
      stoneAt: [at(foot, [-1.2, 1.1, 0, 0.12]), at(foot, [-1.2, -1.1, 0, 0.12])],
      // solved when the leaf has swung in past 46° (it falls flat on the floor)
      check() { return k.angle() > 0.8; } });
  }
  // IV. the antipode: the bowl on the summit (four posts round a hollow) and the vault at the opposite point
  {
    const p = partOf(4), n = vec4.norm(p.pos);
    const vault = block(n, 1.0, { lift: -0.4, tag: 'vault4' }); freeze(p);
    const s0 = launcher.n, fr = frameAt(s0), bowl = off(s0, fr.s, 4.2), bf = frameAt(bowl);
    // the bowl: a hollow carved in the summit by a 4D ball (in your 3D ground, a round stone basin 1.9 m across and
    // 0.45 m deep), so what you leave in it rolls to its bottom and stays; six posts mark its rim, two on each of
    // the ground's three directions
    const hb = G.player.hf.heightAt(bowl);
    carves.push({ a: vec4.scale(bowl, PLANET_R + hb + 0.75), b: vec4.scale(bowl, PLANET_R + hb + 0.75), r: 1.2, name: 'bowl' });
    for (const ax of [bf.f, bf.s, bf.a]) for (const sg of [-1, 1]) block(off(bowl, ax, 1.25 * sg), 0.24, { lift: 0.2, mat: 2, glow: 0.15, tag: 'bowlpost' });
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const fv = frameAt(n); block(off(n, vec4.norm(vec4.add(vec4.scale(fv.f, x), vec4.scale(fv.a, y))), 1.5), 0.24, { mat: 2, glow: 0.15 }); }
    const bowlPos = vec4.scale(bowl, PLANET_R + G.player.hf.heightAt(bowl));
    artifacts.push({ id: 'antipode', name: 'the antipode', n, vault, part: p, bowl: bowlPos,
      check() { return objects.world.bodies.some(b => !b.fixed && !b.held && b.kind !== 'part' && vec4.len(vec4.sub(b.pos, this.bowl)) < 0.9); } });
  }
  G.artifacts = artifacts;
}

// Open a vault: the block goes, the part inside is free, and two impulse stones lie beside it.
function open(a, quiet) {
  if (a.vault) objects.world.remove(a.vault);
  if (a.balls) for (const b of a.balls) b.glow = 0.9;              // (the mirror key's mould: the cube is whole)
  if (a.part && !quiet) { a.part.kinematic = false; a.part.sleeping = false; }
  else if (a.part && !a.part.held) a.part.kinematic = false;              // (a part in your hand stays in your hand)
  if (!quiet) {
    const n = a.n, fr = frameAt(n);
    if (a.stoneAt) for (const q of a.stoneAt) spawnAt('stone', q);
    else for (const sg of [-1, 1]) spawn('stone', off(n, fr.s, sg * 1.3));
    G.audio?.emit('chime', a.vault ? a.vault.pos : vec4.scale(n, PLANET_R), 1.0);
  }
}
// Each frame: check the unsolved ones; mark what you have found (and what a solved one points to).
export function updateArtifacts() {
  const me = G.player.onB == null ? vec4.norm(G.player.pos) : null;
  artifacts.forEach((a, i) => {
    if (me && vec4.dot(me, a.n) > Math.cos(25 / PLANET_R)) G.flags['seen_' + a.id] = true;
    if (a.check && !G.flags['solved_' + a.id] && a.check()) {
      G.flags['solved_' + a.id] = true;
      open(a, false);
      const next = artifacts[(i + 1) % artifacts.length];
      G.flags['seen_' + next.id] = true;                    // a solved artifact points the way to the next
    }
  });
  if (!G.flags.part1 && G.cave) {                           // the cave counts as solved once you've stood in its chamber
    const p = G.player;
    if (p.onB == null && vec4.len(vec4.sub(p.pos, G.cave.chamber)) < 7.5) { G.flags.part1 = true; G.flags.seen_mirror = true; }
  }
  // the bowl's posts glow when something rests in it
  const ant = artifacts.find(a => a.id === 'antipode');
  if (ant) for (const b of objects.world.bodies) if (b.tag === 'bowlpost') b.glow = ant.check() ? 0.9 : 0.15;
}
// After a load: vaults of solved artifacts are gone, and the parts in the others are held fast again.
export function syncArtifacts() {
  for (const a of artifacts) {
    if (a.part) a.part = objects.world.bodies.find(b => b.kind === 'part' && b.tier === a.part.tier) || a.part;
    if (G.flags['solved_' + a.id]) open(a, true);
    else freeze(a.part);
  }
}
