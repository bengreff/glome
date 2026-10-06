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
uniform float uAnaTint;    // optional cue: tint slopes that climb toward ana (warm) or kata (cool)

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
  for (int i = 0; i < 260; i++) {
    vec4 p = ro + rd * t;
    float d = sdTerrain(p);
    if (d < 0.0012 * t + 0.002) return t;
    t += max(d, 0.0008 * t);
    if (t > MAXT) break;
    if (dot(p, p) > rOut * rOut && dot(p, rd) > 0.0) break;
  }
  return -1.0;
}

float softShadow(vec4 ro, vec4 rd) {
  float res = 1.0, t = 0.25, rOut = uPR + SHELL;
  for (int i = 0; i < 40; i++) {
    vec4 p = ro + rd * t;
    float d = sdTerrain(p);
    res = min(res, 8.0 * d / t);
    if (res < 0.02) break;
    t += clamp(d, 0.3, 12.0);
    if (t > 260.0 || (dot(p, p) > rOut * rOut && dot(p, rd) > 0.0)) break;
  }
  return clamp(res, 0.0, 1.0);
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

float dayFactor(vec4 up) { return smoothstep(-0.14, 0.18, dot(uSun, up)); }

vec3 horizonColor(vec4 up) {
  float sunEl = dot(uSun, up);
  float day = dayFactor(up);
  vec3 hz = mix(vec3(0.06, 0.075, 0.13), vec3(0.66, 0.77, 0.90), day);
  float dusk = exp(-pow((sunEl + 0.02) * 5.5, 2.0));
  return mix(hz, vec3(0.95, 0.52, 0.30), dusk * 0.6);
}

vec3 skyColor(vec4 rd, vec4 up) {
  float el = dot(rd, up);
  float day = dayFactor(up);
  vec3 zen = mix(vec3(0.02, 0.03, 0.075), vec3(0.16, 0.36, 0.75), day);
  vec3 col = mix(horizonColor(up), zen, pow(clamp(el, 0.0, 1.0), 0.45));
  float sd = max(dot(rd, uSun), 0.0);
  col += vec3(1.0, 0.82, 0.6) * pow(sd, 7.0) * 0.32 * (0.3 + 0.7 * day);
  col += vec3(1.0, 0.92, 0.8) * smoothstep(0.99955, 0.99975, sd) * 8.0;   // the sun's disc
  if (day < 0.95) {
    // Stars are points scattered over the 3-sphere of directions. A slice only shows directions inside
    // your 3D slice, so a star appears only while its direction is close to it, and fades as you turn through ana.
    vec4 cell = floor(rd * 110.0);
    if (h41(cell + 0.37) > 0.978) {
      vec4 jit = vec4(h41(cell + 1.1), h41(cell + 2.3), h41(cell + 3.7), h41(cell + 4.9)) * 0.6 + 0.2;
      vec4 sdir = normalize(cell + jit);
      float rad = 0.0026 * (0.6 + 0.9 * h41(cell + 5.5));
      col += vec3(0.82, 0.88, 1.0) * smoothstep(rad, rad * 0.25, length(rd - sdir)) * (1.0 - day) * 1.8;
    }
  }
  return col;
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
  if (uAnaTint > 0.5) { float an = dot(n, uA); alb = mix(alb, an > 0.0 ? vec3(0.95, 0.62, 0.30) : vec3(0.32, 0.70, 0.95), min(1.0, abs(an) * 2.2) * 0.75); }

  float sunEl = dot(uSun, up);
  float dif = max(dot(nb, uSun), 0.0) * smoothstep(-0.04, 0.06, sunEl);
  float sh = 1.0;
  if (withShadow && max(dot(n, uSun), 0.0) > 0.0 && uShadows > 0.5) sh = softShadow(p + n * 0.08, uSun);
  float ao = withShadow ? ambientOcclusion(p, n) : 1.0;
  float day = dayFactor(up);
  vec3 sunCol = mix(vec3(1.0, 0.52, 0.28), vec3(1.0, 0.94, 0.84), smoothstep(0.0, 0.35, sunEl));
  vec3 sky = mix(vec3(0.07, 0.085, 0.14), vec3(0.17, 0.25, 0.38), day);   // night: starlight fill
  vec3 bounce = alb * vec3(0.9, 0.8, 0.6) * 0.14 * day;
  float skyVis = 0.5 + 0.5 * dot(nb, up);
  return alb * (sunCol * dif * sh * 1.6 + (sky * skyVis + bounce) * ao * ao);
}

vec3 applyFog(vec3 col, vec4 upEye, float t) {
  return mix(col, horizonColor(upEye) * 0.92, 1.0 - exp(-t * 0.0019));
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
  vec3 refl = skyColor(rr, up);
  float day = dayFactor(up);
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
  vec3 col;
  if (!under && tW > 0.0 && (tT < 0.0 || tW < tT)) {
    tOut = tW;
    col = applyFog(shadeWater(ro + rd * tW, rd, tW, tT, ro), upE, tW);
  } else if (tT > 0.0 && !(under && tW > 0.0 && tW < tT)) {
    tOut = tT;
    col = shadeTerrain(ro + rd * tT, rd, tT, true);
    col = under ? mix(col, vec3(0.015, 0.10, 0.13), 1.0 - exp(-tT * 0.09)) : applyFog(col, upE, tT);
  } else if (under) {
    tOut = tW;
    col = mix(vec3(0.12, 0.32, 0.34) * (0.25 + 0.75 * dayFactor(upE)), vec3(0.015, 0.10, 0.13), 1.0 - exp(-tW * 0.09));
  } else {
    tOut = -1.0;
    col = skyColor(rd, upE);
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
  vec3 col = post(render(uEye, rd, t) * mix(2.2, 1.0, dayFactor(normalize(uEye))));
  float vig = 1.0 - 0.25 * dot(vUV * 0.7, vUV * 0.7);
  outColor = vec4(col * vig, 1.0);
}`;

// 4D eye: one layer of the creature's 3D retina. Layers step through the ana direction.
export const RETINA_FRAG = COMMON + `
uniform float uLayer, uM, uFov;
in vec2 vUV;
out vec4 outColor;
void main() {
  float z = ((uLayer + 0.5) / uM * 2.0 - 1.0) * uFov;
  vec4 rd = normalize(uF + vUV.x * uFov * uR + vUV.y * uFov * uU + z * uA);
  float t;
  vec3 col = post(render(uEye, rd, t) * mix(2.2, 1.0, dayFactor(normalize(uEye))));
  float depth = t < 0.0 ? 1.0 : min(log(1.0 + t) / log(1.0 + MAXT), 0.995);
  outColor = vec4(col, depth);
}`;

// Opacity for the retina volume: show where depth jumps (silhouettes, ridges, the horizon).
export const EDGE_FRAG = COMMON + `
uniform highp sampler3D uRetina;
uniform float uLayer, uM, uFov;
out vec4 outColor;
void main() {
  int M = int(uM);
  ivec3 c = ivec3(int(gl_FragCoord.x), int(gl_FragCoord.y), int(uLayer));
  vec4 s0 = texelFetch(uRetina, c, 0);
  float e = 0.0, ec = 0.0;
  ivec3 offs[6] = ivec3[6](ivec3(1,0,0), ivec3(-1,0,0), ivec3(0,1,0), ivec3(0,-1,0), ivec3(0,0,1), ivec3(0,0,-1));
  for (int k = 0; k < 6; k++) {
    vec4 sn = texelFetch(uRetina, clamp(c + offs[k], ivec3(0), ivec3(M - 1)), 0);
    e = max(e, abs(sn.a - s0.a));
    ec = max(ec, length(sn.rgb - s0.rgb));
  }
  // depth is stored in 8 bits, so ignore one-step jumps; real silhouettes jump much further
  float edge = smoothstep(0.012, 0.06, e);
  float tone = smoothstep(0.2, 0.45, ec) * 0.25;
  float op;
  if (s0.a > 0.999) {
    vec3 g = (vec3(c) + 0.5) / uM * 2.0 - 1.0;
    vec4 rd = normalize(uF + g.x * uFov * uR + g.y * uFov * uU + g.z * uFov * uA);
    op = max(smoothstep(0.9993, 0.9998, dot(rd, uSun)), edge * 0.25);
  } else {
    op = max(max(edge, tone), 0.006);
  }
  outColor = vec4(s0.rgb, op);
}`;

// Render the retina volume as a translucent cube seen from outside.
export const VOLUME_FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler3D uVol;
uniform vec2 uRes;
uniform vec3 uCamPos, uCamR, uCamU, uCamF;
uniform float uM;
in vec2 vUV;
out vec4 outColor;
void main() {
  vec2 q = vUV * vec2(uRes.x / uRes.y, 1.0) * 0.52;
  vec3 ro = uCamPos, rd = normalize(uCamF + q.x * uCamR + q.y * uCamU);
  vec3 inv = 1.0 / rd, t0 = (-1.0 - ro) * inv, t1 = (1.0 - ro) * inv;
  vec3 tn = min(t0, t1), tf = max(t0, t1);
  float a = max(max(tn.x, tn.y), tn.z), b = min(min(tf.x, tf.y), tf.z);
  vec3 bg = vec3(0.035, 0.04, 0.055) * (1.0 - 0.3 * dot(vUV, vUV));
  vec3 col = bg;
  if (b > max(a, 0.0)) {
    float t = max(a, 0.0);
    const int STEPS = 128;
    float dt = (b - t) / float(STEPS);
    float k = dt * uM * 0.5;
    vec4 acc = vec4(0.0);
    for (int i = 0; i < STEPS; i++) {
      vec3 p = ro + rd * (t + (float(i) + 0.5) * dt);
      vec4 s = texture(uVol, p * 0.5 + 0.5);
      float al = 1.0 - pow(1.0 - clamp(s.a, 0.0, 0.999), k);
      acc.rgb += (1.0 - acc.a) * al * s.rgb;
      acc.a += (1.0 - acc.a) * al;
      if (acc.a > 0.985) break;
    }
    col = acc.rgb + (1.0 - acc.a) * bg;
  }
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

// MAP VIEW: a 3D map of the ground you can stand inside. Its three axes are your three walking directions
// (forward, right, ana). Map points are geodesic normal coordinates around you (the exponential map), so
// straight lines from you are straight walks on the planet. Height, the one direction not shown, is encoded
// by nested contour shells and colour.
export const MAP_FRAG = COMMON + `
uniform vec2 uRes;
uniform float uFov;
uniform vec4 uU0;              // up at the player
uniform vec4 uMF, uMR, uMA;    // map axes at the player: forward, right, ana
uniform float uPH;             // ground height under the player (m above sea)
uniform int uStyle;            // 0 floor + contour shells, 1 stacked floors
uniform vec3 uCam;             // camera position in map coordinates (metres)
uniform vec3 uCamF, uCamR, uCamU;
uniform vec4 uMark[6];         // landmark map coords (m) and radius
uniform vec3 uMarkCol[6];
uniform int uMarkN, uTarget;
in vec2 vUV;
out vec4 outColor;

vec3 hyps(float h) {           // hypsometric tint: shore, lowland, upland, rock, snow
  vec3 c = mix(vec3(0.86, 0.80, 0.58), vec3(0.30, 0.62, 0.30), smoothstep(0.5, 4.0, h));
  c = mix(c, vec3(0.62, 0.66, 0.30), smoothstep(8.0, 16.0, h));
  c = mix(c, vec3(0.62, 0.45, 0.30), smoothstep(16.0, 24.0, h));
  c = mix(c, vec3(0.96, 0.96, 1.0), smoothstep(26.0, 32.0, h));
  return c;
}
vec4 planetPoint(vec3 m) {     // map coordinates -> point on the unit 3-sphere
  float r = length(m);
  if (r < 1e-4) return uU0;
  vec4 D = (m.x * uMF + m.y * uMR + m.z * uMA) / r;
  float a = r / uPR;
  return cos(a) * uU0 + sin(a) * D;
}
float hMap(vec3 m) { return heightAt(planetPoint(m)); }
vec3 gradMap(vec3 m) {
  const float e = 1.2;
  return vec3(hMap(m + vec3(e, 0, 0)) - hMap(m - vec3(e, 0, 0)),
              hMap(m + vec3(0, e, 0)) - hMap(m - vec3(0, e, 0)),
              hMap(m + vec3(0, 0, e)) - hMap(m - vec3(0, 0, e))) / (2.0 * e);
}

// One horizontal map sheet (constant ana): a topographic map of the ground in that slice.
vec3 topo(vec3 sp, float tS) {
  float hs = hMap(sp);
  float minor = 1.0 - smoothstep(0.0, 0.06 + 0.002 * tS, abs(fract(hs / 2.5 + 0.5) - 0.5) * 2.5);
  float major = 1.0 - smoothstep(0.0, 0.10 + 0.003 * tS, abs(fract(hs / 10.0 + 0.5) - 0.5) * 10.0);
  vec3 base = hs < uSea ? mix(vec3(0.20, 0.45, 0.70), vec3(0.08, 0.20, 0.40), smoothstep(0.0, 12.0, uSea - hs)) : hyps(hs);
  return mix(base, base * 0.45, max(minor * 0.55, major));
}
const float FLOOR_GAP = 18.0;

const float SHELL0 = 0.5, SHELL1 = 10.0, SHELL2 = 22.0;   // coast, hills, mountains
vec3 shellCol(int k) { return k == 0 ? vec3(0.88, 0.80, 0.52) : k == 1 ? vec3(0.36, 0.72, 0.34) : vec3(0.85, 0.66, 0.48); }
float shellA(int k)   { return k == 0 ? 0.20 : k == 1 ? 0.26 : 0.55; }

void main() {
  vec2 q = vUV * vec2(uRes.x / uRes.y, 1.0) * uFov;
  vec3 rd = normalize(uCamF + q.x * uCamR + q.y * uCamU);
  vec3 ro = uCam;
  const float SMAX = 760.0;
  vec3 col = vec3(0.0);
  float T = 1.0, tHit = 1e9;

  // you: a cyan marker at the origin, nose pointing forward
  {
    vec3 oc = ro; float b = dot(oc, rd), c = dot(oc, oc) - 0.81, d = b * b - c;
    vec3 oc2 = ro - vec3(1.3, 0.0, 0.0); float b2 = dot(oc2, rd), c2 = dot(oc2, oc2) - 0.2, d2 = b2 * b2 - c2;
    if (d > 0.0) tHit = -b - sqrt(d);
    if (d2 > 0.0) tHit = min(tHit, -b2 - sqrt(d2));
  }

  if (uStyle == 1 && abs(rd.z) > 1e-4) {
    // stacked floors are planes: intersect them directly, nearest first, no marching needed
    float tk[5]; int kk[5]; int n = 0;
    for (int k = -2; k <= 2; k++) {
      float tt = (float(k) * FLOOR_GAP - ro.z) / rd.z;
      if (tt > 0.0 && tt < 260.0) { tk[n] = tt; kk[n] = k; n++; }
    }
    for (int a = 0; a < 5; a++) for (int b = 0; b < 4; b++) {
      if (b + 1 < n && tk[b + 1] < tk[b]) { float x = tk[b]; tk[b] = tk[b + 1]; tk[b + 1] = x; int y = kk[b]; kk[b] = kk[b + 1]; kk[b + 1] = y; }
    }
    for (int i = 0; i < 5; i++) {
      if (i >= n || tk[i] > tHit || T < 0.02) break;
      int k = kk[i];
      float a = (k == 0 ? 0.56 : abs(k) == 1 ? 0.34 : 0.22) * (1.0 - smoothstep(60.0, 260.0, tk[i])) * smoothstep(2.0, 8.0, tk[i]);
      col += T * a * topo(ro + rd * tk[i], tk[i]) * (k == 0 ? 1.0 : 0.85); T *= 1.0 - a;
    }
  }
  float t = 0.6, hPrev = hMap(ro + rd * t);
  float tSheet = abs(rd.z) > 1e-4 ? -ro.z / rd.z : -1.0;      // the sheet ana = 0: what your slice view shows
  int lit = 0;
  for (int i = 0; i < 320; i++) {
    if (uStyle == 1) break;
    float ds = 0.5 + 0.011 * t;
    if (uStyle == 0) {
      if (tSheet > t && tSheet <= t + ds && tSheet < 260.0) {   // the floor: a topo map of exactly what your slice shows
        float a = 0.62 * (1.0 - smoothstep(70.0, 260.0, tSheet));
        col += T * a * topo(ro + rd * tSheet, tSheet); T *= 1.0 - a;
      }
    }
    t += ds;
    vec3 m = ro + rd * t;
    if (length(m) > SMAX || t > 900.0) break;
    if (t > tHit) break;
    float h = hMap(m);
    float slope = abs(h - hPrev) / ds;
    float fade = exp(-t * 0.004);
    float near = smoothstep(1.5, 6.0, t);                    // keep the space right around the camera clear

    if (uStyle == 0 && h < uSea) {                           // seas: blue volume
      float k = (0.0035 + 0.0012 * (uSea - h)) * ds;
      col += T * (1.0 - exp(-k)) * vec3(0.12, 0.36, 0.66);
      T *= exp(-k);
    }
    if (uStyle == 0) {
      for (int sI = 0; sI < 3; sI++) {
        float L = sI == 0 ? SHELL0 : sI == 1 ? SHELL1 : SHELL2;
        if ((hPrev - L) * (h - L) < 0.0) {
          float edge = 1.0 - smoothstep(0.0, 1.2, slope);    // shells seen edge-on read as outlines
          float a = clamp(shellA(sI) * (0.45 + 0.8 * edge), 0.0, 0.85) * (sI == 1 ? 0.35 : 0.6) * near * (0.25 + 0.75 * fade);
          float shade = 0.75;
          if (lit < 4) {                                     // light the nearest few crossings so shells read as surfaces
            vec3 n = normalize(gradMap(m) + 1e-6);
            if (dot(n, rd) > 0.0) n = -n;
            shade = 0.35 + 0.55 * max(dot(n, normalize(vec3(-0.4, 0.45, 0.8))), 0.0) + 0.25 * pow(1.0 - abs(dot(n, rd)), 2.0);
            lit++;
          }
          vec3 c = shellCol(sI) * shade * (0.45 + 0.55 * fade);
          col += T * a * c; T *= 1.0 - a;
        }
      }
    }
    hPrev = h;
    if (T < 0.02) break;
  }
  vec3 bg = mix(vec3(0.05, 0.055, 0.075), rd.z > 0.0 ? vec3(0.12, 0.08, 0.05) : vec3(0.04, 0.075, 0.12), abs(rd.z) * 0.7);
  if (tHit < 1e8 && T > 0.0) {                               // your marker
    vec3 p = ro + rd * tHit;
    vec3 n = normalize(p - (length(p - vec3(1.3, 0, 0)) < 0.6 ? vec3(1.3, 0, 0) : vec3(0)));
    col += T * vec3(0.35, 0.95, 1.0) * (0.45 + 0.55 * max(dot(n, -rd), 0.0));
    T = 0.0;
  }
  col += T * bg;

  for (int i = 0; i < 6; i++) {                              // landmarks: orbs, seen through terrain as a dimmer x-ray
    if (i >= uMarkN) break;
    if (length(uMark[i].xyz) < 8.0) continue;              // you are standing on it
    vec3 c = uMark[i].xyz - ro; float r = uMark[i].w;
    float b = dot(rd, c);
    if (b <= 0.0) continue;
    float perp2 = max(dot(c, c) - b * b, 0.0);
    bool tgt = i == uTarget;
    float pulse = tgt ? 0.75 + 0.25 * sin(uTime * 4.0) : 1.0;
    col += uMarkCol[i] * exp(-perp2 / (r * r * (tgt ? 9.0 : 4.0))) * (tgt ? 0.6 : 0.3) * pulse;
    if (perp2 < r * r) col = mix(col, uMarkCol[i], 0.8);
  }
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
