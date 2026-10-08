// GLSL for ray-marching the 4D world. Every ray is a genuine 4D ray: geometry, normals,
// lighting and shadows are all computed in four dimensions.

export const VERT = `#version 300 es
out vec2 vUV;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUV = p * 2.0 - 1.0;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const COMMON = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;

uniform sampler3D uAtlas;   // terrain heights on the cubed 3-sphere, 8 charts stacked in depth
uniform sampler3D uNoise;   // tileable gradient noise: rgb = gradient, a = value
uniform float uN;           // chart resolution
uniform float uPR;          // planet radius
uniform float uSea;         // sea level above uPR
uniform vec4 uEye;          // eye position (planet frame)
uniform vec4 uF, uR, uU, uA;// view basis: forward, right, up (pitched) and ana
uniform vec4 uSun;          // unit direction toward the sun
uniform float uTime;
uniform float uShadows;
const int MAXB = 32;
uniform vec4 uBC[MAXB];     // boulders near you: 4D balls (centres) ...
uniform float uBR[MAXB];    // ... and radii
uniform int uBN;            // all of them cast shadows ...
uniform int uBCut;          // ... but only the first uBCut cross your slice, so only those can be seen,
uniform int uBShadow;       // and only the first uBShadow can shade it

const int MAXO = 12;
uniform vec4 uOC[MAXO];     // objects near you: centres ...
uniform mat4 uOM[MAXO];     // ... orientations (columns: the body's axes in the world) ...
uniform vec4 uOP[MAXO];     // ... x: shape (0 glome, 1 tesseract), y: radius or half side, z: material (0 stone, 1 metal, 2 accent), w: glow
uniform int uON;            // how many; the first uOCut cross your slice
uniform int uOCut;
const int MAXL = 4;
uniform vec4 uLP[MAXL];     // lanterns: positions ...
uniform vec4 uLC[MAXL];     // ... and colour times strength (light falls off as 1/r³)
uniform int uLN;

float bR(int i) { return uBR[i]; }

// The hoop sky. The star is seen with all its images round the hoop: a row of suns along the hoop axis, each
// falling off as 1/d³. Sunlight is their sum.
uniform vec4 uStar0;        // the star's main image (its centre) in this frame
uniform vec4 uHoop;         // unit hoop axis in this frame
uniform float uL, uStarR;
uniform float uStarI;       // 1 / (the row's summed 1/d³ at A's centre), so A's total sunlight is 1
const int NIMG = 7;         // images each side (they hold 95% of the light; the rest lie beyond 70°)
uniform vec4 uStarD[2 * NIMG + 1];   // unit directions to the images from A's centre ...
uniform vec4 uStarW[4];     // ... and each one's share of the light there (they sum to 1)
uniform mat4 uSkyM;         // this frame -> the inertial frame, for the fixed stars
uniform ivec2 uStarK, uCopyK; // the images and copies near enough to your slice to be seen
uniform float uDayE;        // how much of the row's light is above the eye's horizon (0 night .. 1 day)
uniform float uAtmos;       // 1 near the ground, fading to 0 high above it (the sky's colour is artistic)
float starW(int k) { return uStarW[k >> 2][k & 3]; }

const float MAXT = 900.0;
const float SHELL = 48.0;   // terrain lies within uPR-20 .. uPR+SHELL

float h41(vec4 p) {
  p = fract(p * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p += dot(p, p.wzxy + 33.33);
  return fract((p.x + p.y) * (p.z + p.w));
}
float vn4(vec4 x) {
  vec4 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float acc = 0.0;
  for (int c = 0; c < 16; c++) {
    vec4 o = vec4(float(c & 1), float((c >> 1) & 1), float((c >> 2) & 1), float((c >> 3) & 1));
    vec4 w = mix(1.0 - f, f, o);
    acc += w.x * w.y * w.z * w.w * h41(i + o);
  }
  return acc;
}

float comp(vec4 n, int k) { return k == 0 ? n.x : k == 1 ? n.y : k == 2 ? n.z : n.w; }
// One trilinear fetch from chart k (the atlas is pre-smoothed with the cubic B-spline kernel).
float chartHeight(vec4 n, int k) {
  float s = comp(n, k), m = abs(s);
  vec3 u = (k == 0 ? n.yzw : k == 1 ? vec3(n.x, n.z, n.w) : k == 2 ? vec3(n.x, n.y, n.w) : n.xyz) / m;
  vec3 pos = clamp((u * 0.5 + 0.5) * (uN - 1.0), 0.0, uN - 1.0);
  float chart = float(2 * k) + (s > 0.0 ? 1.0 : 0.0);
  return texture(uAtlas, vec3((pos.x + 0.5) / uN, (pos.y + 0.5) / uN, (chart * uN + pos.z + 0.5) / (8.0 * uN))).r;
}
// The water's surface (the sea, or a river 0.5 m above its bed), on the same charts at half the resolution.
uniform sampler3D uWaterL;
float waterAt(vec4 n) {
  vec4 a = abs(n);
  float amax = max(max(a.x, a.y), max(a.z, a.w)), NW = uN * 0.5;
  float sum = 0.0, wsum = 0.0;
  for (int k = 0; k < 4; k++) {
    float w = 1.0 - (amax - comp(a, k)) / (0.04 * amax);
    if (w <= 0.0) continue;
    w = w * w * (3.0 - 2.0 * w);
    float s = comp(n, k), m = abs(s);
    vec3 u = (k == 0 ? n.yzw : k == 1 ? vec3(n.x, n.z, n.w) : k == 2 ? vec3(n.x, n.y, n.w) : n.xyz) / m;
    vec3 pos = clamp((u * 0.5 + 0.5) * (NW - 1.0), 0.0, NW - 1.0);
    float chart = float(2 * k) + (s > 0.0 ? 1.0 : 0.0);
    sum += w * texture(uWaterL, vec3((pos.x + 0.5) / NW, (pos.y + 0.5) / NW, (chart * NW + pos.z + 0.5) / (8.0 * NW))).r;
    wsum += w;
  }
  return max(uSea, sum / wsum);
}
const float SEAM = 0.04;
// Same seam blend as HeightField.heightAt on the CPU: what you see is what you walk on.
float heightAt(vec4 n) {
  vec4 a = abs(n);
  float amax = max(max(a.x, a.y), max(a.z, a.w));
  float sum = 0.0, wsum = 0.0;
  for (int k = 0; k < 4; k++) {
    float w = 1.0 - (amax - comp(a, k)) / (SEAM * amax);
    if (w <= 0.0) continue;
    w = w * w * (3.0 - 2.0 * w);
    sum += w * chartHeight(n, k); wsum += w;
  }
  return sum / wsum;
}

float sdTerrain(vec4 p) {
  float r = length(p);
  return (r - uPR - heightAt(p / r)) * 0.6;
}
// Gradient from 5 samples on a regular 4-simplex (instead of 8 central differences).
const vec4 S0 = vec4( 0.5590170, 0.5590170, 0.5590170, -0.25);
const vec4 S1 = vec4( 0.5590170,-0.5590170,-0.5590170, -0.25);
const vec4 S2 = vec4(-0.5590170, 0.5590170,-0.5590170, -0.25);
const vec4 S3 = vec4(-0.5590170,-0.5590170, 0.5590170, -0.25);
const vec4 S4 = vec4( 0.0, 0.0, 0.0, 1.0);
vec4 terrainNormal(vec4 p, float t) {
  float e = 0.9 + 0.003 * t;
  return normalize(S0 * sdTerrain(p + e * S0) + S1 * sdTerrain(p + e * S1) + S2 * sdTerrain(p + e * S2)
                 + S3 * sdTerrain(p + e * S3) + S4 * sdTerrain(p + e * S4));
}

float marchTerrain(vec4 ro, vec4 rd) {
  float rOut = uPR + SHELL;
  float t = 0.02;
  float b = dot(ro, rd), c = dot(ro, ro) - rOut * rOut;
  if (c > 0.0) {                       // eye above the terrain shell: jump to it
    float disc = b * b - c;
    if (disc < 0.0 || b > 0.0) return -1.0;
    t = -b - sqrt(disc);
  }
  float tPrev = t;
  for (int i = 0; i < 260; i++) {
    vec4 p = ro + rd * t;
    float d = sdTerrain(p);
    if (d < 0.0012 * t + 0.002) {
      if (d < 0.0 && i > 0) {                // overshot (over-relaxed step): bisect back to the surface
        float a = tPrev, z = t;
        for (int j = 0; j < 6; j++) { float m = 0.5 * (a + z); if (sdTerrain(ro + rd * m) < 0.0) z = m; else a = m; }
        return z;
      }
      return t;
    }
    tPrev = t;
    t += max(d * 1.4, 0.0008 * t);          // over-relaxed: the 0.6 slope bound is conservative almost everywhere
    if (t > MAXT) break;
    if (dot(p, p) > rOut * rOut && dot(p, rd) > 0.0) break;
  }
  return -1.0;
}

// The same march for a copy of the planet seen from far away: larger steps and a looser hit tolerance.
float marchTerrainFar(vec4 ro, vec4 rd) {
  float rOut = uPR + SHELL;
  float b = dot(ro, rd), c = dot(ro, ro) - rOut * rOut, disc = b * b - c;
  if (disc < 0.0 || b > 0.0) return -1.0;
  float t = max(-b - sqrt(disc), 0.0), tEnd = -b + sqrt(disc), tPrev = t;
  for (int i = 0; i < 120; i++) {
    float d = sdTerrain(ro + rd * t);
    if (d < 0.0025 * t) {
      if (d < 0.0 && i > 0) { float a = tPrev, z = t; for (int j = 0; j < 5; j++) { float m = 0.5 * (a + z); if (sdTerrain(ro + rd * m) < 0.0) z = m; else a = m; } return z; }
      return t;
    }
    tPrev = t;
    t += max(d * 1.4, 0.002 * t);
    if (t > tEnd) break;
  }
  return -1.0;
}

// Sixteen samples at geometric spacing, 0.3 m to 200 m: the penumbra estimate 8d/t widens as fast as the gaps,
// and fixed-count loops run well in parallel. (Within 1% of an adaptive march, about 20% cheaper.)
float softShadow(vec4 ro, vec4 rd) {
  float res = 1.0, t = 0.3, rOut = uPR + SHELL;
  for (int i = 0; i < 16; i++) {
    vec4 p = ro + rd * t;
    if (dot(p, p) > rOut * rOut && dot(p, rd) > 0.0) break;
    res = min(res, 8.0 * sdTerrain(p) / t);
    if (res < 0.02) break;
    t *= 1.54;
  }
  return clamp(res, 0.0, 1.0);
}

// Boulders are 4D balls, intersected analytically. Your slice cuts each one in a 3D ball of radius
// sqrt(r^2 - a^2), where a is how far its centre lies toward ana or kata: they swell and vanish as you turn.
float hitBoulder(vec4 ro, vec4 rd, float tMax, out int idx) {
  float best = tMax; idx = -1;
  for (int i = 0; i < MAXB; i++) {
    if (i >= uBCut) break;
    vec4 oc = ro - uBC[i];
    float b = dot(oc, rd), c = dot(oc, oc) - bR(i) * bR(i), d = b * b - c;
    if (d > 0.0) { float t = -b - sqrt(d); if (t > 0.0 && t < best) { best = t; idx = i; } }
  }
  return best;
}
// Soft shadow from the boulders along a ray toward the sun.
float boulderShadow(vec4 ro, vec4 rd) {
  float res = 1.0;
  for (int i = 0; i < MAXB; i++) {
    if (i >= uBShadow) break;
    vec4 oc = uBC[i] - ro;
    float t = dot(oc, rd);
    if (t <= 0.0) continue;
    float miss = sqrt(max(dot(oc, oc) - t * t, 0.0)) - bR(i);
    res = min(res, clamp(6.0 * miss / t + 0.5, 0.0, 1.0));
  }
  return res;
}

// Objects: 4D balls and tesseracts with any orientation in SO(4). The ray is carried into the object's own frame
// (the transpose of its rotation), where a tesseract is the box |x_i| <= h: a 4D slab test.
float hitObject(vec4 ro, vec4 rd, float tMax, int count, out int idx, out vec4 nrm) {
  float best = tMax; idx = -1; nrm = vec4(0.0);
  for (int i = 0; i < MAXO; i++) {
    if (i >= count) break;
    vec4 oc = ro - uOC[i];
    float h = uOP[i].y;
    if (uOP[i].x < 0.5) {
      float b = dot(oc, rd), c = dot(oc, oc) - h * h, d = b * b - c;
      if (d > 0.0) { float t = -b - sqrt(d); if (t > 0.0 && t < best) { best = t; idx = i; nrm = (oc + rd * t) / h; } }
    } else {
      vec4 o = oc * uOM[i], dd = rd * uOM[i];           // into the body frame: Mᵀ·v
      vec4 inv = 1.0 / dd;
      vec4 t1 = (-h - o) * inv, t2 = (h - o) * inv;
      vec4 tn = min(t1, t2), tf = max(t1, t2);
      float tNear = max(max(tn.x, tn.y), max(tn.z, tn.w)), tFar = min(min(tf.x, tf.y), min(tf.z, tf.w));
      if (tNear < tFar && tNear > 0.0 && tNear < best) {
        best = tNear; idx = i;
        vec4 nb = vec4(equal(tn, vec4(tNear))) * -sign(dd);
        nrm = uOM[i] * nb;
      }
    }
  }
  return best;
}
// Shadows from objects along a ray toward the sun: soft for balls, sharp for tesseracts.
float objectShadow(vec4 ro, vec4 rd) {
  float res = 1.0;
  for (int i = 0; i < MAXO; i++) {
    if (i >= uON) break;
    vec4 oc = uOC[i] - ro;
    float t = dot(oc, rd);
    if (t <= 0.0) continue;
    float h = uOP[i].y;
    if (uOP[i].x < 0.5) {
      float miss = sqrt(max(dot(oc, oc) - t * t, 0.0)) - h;
      res = min(res, clamp(6.0 * miss / t + 0.5, 0.0, 1.0));
    } else {
      vec4 o = -oc * uOM[i], dd = rd * uOM[i], inv = 1.0 / dd;
      vec4 t1 = (-h - o) * inv, t2 = (h - o) * inv, tn = min(t1, t2), tf = max(t1, t2);
      float tNear = max(max(tn.x, tn.y), max(tn.z, tn.w)), tFar = min(min(tf.x, tf.y), min(tf.z, tf.w));
      if (tNear < tFar && tFar > 0.0) res = 0.0;
    }
  }
  return res;
}
// Lanterns: point lights whose light spreads over a 3-sphere, so it falls off as 1/r³: a small, sharp pool.
vec3 lanternLight(vec4 p, vec4 n) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < MAXL; i++) {
    if (i >= uLN) break;
    vec4 d = uLP[i] - p;
    float r = max(length(d), 0.25);
    acc += uLC[i].rgb * max(dot(n, d / r), 0.0) / (r * r * r);
  }
  return acc;
}

// Cheap ambient occlusion: how much the bounding surface crowds in along the normal.
float ambientOcclusion(vec4 p, vec4 n) {
  float occ = 0.0;
  for (int i = 1; i <= 3; i++) {
    float h = 0.6 * float(i * i);
    occ += (h - sdTerrain(p + n * h) / 0.6) / h * (1.0 / float(i));
  }
  return clamp(1.0 - 0.45 * occ, 0.35, 1.0);
}

// Surface detail from a tileable 3D gradient noise. Two different 3D projections of the 4D point
// are summed so that no 4D direction leaves the pattern constant. Returns the value; g = 4D gradient.
const float NOISE_P = 16.0;
float detail(vec4 p, float f, out vec4 g) {
  const vec3 c1 = vec3(0.613, -0.418, 0.672);
  const vec3 c2 = vec3(-0.281, 0.805, 0.523);
  vec4 a = texture(uNoise, (p.xyz + p.w * c1) * f / NOISE_P);
  vec4 b = texture(uNoise, ((p.yzx - p.w * c2) * f * 1.13 + 17.0) / NOISE_P);
  vec3 ga = (a.xyz * 2.0 - 1.0) * 3.0, gb = (b.xyz * 2.0 - 1.0) * 3.0;
  g = f * vec4(ga, dot(ga, c1)) + f * 1.13 * vec4(gb.z, gb.x, gb.y, -dot(gb, c2));
  return (a.w + b.w) - 1.0;
}

float dayFactor(vec4 up) {
  float s = 0.0;
  for (int k = 0; k < 2 * NIMG + 1; k++) s += starW(k) * smoothstep(-0.14, 0.18, dot(uStarD[k], up));
  return s;
}
// Sunlight on a surface: the exact sum over the row of images, each 1/d³, each set behind its own horizon.
const int NLIT = 5;         // images each side that light surfaces (91% of the light; the share of the rest is folded in)
float rowLight(vec4 p, vec4 n, vec4 up) {
  float s = 0.0;
  for (int k = -NLIT; k <= NLIT; k++) {
    vec4 d = uStar0 + float(k) * uL * uHoop - p;
    float r2 = dot(d, d), r = sqrt(r2);
    s += max(dot(n, d), 0.0) / (r2 * r2) * smoothstep(-0.04, 0.06, dot(d, up) / r);
  }
  return s * uStarI;
}

vec3 horizonColor(vec4 up, float day) {
  float sunEl = dot(uSun, up);
  vec3 hz = mix(vec3(0.06, 0.075, 0.13), vec3(0.66, 0.77, 0.90), day);
  float dusk = exp(-pow((sunEl + 0.02) * 5.5, 2.0));
  return mix(hz, vec3(0.95, 0.52, 0.30), dusk * 0.6);
}

vec3 skyColor(vec4 rd, vec4 up, float day0) {
  float el = dot(rd, up);
  float day = day0 * uAtmos;
  vec3 zen = mix(vec3(0.02, 0.03, 0.075), vec3(0.16, 0.36, 0.75), day);
  vec3 col = mix(horizonColor(up, day0), zen, pow(clamp(el, 0.0, 1.0), 0.45)) * uAtmos;
  if (day < 0.3) {
    // Stars are points scattered over the 3-sphere of directions, fixed in space (so they wheel across the night
    // as the planet double-spins). A slice only shows directions inside your 3D slice, so a star appears only
    // while its direction is close to it, and fades as you turn through ana.
    vec4 rdi = uSkyM * rd;
    vec4 cell = floor(rdi * 110.0);
    if (h41(cell + 0.37) > 0.978) {
      vec4 jit = vec4(h41(cell + 1.1), h41(cell + 2.3), h41(cell + 3.7), h41(cell + 4.9)) * 0.6 + 0.2;
      vec4 sdir = normalize(cell + jit);
      float rad = 0.0026 * (0.6 + 0.9 * h41(cell + 5.5));
      col += vec3(0.82, 0.88, 1.0) * smoothstep(rad, rad * 0.25, length(rdi - sdir)) * (1.0 - smoothstep(0.04, 0.3, day)) * 1.8;
    }
  }
  return col;
}

// The star's images along the ray: their discs (every image has the same surface brightness: radiance is
// conserved along a ray, in any dimension) and a soft glow, dimmer for an image lying off your slice.
vec3 starRow(vec4 ro, vec4 rd, out float tHit) {
  vec3 col = vec3(0.0);
  tHit = -1.0;
  for (int k = -NIMG; k <= NIMG; k++) {
    if (k < uStarK.x || k > uStarK.y) continue;            // only images near your slice can be seen
    vec4 c = uStar0 + float(k) * uL * uHoop, oc = ro - c;
    float b = dot(oc, rd), d2 = dot(oc, oc), disc = b * b - d2 + uStarR * uStarR;
    if (disc > 0.0 && b < 0.0) {
      float mu = sqrt(disc) / uStarR;                       // 1 at the disc's centre, 0 at its limb
      tHit = -b - sqrt(disc);
      return vec3(1.0, 0.92, 0.78) * 9.0 * (0.45 + 0.55 * sqrt(mu));
    }
    if (b < 0.0 && abs(k) <= 3) {
      float w = uStarR * uStarR * uStarR / (d2 * sqrt(d2)) * 520.0;   // ∝ 1/d³, about 1 for the main image
      col += vec3(1.0, 0.82, 0.6) * w * (0.06 * pow(max(-b / sqrt(d2), 0.0), 900.0) + 0.12 * pow(max(-b / sqrt(d2), 0.0), 40.0));
    }
  }
  return col * (0.35 + 0.65 * uAtmos);
}

vec3 shadeTerrain(vec4 p, vec4 rd, float t, bool withShadow) {
  vec4 n = terrainNormal(p, t);
  vec4 up = normalize(p);
  float h = length(p) - uPR;
  float slope = dot(n, up);

  // detail at four scales (≈9 m, 2 m, 0.45 m, 0.14 m), each faded out before it would shimmer
  vec4 g1, g2, g3, g4;
  float d1 = detail(p, 0.11, g1);
  float d2 = detail(p, 0.55, g2);
  float f2 = 1.0 - smoothstep(30.0, 90.0, t), f3 = 1.0 - smoothstep(8.0, 26.0, t), f4 = 1.0 - smoothstep(2.5, 9.0, t);
  float d3 = f3 > 0.0 ? detail(p, 2.3, g3) : 0.0;
  float d4 = f4 > 0.0 ? detail(p, 7.1, g4) : 0.0;
  float f5 = 1.0 - smoothstep(1.0, 4.5, t);
  vec4 g5 = vec4(0.0);
  float d5 = f5 > 0.0 ? detail(p, 19.0, g5) : 0.0;
  if (f3 <= 0.0) g3 = vec4(0.0);
  if (f4 <= 0.0) g4 = vec4(0.0);
  float rocky = 1.0 - smoothstep(0.62, 0.82, slope + 0.08 * d1);
  float sandy = 1.0 - smoothstep(uSea + 0.4, uSea + 2.2 + 0.8 * d1, h);
  float snowy = smoothstep(26.0, 31.0, h + 8.0 * (slope - 0.85) + 4.0 * d1);
  float dirt = smoothstep(-0.42, -0.62, d1 + 0.35 * d2) * (1.0 - rocky) * (1.0 - sandy);

  vec4 bump = g1 * 0.9 + g2 * 0.25 * f2 + g3 * 0.06 * f3 + g4 * 0.03 * f4 + g5 * 0.012 * f5;
  bump *= mix(1.0, 2.4, rocky) * mix(1.0, 0.35, sandy + snowy * 0.6);
  vec4 nb = normalize(n - (bump - n * dot(bump, n)) * 0.6);

  // grass: broad lush/dry patches, clumps, then crisp tufts up close
  vec3 lush = vec3(0.11, 0.25, 0.06), dry = vec3(0.38, 0.40, 0.13), moss = vec3(0.17, 0.27, 0.08);
  vec3 grass = mix(lush, dry, smoothstep(-0.35, 0.45, d1 + 0.4 * d2));
  grass = mix(grass, moss, smoothstep(0.2, 0.7, -d2) * 0.5);
  grass *= 0.86 + 0.12 * d2 + 0.22 * d3 * f3 + 0.17 * d4 * f4 + 0.12 * d5 * f5;
  grass = mix(grass, vec3(0.30, 0.23, 0.14) * (0.85 + 0.25 * d3 * f3 + 0.2 * d4 * f4), dirt);
  // rock: strata bands, plus dark cracks up close
  float strata = smoothstep(0.3, 0.55, fract(h * 0.38 + 1.4 * d1 + 0.6 * d2));
  vec3 rock = mix(vec3(0.30, 0.28, 0.26), vec3(0.49, 0.45, 0.40), 0.5 + 0.5 * d2 + (strata - 0.5) * 0.35 * f2);
  rock *= 0.85 + 0.16 * d3 * f3 + 0.12 * d4 * f4 + 0.08 * d5 * f5;
  rock *= 1.0 - 0.3 * smoothstep(0.05, 0.0, abs(d3)) * f3 * rocky;
  // sand: fine grain and wind ripples
  vec3 sand = mix(vec3(0.58, 0.52, 0.38), vec3(0.70, 0.64, 0.50), 0.5 + 0.5 * d2);
  sand *= 0.92 + 0.1 * sin(dot(p, vec4(2.1, 1.3, -1.7, 0.9)) + 3.0 * d2) * f3 + 0.08 * d4 * f4;
  vec3 snow = vec3(0.92, 0.94, 0.98) * (0.95 + 0.05 * d3);
  vec3 alb = mix(grass, sand, sandy);
  alb = mix(alb, rock, rocky);
  alb = mix(alb, snow, snowy);

  float sunEl = dot(uSun, up);
  float dif = rowLight(p, nb, up);
  float sh = 1.0;
  if (withShadow && max(dot(n, uSun), 0.0) > 0.0 && uShadows > 0.5) {
    sh = softShadow(p + n * 0.08, uSun);
    if (sh > 0.02) sh = min(sh, boulderShadow(p + n * 0.08, uSun));
    if (sh > 0.02 && uON > 0) sh = min(sh, objectShadow(p + n * 0.08, uSun));
  }
  float ao = withShadow ? ambientOcclusion(p, n) : 1.0;
  float day = dayFactor(up);
  vec3 sunCol = mix(vec3(1.0, 0.52, 0.28), vec3(1.0, 0.94, 0.84), smoothstep(0.0, 0.35, sunEl));
  vec3 sky = mix(vec3(0.07, 0.085, 0.14), vec3(0.17, 0.25, 0.38), day);   // night: starlight fill
  vec3 bounce = alb * vec3(0.9, 0.8, 0.6) * 0.14 * day;
  float skyVis = 0.5 + 0.5 * dot(nb, up);
  return alb * (sunCol * dif * sh * 1.6 + (sky * skyVis + bounce) * ao * ao + lanternLight(p, nb));
}

vec3 shadeBoulder(vec4 p, vec4 n, float t) {
  vec4 up = normalize(p);
  vec4 g1, g2, g3;
  float d1 = detail(p, 0.7, g1), d2 = detail(p, 2.6, g2);
  float f3 = 1.0 - smoothstep(4.0, 16.0, t);
  float d3 = f3 > 0.0 ? detail(p, 9.0, g3) : 0.0;
  if (f3 <= 0.0) g3 = vec4(0.0);
  vec4 bump = g1 * 0.25 + g2 * 0.08 + g3 * 0.025 * f3;
  vec4 nb = normalize(n - (bump - n * dot(bump, n)) * 0.6);
  vec3 alb = mix(vec3(0.38, 0.36, 0.33), vec3(0.50, 0.47, 0.43), 0.5 + 0.3 * d1) * (0.88 + 0.12 * d2 + 0.12 * d3 * f3);
  alb *= 1.0 - 0.25 * smoothstep(0.06, 0.0, abs(d2)) * f3;                                        // fine cracks up close
  alb = mix(alb, vec3(0.22, 0.31, 0.12), smoothstep(0.6, 0.9, dot(n, up) + 0.2 * d2) * 0.5);   // moss on top
  float sunEl = dot(uSun, up);
  float dif = rowLight(p, nb, up);
  float sh = 1.0;
  if (dif > 0.0 && uShadows > 0.5) {
    sh = softShadow(p + n * 0.08, uSun);
    if (sh > 0.02) sh = min(sh, boulderShadow(p + n * 0.08, uSun));
    if (sh > 0.02 && uON > 0) sh = min(sh, objectShadow(p + n * 0.08, uSun));
  }
  float day = dayFactor(up);
  vec3 sunCol = mix(vec3(1.0, 0.52, 0.28), vec3(1.0, 0.94, 0.84), smoothstep(0.0, 0.35, sunEl));
  vec3 sky = mix(vec3(0.07, 0.085, 0.14), vec3(0.17, 0.25, 0.38), day);
  float skyVis = 0.5 + 0.5 * dot(nb, up);
  return alb * (sunCol * dif * sh * 1.6 + sky * skyVis * (0.6 + 0.4 * skyVis) + lanternLight(p, nb));
}

// Objects are matte stone or brushed metal; things that respond carry the one accent colour. The surface pattern
// lives in the object's own frame, so a tumbling object visibly turns.
const vec3 ACCENT = vec3(0.32, 0.86, 0.78);
vec3 shadeObject(vec4 p, vec4 n, int i, vec4 rd, float t) {
  vec4 up = normalize(p);
  float h = uOP[i].y, mat = uOP[i].z, glow = uOP[i].w;
  vec4 q = (p - uOC[i]) * uOM[i];                          // body coordinates
  vec4 g1, g2;
  float d1 = detail(q * (1.0 / h) * 1.7 + float(i) * 5.31, 1.0, g1), d2 = detail(q * (1.0 / h) * 5.3 + 2.7, 1.0, g2);
  vec4 nb = n;
  vec3 alb;
  float spec = 0.0;
  if (mat < 0.5) { alb = vec3(0.56, 0.54, 0.50) * (0.9 + 0.08 * d1 + 0.05 * d2); nb = normalize(n - 0.04 * (g1 - n * dot(g1, n))); }
  else if (mat < 1.5) { alb = vec3(0.50, 0.52, 0.56) * (0.94 + 0.04 * d2); spec = 0.6; }
  else { alb = mix(vec3(0.30, 0.31, 0.33), ACCENT, 0.55) * (0.95 + 0.05 * d2); spec = 0.35; }
  if (uOP[i].x > 0.5) {                                    // tesseract: darken the edges of the slice's polyhedron
    vec4 a = step(vec4(h * 0.93), abs(q));
    float ed = a.x + a.y + a.z + a.w;
    alb *= ed >= 2.0 ? 0.62 : 1.0;
  }
  float sunEl = dot(uSun, up);
  float dif = rowLight(p, nb, up);
  float sh = 1.0;
  if (dif > 0.0 && uShadows > 0.5) {
    sh = softShadow(p + n * 0.05, uSun);
    if (sh > 0.02) sh = min(sh, boulderShadow(p + n * 0.05, uSun));
    if (sh > 0.02) sh = min(sh, objectShadow(p + n * 0.05, uSun));
  }
  float day = dayFactor(up);
  vec3 sunCol = mix(vec3(1.0, 0.52, 0.28), vec3(1.0, 0.94, 0.84), smoothstep(0.0, 0.35, sunEl));
  vec3 sky = mix(vec3(0.07, 0.085, 0.14), vec3(0.17, 0.25, 0.38), day);
  float skyVis = 0.5 + 0.5 * dot(nb, up);
  vec3 col = alb * (sunCol * dif * sh * 1.6 + sky * skyVis * (0.65 + 0.35 * skyVis) + lanternLight(p, nb));
  col += sunCol * spec * pow(max(dot(reflect(uSun, nb), rd), 0.0), 36.0) * sh * smoothstep(-0.04, 0.06, sunEl);
  col += ACCENT * glow * (0.6 + 0.4 * (0.5 + 0.5 * d2));
  return col;
}

vec3 applyFog(vec3 col, vec4 upEye, float t) {
  return mix(col, horizonColor(upEye, uDayE) * 0.92, (1.0 - exp(-t * 0.0019)) * uAtmos);
}

vec3 shadeWater(vec4 p, vec4 rd, float tw, float tBottom, vec4 ro) {
  vec4 up = normalize(p);
  vec4 tng = vec4(sin(p.x * 0.71 + uTime * 1.3), sin(p.y * 0.93 - uTime * 1.1),
                  sin(p.z * 0.82 + uTime * 0.9), sin(p.w * 0.64 - uTime * 1.2));
  tng += 0.5 * vec4(sin(p.y * 1.9 + uTime * 2.1), sin(p.w * 2.3 + uTime * 1.7),
                    sin(p.x * 2.1 - uTime * 1.9), sin(p.z * 1.7 + uTime * 2.3));
  vec4 gw1, gw2;
  detail(p + vec4(uTime * 0.31, -uTime * 0.23, uTime * 0.17, uTime * 0.27), 0.45, gw1);
  detail(p - vec4(uTime * 0.52, uTime * 0.41, -uTime * 0.36, uTime * 0.29), 1.4, gw2);
  tng = tng * 0.012 + gw1 * 0.05 + gw2 * 0.018 * (1.0 - smoothstep(10.0, 40.0, tw));
  tng -= up * dot(tng, up);
  vec4 wn = normalize(up + tng);
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(-rd, wn), 0.0), 5.0);
  vec4 rr = reflect(rd, wn);
  float day = dayFactor(up);
  vec3 refl = skyColor(rr, up, day);
  vec3 deep = vec3(0.012, 0.075, 0.11) * (0.4 + 0.6 * day);
  vec3 under = deep;
  if (tBottom > 0.0) {
    vec3 bottom = shadeTerrain(ro + rd * tBottom, rd, tBottom, false) * vec3(0.55, 0.82, 0.86);
    under = mix(bottom, deep, 1.0 - exp(-(tBottom - tw) * 0.13));
  }
  vec3 col = mix(under, refl, fres);
  col += vec3(1.0, 0.9, 0.75) * pow(max(dot(rr, uSun), 0.0), 220.0) * 2.5 * smoothstep(-0.02, 0.05, dot(uSun, up));
  return col;
}

// The planet's own copies round the hoop, k·L along the hoop axis: the same ground under the same suns (the row
// of images is periodic too), so a copy is shaded exactly like the planet itself.
bool hitCopies(vec4 ro, vec4 rd, out float tc, out vec3 col) {
  tc = 1e9;
  float Rw = uPR + uSea;
  for (int k = -2; k <= 2; k++) {
    if (k == 0 || k < uCopyK.x || k > uCopyK.y) continue;    // only copies your slice cuts
    vec4 o = ro - float(k) * uL * uHoop;
    float b = dot(o, rd), c = dot(o, o) - (uPR + SHELL) * (uPR + SHELL);
    if (b > 0.0 || b * b < c) continue;                      // misses the copy's terrain shell
    float t = marchTerrainFar(o, rd);
    float cw = dot(o, o) - Rw * Rw, dw = b * b - cw, tw = dw > 0.0 ? -b - sqrt(dw) : -1.0;
    if (tw > 0.0 && (t < 0.0 || tw < t)) {                   // the copy's sea
      if (tw < tc) {
        tc = tw;
        vec4 p = o + rd * tw, up = normalize(p);
        vec3 sea = vec3(0.03, 0.12, 0.2) * (0.3 + 0.7 * dayFactor(up)) + vec3(0.9, 0.85, 0.7) * pow(max(dot(reflect(rd, up), uSun), 0.0), 60.0) * 0.6;
        col = sea;
      }
    } else if (t > 0.0 && t < tc) {
      tc = t;
      col = shadeTerrain(o + rd * t, rd, t, false);
    }
  }
  if (tc > 1e8) return false;
  col = mix(col, skyColor(rd, normalize(ro), uDayE), (1.0 - exp(-tc * 0.0007)) * uAtmos);   // a little haze
  return true;
}

// Trace one 4D ray. Returns colour; tOut = hit distance or -1 for sky.
vec3 render(vec4 ro, vec4 rd, out float tOut) {
  vec4 upE = normalize(ro);
  float Rw = uPR + uSea;
  float b = dot(ro, rd), c = dot(ro, ro) - Rw * Rw, disc = b * b - c;
  bool under = c < 0.0;
  float tW = -1.0;
  if (disc > 0.0) {
    float s = sqrt(disc);
    if (!under) { if (-b - s > 0.0) tW = -b - s; }
    else tW = -b + s;
  }
  float tT = marchTerrain(ro, rd);
  int bi;
  float tB = hitBoulder(ro, rd, tT > 0.0 ? tT : MAXT, bi);
  int oi; vec4 on;
  float tO = hitObject(ro, rd, bi >= 0 ? tB : tT > 0.0 ? tT : MAXT, uOCut, oi, on);
  if (oi >= 0 && (under || tW < 0.0 || tO < tW)) {             // an object in front of everything else
    tOut = tO;
    vec3 col = shadeObject(ro + rd * tO, on, oi, rd, tO);
    return under ? mix(col, vec3(0.015, 0.10, 0.13), 1.0 - exp(-tO * 0.09)) : applyFog(col, upE, tO);
  }
  if (bi >= 0 && (under || tW < 0.0 || tB < tW)) {             // a boulder in front of everything else
    tOut = tB;
    vec4 p = ro + rd * tB;
    vec3 col = shadeBoulder(p, (p - uBC[bi]) / bR(bi), tB);
    return under ? mix(col, vec3(0.015, 0.10, 0.13), 1.0 - exp(-tB * 0.09)) : applyFog(col, upE, tB);
  }
  vec3 col;
  if (!under && tW > 0.0 && (tT < 0.0 || tW < tT)) {
    tOut = tW;
    col = applyFog(shadeWater(ro + rd * tW, rd, tW, tT, ro), upE, tW);
  } else if (tT > 0.0 && !(under && tW > 0.0 && tW < tT)) {
    tOut = tT;
    vec4 pT = ro + rd * tT, nT = normalize(pT);
    float hT = length(pT) - uPR, wl = waterAt(nT);
    if (wl > uSea + 0.05 && wl > hT + 0.03) {                // a river: shallow water over its bed
      float down = -dot(rd, nT), tw = max(0.02, tT - (wl - hT) / max(down, 0.08));
      col = shadeWater(ro + rd * tw, rd, tw, tT, ro);
    } else
    col = shadeTerrain(ro + rd * tT, rd, tT, true);
    col = under ? mix(col, vec3(0.015, 0.10, 0.13), 1.0 - exp(-tT * 0.09)) : applyFog(col, upE, tT);
  } else if (under) {
    tOut = tW;
    col = mix(vec3(0.12, 0.32, 0.34) * (0.25 + 0.75 * uDayE), vec3(0.015, 0.10, 0.13), 1.0 - exp(-tW * 0.09));
  } else {
    tOut = -1.0;
    float tc, ts;
    vec3 cc;
    if (hitCopies(ro, rd, tc, cc)) { col = cc; tOut = tc; }
    else col = skyColor(rd, upE, uDayE) + starRow(ro, rd, ts);
  }
  return col;
}

vec3 post(vec3 c) {
  c *= 0.92;
  c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);   // ACES fit
  return pow(c, vec3(1.0 / 2.2));
}
`;

// Slice view: rays confined to the 3D hyperplane spanned by forward, right and up.
export const SLICE_FRAG = COMMON + `
uniform vec2 uRes;
uniform float uFov;
in vec2 vUV;
out vec4 outColor;
void main() {
  vec2 q = vUV * vec2(uRes.x / uRes.y, 1.0) * uFov;
  vec4 rd = normalize(uF + q.x * uR + q.y * uU);
  float t;
  vec3 col = post(render(uEye, rd, t) * mix(2.2, 1.0, uDayE));
  float vig = 1.0 - 0.25 * dot(vUV * 0.7, vUV * 0.7);
  col *= vig;
  outColor = vec4(col, 1.0);
}`;

// Upscale the internal render to the screen with contrast-adaptive sharpening (after AMD's CAS).
export const UPSCALE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uSrc;          // internal render size
uniform float uSharp;       // 0..1
in vec2 vUV;
out vec4 outColor;
void main() {
  vec2 uv = vUV * 0.5 + 0.5, px = 1.0 / uSrc;
  vec3 c = texture(uScene, uv).rgb;
  vec3 n = texture(uScene, uv + vec2(0.0, px.y)).rgb, s = texture(uScene, uv - vec2(0.0, px.y)).rgb;
  vec3 e = texture(uScene, uv + vec2(px.x, 0.0)).rgb, w = texture(uScene, uv - vec2(px.x, 0.0)).rgb;
  vec3 mn = min(c, min(min(n, s), min(e, w))), mx = max(c, max(max(n, s), max(e, w)));
  vec3 amp = sqrt(clamp(min(mn, 2.0 - mx) / max(mx, 1e-4), 0.0, 1.0));
  vec3 wt = -amp / mix(8.0, 4.6, uSharp);
  vec3 col = (c + (n + s + e + w) * wt) / (1.0 + 4.0 * wt);
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// RADAR: a glass ball holding the ground around you. The ground of a 4D world is three-dimensional, so its
// minimap is a 3D object. Ball coordinates are geodesic normal coordinates (the exponential map) along three
// horizontal axes, so a straight line from the centre is a straight walk on the planet. Height, the one
// direction the ball cannot show, is drawn as nested contour shells, water as blue haze. The disc through the
// centre is the ground your slice view shows.
// The heights inside the ball are baked into a volume (RADAR_BAKE_FRAG), so marching the ball costs a texture
// lookup per step instead of a full height lookup on the 3-sphere. The volume's layers are tiles of one 2D atlas,
// so the whole bake is a single draw (one draw per layer of a 3D texture costs more than the work itself).
const RADAR_COMMON = `
uniform vec4 uU0;              // up at the player
uniform vec4 uB1, uB2, uB3;    // the ball's axes as 4D directions along the ground
uniform float uRB;             // ball radius (m)
uniform float uVN, uEnc;       // baked volume resolution · heights stored as 8-bit (1) or half floats (0)
uniform float uTX;             // atlas: layers per row
const float VOL_PAD = 1.04;    // the volume covers a cube slightly larger than the ball
vec4 planetPoint(vec3 m) {     // ball coordinates -> point on the unit 3-sphere
  float r = length(m);
  if (r < 1e-4) return uU0;
  vec4 D = (m.x * uB1 + m.y * uB2 + m.z * uB3) / r;
  float a = r / uPR;
  return cos(a) * uU0 + sin(a) * D;
}
`;

export const RADAR_BAKE_FRAG = COMMON + RADAR_COMMON + `
out vec4 outColor;
void main() {
  vec2 tile = floor(gl_FragCoord.xy / uVN), xy = gl_FragCoord.xy - tile * uVN;   // texel centre within its layer
  float layer = tile.x + tile.y * uTX;
  vec3 m = (vec3(xy, layer + 0.5) / uVN * 2.0 - 1.0) * uRB * VOL_PAD;
  float h = heightAt(planetPoint(m));
  outColor = uEnc > 0.5 ? vec4(clamp((h + 40.0) / 100.0, 0.0, 1.0), 0.0, 0.0, 1.0) : vec4(h, 0.0, 0.0, 1.0);
}`;

export const RADAR_FRAG = COMMON + RADAR_COMMON + `
uniform vec2 uRes;
uniform float uFov;
uniform vec3 uCam, uCamF, uCamR, uCamU, uLight;
uniform vec3 uDiscN, uFwd, uRight;   // your slice's ground, forward and right, in ball coordinates
uniform float uFovX;           // half-width (tan) of the slice view, for the view wedge
uniform sampler2D uVol;
uniform vec2 uVolSize;         // atlas size in texels
uniform vec3 uShellA;          // opacity of the coast, hill and mountain shells (layers can be switched off)
uniform float uWater;
uniform float uPinned;         // 1: the ball is fixed to a pin, not to you; your slice is then a curved sheet
uniform vec4 uSliceA;          // your ana direction in 4D: your slice is the set of points with dot(x, uSliceA) = 0
in vec2 vUV;
out vec4 outColor;

vec3 hyps(float h) {           // hypsometric tint: shore, lowland, upland, rock, snow
  vec3 c = mix(vec3(0.86, 0.80, 0.58), vec3(0.30, 0.62, 0.30), smoothstep(0.5, 4.0, h));
  c = mix(c, vec3(0.62, 0.66, 0.30), smoothstep(8.0, 16.0, h));
  c = mix(c, vec3(0.62, 0.45, 0.30), smoothstep(16.0, 24.0, h));
  c = mix(c, vec3(0.96, 0.96, 1.0), smoothstep(26.0, 32.0, h));
  return c;
}
float hVol(vec3 m) {               // trilinear: bilinear in two neighbouring layers, then a lerp
  vec3 c = clamp((m / (2.0 * uRB * VOL_PAD) + 0.5) * uVN, 0.5, uVN - 0.5);
  float z = c.z - 0.5, z0 = floor(z), z1 = min(z0 + 1.0, uVN - 1.0);
  vec2 o0 = vec2(mod(z0, uTX), floor(z0 / uTX)) * uVN, o1 = vec2(mod(z1, uTX), floor(z1 / uTX)) * uVN;
  float v = mix(texture(uVol, (o0 + c.xy) / uVolSize).r, texture(uVol, (o1 + c.xy) / uVolSize).r, z - z0);
  return uEnc > 0.5 ? v * 100.0 - 40.0 : v;
}
vec3 gradVol(vec3 m) {
  float e = 2.0 * uRB * VOL_PAD / uVN;
  return vec3(hVol(m + vec3(e, 0, 0)) - hVol(m - vec3(e, 0, 0)),
              hVol(m + vec3(0, e, 0)) - hVol(m - vec3(0, e, 0)),
              hVol(m + vec3(0, 0, e)) - hVol(m - vec3(0, 0, e))) / (2.0 * e);
}
// Mountains off to either side of your slice, projected onto the disc: orange where one lies toward ana,
// blue toward kata. The disc then shows everything that a turn or a step through ana would bring into view.
vec2 footprint(vec3 sp) {
  float reach = sqrt(max(uRB * uRB - dot(sp, sp), 0.0));
  float up = 0.0, dn = 0.0;
  for (int i = 1; i <= 10; i++) {
    float o = reach * float(i) / 10.0;
    up = max(up, smoothstep(21.0, 25.0, hVol(sp + uDiscN * o)));
    dn = max(dn, smoothstep(21.0, 25.0, hVol(sp - uDiscN * o)));
  }
  return vec2(up, dn);
}
vec3 topo(vec3 sp) {           // the disc: a topographic map of exactly the ground in your slice (exact heights)
  float hs = heightAt(planetPoint(sp));
  float minor = 1.0 - smoothstep(0.0, 0.10, abs(fract(hs / 4.0 + 0.5) - 0.5) * 4.0);
  float major = 1.0 - smoothstep(0.0, 0.18, abs(fract(hs / 12.0 + 0.5) - 0.5) * 12.0);
  vec3 base = hs < uSea ? mix(vec3(0.22, 0.48, 0.72), vec3(0.08, 0.20, 0.42), smoothstep(0.0, 14.0, uSea - hs)) : hyps(hs);
  return mix(base, base * 0.4, max(minor * 0.5, major * 0.9));
}

const vec3 SHELL_L = vec3(0.5, 12.0, 24.0);     // coast, hills, mountains
vec3 shellCol(int k) { return k == 0 ? vec3(0.62, 0.82, 0.98) : k == 1 ? vec3(0.42, 0.80, 0.40) : vec3(0.92, 0.72, 0.52); }

void main() {
  vec2 q = vUV * vec2(uRes.x / uRes.y, 1.0) * uFov;
  vec3 rd = normalize(uCamF + q.x * uCamR + q.y * uCamU);
  vec3 ro = uCam;
  float b = dot(ro, rd), c = dot(ro, ro) - uRB * uRB, disc = b * b - c;
  float perp = sqrt(max(dot(ro, ro) - b * b, 0.0)) / uRB;
  if (disc <= 0.0) {                                         // outside the ball: a soft shadow so it reads on any sky
    outColor = vec4(0.0, 0.0, 0.0, 0.5 * (1.0 - smoothstep(1.0, 1.1, perp)));
    return;
  }
  float t0 = -b - sqrt(disc), t1 = -b + sqrt(disc);
  vec3 col = vec3(0.0);
  float T = 1.0;

  // glass: a bright rim where the ray grazes the ball
  vec3 nS = normalize(ro + rd * t0);
  float rim = pow(1.0 - abs(dot(nS, rd)), 4.0);
  col += vec3(0.55, 0.70, 0.95) * rim * 0.55; T *= 1.0 - rim * 0.45;

  // you: a small cyan body with a nose along your forward direction
  float tHit = 1e9;
  if (uPinned < 0.5) {
    float r0 = 0.024 * uRB, r1 = 0.014 * uRB;
    float bb = dot(ro, rd), cc = dot(ro, ro) - r0 * r0, dd = bb * bb - cc;
    if (dd > 0.0) tHit = -bb - sqrt(dd);
    vec3 o2 = ro - uFwd * 0.05 * uRB; bb = dot(o2, rd); cc = dot(o2, o2) - r1 * r1; dd = bb * bb - cc;
    if (dd > 0.0) tHit = min(tHit, -bb - sqrt(dd));
  }

  float dn = dot(rd, uDiscN);
  float tD = uPinned < 0.5 && abs(dn) > 1e-5 ? -dot(ro, uDiscN) / dn : -1.0;
  float sPrev = uPinned > 0.5 ? dot(planetPoint(ro + rd * t0), uSliceA) : 0.0;
  float span = t1 - t0;
  int steps = int(clamp(1.05 * uVN * span / (2.0 * uRB), 8.0, 200.0));
  float ds = span / float(steps);
  float t = t0, hPrev = hVol(ro + rd * t0);
  for (int i = 0; i < 200; i++) {
    if (i >= steps || T < 0.02) break;
    if (tD > t && tD <= t + ds && tD < tHit) {               // the disc
      vec3 sp = ro + rd * tD;
      float r = length(sp) / uRB;
      float fx = dot(sp, uFwd), fy = dot(sp, uRight);
      float inView = fx > 0.0 && abs(fy) < uFovX * fx ? 1.0 : 0.0;
      float edge = fx > 0.0 ? 1.0 - smoothstep(0.0, 0.006 * uRB, abs(abs(fy) - uFovX * fx) / sqrt(1.0 + uFovX * uFovX)) : 0.0;
      vec3 dc = topo(sp) * mix(0.62, 1.05, inView);
      if (uShellA.z > 0.0) {
        vec2 fp = footprint(sp);
        dc = mix(dc, vec3(1.0, 0.62, 0.28), fp.x * 0.38);
        dc = mix(dc, vec3(0.35, 0.62, 1.0), fp.y * 0.38);
      }
      float ring = max(1.0 - smoothstep(0.0, 0.006, abs(r - 1.0 / 3.0)), 1.0 - smoothstep(0.0, 0.006, abs(r - 2.0 / 3.0)));
      dc = mix(dc, vec3(0.85, 0.92, 1.0), ring * 0.35 + edge * 0.7);
      dc = mix(dc, vec3(0.85, 0.92, 1.0), 1.0 - smoothstep(0.0, 0.012, 0.99 - r));   // disc rim
      float a = mix(0.55, 0.72, inView) * (0.55 + 0.45 * smoothstep(0.0, 0.25, abs(dn)));
      col += T * a * dc; T *= 1.0 - a;
    }
    t += ds;
    if (t > tHit) break;
    vec3 m = ro + rd * t;
    float h = hVol(m);
    float fade = 1.0 - 0.45 * (t - t0) / (2.0 * uRB);        // a touch of depth haze inside the ball
    if (uPinned > 0.5) {                                     // your slice, seen from a pin: a curved sheet (a great 2-sphere)
      float sNow = dot(planetPoint(m), uSliceA);
      if (sNow * sPrev < 0.0) {
        vec3 mc = m - rd * ds * sNow / (sNow - sPrev);
        float a = 0.42;
        col += T * a * topo(mc) * fade; T *= 1.0 - a;
      }
      sPrev = sNow;
    }
    if (h < uSea) {                                          // water: blue haze, thicker where deeper
      float k = (0.0035 + 0.0006 * (uSea - h)) * ds * (90.0 / uRB) * uWater;
      col += T * (1.0 - exp(-k)) * vec3(0.16, 0.42, 0.78) * fade;
      T *= exp(-k);
    }
    for (int s = 0; s < 3; s++) {
      float L = SHELL_L[s];
      if (uShellA[s] > 0.0 && (hPrev - L) * (h - L) < 0.0) {                     // a contour shell: lit, brighter where seen edge-on
        vec3 mc = m - rd * ds * (h - L) / (h - hPrev);
        vec3 n = normalize(gradVol(mc) + 1e-6);
        if (dot(n, rd) > 0.0) n = -n;
        float edgeOn = 1.0 - abs(dot(n, rd));
        float shade = 0.36 + 0.64 * max(dot(n, uLight), 0.0) + 0.3 * pow(edgeOn, 3.0);
        shade += s == 2 ? 0.25 * pow(max(dot(reflect(-uLight, n), -rd), 0.0), 12.0) : 0.0;
        float a = clamp(uShellA[s] * (0.55 + 0.9 * edgeOn * edgeOn), 0.0, 0.92);
        col += T * a * shellCol(s) * shade * fade; T *= 1.0 - a;
      }
    }
    hPrev = h;
  }
  if (tHit < 1e8 && T > 0.0) {                               // your marker
    vec3 p = ro + rd * tHit;
    vec3 n = normalize(p - (length(p) < 0.03 * uRB ? vec3(0) : uFwd * 0.05 * uRB));
    col += T * vec3(0.35, 0.95, 1.0) * (0.5 + 0.5 * max(dot(n, -rd), 0.0));
    T = 0.0;
  }
  col += T * vec3(0.045, 0.055, 0.08);
  outColor = vec4(col * 0.94, 0.94);                         // premultiplied
}`;

// Copies the radar (premultiplied alpha) onto the screen.
export const BLIT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
in vec2 vUV;
out vec4 outColor;
void main() { outColor = texture(uTex, vUV * 0.5 + 0.5); }`;
