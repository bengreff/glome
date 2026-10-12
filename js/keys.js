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
