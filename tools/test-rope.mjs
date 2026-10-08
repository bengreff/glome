// Why a knot cannot hold in four dimensions (node tools/test-rope.mjs).
// A knot is held by its crossings: one strand pressed against another that it cannot pass. Untying it means
// changing crossings. Here one rope makes a crossing with itself: a taut strand A (its ends pinned), and a strand B
// lying across it, which we press down through A. Confined to a 3D slice (as a rope in our world), B is blocked by A.
// Free in 4D, B slides past A through ana, and at no moment do the two strands overlap: a crossing can always be
// changed, so no knot can hold.
import { Rope, segSeg } from '../js/rope.js';
function build() {
  const pts = [];
  for (let i = 0; i <= 20; i++) pts.push([-0.6 + 0.06 * i, 0, 0, 0]);                  // strand A, along x
  for (let i = 1; i <= 12; i++) { const a = Math.PI * i / 13; pts.push([0.6 + 0.35 * Math.sin(a), -0.6 + 0.0 * a, 0.35 * (1 - Math.cos(a)), 0]); }   // a loose loop round
  const b0 = pts.length;
  for (let i = 0; i <= 20; i++) pts.push([0, -0.6 + 0.06 * i, 0.062, 0]);              // strand B, along y, resting on A
  return { pts, b0, b1: pts.length - 1 };
}
function run(planar) {
  const { pts, b0, b1 } = build();
  const rope = new Rope(pts, { radius: 0.03, damping: 0.9 });
  rope.iterations = 30;
  if (planar) rope.planar = [0, 0, 0, 1];
  else rope.x.forEach((p, i) => { p[3] += 0.002 * Math.sin(i * 2.3); });              // a hair off any one slice
  const n = rope.x.length, pinA0 = rope.x[0].slice(), pinA1 = rope.x[20].slice();
  const B0 = rope.x[b0].slice(), B1 = rope.x[b1].slice();
  let minGap = Infinity;
  for (let s = 0; s < 480; s++) {
    const dz = Math.min(0.5, s * 0.0015);                                               // press B's ends down 0.5 m
    rope.pins.set(0, pinA0); rope.pins.set(20, pinA1);
    rope.pins.set(b0, [B0[0], B0[1], B0[2] - dz, B0[3]]); rope.pins.set(b1, [B1[0], B1[1], B1[2] - dz, B1[3]]);
    rope.step(1 / 120);
    for (let i = 0; i < 20; i++) for (let j = b0; j < b1; j++) {
      const [u, v] = segSeg(rope.x[i], rope.x[i + 1], rope.x[j], rope.x[j + 1]);
      const pi = rope.x[i].map((q, k) => q + (rope.x[i + 1][k] - q) * u), pj = rope.x[j].map((q, k) => q + (rope.x[j + 1][k] - q) * v);
      minGap = Math.min(minGap, Math.hypot(...pi.map((q, k) => q - pj[k])));
    }
  }
  const mid = rope.x[b0 + 10], aMid = rope.x[10];
  return { passed: mid[2] < aMid[2] - 0.03, bz: mid[2] - aMid[2], w: Math.abs(mid[3] - aMid[3]), minGap, r: rope.r };
}
const r3 = run(true), r4 = run(false);
const say = (name, r) => console.log(`${name}: B's middle ends ${r.bz > 0 ? 'above' : 'below'} A (${r.bz.toFixed(3)} m), ana offset ${r.w.toFixed(3)} m, closest approach ${r.minGap.toFixed(4)} m (the strands touch at ${(2 * r.r).toFixed(3)})`);
say('3D (confined to a slice)', r3);
say('4D (free)               ', r4);
const ok = !r3.passed && r4.passed && r4.minGap > 2 * r4.r * 0.85 && r3.minGap > 2 * r3.r * 0.85;
console.log(ok ? 'PASS: in 3D the crossing holds; in 4D the strand passes through ana without the strands ever overlapping, so no crossing (and no knot) can hold'
               : 'FAIL');
process.exit(ok ? 0 : 1);
