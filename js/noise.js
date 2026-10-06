// Deterministic 4D noise. Integer hashing is exact 32-bit arithmetic, so results are identical everywhere.

// PCG4D hash (Jarzynski & Olano 2020).
function pcg4d(x, y, z, w) {
  x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
  y = (Math.imul(y, 1664525) + 1013904223) >>> 0;
  z = (Math.imul(z, 1664525) + 1013904223) >>> 0;
  w = (Math.imul(w, 1664525) + 1013904223) >>> 0;
  x = (x + Math.imul(y, w)) >>> 0; y = (y + Math.imul(z, x)) >>> 0;
  z = (z + Math.imul(x, y)) >>> 0; w = (w + Math.imul(y, z)) >>> 0;
  x ^= x >>> 16; y ^= y >>> 16; z ^= z >>> 16; w ^= w >>> 16;
  x = (x + Math.imul(y, w)) >>> 0; y = (y + Math.imul(z, x)) >>> 0;
  z = (z + Math.imul(x, y)) >>> 0; w = (w + Math.imul(y, z)) >>> 0;
  return (x ^ y ^ z ^ w) >>> 0;
}

// Lattice value in [-1, 1].
function lattice(ix, iy, iz, iw) {
  return (pcg4d(ix | 0, iy | 0, iz | 0, iw | 0) >>> 8) / 8388608 - 1;
}

const fade = t => t * t * t * (t * (t * 6 - 15) + 10);

// 4D value noise in roughly [-1, 1].
export function vnoise4(x, y, z, w) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), iw = Math.floor(w);
  const ux = fade(x - ix), uy = fade(y - iy), uz = fade(z - iz), uw = fade(w - iw);
  let acc = 0;
  for (let c = 0; c < 16; c++) {
    const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1, dw = (c >> 3) & 1;
    const wt = (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz) * (dw ? uw : 1 - uw);
    acc += wt * lattice(ix + dx, iy + dy, iz + dz, iw + dw);
  }
  return acc;
}

// Fractal sum; each octave is offset so lattice artefacts don't line up.
export function fbm4(x, y, z, w, octaves) {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise4(x * f + 17.1 * o, y * f - 9.3 * o, z * f + 5.7 * o, w * f - 13.9 * o);
    norm += amp; amp *= 0.5; f *= 2.03;
  }
  return sum / norm;
}

// Ridged fractal in [0, 1]: sharp crests where the noise crosses zero.
export function ridged4(x, y, z, w, octaves) {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(vnoise4(x * f + 3.3 * o, y * f + 7.9 * o, z * f - 1.7 * o, w * f + 4.1 * o));
    sum += amp * n * n; norm += amp; amp *= 0.5; f *= 2.07;
  }
  return sum / norm;
}
