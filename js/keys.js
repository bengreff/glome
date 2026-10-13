// The keys and what they fit. Every key is made of one material that nothing else is (the key brass, object
// material 8), and the launcher's four are rings: a block with a square hole through it along its own fourth axis.
// They are threaded onto the pillar beside the launch pad, a thin square spindle with four balls on it, smaller
// going up: a ring's hole passes every ball smaller than it and comes to rest on the first ball wider than it, so
// each ring finds its own place by its size alone (ring I at the bottom).
//
// Ring k: hole half-width a_k, wall w, half-thickness t along the hole. Ball k: radius R_k, centre z_k above the
// pillar's foot. a_k < R_k by 4 cm (it rests on ball k) and a_k > R_(k+1) by 5 cm (it passes ball k+1); ring IV
// passes the spindle (round, radius p, its top rounded) by 8.5 cm. Resting, ring k's inner bottom edges touch ball k
// where its slice at that height is as wide as the hole: its centre stands √(R_k² − a_k²) + t above ball k's.
// Brass on the pillar's metal slides (μ 0.4, as dry brass on steel): a ring let go a little off the axis comes down
// the balls' shoulders to the middle instead of sticking where it first touched.
export const RING = { a: [0.39, 0.30, 0.21, 0.12], w: 0.12, t: 0.05, mass: 14, mu: 0.4 };
export const PILLAR = { R: [0.43, 0.34, 0.25, 0.16], z: [0.30, 0.68, 1.02, 1.30], p: 0.035, top: 1.62, mu: 0.4 };
export const seatHeight = k => PILLAR.z[k] + Math.sqrt(PILLAR.R[k] ** 2 - RING.a[k] ** 2) + RING.t;   // ring k's centre (k = 0..3)

// The ring's six walls as boxes in its own frame (the hole along axis 3): the two across axis 0 take the corners, the
// two across axis 1 fill between them, the two across axis 2 close the rest. Its shape for drawing is one frame.
export function ringParts(k) {
  const a = RING.a[k], w = RING.w, t = RING.t, o = a + w, m = a + w / 2;
  return [
    { shape: 'box', c: [m, 0, 0, 0], e: [w / 2, o, o, t] }, { shape: 'box', c: [-m, 0, 0, 0], e: [w / 2, o, o, t] },
    { shape: 'box', c: [0, m, 0, 0], e: [a, w / 2, o, t] }, { shape: 'box', c: [0, -m, 0, 0], e: [a, w / 2, o, t] },
    { shape: 'box', c: [0, 0, m, 0], e: [a, a, w / 2, t] }, { shape: 'box', c: [0, 0, -m, 0], e: [a, a, w / 2, t] },
  ];
}
export const ringDraw = k => [{ shape: 'frame', c: [0, 0, 0, 0], e: [RING.a[k] + RING.w, RING.a[k] + RING.w, RING.a[k] + RING.w, RING.t], a: RING.a[k] }];
// The pillar's parts in its own frame (axis 3 up, its foot at the origin): the spindle (a 4D capsule, round, so a
// ring that comes down against it slides off it cleanly) and the four balls.
export function pillarParts() {
  return [{ shape: 'cap', c: [0, 0, 0, (PILLAR.top - PILLAR.p) / 2], h: (PILLAR.top - PILLAR.p) / 2, r: PILLAR.p },
    ...PILLAR.R.map((r, k) => ({ shape: 'glome', c: [0, 0, 0, PILLAR.z[k]], r }))];
}

// ---------- the mirror key and its mould (artifact II) ----------
// The mould is a 2×2×2 block of cells (pitch 0.30 m) in the slice's three directions (axes f, s and up of its frame),
// one cell deep toward ana (axis a): four of its cells are solid, a handed shape (a chain of four cubes turning
// three ways), and the other four are empty, a handed shape too. Open at the top, under a funnel whose six walls
// slope in at 45° (along a as well, which you can't see: it brings a key let go a little off the mould into it).
// The key is four brass cells, the empty space's mirror image: no turn within your slice makes it fit, as no turn
// in 3D makes a left hand right; half a turn through ana does, and then it drops in flush and completes the cube.
// (Checked over all 192 turns of the 4-cube's grid: the key as found nests only by those that carry its thickness
// to −a and mirror its three other directions.)
// The mould's frame: axis 0 f, 1 s, 2 a, 3 up; origin at the plinth's foot.
export const MOULD = { P0: 0.85, pitch: 0.40, solid: [[0, 1, 0], [1, 0, 1], [1, 1, 0], [1, 1, 1]] };
const ALL8 = []; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) ALL8.push([i, j, k]);
MOULD.free = ALL8.filter(c => !MOULD.solid.some(d => d[0] === c[0] && d[1] === c[1] && d[2] === c[2]));
export const cellCentre = ([i, j, k]) => [-0.2 + 0.4 * i, -0.2 + 0.4 * j, 0, MOULD.P0 + 0.2 + 0.4 * k];
// The mould stands on a plinth at chest height, open toward you (−f) and at the top: you push the key in with your
// hands, as into a drawer. The empty cells are a chain of four turning three ways, two in each layer (a bar along f
// below, a bar along s above it at the front), so the key stands on the ground on its own, and it can be pushed
// straight in from the front (its deeper cell behind an empty one); the mirror key's cells run into a ball. (Of all
// such chains, chosen to stand and to slide in; checked over all 192 turns of the grid that only a half turn through
// ana makes the key as found fit.)
export function mouldParts() {
  const P0 = MOULD.P0, h = P0 + 0.41;
  return [
    { shape: 'box', c: [0.05, 0, 0, P0 / 2], e: [0.5, 0.5, 0.38, P0 / 2] },                                  // the plinth
    // the solid cells, 4D balls 0.26 m across on the 0.40 m grid (round: a cell of the key pushed against one slides
    // off it; 14 cm between a ball and a key's cell beside it), and the walls, 7 cm clear of a key in place: 0.80 m
    // across, and 0.52 deep toward ana, where you can't see how far off you are (the key is 0.26 thick that way:
    // ±13 cm to spare; lying any other way it is 0.66, and can't go in). Open at the front and the top.
    ...MOULD.solid.map(c => ({ shape: 'glome', c: cellCentre(c), r: 0.13 })),
    // each ball on a stalk from the back wall (through solid cells only)
    ...MOULD.solid.map(c => { const q = cellCentre(c), x0 = q[0] + 0.1; return { shape: 'box', c: [(x0 + 0.41) / 2, q[1], 0, q[3]], e: [(0.41 - x0) / 2, 0.03, 0.03, 0.03] }; }),
    { shape: 'box', c: [0.425, 0, 0, h], e: [0.025, 0.45, 0.31, 0.41] },                                       // the back
    { shape: 'box', c: [0, 0.425, 0, h], e: [0.45, 0.025, 0.31, 0.41] }, { shape: 'box', c: [0, -0.425, 0, h], e: [0.45, 0.025, 0.31, 0.41] },
    { shape: 'box', c: [0, 0, 0.285, h], e: [0.45, 0.45, 0.025, 0.41] }, { shape: 'box', c: [0, 0, -0.285, h], e: [0.45, 0.45, 0.025, 0.41] },
  ];
}
function det4(cols) {
  const m = [0, 1, 2, 3].map(r => cols.map(c => c[r]));
  const s3 = (a, b, c, d, e, f, g, h, i) => a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  let r = 0; for (let j = 0; j < 4; j++) { const mm = [1, 2, 3].map(i => m[i].filter((_, k) => k !== j)); r += (j % 2 ? -1 : 1) * m[0][j] * s3(...mm[0], ...mm[1], ...mm[2]); }
  return r;
}
// The key as found: the empty cells mirrored across f (x → 1 − x), in its own frame (x, y, z, and its thickness w).
export const KEY = { cells: MOULD.free.map(([i, j, k]) => [1 - i, j, k]), mass: 9, mu: 0.4 };
// Its cells are 0.26 m cubes on the mould's 0.40 m grid, joined by brass pins where they meet.
export function keyParts() {
  const cells = KEY.cells, P = MOULD.pitch, parts = cells.map(([i, j, k]) => ({ shape: 'box', c: [P * i, P * j, P * k, 0], e: [0.13, 0.13, 0.13, 0.13] }));
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
    const d = [0, 1, 2].map(m => cells[b][m] - cells[a][m]);
    if (Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2]) !== 1) continue;
    const c = [0, 1, 2].map(m => P / 2 * (cells[a][m] + cells[b][m])), e = d.map(v => (v ? P / 2 - 0.1 : 0.04));
    parts.push({ shape: 'box', c: [...c, 0], e: [...e, 0.04] });
  }
  return parts;
}
