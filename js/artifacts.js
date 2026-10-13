// The artifacts: wordless puzzles in the same geometric language as everything else, matte stone and brushed metal,
// with the one accent colour for what responds. Each opens only to a genuinely 4D idea, and holds a launcher part
// (in a stone vault) and a couple of impulse stones. Solving one marks the next on your radar.
//   I    the closed room (room.js): walled on every side in your slice, a grille to see ring I through; its walls
//        reach only a metre toward ana, and stepping round them through ana is the way in.
//   II   the mirror key: a mould on a plinth, four of its eight cells solid, and a brass key that is the empty cells'
//        mirror image. No turn in 3D makes a thing its mirror image; half a turn through ana does, and then the key
//        slides in, completing the cube, and the house beside it opens.
//   III  the knot gate (knot.js): a heavy leaf hung by its foot, leaning in, held shut by a rope whose loop hangs
//        over a peg with a knob on its end. In 3D the loop is captive; in 4D it lifts off the peg through ana.
//   IV   the fold (fold.js): the net of a tesseract, eight cells in a cross lying flat; lift the six round the middle
//        on their hinges, turn the last over onto them, and they close into a tesseract: the chest beside it opens.
import { G } from './game.js';
import { vec4 } from './player.js';
import { PLANET_R } from './world.js';
import { tangents } from './env.js';
import { rot as R4 } from './so4.js';
import { makeBody } from './bodies.js';
import { objects, spawn, KINDS } from './objects.js';
import { makeProp, addRock, SHAPE, MAT } from './props.js';
import { mouldParts, MOULD, cellCentre, RING } from './keys.js';
import { reachAlong, bodyOf, spawnAt } from './objects.js';
import { seated } from './launcher.js';
import { gateParts, gateBuild, GATE } from './knot.js';
import { foldParts, foldBuild, CHEST } from './fold.js';
import { roomParts, inRoom, ROOM } from './room.js';
import { terrainSD } from './env.js';

export const artifacts = [];        // { id, name, n (unit position), solved(), vault, part, ... }
const off = (u, t, m) => vec4.norm(vec4.add(vec4.scale(u, Math.cos(m / PLANET_R)), vec4.scale(t, Math.sin(m / PLANET_R))));
const proj = (v, n) => vec4.norm(vec4.sub(v, vec4.scale(n, vec4.dot(v, n))));
// A ground frame at unit n: three tangents and up, as a proper rotation (columns).
function frameAt(n, f0) {
  const T = tangents(n), f = proj(f0 || T[0], n);
  let s = proj(vec4.sub(T[1], vec4.scale(f, vec4.dot(T[1], f))), n); if (Math.abs(vec4.dot(f, T[1])) > 0.95) s = proj(vec4.sub(T[2], vec4.scale(f, vec4.dot(T[2], f))), n);
  let a = vec4.sub(vec4.sub(T[2], vec4.scale(f, vec4.dot(T[2], f))), vec4.scale(s, vec4.dot(T[2], s)));
  if (vec4.len(a) < 0.3) a = vec4.sub(vec4.sub(T[0], vec4.scale(f, vec4.dot(T[0], f))), vec4.scale(s, vec4.dot(T[0], s)));
  a = proj(a, n);
  return { f, s, a, up: n };
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
// A place near n for a built artifact: dry within 7 m (no water above the ground: waterAt is the water's surface
// height, where there is water), between 1.5 and 24 m up, and as level as can be found within 7 m; the nearest one
// level to tol (1 m: the platform's steps take up the rest), or failing that the levellest dry one within 250 m.
function siteNear(n, tol = 1.0) {
  const hf = G.player.hf;
  const score = q => { const T = tangents(q); let lo = Infinity, hi = -Infinity;
    for (const d of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0.7, 0.7, 0], [-0.7, 0, 0.7], [0, -0.7, -0.7], [0.6, -0.6, 0.6], [-0.6, 0.6, -0.6]]) for (const r of [3.5, 7]) {
      const dir = [0, 1, 2, 3].map(i => d[0] * T[0][i] + d[1] * T[1][i] + d[2] * T[2][i]), l = Math.hypot(...dir);
      const p = l < 1e-9 ? q : off(q, vec4.scale(dir, 1 / l), r * l), h = hf.heightAt(p);
      if (hf.waterAt(p) > h - 0.05 || h < 1.5 || h > 24) return Infinity;
      lo = Math.min(lo, h); hi = Math.max(hi, h);
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
// A level stone platform for a built site at unit n (frame R): its top a little over the highest ground under it,
// deep enough to meet the lowest, and as many steps round it as keep each rise under a quarter metre (you climb a
// step that high without thinking; a ledge of half a metre you would have to jump). plat: the platform's box in
// the site's frame, its top at 0. Returns the foot (the platform's top at n) and the boxes.
function platformAt(n, R, plat) {
  const hf = G.player.hf, at = c => vec4.norm(vec4.add(vec4.scale(n, PLANET_R), R4.apply(R, c)));
  const sample = ex => { let lo = Infinity, hi = -Infinity; const e = plat.e.map((v, i) => (i < 3 ? v + ex : v));
    const t9 = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
    for (const x of t9) for (const y of [-1, -0.5, 0, 0.5, 1]) for (const z of t9) {
      const h = hf.heightAt(at([plat.c[0] + x * e[0], plat.c[1] + y * e[1], plat.c[2] + z * e[2], 0])); lo = Math.min(lo, h); hi = Math.max(hi, h);
    } return { lo, hi }; };
  const s0 = sample(0), top = s0.hi + 0.06;
  let lo = s0.lo, k = 0;
  for (let i = 0; i < 4; i++) { k = Math.max(0, Math.ceil((top - lo) / 0.25) - 1); lo = Math.min(lo, sample(0.5 * k).lo); }   // (wider steps reach lower ground)
  const ledge = top - lo, deep = ledge + 0.4, B = (c, e) => ({ shape: 'box', c, e }), [c0, c1, c2] = plat.c, [e0, e1, e2] = plat.e;
  const parts = [B([c0, c1, c2, -deep / 2], [e0, e1, e2, deep / 2])];
  for (let i = 1; i <= k; i++) { const st = -i * ledge / (k + 1); parts.push(B([c0, c1, c2, (st - deep) / 2], [e0 + 0.5 * i, e1 + 0.5 * i, e2 + 0.5 * i, (st + deep) / 2])); }
  return { foot: vec4.scale(n, PLANET_R + top), parts };
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
  // I. the closed room (room.js): on open, level, dry ground near where part I was put (14 m from where you arrive,
  // toward the summit), a stone platform a little over the highest ground under it, the room on it, ring I inside
  {
    const p = partOf(1), n = siteNear(vec4.norm(p.pos)), fr = frameAt(n), R = properRot([fr.f, fr.s, fr.a, n]);
    const at = (o, c) => vec4.add(o, R4.apply(R, c));
    const P = roomParts(), { foot, parts: plat } = platformAt(n, R, P.platform[0]);
    fixedCompound([...plat, ...P.walls, ...P.bars], foot, R, 'room');
    for (const q of plat) showPart(at(foot, q.c), q, MAT.worked, R);
    for (const q of P.walls) showPart(at(foot, q.c), q, MAT.basalt, R);
    for (const q of P.bars) showPart(at(foot, q.c), q, MAT.metal, R);
    p.pos = vec4.add(at(foot, ROOM.part), vec4.scale(n, RING.t + 0.005)); p.rot = R; p.vel = [0, 0, 0, 0]; p.omega = [0, 0, 0, 0, 0, 0]; p.sleeping = true;
    artifacts.push({ id: 'room', name: 'the closed room', n, part: p, clear: 6, R, foot,
      // inside it: you stand within its walls (and so within their reach toward ana)
      inside: q => inRoom(R4.applyInv(R, vec4.sub(q, foot))), solved: () => !!G.flags.part1 });
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
    const p = partOf(3), n = siteNear(vec4.norm(p.pos)), fr = frameAt(n), R = properRot([fr.f, fr.s, fr.a, n]);
    const at = (o, c) => vec4.add(o, R4.apply(R, c));
    const all = gateParts(), { foot, parts: plat } = platformAt(n, R, all[0]), parts = all.slice(1);
    fixedCompound([...plat, ...parts], foot, R, 'gatehouse');
    for (const q of plat) showPart(at(foot, q.c), q, MAT.worked, R);
    parts.forEach((q, i) => showPart(at(foot, q.c), q, i >= parts.length - 2 ? MAT.metal : MAT.basalt, R));
    const k = G.knot = gateBuild(objects.world, foot, R, terrainSD);
    G.rope = k.rope;
    p.pos = vec4.add(at(foot, GATE.part), vec4.scale(n, RING.t + 0.005)); p.rot = R; p.vel = [0, 0, 0, 0]; freeze(p);
    artifacts.push({ id: 'knot', name: 'the knot gate', n, vault: null, part: p, clear: 6, loop: k.rope.loop,
      stoneAt: [at(foot, [-1.2, 1.1, 0, 0.12]), at(foot, [-1.2, -1.1, 0, 0.12])],
      // solved when the leaf has swung in past 46° (it falls flat on the floor)
      check() { return k.angle() > 0.8; } });
  }
  // IV. the fold (fold.js): on open, level, dry ground near where part IV was put (as near the summit's antipode as
  // there is dry ground), a stone platform a little over the highest ground under it, the cross lying on it and the
  // chest at its foot (−f), ring IV inside under the lid
  {
    const p = partOf(4), n = siteNear(vec4.norm(p.pos)), fr = frameAt(n), R = properRot([fr.f, fr.s, fr.a, n]);
    const at = (o, c) => vec4.add(o, R4.apply(R, c));
    const P = foldParts(), { foot, parts: plat } = platformAt(n, R, P.platform[0]);
    fixedCompound([...plat, ...P.chest], foot, R, 'foldsite');
    for (const q of plat) showPart(at(foot, q.c), q, MAT.worked, R);
    for (const q of P.chest) showPart(at(foot, q.c), q, MAT.basalt, R);
    const base = fixedCompound(P.base, foot, R, 'cell'); base.hidden = false; base.mat = 1;          // the middle cell, fixed
    const lid = fixedCompound(P.lid, at(foot, P.lidAt), R, 'lid'); lid.hidden = false; lid.mat = 3; lid.tag = 'vault4';
    const fd = G.fold = foldBuild(objects.world, foot, R);
    p.pos = vec4.add(at(foot, CHEST.ring), vec4.scale(n, RING.t + 0.005)); p.rot = R; p.vel = [0, 0, 0, 0]; freeze(p);
    artifacts.push({ id: 'fold', name: 'the fold', n, vault: lid, part: p, clear: 6, plates: [base, ...fd.plates],
      stoneAt: [at(foot, [-3.0, 1.6, 0, 0.12]), at(foot, [-1.2, 1.6, 0, 0.12])],
      // solved when every hinge is within 4° of its stop: six cells up round the middle, the last over them
      check() { return fd.angles().every(x => x > 1.5); } });
  }
  // where each part is kept (and the mirror's key lies), for a save made before the artifacts were rebuilt
  for (const a of artifacts) if (a.part) a.home = { pos: a.part.pos.slice(), rot: a.part.rot };
  const key = objects.world.bodies.find(b => b.tag === 'key2'), mir = artifacts.find(a => a.id === 'mirror');
  if (key && mir) mir.keyHome = { pos: key.pos.slice(), rot: key.rot };
  G.artifacts = artifacts;
}

// Open a vault: the block goes, the part inside is free, and two impulse stones lie beside it.
function open(a, quiet) {
  if (a.vault) objects.world.remove(a.vault);
  if (a.balls) for (const b of a.balls) b.glow = 0.9;              // (the mirror key's mould: the cube is whole)
  if (a.plates) for (const b of a.plates) b.glow = 0.12;           // (the fold: the tesseract is closed)
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
  const room = artifacts.find(a => a.id === 'room');               // the room counts as solved once you've stood in it
  if (room && !G.flags.part1 && G.player.onB == null && room.inside(G.player.pos)) { G.flags.part1 = true; G.flags.seen_mirror = true; }
}
// After a load: vaults of solved artifacts are gone, and the parts in the others are held fast again.
export function syncArtifacts() {
  if (G.flags.solved_antipode && !G.flags.solved_fold) G.flags.solved_fold = true;     // (a save from before the fold replaced the antipode)
  for (const a of artifacts) {
    if (a.part) a.part = objects.world.bodies.find(b => b.kind === 'part' && b.tier === a.part.tier) || a.part;
    const done = G.flags['solved_' + a.id] || (a.id === 'room' && G.flags.part1);
    // a save from before the artifacts were rebuilt keeps an unsolved one's ring where its old vault was: back inside
    if (!done && a.part && a.home && !a.part.held && !seated(a.part) && vec4.len(vec4.sub(a.part.pos, a.home.pos)) > 1) {
      a.part.pos = a.home.pos.slice(); a.part.prevPos = a.part.pos.slice(); a.part.rot = a.home.rot; a.part.vel = [0, 0, 0, 0]; a.part.omega = [0, 0, 0, 0, 0, 0];
    }
    if (a.id === 'mirror' && !done && a.keyHome) {
      const k = objects.world.bodies.find(b => b.tag === 'key2');
      if (k && !k.held && vec4.len(vec4.sub(k.pos, a.keyHome.pos)) > 30) { k.pos = a.keyHome.pos.slice(); k.prevPos = k.pos.slice(); k.rot = a.keyHome.rot; k.vel = [0, 0, 0, 0]; k.omega = [0, 0, 0, 0, 0, 0]; k.sleeping = false; }
    }
    if (G.flags['solved_' + a.id]) open(a, true);
    else if (a.id !== 'room') freeze(a.part);
  }
}
