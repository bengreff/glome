// SO(4): rotations of 4D space, as pairs of unit quaternions.
//
// Fact used throughout: SO(4) ≅ (S³ × S³)/±1. Identify a 4-vector (a,b,c,d) with the
// quaternion a + b i + c j + d k. A rotation is a pair of unit quaternions A = {l, r}
// acting on a 4-vector v (itself read as a quaternion) by the two-sided product
//
//     apply(A, v) = l · v · r        (quaternion multiplication)
//
// Every proper rotation of R⁴ arises this way, and {l, r} and {-l, -r} give the same
// rotation (the ±1 in the quotient), which is why fromMatrix only recovers l, r up to a
// common sign flip.
//
// Vectors are plain arrays [x, y, z, w] (or typed arrays — anything with [0..3]).

// ---------------------------------------------------------------------------
// Quaternion basics. A quaternion is [w, x, y, z] = w + x i + y j + z k (Hamilton
// convention, i*j = k, right-handed). Plain 4-arrays double as quaternions.
// ---------------------------------------------------------------------------

// Hamilton product p*q.
export function qmul(p, q) {
  const [p0, p1, p2, p3] = p, [q0, q1, q2, q3] = q;
  return [
    p0 * q0 - p1 * q1 - p2 * q2 - p3 * q3,
    p0 * q1 + p1 * q0 + p2 * q3 - p3 * q2,
    p0 * q2 - p1 * q3 + p2 * q0 + p3 * q1,
    p0 * q3 + p1 * q2 - p2 * q1 + p3 * q0,
  ];
}

export function qconj(q) { return [q[0], -q[1], -q[2], -q[3]]; }

export function qlen(q) { return Math.hypot(q[0], q[1], q[2], q[3]); }

// Normalise to a unit quaternion.
export function qnorm(q) {
  const l = qlen(q);
  if (l < 1e-300) return [1, 0, 0, 0];
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

// sinc(x) = sin(x)/x, by a Taylor series for small x where the direct division loses precision.
function sinc(x) {
  const x2 = x * x;
  if (x < 1e-4) return 1 - x2 / 6 + (x2 * x2) / 120;
  return Math.sin(x) / x;
}

// Exact exponential of a pure quaternion (0, v), v a 3-vector [vx, vy, vz]:
//   exp(v) = cos|v| + sin|v| * v/|v|,
// with the v/|v| factor replaced by its sinc series near |v| = 0 so it stays smooth
// (and defined) at v = 0, where exp(0) = 1.
export function qexp(v) {
  const m = Math.hypot(v[0], v[1], v[2]);
  const s = sinc(m);
  return [Math.cos(m), v[0] * s, v[1] * s, v[2] * s];
}

// ---------------------------------------------------------------------------
// Rotations: {l, r} acting as v ↦ l v r.
// ---------------------------------------------------------------------------

export const rot = {
  identity() { return { l: [1, 0, 0, 0], r: [1, 0, 0, 0] }; },

  // compose(A, B): "first B, then A", i.e. apply(compose(A,B), v) === apply(A, apply(B,v)).
  // apply(A, apply(B,v)) = lA (lB v rB) rA = (lA lB) v (rB rA)   [quaternion mult is associative]
  compose(A, B) {
    return { l: qmul(A.l, B.l), r: qmul(B.r, A.r) };
  },

  // inverse(A): l' l = 1 and r r' = 1, so l' = conj(l), r' = conj(r) (both unit quaternions).
  inverse(A) {
    return { l: qconj(A.l), r: qconj(A.r) };
  },

  apply(A, v) { return qmul(qmul(A.l, v), A.r); },

  applyInv(A, v) { return rot.apply(rot.inverse(A), v); },

  renorm(A) { return { l: qnorm(A.l), r: qnorm(A.r) }; },

  // Column-major Float32Array(16) for WebGL's uniformMatrix4fv, with M·v === apply(A, v).
  // Column c of M is apply(A, e_c) for the c-th basis vector e_c.
  toMatrix(A) {
    const M = new Float32Array(16);
    const basis = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
    for (let c = 0; c < 4; c++) {
      const col = rot.apply(A, basis[c]);
      for (let r = 0; r < 4; r++) M[c * 4 + r] = col[r];
    }
    return M;
  },

  // The same matrix as 4 row arrays (rows[r][c] = M_rc), for plain JS use. Matches the
  // array-of-rows convention fromMatrix expects.
  toRows(A) {
    const basis = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
    const cols = basis.map(e => rot.apply(A, e));
    const rows = [[], [], [], []];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) rows[r][c] = cols[c][r];
    return rows;
  },

  // fromMatrix(M): recover {l, r} for any proper orthogonal 4x4 matrix M (rows = array of
  // 4 row-arrays), such that apply({l,r}, v) === M·v.
  //
  // Derivation (the isoclinic decomposition, done via quaternion conjugation rather than
  // the raw 16-term bilinear "associate matrix" — equivalent, but far less error-prone):
  //
  //   Column 0 of M is M applied to the quaternion 1 = (1,0,0,0): M·1 = l·1·r = l·r =: p.
  //   Column k (k=1,2,3) of M is M applied to the quaternion basis vector e_k (i, j or k):
  //     M·e_k = l·e_k·r.
  //   Multiply on the right by conj(p) = conj(r)·conj(l):
  //     (l·e_k·r)·conj(p) = l·e_k·r·conj(r)·conj(l) = l·e_k·conj(l)     (r·conj(r) = 1)
  //   So s_k := M(e_k)·conj(p) = l · e_k · conj(l), which is exactly the ordinary 3D
  //   quaternion sandwich-rotation of the basis vector e_k by l. Its vector part, for
  //   k=1,2,3, is therefore the k-th column of the 3x3 rotation matrix R3 that l represents
  //   in the standard way. Recover l from R3 by the robust (Shepperd) method, then
  //   r = conj(l)·p (from l·r = p, left-multiply by conj(l)).
  fromMatrix(M) {
    const col = j => [M[0][j], M[1][j], M[2][j], M[3][j]];
    const p = col(0);
    const pc = qconj(p);
    const s1 = qmul(col(1), pc), s2 = qmul(col(2), pc), s3 = qmul(col(3), pc);
    // R3 columns are the vector (i,j,k) parts of s1,s2,s3.
    const R3 = [
      [s1[1], s2[1], s3[1]],
      [s1[2], s2[2], s3[2]],
      [s1[3], s2[3], s3[3]],
    ];
    const l = qnorm(quatFromRotMatrix3(R3));
    const r = qnorm(qmul(qconj(l), p));
    return { l, r };
  },

  // Rotation by `angle` in the coordinate plane (i, j), i<j in {0,1,2,3}, taking axis i
  // toward axis j. A rotation confined to a single coordinate plane is exactly the
  // one-parameter subgroup generated by that plane's unit bivector, so this is just
  // step() applied to the identity with ω = angle in that one plane and dt = 1 — exact,
  // and it reuses the already-verified exponential machinery below instead of a separate
  // (and separately error-prone) derivation.
  planeRotation(i, j, angle) {
    // Note the minus sign: with Ω[i][j] = ω_ij (i<j), the velocity of a point at e_i is
    // Ω·e_i, whose j-component is Ω[j][i] = -ω_ij. So a positive ω_ij actually carries
    // axis i toward -j; to take i toward +j (as specified) the bivector component must be
    // -angle. Found by the round-trip test against the explicit "i toward j" definition,
    // not assumed.
    const idx = planeIndex(i, j);
    const omega = [0, 0, 0, 0, 0, 0];
    omega[idx] = -angle;
    return step(rot.identity(), omega, 1);
  },
};

// ---------------------------------------------------------------------------
// Bivectors: angular velocity / momentum / torque, as 6 numbers in plane order
// [xy, xz, xw, yz, yw, zw] <-> index pairs (0,1), (0,2), (0,3), (1,2), (1,3), (2,3).
// The antisymmetric matrix Ω has Ω[i][j] = ω_ij (i<j), Ω[j][i] = -ω_ij, and the velocity
// of a point at offset r from the centre of a rotating body is v = Ω·r.
// ---------------------------------------------------------------------------

const PLANES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
function planeIndex(i, j) {
  if (i > j) [i, j] = [j, i];
  for (let k = 0; k < 6; k++) if (PLANES[k][0] === i && PLANES[k][1] === j) return k;
  throw new Error('bad plane indices');
}

// Bivector components of a ∧ b: (a_i b_j - a_j b_i) for each plane (i,j) in PLANES order.
export function wedge(a, b) {
  const out = new Array(6);
  for (let k = 0; k < 6; k++) { const [i, j] = PLANES[k]; out[k] = a[i] * b[j] - a[j] * b[i]; }
  return out;
}

// Ω·r, Ω the antisymmetric matrix built from bivector ω.
export function bivApply(w, r) {
  const [w0, w1, w2, w3, w4, w5] = w; // xy, xz, xw, yz, yw, zw
  return [
    w0 * r[1] + w1 * r[2] + w2 * r[3],
    -w0 * r[0] + w3 * r[2] + w4 * r[3],
    -w1 * r[0] - w3 * r[1] + w5 * r[3],
    -w2 * r[0] - w4 * r[1] - w5 * r[2],
  ];
}

// The antisymmetric 4x4 matrix Ω as an array of 4 row-arrays (JS use; same row-array
// convention as toRows/fromMatrix, not the WebGL column-major layout).
export function bivToMatrix(w) {
  const [w0, w1, w2, w3, w4, w5] = w;
  return [
    [0, w0, w1, w2],
    [-w0, 0, w3, w4],
    [-w1, -w3, 0, w5],
    [-w2, -w4, -w5, 0],
  ];
}

export function bivAdd(a, b) { return a.map((v, i) => v + b[i]); }
export function bivScale(a, s) { return a.map(v => v * s); }
export function bivDot(a, b) { return a.reduce((s, v, i) => s + v * b[i], 0); }

// ---------------------------------------------------------------------------
// Exact integration of a constant world-frame angular velocity bivector ω over dt:
// step(A, ω, dt) = expm(Ω dt) ∘ A, computed exactly (not just to first order) via the
// self-dual / anti-self-dual split of ω into two 3-vectors ω₊, ω₋.
//
// Derivation. Write dA for the infinitesimal rotation applied over dt in the WORLD frame,
// so the new orientation is A' = compose(dA, A) (dA composed on the outside): per
// compose(), that means l' = l_dA · l, r' = r · r_dA — matching the "l ← ... · l,
// r ← r · ..." shape the brief describes.
//
// For dA = {l: qexp(a dt/2), r: qexp(b dt/2)} with fixed pure-quaternion directions a, b
// (3-vectors), and v(t) = l(t) v0 r(t) starting from the identity, differentiating gives
//   dv/dt = (a/2)·v(t) + v(t)·(b/2)          (quaternion products; exact for all t, because
// exp(a t) commutes with its own generator a, so the derivative of exp(a t) is exactly
// (a) · exp(a t) with no higher-order correction — this is NOT merely a first-order
// approximation, it is the exact solution of the linear ODE for all t).
// Matching the right-hand side to Ω v = (1/2)[ (0,a)·v + v·(0,b) ] for every v and solving
// the resulting linear system against Ω's definition above (Ω[i][j] = ω_ij) gives, with
// ω = [xy, xz, xw, yz, yw, zw]:
//
//   ω₊ = ( -(ω_xy + ω_zw),   ω_yw - ω_xz,   -(ω_xw + ω_yz) )     (self-dual part)
//   ω₋ = (  ω_zw - ω_xy,   -(ω_xz + ω_yw),   ω_yz - ω_xw  )     (anti-self-dual part)
//
// (worked out from scratch by matching L(a) and R(b), the matrices of left/right
// quaternion multiplication by pure quaternions, against Ω entry by entry — not assumed).
// Because this one-parameter subgroup is exact for any t, composing n sub-steps of size
// dt/n reproduces exactly the same {l,r} as one step of size dt: step() is exact for any
// dt, not just a small-angle approximation.
// ---------------------------------------------------------------------------
export function step(A, w, dt) {
  const [wxy, wxz, wxw, wyz, wyw, wzw] = w;
  const wp = [-(wxy + wzw), wyw - wxz, -(wxw + wyz)];   // ω₊, self-dual
  const wm = [wzw - wxy, -(wxz + wyw), wyz - wxw];      // ω₋, anti-self-dual
  const half = dt / 2;
  const dl = qexp([wp[0] * half, wp[1] * half, wp[2] * half]);
  const dr = qexp([wm[0] * half, wm[1] * half, wm[2] * half]);
  return { l: qmul(dl, A.l), r: qmul(A.r, dr) };
}

// ---------------------------------------------------------------------------
// Robust 3x3 rotation-matrix -> quaternion (Shepperd's method: pick whichever of
// w²,x²,y²,z² is largest to divide by, so it never divides by something near zero).
// m is an array of 3 row-arrays. Returns [w,x,y,z] with v' = q v conj(q) matching m·v.
// ---------------------------------------------------------------------------
function quatFromRotMatrix3(m) {
  const [[m00, m01, m02], [m10, m11, m12], [m20, m21, m22]] = m;
  const tr = m00 + m11 + m22;
  let w, x, y, z;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = 0.25 * s;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    x = 0.25 * s;
    w = (m21 - m12) / s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    y = 0.25 * s;
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    z = 0.25 * s;
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
  }
  return [w, x, y, z];
}
