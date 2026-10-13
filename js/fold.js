// IV, the fold. Dalí's Corpus Hypercubus, lying down: the net of a tesseract, eight cells in a cross. Each cell is a
// cube in the ground's three directions (f, s, a), a plate 4 cm thin in the fourth (up), so the cross lies flat on a
// stone platform: in your slice a cross of six square plates, the two arms toward ana and kata out of it (turn to
// see them). The middle cell is fixed; the six round it are hinged to it at their shared faces (a cube's face is a
// square: in 4D the hinge turns about that whole plane), and the last, beyond the +f arm, is hinged to that arm.
// Lift a plate by its far edge and it turns up on its hinge to stand at the middle cell's edge; upright, it meets its
// stop and rests there. With all six up, and the last turned over onto them as a roof, the
// eight cells close into a tesseract's boundary, a 4D box (your slice of it is a closed cube), and the stone chest at
// the cross's foot opens, ring IV inside.
// Pure geometry and the bodies; artifacts.js builds it into the world.
import { rot as R4 } from './so4.js';
import { makeBody, hinge } from './bodies.js';

const add = (a, b) => a.map((v, i) => v + b[i]), scale = (a, s) => a.map(v => v * s);
const E = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
// A cell's edge L, its thickness t, the gap between cells g, and the stop, upright. The hinges run along the plates'
// faces that turn outward, so an upright plate's weight lies inside its hinge and holds it on its stop (it balances
// 2.7° short of upright): walls stand plumb, side by side, never touching. The gap is a little more than twice the
// thickness, so a plate turning up clears the middle cell's edge, and a turned-up plate's top is level with the
// roof's underside. Light metal (2700 kg/m⁴, as aluminium): a plate weighs 55 kg, and lifted by its far edge half
// of it is in your hands (the arm that carries the roof, about all of the two).
export const FOLD = { L: 0.8, t: 0.04, g: 0.09, stop: Math.PI / 2, density: 2700 };
// Each hinge has a catch: a plate brought within 1.7° of upright is held there. (Upright on its own, a plate leans
// its weight 2.7° inside its hinge; but level here isn't quite square to the planet: the pull of the planet's own
// copies round the hoop tips the vertical by up to 4°, and turns it with the day, so without a catch a wall could
// fall back outward, or fail to stay as it came up.)
const CATCH = 0.03;
// The arms: the site axis each lies along (0 f, 1 s, 2 a) and which way. The +f one carries the roof.
export const ARMS = [[0, -1], [0, 1], [1, 1], [1, -1], [2, 1], [2, -1]];
// A plate in its hinge's frame: axis 0 out from the hinge, 3 up, the hinge's line at the origin along the plate's
// underside; 3 cm short of a cell across, so turned-up plates stand clear of each other at the corners (by 2 cm
// each way: more than the 2 cm within which contacts are looked for).
const plate = () => { const { L, t, g } = FOLD; return [{ shape: 'box', c: [g / 2 + L / 2, 0, 0, t / 2], e: [L / 2, L / 2 - 0.015, L / 2 - 0.015, t / 2] }]; };
// The hinge's frame for an arm, in the site's frame: out along its axis, then the other two ground axes, then up
// (proper: the second and third swapped if need be).
function armFrame(k, sg) {
  const o = [0, 1, 2].filter(i => i !== k), c0 = scale(E[k], sg), c1 = E[o[0]], c2 = E[o[1]];
  const det = sg * (k === 1 ? -1 : 1);                          // (the sign of [c0 c1 c2] as a 3D frame)
  const cols = det > 0 ? [c0, c1, c2, E[3]] : [c0, c2, c1, E[3]];
  return R4.fromMatrix([0, 1, 2, 3].map(r => cols.map(c => c[r])));
}
// The site's fixed parts (site frame, the middle cell's centre at the origin on the platform's top): the platform
// (room to stand beyond every arm's end), the middle cell, and the chest by the cross's foot, off every arm's line,
// with its lid; ring IV's place inside it.
export const CHEST = { c: [-2.0, 1.6, 0, 0], ring: [-2.0, 1.6, 0, 0] };
export function foldParts() {
  const { L, t } = FOLD, B = (c, e) => ({ shape: 'box', c, e }), [cf, cs] = CHEST.c;
  return {
    platform: [B([0, 0, 0, -0.35], [3.3, 2.3, 2.3, 0.35])],
    base: [B([0, 0, 0, t / 2], [L / 2, L / 2, L / 2, t / 2])],
    // the chest: walls 0.1 thick round 0.8 × 0.8 × 0.8 (f, s, a), 0.5 high
    chest: [B([cf - 0.45, cs, 0, 0.25], [0.05, 0.5, 0.5, 0.25]), B([cf + 0.45, cs, 0, 0.25], [0.05, 0.5, 0.5, 0.25]),
            B([cf, cs + 0.45, 0, 0.25], [0.4, 0.05, 0.5, 0.25]), B([cf, cs - 0.45, 0, 0.25], [0.4, 0.05, 0.5, 0.25]),
            B([cf, cs, 0.45, 0.25], [0.4, 0.4, 0.05, 0.25]), B([cf, cs, -0.45, 0.25], [0.4, 0.4, 0.05, 0.25])],
    lid: [B([0, 0, 0, 0], [0.5, 0.5, 0.5, 0.04])], lidAt: [cf, cs, 0, 0.54],
  };
}
// The seven plates and their hinges in world w, the site's middle cell at foot with frame R. Returns { plates,
// joints, roof, angles() } (each arm's turn up from flat; the roof's over its arm).
export function foldBuild(w, foot, R) {
  const { L, t, g, stop, density } = FOLD, plates = [], joints = [];
  const mk = (rot, hingeAt, parts = plate()) => {
    const b = makeBody({ shape: 'compound', parts, density, mu: 0.5, pos: hingeAt, kind: 'cell' });
    b.rot = rot; b.pos = add(hingeAt, R4.apply(rot, b.com));
    Object.assign(b, { mat: 1, glow: 0, keep: true, hinged: true });
    w.add(b); b.sleeping = true; return b;
  };
  for (const [k, sg] of ARMS) {
    const F = R4.compose(R, armFrame(k, sg)), at = add(foot, R4.apply(R, add(scale(E[k], sg * (L / 2 + g / 2)), [0, 0, 0, 0])));
    const b = mk(F, at); plates.push(b);
    const j = hinge({ b, ca: at, cb: scale(b.com, -1), Fa: F, plane: [0, 3], lo: -0.05, hi: stop, catchW: CATCH }); w.joints.push(j); joints.push(j);
  }
  // the roof: hinged to the +f arm at its far edge (in that arm's frame, L + g out), turning the same way. Turned
  // over, it lies within the ring of walls on its own stop, its underside level with their tops: walls come up past
  // it whether it is closed or not, and nothing falls on them.
  const arm = plates[1], F = arm.rot, at = add(foot, R4.apply(R, [L / 2 + g / 2 + L + g, 0, 0, 0]));
  const roof = mk(F, at); plates.push(roof);
  const jr = hinge({ a: arm, b: roof, ca: add([L + g, 0, 0, 0], scale(arm.com, -1)), cb: scale(roof.com, -1), Fa: R4.identity(), plane: [0, 3], lo: -0.02, hi: stop, catchW: CATCH });
  w.joints.push(jr); joints.push(jr);
  // (a hinge's angle is kept by the solver only while its plates move: measure it here)
  const ang = (Fa, Fb) => { const m = R4.toRows(R4.compose(R4.inverse(Fa), Fb)); return Math.atan2(m[3][0] - m[0][3], m[0][0] + m[3][3]); };
  return { plates, joints, roof, R, foot,
    angles() { return [...ARMS.map((_, i) => ang(joints[i].Fa, plates[i].rot)), ang(arm.rot, roof.rot)]; },
  };
}
