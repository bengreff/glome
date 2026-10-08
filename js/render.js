// The GL side: context, programs, textures, the slice view, dynamic resolution, upscaling and the profiler.
import { VERT, SLICE_FRAG, UPSCALE_FRAG, RADAR_BAKE_FRAG, RADAR_FRAG, BLIT_FRAG } from './shaders.js';
import { PLANET_R, SEA } from './world.js';
import { G } from './game.js';
import { boulders } from './boulders.js';
import { gpuObj } from './objects.js';
import { skyUniforms } from './cosmos.js';
import { bUniforms, NORMAL_DATA } from './planetB.js';
import { carveUniforms } from './landforms.js';
import { treeUniforms, treeTexData, ropeTexData, rope as ropeSlot, ROPE_CAPS, legs as legSlot, legTexData, LEG_CAPS } from './trees.js';

const $ = id => document.getElementById(id);
export const canvas = $('view'), overlay = $('overlay');
export const octx = overlay.getContext('2d');

export function fail(msg) {
  $('loading').hidden = true;
  $('error').hidden = false;
  $('error-msg').textContent = msg;
  throw new Error(msg);
}

export const gl = canvas.getContext('webgl2', { antialias: false, powerPreference: 'high-performance' });
if (!gl) fail('This world needs WebGL 2, which this browser does not provide. Try a recent Chrome, Edge, Firefox or Safari on a desktop.');

// ---------- GL helpers ----------
function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) fail('Shader failed to compile:\n' + gl.getShaderInfoLog(s));
  return s;
}
export function program(fragSrc) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) fail('Shader failed to link:\n' + gl.getProgramInfoLog(p));
  const locs = {};
  p.u = name => (name in locs) ? locs[name] : (locs[name] = gl.getUniformLocation(p, name));
  return p;
}
export const progSlice = program(SLICE_FRAG), progUp = program(UPSCALE_FRAG), progRadar = program(RADAR_FRAG), progBake = program(RADAR_BAKE_FRAG), progBlit = program(BLIT_FRAG);
export const vao = gl.createVertexArray();

export function tex3D(w, h, d, internal, format, type, filter, data = null) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE7);
  gl.bindTexture(gl.TEXTURE_3D, t);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, filter);
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage3D(gl.TEXTURE_3D, 0, internal, w, h, d, 0, format, type, data);
  gl.bindTexture(gl.TEXTURE_3D, null);
  gl.activeTexture(gl.TEXTURE0);
  return t;
}

// ---------- terrain atlas ----------
const max3D = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE);
export let N = 128;
while (8 * N > max3D && N > 32) N >>= 1;

export function buildAtlas() {
  return new Promise((resolve, reject) => {
    const data = new Float32Array(N * N * N * 8), NW = N >> 1, water = new Float32Array(NW * NW * NW * 8);
    const progress = new Array(8).fill(0);
    let done = 0;
    for (let c = 0; c < 8; c++) {
      const w = new Worker(new URL('./terrain-worker.js' + new URL(import.meta.url).search, import.meta.url), { type: 'module' });
      w.onerror = e => reject(new Error('Terrain worker failed: ' + (e.message || 'unknown error')));
      w.onmessage = e => {
        if (e.data.data) {
          data.set(e.data.data, c * N * N * N);
          water.set(e.data.water, c * NW * NW * NW);
          progress[c] = 1; w.terminate();
          if (++done === 8) resolve({ data, water });
        } else progress[c] = e.data.progress;
        $('bar').style.width = (100 * progress.reduce((a, b) => a + b, 0) / 8).toFixed(1) + '%';
      };
      w.postMessage({ chart: c, N });
    }
  });
}

// Tileable 3D gradient (Perlin) noise with its analytic gradient: rgb = gradient / 4, a = value (mapped to 0..1).
// 128³ texels over 16³ lattice cells. (Value noise, random numbers on the lattice blended smoothly, was used first;
// its blobs line up with the lattice, which the tetraplanar layers turn square to the ground, so from above the
// grass came out in blocks.) Scaled by 1.94 to keep the value noise's spread (standard deviation 0.37).
export function makeNoise() {
  const S = 128, P = 16, k = S / P, AMP = 1.94;
  let seed = 7;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const Gr = new Float32Array(P * P * P * 3);                  // a random unit gradient at each lattice point
  for (let i = 0; i < P * P * P; i++) {
    let x, y, z, l;
    do { x = rnd(); y = rnd(); z = rnd(); l = Math.hypot(x, y, z); } while (l > 1 || l < 0.1);
    Gr[3 * i] = x / l; Gr[3 * i + 1] = y / l; Gr[3 * i + 2] = z / l;
  }
  const out = new Uint8Array(S * S * S * 4);
  const I = new Int32Array(S), F = new Float64Array(S), U = new Float64Array(S), D = new Float64Array(S);
  for (let x = 0; x < S; x++) { const q = (x + 0.5) / k, i = Math.floor(q), f = q - i; I[x] = i; F[x] = f; U[x] = f * f * f * (f * (f * 6 - 15) + 10); D[x] = 30 * f * f * (f - 1) * (f - 1); }
  const enc = t => Math.max(0, Math.min(255, Math.round((t * 0.5 + 0.5) * 255)));
  for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0, gx = 0, gy = 0, gz = 0;
    for (let c = 0; c < 8; c++) {
      const a = c & 1, b = (c >> 1) & 1, d = (c >> 2) & 1;
      const idx = 3 * (((I[x] + a) & 15) + P * (((I[y] + b) & 15) + P * ((I[z] + d) & 15)));
      const nc = Gr[idx] * (F[x] - a) + Gr[idx + 1] * (F[y] - b) + Gr[idx + 2] * (F[z] - d);
      const wx = a ? U[x] : 1 - U[x], wy = b ? U[y] : 1 - U[y], wz = d ? U[z] : 1 - U[z], w = wx * wy * wz;
      v += w * nc;
      gx += (a ? D[x] : -D[x]) * wy * wz * nc + w * Gr[idx];
      gy += wx * (b ? D[y] : -D[y]) * wz * nc + w * Gr[idx + 1];
      gz += wx * wy * (d ? D[z] : -D[z]) * nc + w * Gr[idx + 2];
    }
    const o = 4 * (x + S * (y + S * z));
    out[o] = enc(AMP * gx / 4); out[o + 1] = enc(AMP * gy / 4); out[o + 2] = enc(AMP * gz / 4); out[o + 3] = enc(AMP * v);
  }
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE7);
  gl.bindTexture(gl.TEXTURE_3D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, S, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, out);
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  if (aniso) gl.texParameterf(gl.TEXTURE_3D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  gl.generateMipmap(gl.TEXTURE_3D);
  gl.bindTexture(gl.TEXTURE_3D, null);
  gl.activeTexture(gl.TEXTURE0);
  return t;
}
export const tex = { atlas: null, noise: null, water: null };

// ---------- dynamic resolution ----------
// Render internally at a fraction of the screen, adjusted to hold ~55-60 fps, then upscale with sharpening.
export const dyn = { scale: 0.6, auto: true, acc: 0, n: 0, fast: 0, probe: null, floor: 0, floorUntil: 0 };
export const quality = { cap: 1 };                       // the graphics setting: a cap on the resolution
const maxScale = () => Math.min(1, 1.4 / Math.min(devicePixelRatio || 1, 2)) * quality.cap;
// Lower the resolution when frames are slow, but check that it helped: if a step down doesn't make frames
// faster, pixels aren't what limits the frame rate (a capped display, a throttled GPU, the compositor), so
// undo it and don't go below that resolution for a while.
export function updateDyn(frameSec) {
  const simT = G.simT;
  dyn.acc += frameSec; dyn.n++;
  if (dyn.acc < 0.4) return;
  const avg = dyn.acc / dyn.n; dyn.acc = 0; dyn.n = 0;
  if (dyn.scale > maxScale()) dyn.scale = maxScale();
  if (!dyn.auto || simT < 3) return;                      // ignore the start-up hitches (shader warm-up, terrain searches)
  if (dyn.probe) {                                         // judge the last step down
    const p = dyn.probe; dyn.probe = null;
    // a step that cut the pixels by a fraction f should save about f of a GPU-bound frame: expect at least a
    // quarter of that (frame times are noisy), unless it reached the display's rate (vsync rounds frame times, so a
    // step that just makes it saves less)
    const r = dyn.scale / p.scale, expect = 1 - 0.25 * (1 - r * r);
    if (avg > p.avg * expect && avg > 1 / 58.5) { dyn.scale = p.scale; dyn.floor = p.scale; dyn.floorUntil = simT + 6; return; }
  }
  const floor = simT < dyn.floorUntil ? dyn.floor : 0.3;
  // a resolution that proved too slow is a ceiling for half a minute (at a vsync'd 60 Hz every frame that makes it
  // looks equally fast, so without one the scale hunts up and down)
  const ceil = simT < (dyn.ceilUntil || 0) ? dyn.ceil * 0.99 : maxScale();
  dyn.fast = avg < 1 / 59 ? dyn.fast + 1 : 0;
  if (avg > 1 / 57 && dyn.scale > floor + 0.01) {
    dyn.probe = { scale: dyn.scale, avg };
    dyn.ceil = dyn.scale; dyn.ceilUntil = simT + 30;
    dyn.scale = Math.max(floor, dyn.scale * (avg > 1 / 35 ? 0.8 : avg > 1 / 50 ? 0.9 : 0.95));
  } else if (dyn.fast >= 3 && dyn.scale < ceil) { dyn.scale = Math.min(ceil, dyn.scale * 1.04); dyn.fast = 0; }
}
// Two scene buffers, used in turn: each frame draws into one while the other still holds the last frame, which the
// console's screen shows (the view fed back into itself).
export const scene = { fbos: [gl.createFramebuffer(), gl.createFramebuffer()], texs: [null, null], cur: 0, fbo: null, tex: null, prev: null, w: 0, h: 0 };
function makeSceneTex(w, h) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE5);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function ensureScene(w, h) {
  if (!(scene.texs[0] && Math.abs(w - scene.w) < 2 && Math.abs(h - scene.h) < 2)) {
    for (let i = 0; i < 2; i++) {
      if (scene.texs[i]) gl.deleteTexture(scene.texs[i]);
      scene.texs[i] = makeSceneTex(w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbos[i]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, scene.texs[i], 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    scene.w = w; scene.h = h;
  }
  scene.cur ^= 1;                                   // swap: draw into one, the other is last frame
  scene.fbo = scene.fbos[scene.cur]; scene.tex = scene.texs[scene.cur]; scene.prev = scene.texs[scene.cur ^ 1];
}

export function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = Math.max(1, Math.round(innerWidth * dpr)), H = Math.max(1, Math.round(innerHeight * dpr));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  if (overlay.width !== W || overlay.height !== H) { overlay.width = W; overlay.height = H; }
  ensureScene(Math.max(16, Math.round(W * dyn.scale)), Math.max(16, Math.round(H * dyn.scale)));
}

// Uniforms every world shader shares: the terrain, the camera, the sun and the boulders near you.
// Planet B's floor normals, as a 120×1 float texture.
const bTex = (() => {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 120, 1, 0, gl.RGBA, gl.FLOAT, NORMAL_DATA);
  for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
  gl.activeTexture(gl.TEXTURE0);
  return t;
})();
// The trees' capsules, as a float texture (built once the trees have grown).
let treeTex = null;
export function uploadTrees() {
  const { data, count } = treeTexData();
  treeTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, treeTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, Math.max(1, count * 3), 1, 0, gl.RGBA, gl.FLOAT, data);
  for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
  gl.activeTexture(gl.TEXTURE0);
}
// The hoop sky, computed once per frame (render.sky); the sun direction used for shadows is its mean.
export const skyNow = { u: null };
export function updateSky(t, eye, up) { skyNow.u = skyUniforms(t, eye, up); skyNow.b = bUniforms(t); G.sun = skyNow.u.sun; return G.sun; }
export function setWorld(p, cam, sun) {
  const sk = skyNow.u;
  gl.uniform4fv(p.u('uStar0'), sk.star0);
  gl.uniform4fv(p.u('uHoop'), sk.hoop);
  gl.uniform1f(p.u('uL'), sk.L);
  gl.uniform1f(p.u('uStarR'), sk.starR);
  gl.uniform1f(p.u('uStarI'), sk.starI);
  gl.uniform4fv(p.u('uStarD'), sk.D);
  gl.uniform4fv(p.u('uStarW'), sk.W);
  gl.uniformMatrix4fv(p.u('uSkyM'), false, sk.M);
  gl.uniform1f(p.u('uDayE'), sk.dayE);
  // Images and copies lie on lines along the hoop axis, so their offsets from your slice change linearly with k:
  // the ones a slice ray can reach form a contiguous range.
  const range = (c0, R, kmax) => {
    const a0 = vec4dot(c0, cam.A) - vec4dot(cam.eye, cam.A), da = sk.L * vec4dot(sk.hoop, cam.A);
    let lo = kmax + 1, hi = -kmax - 1;
    for (let k = -kmax; k <= kmax; k++) if (Math.abs(a0 + k * da) < R) { lo = Math.min(lo, k); hi = Math.max(hi, k); }
    return [lo, hi];
  };
  const sr = range(sk.star0, sk.starR * 6, 7), cr = range([0, 0, 0, 0], PLANET_R + 48, 2);
  gl.uniform2i(p.u('uStarK'), sr[0], sr[1]);
  const bu = skyNow.b, br = range(bu.c, bu.rin * 1.09, 1);
  gl.uniform4fv(p.u('uPBc'), bu.c);
  gl.uniformMatrix4fv(p.u('uPBM'), false, bu.M);
  gl.uniform1f(p.u('uPBin'), bu.rin);
  gl.uniform2i(p.u('uPBK'), br[0], br[1]);
  gl.uniform1i(p.u('uPBpad'), 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bTex); gl.uniform1i(p.u('uPBN'), 1); gl.activeTexture(gl.TEXTURE0);
  gl.uniform2i(p.u('uCopyK'), cr[0], cr[1]);
  const atm = Math.exp(-Math.max(0, Math.hypot(...cam.eye) - PLANET_R - 60) / 220);
  gl.uniform1f(p.u('uAtmos'), atm < 0.02 ? 0 : atm);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_3D, tex.water);
  gl.uniform1i(p.u('uWaterL'), 2);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_3D, tex.noise);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, tex.atlas);
  gl.uniform1i(p.u('uAtlas'), 0);
  gl.uniform1i(p.u('uNoise'), 4);
  gl.uniform1f(p.u('uN'), N);
  gl.uniform1f(p.u('uPR'), PLANET_R);
  gl.uniform1f(p.u('uSea'), SEA);
  gl.uniform4fv(p.u('uEye'), cam.eye);
  gl.uniform4fv(p.u('uF'), cam.F);
  gl.uniform4fv(p.u('uR'), cam.R);
  gl.uniform4fv(p.u('uU'), cam.U);
  gl.uniform4fv(p.u('uA'), cam.A);
  gl.uniform4fv(p.u('uSun'), sun);
  gl.uniform1f(p.u('uTime'), performance.now() / 1000);
  gl.uniform1f(p.u('uShadows'), 1);
  gl.uniform1i(p.u('uDebug'), G.debug | 0);
  gl.uniform4fv(p.u('uBC'), boulders.C);
  gl.uniform1fv(p.u('uBR'), boulders.R);
  gl.uniform1i(p.u('uBN'), boulders.near.length);
  gl.uniform1i(p.u('uBCut'), boulders.cut);
  gl.uniform1i(p.u('uBShadow'), boulders.shadow);
  gl.uniform4fv(p.u('uOC'), gpuObj.C);
  gl.uniformMatrix4fv(p.u('uOM'), false, gpuObj.M);
  gl.uniform4fv(p.u('uOP'), gpuObj.P);
  gl.uniform1i(p.u('uON'), gpuObj.n);
  gl.uniform1i(p.u('uOCut'), gpuObj.cut);
  gl.uniform1i(p.u('uGhost'), gpuObj.ghost);
  if (p === progSlice) { gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, scene.prev); gl.uniform1i(p.u('uPrev'), 7); gl.activeTexture(gl.TEXTURE0); }
  gl.uniform1f(p.u('uScreenOn'), G.screenOn ? 1 : 0);
  if (treeTex && p === progSlice) {                          // the rope and the walkers' legs move: rewrite them
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, treeTex);
    if (ropeSlot.obj) gl.texSubImage2D(gl.TEXTURE_2D, 0, ropeSlot.start * 3, 0, ROPE_CAPS * 3, 1, gl.RGBA, gl.FLOAT, ropeTexData());
    if (legSlot.caps.length) gl.texSubImage2D(gl.TEXTURE_2D, 0, legSlot.start * 3, 0, LEG_CAPS * 3, 1, gl.RGBA, gl.FLOAT, legTexData());
    gl.activeTexture(gl.TEXTURE0);
  }
  const tu = treeUniforms(cam.eye, cam.A);
  gl.uniform4fv(p.u('uTC'), tu.C);
  gl.uniform1fv(p.u('uTRad'), tu.R);
  gl.uniform2iv(p.u('uTS'), tu.S);
  gl.uniform1i(p.u('uTN'), treeTex ? tu.n : 0);
  gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, treeTex); gl.uniform1i(p.u('uTreeTex'), 6); gl.activeTexture(gl.TEXTURE0);
  const cu = carveUniforms(cam.eye);
  gl.uniform4fv(p.u('uCA'), cu.A); gl.uniform4fv(p.u('uCB'), cu.B); gl.uniform1fv(p.u('uCR'), cu.R); gl.uniform1i(p.u('uCN'), cu.n);
  gl.uniform4fv(p.u('uCBoundC'), cu.C); gl.uniform1f(p.u('uCBoundR'), cu.Rb);
  gl.uniform4fv(p.u('uLP'), gpuObj.LP);
  gl.uniform4fv(p.u('uLC'), gpuObj.LC);
  gl.uniform1i(p.u('uLN'), gpuObj.ln);
}

const vec4dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
export let FOV = Math.tan(38 * Math.PI / 180);           // half the view's height at unit distance (a setting: 60–100°)
export function setFov(deg) { FOV = Math.tan(Math.max(60, Math.min(100, deg || 76)) / 2 * Math.PI / 180); }

export function drawSlice(cam, sun, x, y, w, h) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
  gl.viewport(x, y, w, h);
  gl.useProgram(progSlice);
  setWorld(progSlice, cam, sun);
  gl.uniform2f(progSlice.u('uRes'), w, h);
  gl.uniform1f(progSlice.u('uFov'), FOV);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export function present() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(progUp);
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, scene.tex);
  gl.uniform1i(progUp.u('uScene'), 5);
  gl.uniform2f(progUp.u('uSrc'), scene.w, scene.h);
  gl.uniform1f(progUp.u('uSharp'), Math.min(1, 0.35 + 0.9 * (1 - scene.w / canvas.width)));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.activeTexture(gl.TEXTURE0);
}

// ---------- profiler ----------
// Moving averages of CPU time per part of the frame, and GPU time per frame (via timer queries where the
// browser allows them). Read from the console as __glome.prof.
export const prof = { cpu: {}, gpu: 0, interval: 0 };
const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2'), queries = [];
let profT = 0;
export const mark = name => { const t = performance.now(); if (name) prof.cpu[name] = 0.95 * (prof.cpu[name] || 0) + 0.05 * (t - profT); profT = t; };
export function gpuBegin() {
  if (!tq) return;
  while (queries.length && gl.getQueryParameter(queries[0], gl.QUERY_RESULT_AVAILABLE)) {
    const q = queries.shift();
    if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) prof.gpu = 0.95 * prof.gpu + 0.05 * gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
    gl.deleteQuery(q);
  }
  if (queries.length > 4) return null;
  const q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q); return q;
}
export function gpuEnd(q) { if (q) { gl.endQuery(tq.TIME_ELAPSED_EXT); queries.push(q); } }
