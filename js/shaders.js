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

// Atlas lookup with a cubic B-spline (8 trilinear fetches), matching HeightField.heightAt on the CPU.
float atlasTap(vec3 pos, float chart) {
  float z = clamp(pos.z, 0.0, uN - 1.0);
  return texture(uAtlas, vec3((pos.x + 0.5) / uN, (pos.y + 0.5) / uN, (chart * uN + z + 0.5) / (8.0 * uN))).r;
}
float comp(vec4 n, int k) { return k == 0 ? n.x : k == 1 ? n.y : k == 2 ? n.z : n.w; }
float chartHeight(vec4 n, int k) {
  float s = comp(n, k), m = abs(s);
  vec3 u = k == 0 ? n.yzw : k == 1 ? vec3(n.x, n.z, n.w) : k == 2 ? vec3(n.x, n.y, n.w) : n.xyz;
  u /= m;
  float chart = float(2 * k) + (s > 0.0 ? 1.0 : 0.0);
  vec3 idx = (u * 0.5 + 0.5) * (uN - 1.0);
  vec3 i0 = floor(idx), f = idx - i0, g = 1.0 - f;
  vec3 w0 = g * g * g / 6.0, w1 = (4.0 - 6.0 * f * f + 3.0 * f * f * f) / 6.0, w3 = f * f * f / 6.0, w2 = 1.0 - w0 - w1 - w3;
  vec3 g0 = w0 + w1, g1 = w2 + w3;
  vec3 s0 = i0 - 1.0 + w1 / g0, s1 = i0 + 1.0 + w3 / g1;
  return g0.z * (g0.y * (g0.x * atlasTap(vec3(s0.x, s0.y, s0.z), chart) + g1.x * atlasTap(vec3(s1.x, s0.y, s0.z), chart))
               + g1.y * (g0.x * atlasTap(vec3(s0.x, s1.y, s0.z), chart) + g1.x * atlasTap(vec3(s1.x, s1.y, s0.z), chart)))
       + g1.z * (g0.y * (g0.x * atlasTap(vec3(s0.x, s0.y, s1.z), chart) + g1.x * atlasTap(vec3(s1.x, s0.y, s1.z), chart))
               + g1.y * (g0.x * atlasTap(vec3(s0.x, s1.y, s1.z), chart) + g1.x * atlasTap(vec3(s1.x, s1.y, s1.z), chart)));
}
// Cheap single-fetch height (trilinear, main chart only) for coarse marching and shadows.
float heightFast(vec4 n) {
  vec4 a = abs(n);
  float m = a.x; int k = 0;
  if (a.y > m) { m = a.y; k = 1; }
  if (a.z > m) { m = a.z; k = 2; }
  if (a.w > m) { m = a.w; k = 3; }
  float s = comp(n, k);
  vec3 u = (k == 0 ? n.yzw : k == 1 ? vec3(n.x, n.z, n.w) : k == 2 ? vec3(n.x, n.y, n.w) : n.xyz) / m;
  return atlasTap((u * 0.5 + 0.5) * (uN - 1.0), float(2 * k) + (s > 0.0 ? 1.0 : 0.0));
}
const float SEAM = 0.04;
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
const float MARGIN = 1.6;   // the cheap surface is lifted by this much, so coarse steps never pass the true one
float sdFast(vec4 p) {
  float r = length(p);
  return (r - uPR - heightFast(p / r) - MARGIN) * 0.6;
}

vec4 terrainNormal(vec4 p, float t) {
  float e = 0.03 + 0.002 * t;
  vec2 h = vec2(e, 0.0);
  return normalize(vec4(
    sdTerrain(p + h.xyyy) - sdTerrain(p - h.xyyy),
    sdTerrain(p + h.yxyy) - sdTerrain(p - h.yxyy),
    sdTerrain(p + h.yyxy) - sdTerrain(p - h.yyxy),
    sdTerrain(p + h.yyyx) - sdTerrain(p - h.yyyx)));
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
  // Step with the cheap lifted surface while far from it; near it, use the true smooth surface.
  // After skimming past a ridge the cheap distance grows again and big steps resume.
  for (int i = 0; i < 320; i++) {
    vec4 p = ro + rd * t;
    float d = sdFast(p);
    if (d < 0.03 + 0.0008 * t) {
      d = sdTerrain(p);
      if (d < 0.0013 * t + 0.002) return t;
    }
    t += max(d, 0.0006 * t);
    if (t > MAXT) break;
    if (dot(p, p) > rOut * rOut && dot(p, rd) > 0.0) break;
  }
  return -1.0;
}

float softShadow(vec4 ro, vec4 rd) {
  float res = 1.0, t = 0.15, rOut = uPR + SHELL;
  for (int i = 0; i < 56; i++) {
    vec4 p = ro + rd * t;
    float d = sdFast(p) + MARGIN * 0.6;
    res = min(res, 9.0 * d / t);
    if (res < 0.02) break;
    t += clamp(d, 0.15, 9.0);
    if (t > 260.0 || (dot(p, p) > rOut * rOut && dot(p, rd) > 0.0)) break;
  }
  return clamp(res, 0.0, 1.0);
}

float dayFactor(vec4 up) { return smoothstep(-0.14, 0.18, dot(uSun, up)); }

vec3 horizonColor(vec4 up) {
  float sunEl = dot(uSun, up);
  float day = dayFactor(up);
  vec3 hz = mix(vec3(0.025, 0.03, 0.065), vec3(0.66, 0.77, 0.90), day);
  float dusk = exp(-pow((sunEl + 0.02) * 5.5, 2.0));
  return mix(hz, vec3(0.95, 0.52, 0.30), dusk * 0.6);
}

vec3 skyColor(vec4 rd, vec4 up) {
  float el = dot(rd, up);
  float day = dayFactor(up);
  vec3 zen = mix(vec3(0.006, 0.01, 0.03), vec3(0.16, 0.36, 0.75), day);
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
  float v1 = vn4(p * 0.07), v2 = vn4(p * 0.45 + 3.0);
  vec3 grass = mix(vec3(0.17, 0.30, 0.10), vec3(0.34, 0.44, 0.15), v1);
  grass *= 0.85 + 0.3 * v2;
  vec3 rock = mix(vec3(0.33, 0.31, 0.29), vec3(0.47, 0.43, 0.39), v2);
  vec3 sand = vec3(0.74, 0.68, 0.50);
  vec3 snow = vec3(0.93, 0.95, 0.98);
  vec3 alb = mix(sand, grass, smoothstep(uSea + 0.5, uSea + 2.0, h));
  alb = mix(alb, rock, 1.0 - smoothstep(0.66, 0.84, slope));
  alb = mix(alb, snow, smoothstep(27.0, 31.0, h + 8.0 * (slope - 0.85) + 3.0 * v1));
  if (uAnaTint > 0.5) { float an = dot(n, uA); alb = mix(alb, an > 0.0 ? vec3(0.95, 0.62, 0.30) : vec3(0.32, 0.70, 0.95), min(1.0, abs(an) * 2.2) * 0.75); }
  float sunEl = dot(uSun, up);
  float dif = max(dot(n, uSun), 0.0) * smoothstep(-0.04, 0.06, sunEl);
  float sh = 1.0;
  if (withShadow && dif > 0.0 && uShadows > 0.5) sh = softShadow(p + n * 0.06, uSun);
  float day = dayFactor(up);
  vec3 sunCol = mix(vec3(1.0, 0.55, 0.32), vec3(1.0, 0.95, 0.86), smoothstep(0.0, 0.35, sunEl));
  vec3 amb = mix(vec3(0.018, 0.022, 0.045), vec3(0.26, 0.34, 0.48), day);
  return alb * (sunCol * dif * sh * 1.35 + amb * (0.55 + 0.45 * slope));
}

vec3 applyFog(vec3 col, vec4 upEye, float t) {
  return mix(col, horizonColor(upEye), 1.0 - exp(-t * 0.0032));
}

vec3 shadeWater(vec4 p, vec4 rd, float tw, float tBottom, vec4 ro) {
  vec4 up = normalize(p);
  vec4 tng = vec4(sin(p.x * 0.71 + uTime * 1.3), sin(p.y * 0.93 - uTime * 1.1),
                  sin(p.z * 0.82 + uTime * 0.9), sin(p.w * 0.64 - uTime * 1.2));
  tng += 0.5 * vec4(sin(p.y * 1.9 + uTime * 2.1), sin(p.w * 2.3 + uTime * 1.7),
                    sin(p.x * 2.1 - uTime * 1.9), sin(p.z * 1.7 + uTime * 2.3));
  tng -= up * dot(tng, up);
  vec4 wn = normalize(up + tng * 0.025);
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(-rd, wn), 0.0), 5.0);
  vec4 rr = reflect(rd, wn);
  vec3 refl = skyColor(rr, up);
  float day = dayFactor(up);
  vec3 deep = vec3(0.012, 0.075, 0.11) * (0.15 + 0.85 * day);
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
  c = 1.0 - exp(-c * 1.15);
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
  vec3 col = post(render(uEye, rd, t));
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
  vec3 col = post(render(uEye, rd, t));
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
  float tone = smoothstep(0.14, 0.35, ec) * 0.3;
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
