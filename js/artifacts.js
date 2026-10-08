// The artifacts: wordless puzzles in the same geometric language as everything else, matte stone and brushed metal,
// with the one accent colour for what responds. Each opens only to a genuinely 4D idea, and holds a launcher part
// (in a stone vault) and a couple of impulse stones. Solving one marks the next on your radar.
//   I    the closed room: the cave, whose only way in leaves its chamber toward ana (part I lies inside).
//   II   the mirror key: the key's socket shows its mirror image. No turn in 3D makes a thing its mirror image;
//        half a turn through ana does.
//   III  the knot gate: a rope looped round a tall post holds the gate. In 4D no loop can hold on a post.
//   IV   the antipode: what you leave in the bowl on the summit opens the vault at the planet's opposite point.
import { G } from './game.js';
import { vec4 } from './player.js';
import { PLANET_R } from './world.js';
import { tangents } from './env.js';
import { rot as R4 } from './so4.js';
import { makeBody } from './bodies.js';
import { objects, spawn, KINDS } from './objects.js';
import { launcher } from './launcher.js';

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
// A fixed block of stone or metal (a tesseract of the given side), resting with its centre at height h above the ground.
function block(n, side, { lift = 0, mat = 0, glow = 0, rot = null, tag = null } = {}) {
  const h = G.player.hf.heightAt(n), fr = frameAt(n);
  const b = makeBody({ shape: 'tesseract', size: side, mass: 1e9, pos: vec4.scale(n, PLANET_R + h + side / 2 + lift - 0.04), rot: rot || rotFromCols([fr.f, fr.s, fr.a, n]), kind: 'block' });
  b.kinematic = true; b.fixed = true; b.mat = mat; b.glow = glow; b.tag = tag;
  objects.world.add(b);
  return b;
}
const partOf = k => objects.world.bodies.find(b => b.kind === 'part' && b.tier === k);
function freeze(b) { if (b) { b.kinematic = true; b.sleeping = true; b.vel = [0, 0, 0, 0]; b.omega = [0, 0, 0, 0, 0, 0]; } }

export function buildArtifacts() {
  artifacts.length = 0;
  const hf = G.player.hf;
  // I. the closed room: a built arch frames the tunnel's mouth (the cave itself is in landforms.js)
  if (G.cave) {
    const m = vec4.norm(G.cave.mouth), toward = proj(vec4.sub(vec4.norm(G.cave.chamber), m), m), side = frameAt(m, toward).s;
    const legs = [-1, 1].map(sg => off(m, side, sg * 3.0));
    for (const n of legs) { block(n, 0.6); block(n, 0.6, { lift: 0.6 }); block(n, 0.6, { lift: 1.2, glow: 0.1 }); }
    artifacts.push({ id: 'room', name: 'the closed room', n: m, solved: () => !!G.flags.part1 });
  }
  // II. the mirror key, beside part II
  {
    const p = partOf(2), n = vec4.norm(p.pos), fr = frameAt(n);
    const vault = block(n, 1.0, { lift: -0.4, tag: 'vault2' }); freeze(p);
    const sock = off(n, fr.f, 3.2), sf = frameAt(sock, fr.f);
    const socket = block(sock, 0.9, { lift: -0.55, mat: 1, tag: 'socket2' });
    // the model, on a pillar beside the socket: how the key must sit (its target orientation)
    const target = rotFromCols([sf.f, sf.s, sf.up, sf.a]);
    const pil = off(sock, sf.s, 1.4);
    block(pil, 0.5); const model = block(pil, 0.32, { lift: 0.5, mat: 4, rot: target, tag: 'model2' });
    // the key itself lies nearby as that model's mirror image (its marked cells swapped side for side in your slice):
    // [f, -s, up, -a] is a proper rotation whose slice is the mirror of the target's
    const keyN = off(sock, sf.s, -2.4);
    const key = spawn('key', keyN, { rot: rotFromCols([sf.f, vec4.scale(sf.s, -1), sf.up, vec4.scale(sf.a, -1)]) });
    key.tag = 'key2';
    artifacts.push({ id: 'mirror', name: 'the mirror key', n, vault, part: p, sock: vec4.scale(sock, PLANET_R + hf.heightAt(sock) + 0.05), target: [sf.f, sf.s],
      check() {
        const k = objects.world.bodies.find(b => b.tag === 'key2');
        if (!k || k.held) return false;
        const M = R4.toRows(k.rot), kx = [0, 1, 2, 3].map(i => M[i][0]), ky = [0, 1, 2, 3].map(i => M[i][1]);
        const near = vec4.len(vec4.sub(k.pos, this.sock)) < 1.0;
        return near && vec4.dot(kx, this.target[0]) > 0.8 && vec4.dot(ky, this.target[1]) > 0.8;
      } });
  }
  // III. the knot gate: a tall post; the rope (rope.js) is looped round it and tied to the vault (main.js lays it out)
  {
    const p = partOf(3), n = vec4.norm(p.pos), fr = frameAt(n);
    const vault = block(n, 1.0, { lift: -0.4, tag: 'vault3' }); freeze(p);
    const postN = off(n, fr.f, 2.6);
    for (let k = 0; k < 6; k++) block(postN, 0.4, { lift: 0.4 * k, mat: k === 5 ? 2 : 0, glow: k === 5 ? 0.2 : 0 });
    const hp = hf.heightAt(postN);
    G.knotPost = { a: vec4.scale(postN, PLANET_R + hp), b: vec4.scale(postN, PLANET_R + hp + 2.4), r: 0.29 };
    G.knotAnchor = vec4.add(vault.pos, vec4.scale(n, 0.3));
    artifacts.push({ id: 'knot', name: 'the knot gate', n, vault, part: p,
      check() {
        const R = G.rope; if (!R) return false;
        const { a, b } = G.knotPost, ab = vec4.sub(b, a);
        // off the post: no part of the rope within a metre of its axis (and not because you are holding it there)
        return R.x.every(q => { const t = Math.max(0, Math.min(1, vec4.dot(vec4.sub(q, a), ab) / vec4.dot(ab, ab))); return vec4.len(vec4.sub(q, vec4.add(a, vec4.scale(ab, t)))) > 1.0; });
      } });
  }
  // IV. the antipode: the bowl on the summit (four posts round a hollow) and the vault at the opposite point
  {
    const p = partOf(4), n = vec4.norm(p.pos);
    const vault = block(n, 1.0, { lift: -0.4, tag: 'vault4' }); freeze(p);
    const s0 = launcher.n, fr = frameAt(s0), bowl = off(s0, fr.s, 4.2), bf = frameAt(bowl);
    block(bowl, 1.5, { lift: -1.3, tag: 'bowlfloor' });       // a level stone floor, so what you leave stays put
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) block(off(bowl, vec4.norm(vec4.add(vec4.scale(bf.f, x), vec4.scale(bf.a, y))), 0.9), 0.24, { lift: 0.2, mat: 2, glow: 0.15, tag: 'bowlpost' });
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
  if (a.part && !quiet) { a.part.kinematic = false; a.part.sleeping = false; }
  else if (a.part && !a.part.held) a.part.kinematic = false;              // (a part in your hand stays in your hand)
  if (!quiet) {
    const n = a.n, fr = frameAt(n);
    for (const sg of [-1, 1]) spawn('stone', off(n, fr.s, sg * 1.3));
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
