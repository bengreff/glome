// Node test for js/so4.js. No packages: plain JS, a hand-rolled matrix exponential
// (Taylor + scaling-and-squaring) used only as an independent oracle to check step().
import { rot, qmul, qconj, qnorm, qexp, wedge, bivApply, bivToMatrix, bivAdd, bivScale, bivDot, step } from '../js/so4.js';

let fails = 0, checks = 0;
function near(a, b, tol, msg) {
  checks++;
  const d = Math.abs(a - b);
  if (!(d <= tol)) { fails++; console.error(`FAIL ${msg}: |${a} - ${b}| = ${d} > ${tol}`); }
}
function vnear(a, b, tol, msg) {
  for (let i = 0; i < a.length; i++) near(a[i], b[i], tol, `${msg}[${i}]`);
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(12345);
const rnd = (lo, hi) => lo + (hi - lo) * rand();

function randomUnitQuat() {
  const v = [rnd(-1, 1), rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)];
  return qnorm(v);
}
function randomRot() { return { l: randomUnitQuat(), r: randomUnitQuat() }; }
function randomVec4() { return [rnd(-3, 3), rnd(-3, 3), rnd(-3, 3), rnd(-3, 3)]; }
function randomBivector() { return [rnd(-2, 2), rnd(-2, 2), rnd(-2, 2), rnd(-2, 2), rnd(-2, 2), rnd(-2, 2)]; }

// ---- plain 4x4 matrix helpers (test-local oracle; independent of so4.js) ----
const mat = {
  mul(A, B) {
    const C = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      let s = 0; for (let k = 0; k < 4; k++) s += A[i][k] * B[k][j];
      C[i][j] = s;
    }
    return C;
  },
  add(A, B) { return A.map((row, i) => row.map((v, j) => v + B[i][j])); },
  scale(A, s) { return A.map(row => row.map(v => v * s)); },
  identity() { return [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]; },
  apply(A, v) { return A.map(row => row[0] * v[0] + row[1] * v[1] + row[2] * v[2] + row[3] * v[3]); },
  norm1(A) { let m = 0; for (const row of A) for (const v of row) m = Math.max(m, Math.abs(v)); return m; },
};

// expm via Taylor series with scaling-and-squaring (independent oracle for step()).
function expm(A) {
  const n = mat.norm1(A);
  let s = 0, scaled = A;
  if (n > 0.5) { s = Math.ceil(Math.log2(n / 0.5)); scaled = mat.scale(A, 1 / Math.pow(2, s)); }
  let term = mat.identity(), sum = mat.identity();
  for (let k = 1; k <= 20; k++) {
    term = mat.scale(mat.mul(term, scaled), 1 / k);
    sum = mat.add(sum, term);
  }
  for (let i = 0; i < s; i++) sum = mat.mul(sum, sum);
  return sum;
}

console.log('--- so4.js tests ---');

// 1. qexp/qmul/qconj/qnorm sanity: exp(0) = 1, |exp(v)| = 1, exp is a homomorphism along a fixed axis.
{
  vnear(qexp([0, 0, 0]), [1, 0, 0, 0], 1e-14, 'qexp(0)=1');
  const v = [0.3, -0.7, 1.1];
  const e = qexp(v);
  near(qlen_(e), 1, 1e-14, 'qexp unit length');
  const e2 = qmul(qexp(v), qexp(v));
  const e2b = qexp([v[0] * 2, v[1] * 2, v[2] * 2]);
  vnear(e2, e2b, 1e-12, 'qexp additive along fixed axis');
  vnear(qmul(e, qconj(e)), [1, 0, 0, 0], 1e-13, 'q * conj(q) = 1');
}
function qlen_(q) { return Math.hypot(q[0], q[1], q[2], q[3]); }

// 2. identity / compose / inverse / apply identities.
for (let t = 0; t < 50; t++) {
  const A = randomRot(), B = randomRot(), v = randomVec4();
  const I = rot.identity();
  vnear(rot.apply(I, v), v, 1e-12, 'identity.apply');
  const AB = rot.compose(A, B);
  vnear(rot.apply(AB, v), rot.apply(A, rot.apply(B, v)), 1e-10, 'compose = apply(A,apply(B,v))');
  const Ainv = rot.inverse(A);
  vnear(rot.apply(Ainv, rot.apply(A, v)), v, 1e-10, 'inverse undoes apply');
  vnear(rot.applyInv(A, rot.apply(A, v)), v, 1e-10, 'applyInv undoes apply');
  // apply preserves length (it's a rotation)
  near(qlen_(rot.apply(A, v)), qlen_(v), 1e-10, 'apply preserves length');
}

// 3. toMatrix / toRows / fromMatrix round trips.
for (let t = 0; t < 50; t++) {
  const A = randomRot();
  const rows = rot.toRows(A);
  const M = rot.toMatrix(A);
  // toMatrix and toRows must agree (col-major vs row-major of the SAME matrix)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) near(M[c * 4 + r], rows[r][c], 1e-6, `toMatrix vs toRows [${r}][${c}]`);
  const v = randomVec4();
  vnear(mat.apply(rows, v), rot.apply(A, v), 1e-10, 'toRows matches apply');

  const B = rot.fromMatrix(rows);
  const v2 = randomVec4();
  vnear(rot.apply(B, v2), rot.apply(A, v2), 1e-9, 'fromMatrix round trip (action)');
  // orthonormality of the recovered rows
  const rowsB = rot.toRows(B);
  for (let i = 0; i < 4; i++) {
    const len2 = rowsB[i].reduce((s, x) => s + x * x, 0);
    near(len2, 1, 1e-9, `fromMatrix row ${i} unit length`);
  }
}

// 4. fromMatrix on known matrices: plain identity, and a few coordinate-plane rotations
// built by hand (independent of so4.js's own planeRotation), to make sure fromMatrix
// doesn't just happen to agree with itself.
{
  const B = rot.fromMatrix(mat.identity());
  vnear(rot.apply(B, [1, 2, 3, 4]), [1, 2, 3, 4], 1e-10, 'fromMatrix(I) is identity action');

  const theta = 0.7, c = Math.cos(theta), s = Math.sin(theta);
  // hand-built rotation in the (0,1) plane, i toward j convention from PHYSICS math above
  const Mxy = [[c, -s, 0, 0], [s, c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  const Bxy = rot.fromMatrix(Mxy);
  const v = [1, 0, 0, 0];
  vnear(rot.apply(Bxy, v), mat.apply(Mxy, v), 1e-10, 'fromMatrix hand-built xy rotation');
  const v2 = [0.3, -1.2, 0.6, 2.1];
  vnear(rot.apply(Bxy, v2), mat.apply(Mxy, v2), 1e-10, 'fromMatrix hand-built xy rotation, generic v');
}

// 5. planeRotation: axis i moves toward axis j; angle additivity; orthonormal.
{
  const theta = 0.5;
  const A = rot.planeRotation(0, 1, theta);
  const e0 = [1, 0, 0, 0];
  const v = rot.apply(A, e0);
  vnear(v, [Math.cos(theta), Math.sin(theta), 0, 0], 1e-9, 'planeRotation(0,1) takes x toward y');
  // untouched plane
  vnear(rot.apply(A, [0, 0, 1, 0]), [0, 0, 1, 0], 1e-9, 'planeRotation(0,1) leaves z fixed');
  vnear(rot.apply(A, [0, 0, 0, 1]), [0, 0, 0, 1], 1e-9, 'planeRotation(0,1) leaves w fixed');

  // angle additivity: R(a) then R(b) == R(a+b)
  const a = 0.3, b = 0.9;
  const Ra = rot.planeRotation(1, 3, a), Rb = rot.planeRotation(1, 3, b);
  const Rab = rot.planeRotation(1, 3, a + b);
  const vv = randomVec4();
  vnear(rot.apply(Rb, rot.apply(Ra, vv)), rot.apply(Rab, vv), 1e-9, 'planeRotation angle additivity');

  // full turn = identity
  const full = rot.planeRotation(2, 3, 2 * Math.PI);
  vnear(rot.apply(full, vv), vv, 1e-8, 'planeRotation full turn is identity action');
}

// 6. wedge / bivApply / bivToMatrix consistency: Ω·r from bivApply must match the matrix
// built by bivToMatrix, and wedge(a,b) must match the definition entrywise.
for (let t = 0; t < 20; t++) {
  const a = randomVec4(), b = randomVec4();
  const w = wedge(a, b);
  const planes = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
  planes.forEach(([i, j], k) => near(w[k], a[i] * b[j] - a[j] * b[i], 1e-10, `wedge plane ${k}`));

  const r = randomVec4();
  const M = bivToMatrix(w);
  vnear(bivApply(w, r), mat.apply(M, r), 1e-10, 'bivApply matches bivToMatrix');
}
{
  const a = randomBivector(), b = randomBivector();
  vnear(bivAdd(a, b), a.map((v, i) => v + b[i]), 1e-14, 'bivAdd');
  vnear(bivScale(a, 2.5), a.map(v => v * 2.5), 1e-14, 'bivScale');
  near(bivDot(a, b), a.reduce((s, v, i) => s + v * b[i], 0), 1e-14, 'bivDot');
}

// 7. step(): the core exactness test. For random A, ω, dt compare apply(step(A,ω,dt), v)
// against expm(Ω dt) * apply(A, v), with expm a plain Taylor/scaling-squaring oracle.
for (let t = 0; t < 60; t++) {
  const A = randomRot();
  const w = randomBivector();
  const dt = rnd(-0.8, 0.8);
  const v = randomVec4();
  const A2 = step(A, w, dt);
  const Omega = bivToMatrix(w);
  const E = expm(mat.scale(Omega, dt));
  const lhs = rot.apply(A2, v);
  const rhs = mat.apply(E, rot.apply(A, v));
  vnear(lhs, rhs, 1e-10, `step vs expm (t=${t})`);
}

// 8. step() composes correctly over sub-steps (same ω, same total time, different step counts).
{
  const A = randomRot(), w = randomBivector(), T = 1.3, v = randomVec4();
  const oneShot = step(A, w, T);
  let multi = A;
  const n = 37;
  for (let i = 0; i < n; i++) multi = step(multi, w, T / n);
  vnear(rot.apply(oneShot, v), rot.apply(multi, v), 1e-8, 'step: one big step == many small steps');
}

// 9. orthonormality survives 1e5 steps with periodic renorm (numerical drift control).
{
  let A = rot.identity();
  const w = [0.37, -0.21, 0.58, 0.12, -0.44, 0.29];
  const dt = 1 / 120;
  for (let i = 0; i < 1e5; i++) {
    A = step(A, w, dt);
    if (i % 500 === 0) A = rot.renorm(A);
  }
  A = rot.renorm(A);
  const rows = rot.toRows(A);
  // orthonormal: rows . rows^T = I
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const dij = rows[i].reduce((s, x, k) => s + x * rows[j][k], 0);
    near(dij, i === j ? 1 : 0, 1e-8, `orthonormality after 1e5 steps [${i}][${j}]`);
  }
}

console.log(`${checks} checks, ${fails} failures.`);
if (fails > 0) process.exit(1);
console.log('so4.js: ALL PASS');
