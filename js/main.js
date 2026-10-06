import { VERT, SLICE_FRAG, RETINA_FRAG, EDGE_FRAG, VOLUME_FRAG, UPSCALE_FRAG, MAP_FRAG, SKYLINE_FRAG } from './shaders.js';
import { PLANET_R, SEA, HeightField, prefilter } from './world.js';
import { Player, vec4 } from './player.js';

const $ = id => document.getElementById(id);
const canvas = $('view'), overlay = $('overlay');
const octx = overlay.getContext('2d');

function fail(msg) {
  $('loading').hidden = true;
  $('error').hidden = false;
  $('error-msg').textContent = msg;
  throw new Error(msg);
}

const gl = canvas.getContext('webgl2', { antialias: false, powerPreference: 'high-performance' });
if (!gl) fail('This world needs WebGL 2, which this browser does not provide. Try a recent Chrome, Edge, Firefox or Safari on a desktop.');

// ---------- GL helpers ----------
function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) fail('Shader failed to compile:\n' + gl.getShaderInfoLog(s));
  return s;
}
function program(fragSrc) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) fail('Shader failed to link:\n' + gl.getProgramInfoLog(p));
  const locs = {};
  p.u = name => (name in locs) ? locs[name] : (locs[name] = gl.getUniformLocation(p, name));
  return p;
}
const progSlice = program(SLICE_FRAG), progRetina = program(RETINA_FRAG), progEdge = program(EDGE_FRAG), progVol = program(VOLUME_FRAG), progUp = program(UPSCALE_FRAG), progMap = program(MAP_FRAG), progSky = program(SKYLINE_FRAG);
const vao = gl.createVertexArray();

function tex3D(w, h, d, internal, format, type, filter, data = null) {
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
let N = 128;
while (8 * N > max3D && N > 32) N >>= 1;

function buildAtlas() {
  return new Promise((resolve, reject) => {
    const data = new Float32Array(N * N * N * 8);
    const progress = new Array(8).fill(0);
    let done = 0;
    for (let c = 0; c < 8; c++) {
      const w = new Worker(new URL('./terrain-worker.js', import.meta.url), { type: 'module' });
      w.onerror = e => reject(new Error('Terrain worker failed: ' + (e.message || 'unknown error')));
      w.onmessage = e => {
        if (e.data.data) {
          data.set(e.data.data, c * N * N * N);
          progress[c] = 1; w.terminate();
          if (++done === 8) resolve(data);
        } else progress[c] = e.data.progress;
        $('bar').style.width = (100 * progress.reduce((a, b) => a + b, 0) / 8).toFixed(1) + '%';
      };
      w.postMessage({ chart: c, N });
    }
  });
}

// Tileable 3D value noise with analytic gradient: rgb = gradient / 3, a = value (all mapped to 0..1).
function makeNoise() {
  const S = 64, P = 16, k = S / P;
  let seed = 7;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const lat = new Float32Array(P * P * P).map(rnd);
  const L = (x, y, z) => lat[((x % P + P) % P) + P * (((y % P + P) % P) + P * ((z % P + P) % P))];
  const out = new Uint8Array(S * S * S * 4);
  const sm = f => f * f * (3 - 2 * f), dsm = f => 6 * f * (1 - f);
  for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const q = [(x + 0.5) / k, (y + 0.5) / k, (z + 0.5) / k];
    const i = q.map(Math.floor), f = q.map((v, j) => v - i[j]);
    const w = f.map(sm), dw = f.map(dsm);
    let v = 0, gx = 0, gy = 0, gz = 0;
    for (let c = 0; c < 8; c++) {
      const a = c & 1, b = (c >> 1) & 1, d = (c >> 2) & 1;
      const val = L(i[0] + a, i[1] + b, i[2] + d);
      const wx = a ? w[0] : 1 - w[0], wy = b ? w[1] : 1 - w[1], wz = d ? w[2] : 1 - w[2];
      const sx = a ? dw[0] : -dw[0], sy = b ? dw[1] : -dw[1], sz = d ? dw[2] : -dw[2];
      v += wx * wy * wz * val; gx += sx * wy * wz * val; gy += wx * sy * wz * val; gz += wx * wy * sz * val;
    }
    const o = 4 * (x + S * (y + S * z)), enc = t => Math.max(0, Math.min(255, Math.round((t * 0.5 + 0.5) * 255)));
    out[o] = enc(gx / 3); out[o + 1] = enc(gy / 3); out[o + 2] = enc(gz / 3); out[o + 3] = enc(v);
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

// ---------- state ----------
const DAY1 = 300;                       // seconds for one turn in the first rotation plane (at 1×)
const state = {
  view: 'slice', time: 0, timeScale: 1, paused: false, rotation: 'double',
  shadows: true, retinaM: 64, help: false, anaTint: false,
  mapStyle: 1, mapChase: true, skylines: true, marks: [], target: 0, facing: false,
  eyeYaw: 0, eyePitch: 0.3, eyeAuto: true,
};
const RATIOS = { double: 1.6180339887, isoclinic: 1 };

// The planet double-rotates; in the planet's own frame the sun circles in two planes at once.
function sunDir(t) {
  const a = Math.SQRT1_2, w1 = 2 * Math.PI / DAY1, w2 = w1 * RATIOS[state.rotation];
  return [a * Math.cos(w1 * t), -a * Math.sin(w1 * t), a * Math.cos(w2 * t), -a * Math.sin(w2 * t)];
}

let player, atlasTex, noiseTex;
let retinaTex = null, volTex = null, fbo = null;

function makeRetina(M) {
  if (retinaTex) { gl.deleteTexture(retinaTex); gl.deleteTexture(volTex); }
  retinaTex = tex3D(M, M, M, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
  volTex = tex3D(M, M, M, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
  fbo = fbo || gl.createFramebuffer();
}

// Dynamic resolution: render internally at a fraction of the screen, adjusted to hold ~55-60 fps,
// then upscale with sharpening. 1/2/3 pick a fixed level, 0 returns to automatic.
const dyn = { scale: 0.6, auto: true, acc: 0, n: 0, slow: 0, fast: 0 };
const maxScale = () => Math.min(1, 1.5 / Math.min(devicePixelRatio || 1, 2));
function updateDyn(dt) {
  dyn.acc += dt; dyn.n++;
  if (dyn.acc < 0.35) return;
  const avg = dyn.acc / dyn.n; dyn.acc = 0; dyn.n = 0;
  if (!dyn.auto) return;
  // drop quickly when frames are slow, climb only after a sustained run of fast frames (no flip-flopping)
  dyn.slow = avg > 1 / 50 ? dyn.slow + 1 : 0;
  dyn.fast = avg < 1 / 58 ? dyn.fast + 1 : 0;
  if (dyn.slow >= 1) { dyn.scale = Math.max(0.3, dyn.scale * (avg > 1 / 35 ? 0.8 : 0.9)); dyn.slow = 0; }
  else if (dyn.fast >= 4) { dyn.scale = Math.min(maxScale(), dyn.scale * 1.06); dyn.fast = 0; }
}
const scene = { fbo: gl.createFramebuffer(), tex: null, w: 0, h: 0 };
function ensureScene(w, h) {
  if (scene.tex && Math.abs(w - scene.w) < 2 && Math.abs(h - scene.h) < 2) return;
  if (scene.tex) gl.deleteTexture(scene.tex);
  scene.tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE5);
  gl.bindTexture(gl.TEXTURE_2D, scene.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, scene.tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.activeTexture(gl.TEXTURE0);
  scene.w = w; scene.h = h;
}

// ---------- input ----------
const keys = new Set();
let mouseDX = 0, mouseDY = 0, mouseAlt = false, dragging = false;
const SENS = 0.0022;

addEventListener('keydown', e => {
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  switch (e.code) {
    case 'KeyV':
      if (e.shiftKey) state.view = state.view === 'eye' ? 'map' : 'eye';
      else state.view = state.view === 'slice' ? 'triptych' : 'slice';
      break;
    case 'KeyK': if (state.view !== 'eye') state.skylines = !state.skylines; break;
    case 'KeyB': state.target = (state.target + 1) % state.marks.length; state.facing = false; break;
    case 'KeyN': dropMarker(); break;
    case 'KeyF': state.facing = true; break;
    case 'KeyR': state.mapChase = !state.mapChase; break;
    case 'BracketRight': state.timeScale = Math.min(state.timeScale * 2, 256); break;
    case 'BracketLeft': state.timeScale = Math.max(state.timeScale / 2, 1 / 8); break;
    case 'KeyP': state.paused = !state.paused; break;
    case 'KeyT': state.rotation = state.rotation === 'double' ? 'isoclinic' : 'double'; break;
    case 'KeyH': state.help = !state.help; $('help').hidden = !state.help; break;
    case 'KeyG': state.shadows = !state.shadows; break;
    case 'Digit0': dyn.auto = true; break;
    case 'Digit1': dyn.auto = false; dyn.scale = 0.4 * maxScale(); break;
    case 'Digit2': dyn.auto = false; dyn.scale = 0.7 * maxScale(); break;
    case 'Digit3': dyn.auto = false; dyn.scale = maxScale(); break;
    case 'KeyM':
      if (e.shiftKey) { state.retinaM = { 48: 64, 64: 96, 96: 48 }[state.retinaM]; makeRetina(state.retinaM); }
      else state.mapStyle = (state.mapStyle + 1) % 2;
      break;
    case 'KeyO': state.eyeAuto = !state.eyeAuto; break;
    case 'KeyX': state.anaTint = !state.anaTint; break;
  }
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  if (document.pointerLockElement !== canvas && e.button === 0) {
    canvas.requestPointerLock?.();
    dragging = true;
  }
});
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', e => {
  if (document.pointerLockElement === canvas || dragging) {
    mouseDX += e.movementX; mouseDY += e.movementY;
    mouseAlt = (e.buttons & 2) !== 0 || e.altKey;
  }
});
document.addEventListener('pointerlockchange', () => {
  $('hint').hidden = document.pointerLockElement === canvas;
});

function readInput() {
  const k = c => keys.has(c) ? 1 : 0;
  return {
    fwd: k('KeyW') - k('KeyS'), right: k('KeyD') - k('KeyA'), ana: k('KeyE') - k('KeyQ'),
    jump: keys.has('Space'), run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
  };
}

// ---------- ana skylines ----------
// Layers of the 4D eye's retina, by ana tilt. Index SKY_CENTER is the slice itself (computed, not drawn).
const SKY_TILTS = [-26, -16, -8, 0, 8, 16, 26];
const SKY_CENTER = 3, SKY_COLS = 320;
const SKY_COLORS = [[0.35, 0.52, 1.0], [0.42, 0.70, 1.0], [0.60, 0.86, 1.0], [1, 1, 1], [1.0, 0.82, 0.50], [1.0, 0.62, 0.32], [0.96, 0.44, 0.26]];
const SKY_ALPHA = [0.62, 0.78, 0.92, 0, 0.92, 0.78, 0.62];
const sky = { fbo: gl.createFramebuffer(), tex: null };
(function makeSky() {
  sky.tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE6);
  gl.bindTexture(gl.TEXTURE_2D, sky.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, SKY_COLS, SKY_TILTS.length, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
  gl.bindFramebuffer(gl.FRAMEBUFFER, sky.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sky.tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.activeTexture(gl.TEXTURE0);
})();
function computeSkylines(cam, sun, aspect) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, sky.fbo);
  gl.viewport(0, 0, SKY_COLS, SKY_TILTS.length);
  gl.useProgram(progSky);
  setWorld(progSky, cam, sun);
  gl.uniform1f(progSky.u('uCols'), SKY_COLS);
  gl.uniform1f(progSky.u('uFovX'), FOV * aspect);
  gl.uniform1fv(progSky.u('uTilt'), new Float32Array(SKY_TILTS.map(d => Math.tan(d * Math.PI / 180)).concat([0])));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ---------- landmarks and navigation ----------
const MARK_COLORS = { home: [0.95, 0.95, 0.95], summit: [1.0, 0.55, 0.2], deep: [0.3, 0.55, 1.0], lake: [0.35, 0.95, 0.9], antipode: [0.78, 0.5, 1.0], marker: [1.0, 0.86, 0.25] };
function findLandmarks(rand) {
  const hf = player.hf, home = player.up();
  let summit = null, deep = null, lake = null, hs = -1e9, hd = 1e9, ld = -2;
  for (let k = 0; k < 30000; k++) {
    const v = vec4.norm([rand() - 0.5, rand() - 0.5, rand() - 0.5, rand() - 0.5]);
    const h = hf.heightAt(v);
    if (h > hs) { hs = h; summit = v; }
    if (h < hd) { hd = h; deep = v; }
    const c = vec4.dot(v, home);
    if (h < -2.5 && c > ld && c < Math.cos(60 / PLANET_R)) { ld = c; lake = v; }   // nearest lake at least 60 m away
  }
  const marks = [
    { name: 'Home', n: home, col: MARK_COLORS.home },
    { name: 'Summit', n: summit, col: MARK_COLORS.summit },
    { name: 'Deep sea', n: deep, col: MARK_COLORS.deep },
    { name: 'Antipode', n: vec4.scale(home, -1), col: MARK_COLORS.antipode },
  ];
  if (lake) marks.splice(1, 0, { name: 'Lake', n: lake, col: MARK_COLORS.lake });
  return marks;
}
function dropMarker() {
  const k = state.marks.filter(m => m.dropped).length + 1;
  const m = { name: 'Marker ' + k, n: player.up(), col: MARK_COLORS.marker, dropped: true };
  if (state.marks.length >= 6) state.marks.splice(state.marks.findIndex(x => x.dropped), 1);
  state.marks.push(m);
}
// Unit horizontal direction to walk from here toward n, and the walking distance (great-circle metres).
function headingTo(n) {
  const u = player.up(), c = Math.max(-1, Math.min(1, vec4.dot(u, n)));
  const v = vec4.sub(n, vec4.scale(u, c)), l = vec4.len(v);
  return { dir: l > 1e-9 ? vec4.scale(v, 1 / l) : player.F, dist: Math.acos(c) * PLANET_R };
}
// Map coordinates (metres along forward, right, ana) of a point on the planet: the log map at the player.
function mapCoords(n) {
  const { dir, dist } = headingTo(n);
  return [vec4.dot(dir, player.F) * dist, vec4.dot(dir, player.R) * dist, vec4.dot(dir, player.A) * dist];
}

// ---------- rendering ----------
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = Math.max(1, Math.round(innerWidth * dpr)), H = Math.max(1, Math.round(innerHeight * dpr));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  if (overlay.width !== W || overlay.height !== H) { overlay.width = W; overlay.height = H; }
  ensureScene(Math.max(16, Math.round(W * dyn.scale)), Math.max(16, Math.round(H * dyn.scale)));
}

function setWorld(p, cam, sun) {
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_3D, noiseTex);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, atlasTex);
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
  gl.uniform1f(p.u('uShadows'), state.shadows ? 1 : 0);
  gl.uniform1f(p.u('uAnaTint'), state.anaTint ? 1 : 0);
}

const FOV = Math.tan(38 * Math.PI / 180);

// A camera turned by `deg` toward ana (rotation in the forward–ana plane): another layer of the 4D retina.
function tiltedCam(cam, deg) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return { ...cam, F: vec4.add(vec4.scale(cam.F, c), vec4.scale(cam.A, s)), A: vec4.sub(vec4.scale(cam.A, c), vec4.scale(cam.F, s)) };
}
function drawSlice(cam, sun, x, y, w, h, skylines = false) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
  gl.viewport(x, y, w, h);
  gl.useProgram(progSlice);
  setWorld(progSlice, cam, sun);
  gl.uniform2f(progSlice.u('uRes'), w, h);
  gl.uniform1f(progSlice.u('uFov'), FOV);
  gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, sky.tex); gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(progSlice.u('uSky'), 6);
  gl.uniform1f(progSlice.u('uSkyOn'), skylines ? 1 : 0);
  gl.uniform1f(progSlice.u('uSkyCols'), SKY_COLS);
  gl.uniform1f(progSlice.u('uSkyN'), SKY_TILTS.length);
  gl.uniform1f(progSlice.u('uSkyCenter'), SKY_CENTER);
  gl.uniform3fv(progSlice.u('uSkyCol'), new Float32Array(SKY_COLORS.flat().concat([1, 1, 1])));
  gl.uniform1fv(progSlice.u('uSkyA'), new Float32Array(SKY_ALPHA.concat([0])));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

const MAP_FOV = Math.tan(48 * Math.PI / 180);
function drawMap(cam, sun) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
  gl.viewport(0, 0, scene.w, scene.h);
  gl.useProgram(progMap);
  setWorld(progMap, cam, sun);
  gl.uniform2f(progMap.u('uRes'), scene.w, scene.h);
  gl.uniform1f(progMap.u('uFov'), MAP_FOV);
  gl.uniform4fv(progMap.u('uU0'), player.up());
  gl.uniform4fv(progMap.u('uMF'), player.F);
  gl.uniform4fv(progMap.u('uMR'), player.R);
  gl.uniform4fv(progMap.u('uMA'), player.A);
  gl.uniform1f(progMap.u('uPH'), player.hf.heightAt(player.up()));
  gl.uniform1i(progMap.u('uStyle'), state.mapStyle);
  // camera in map space: a chase camera a little behind you and slightly toward ana, or first-person
  const cp = state.mapChase ? [-22, 0, 14] : [0.05, 0, 0];
  const look = state.mapChase ? [30, 0, -14] : [1, 0, 0];
  const ln = Math.hypot(...look), CF = look.map(v => v / ln);
  const CR = [0, 1, 0], CU = [CF[1] * CR[2] - CF[2] * CR[1], CF[2] * CR[0] - CF[0] * CR[2], CF[0] * CR[1] - CF[1] * CR[0]];   // screen up = ana
  gl.uniform3fv(progMap.u('uCam'), cp);
  gl.uniform3fv(progMap.u('uCamF'), CF);
  gl.uniform3fv(progMap.u('uCamR'), CR);
  gl.uniform3fv(progMap.u('uCamU'), CU);
  state.mapCam = { pos: cp, F: CF, R: CR, U: CU };
  const mk = new Float32Array(24), mc = new Float32Array(18);
  state.marks.forEach((m, i) => { const c = mapCoords(m.n); mk.set([...c, i === state.target ? 4.5 : 3.0], 4 * i); mc.set(m.col, 3 * i); });
  gl.uniform4fv(progMap.u('uMark'), mk);
  gl.uniform3fv(progMap.u('uMarkCol'), mc);
  gl.uniform1i(progMap.u('uMarkN'), state.marks.length);
  gl.uniform1i(progMap.u('uTarget'), state.target);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // inset: the real first-person slice
  const iw = Math.round(scene.w * 0.27), ih = Math.round(iw * 0.62), m = Math.round(scene.w * 0.012);
  drawSlice(cam, sun, scene.w - iw - m, m, iw, ih);
  return { iw, ih, m };
}

function drawEye(cam, sun, t) {
  const M = state.retinaM;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, M, M);
  // 1. the 3D retina: M layers, each a fan of rays tilted further toward ana
  gl.useProgram(progRetina);
  setWorld(progRetina, cam, sun);
  gl.uniform1f(progRetina.u('uM'), M);
  gl.uniform1f(progRetina.u('uFov'), FOV);
  for (let l = 0; l < M; l++) {
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, retinaTex, 0, l);
    gl.uniform1f(progRetina.u('uLayer'), l);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  // 2. opacity from depth discontinuities
  gl.useProgram(progEdge);
  setWorld(progEdge, cam, sun);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, retinaTex);
  gl.uniform1i(progEdge.u('uRetina'), 1);
  gl.uniform1f(progEdge.u('uM'), M);
  gl.uniform1f(progEdge.u('uFov'), FOV);
  for (let l = 0; l < M; l++) {
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, volTex, 0, l);
    gl.uniform1f(progEdge.u('uLayer'), l);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, null);
  // 3. view the retina cube from outside
  gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
  gl.viewport(0, 0, scene.w, scene.h);
  gl.useProgram(progVol);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_3D, volTex);
  gl.uniform1i(progVol.u('uVol'), 2);
  const cv = eyeCamera(t);
  gl.uniform3fv(progVol.u('uCamPos'), cv.pos);
  gl.uniform3fv(progVol.u('uCamR'), cv.R);
  gl.uniform3fv(progVol.u('uCamU'), cv.U);
  gl.uniform3fv(progVol.u('uCamF'), cv.F);
  gl.uniform2f(progVol.u('uRes'), scene.w, scene.h);
  gl.uniform1f(progVol.u('uM'), M);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.activeTexture(gl.TEXTURE0);
  // inset: the ordinary slice (it is the middle layer of the retina)
  const iw = Math.round(scene.w * 0.27), ih = Math.round(iw * 0.62), m = Math.round(scene.w * 0.012);
  drawSlice(cam, sun, scene.w - iw - m, m, iw, ih);
  return { iw, ih, m, cv };
}

function eyeCamera(t) {
  const yaw = state.eyeYaw + (state.eyeAuto ? 0.55 * Math.sin(t * 0.35) : 0) + 0.45;
  const pitch = state.eyePitch;
  const F = [-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  const pos = F.map(v => -v * 3.5);
  const R = [Math.cos(yaw), 0, Math.sin(yaw)];
  const U = [F[1] * R[2] - F[2] * R[1], F[2] * R[0] - F[0] * R[2], F[0] * R[1] - F[1] * R[0]];
  return { pos, F, R, U };
}

function drawCubeOverlay(cv, inset) {
  const W = overlay.width, H = overlay.height, aspect = W / H, s = 0.52;
  const proj = p => {
    const d = [p[0] - cv.pos[0], p[1] - cv.pos[1], p[2] - cv.pos[2]];
    const z = d[0] * cv.F[0] + d[1] * cv.F[1] + d[2] * cv.F[2];
    const x = (d[0] * cv.R[0] + d[1] * cv.R[1] + d[2] * cv.R[2]) / z / (s * aspect);
    const y = (d[0] * cv.U[0] + d[1] * cv.U[1] + d[2] * cv.U[2]) / z / s;
    return [(x * 0.5 + 0.5) * W, (0.5 - y * 0.5) * H];
  };
  octx.lineWidth = Math.max(1, W / 1400);
  octx.strokeStyle = 'rgba(190, 205, 230, 0.28)';
  const c = [-1, 1];
  octx.beginPath();
  for (const a of c) for (const b of c) {
    for (const [p, q] of [[[-1, a, b], [1, a, b]], [[a, -1, b], [a, 1, b]], [[a, b, -1], [a, b, 1]]]) {
      const P = proj(p), Q = proj(q); octx.moveTo(...P); octx.lineTo(...Q);
    }
  }
  octx.stroke();
  const fs = Math.round(H / 60);
  octx.font = `500 ${fs}px "IBM Plex Mono", ui-monospace, monospace`;
  octx.fillStyle = 'rgba(214, 224, 240, 0.85)';
  const label = (p, txt) => { const P = proj(p); octx.fillText(txt, P[0] + 6, P[1] - 6); };
  label([1.08, -1, -1], 'right →');
  label([-1, 1.08, -1], 'up ↑');
  label([-1, -1, 1.12], 'ana ⟶');
  label([-1, -1, -1.12], 'kata');
  // inset frame
  const k = overlay.width / scene.w;
  octx.strokeStyle = 'rgba(214, 224, 240, 0.5)';
  octx.strokeRect(W - (inset.iw + inset.m) * k, H - (inset.ih + inset.m) * k, inset.iw * k, inset.ih * k);
  octx.fillText('slice = middle layer', W - (inset.iw + inset.m) * k, H - (inset.ih + inset.m) * k - fs * 0.5);
}

// The ground along your kata-ana line: the one direction the slice view never shows.
function drawAnaGauge() {
  const W = overlay.width, H = overlay.height, k = W / innerWidth;
  const gw = 230 * k, gh = 74 * k, x0 = 16 * k, y0 = H - gh - 18 * k;
  const up = player.up(), A = player.A, R0 = PLANET_R;
  const here = player.altitude(), span = 60, n = 49, hs = [];
  for (let i = 0; i < n; i++) {
    const d = (i / (n - 1) * 2 - 1) * span, a = d / R0;
    const dir = vec4.norm(vec4.add(vec4.scale(up, Math.cos(a)), vec4.scale(A, Math.sin(a))));
    hs.push(player.hf.heightAt(dir) - SEA);
  }
  const lo = Math.min(here - 8, ...hs, -2), hi = Math.max(here + 8, ...hs, 4);
  const X = i => x0 + i / (n - 1) * gw, Y = h => y0 + gh - (h - lo) / (hi - lo) * gh;
  octx.fillStyle = 'rgba(11, 14, 20, 0.62)';
  octx.fillRect(x0 - 8 * k, y0 - 22 * k, gw + 16 * k, gh + 34 * k);
  octx.fillStyle = 'rgba(70, 140, 190, 0.35)';                       // sea
  if (lo < 0) octx.fillRect(x0, Y(Math.min(0, hi)), gw, y0 + gh - Y(Math.min(0, hi)));
  octx.beginPath(); octx.moveTo(X(0), y0 + gh);
  hs.forEach((h, i) => octx.lineTo(X(i), Y(h)));
  octx.lineTo(X(n - 1), y0 + gh); octx.closePath();
  octx.fillStyle = 'rgba(120, 160, 90, 0.55)'; octx.fill();
  octx.fillStyle = 'rgba(236, 240, 246, 0.95)';
  octx.beginPath(); octx.arc(X((n - 1) / 2), Y(here), 3.2 * k, 0, 7); octx.fill();
  octx.font = `500 ${11 * k}px "IBM Plex Mono", ui-monospace, monospace`;
  octx.fillStyle = 'rgba(141, 154, 176, 0.95)';
  octx.fillText('kata', x0, y0 - 8 * k);
  octx.fillText('ground across ana', x0 + gw / 2 - 58 * k, y0 - 8 * k);
  octx.fillText('ana', x0 + gw - 22 * k, y0 - 8 * k);
}

function present() {
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

const TRIP = 25;   // degrees of ana tilt for the side panels
function drawTriptych(cam, sun) {
  const W = scene.w, H = scene.h, side = Math.round(W * 0.25), mid = W - 2 * side;
  drawSlice(tiltedCam(cam, -TRIP), sun, 0, 0, side, H);
  drawSlice(cam, sun, side, 0, mid, H, state.skylines);
  drawSlice(tiltedCam(cam, TRIP), sun, side + mid, 0, side, H);
  return { side, mid };
}
function drawTriptychOverlay(cam, t) {
  const W = overlay.width, H = overlay.height, k = W / innerWidth, s2 = W / scene.w;
  const side = t.side * s2, mid = t.mid * s2;
  octx.fillStyle = 'rgba(11, 14, 20, 0.85)';
  octx.fillRect(side - 1.5 * k, 0, 3 * k, H); octx.fillRect(side + mid - 1.5 * k, 0, 3 * k, H);
  octx.font = `600 ${12 * k}px "IBM Plex Mono", ui-monospace, monospace`;
  octx.fillStyle = 'rgba(110, 175, 255, 0.95)'; octx.fillText(`← turned ${TRIP}° toward kata`, 12 * k, H - 16 * k);
  octx.fillStyle = 'rgba(236, 240, 246, 0.95)'; octx.fillText('your slice', side + 12 * k, H - 16 * k);
  octx.fillStyle = 'rgba(255, 170, 90, 0.95)'; octx.fillText(`turned ${TRIP}° toward ana →`, side + mid + 12 * k, H - 16 * k);
  drawSliceMarks(cam, side, mid);
  drawSliceMarks(tiltedCam(cam, -TRIP), 0, side);
  drawSliceMarks(tiltedCam(cam, TRIP), side + mid, side);
}
function drawSkyLegend() {
  if (!state.skylines) return;
  const W = overlay.width, k = W / innerWidth;
  const x0 = W - 252 * k, y0 = 22 * k;
  octx.fillStyle = 'rgba(11, 14, 20, 0.62)'; octx.fillRect(x0 - 10 * k, y0 - 16 * k, 246 * k, 74 * k);
  octx.font = `500 ${11 * k}px "IBM Plex Mono", ui-monospace, monospace`;
  octx.fillStyle = 'rgba(141, 154, 176, 0.95)'; octx.fillText('skylines if you turned… (K hides)', x0, y0);
  const row = (y, cols, label) => { cols.forEach((c, i) => { octx.fillStyle = `rgb(${c.map(v => Math.round(v * 255)).join(',')})`; octx.fillRect(x0 + i * 22 * k, y, 18 * k, 4 * k); });
    octx.fillStyle = 'rgba(214, 224, 240, 0.9)'; octx.fillText(label, x0 + 74 * k, y + 5 * k); };
  row(y0 + 16 * k, [SKY_COLORS[4], SKY_COLORS[5], SKY_COLORS[6]], 'toward ana 8° 16° 26°');
  row(y0 + 34 * k, [SKY_COLORS[2], SKY_COLORS[1], SKY_COLORS[0]], 'toward kata 8° 16° 26°');
}

const MAP_STYLES = ['floor + shells', 'stacked floors'];
function drawMapOverlay(inset) {
  const W = overlay.width, H = overlay.height, k = W / innerWidth, aspect = W / H;
  octx.font = `500 ${12 * k}px "IBM Plex Mono", ui-monospace, monospace`;
  octx.textAlign = 'center';
  const mc = state.mapCam;
  state.marks.forEach((mk, i) => {
    const c0 = mapCoords(mk.n), dist = Math.hypot(...c0);
    if (dist < 8) return;
    const d = c0.map((v, j) => v - mc.pos[j]);
    const z = d[0] * mc.F[0] + d[1] * mc.F[1] + d[2] * mc.F[2];
    if (z <= 0.5) return;
    const x = (d[0] * mc.R[0] + d[1] * mc.R[1] + d[2] * mc.R[2]) / z / (MAP_FOV * aspect);
    const y = (d[0] * mc.U[0] + d[1] * mc.U[1] + d[2] * mc.U[2]) / z / MAP_FOV;
    if (Math.abs(x) > 1.05 || Math.abs(y) > 1.05) return;
    const X = (x * 0.5 + 0.5) * W, Y = (0.5 - y * 0.5) * H;
    octx.fillStyle = i === state.target ? 'rgba(255, 236, 170, 0.98)' : 'rgba(225, 232, 244, 0.85)';
    octx.fillText(`${mk.name} · ${Math.round(dist)} m`, X, Y - 16 * k);
  });
  octx.textAlign = 'left';
  // legend
  const x0 = 16 * k, y0 = H - 128 * k, bw = 220 * k;
  octx.fillStyle = 'rgba(11, 14, 20, 0.66)'; octx.fillRect(x0 - 8 * k, y0 - 20 * k, bw + 16 * k, 124 * k);
  const g = octx.createLinearGradient(x0, 0, x0 + bw, 0);
  [[0, '#dccc94'], [0.15, '#4d9e4d'], [0.45, '#9ea84d'], [0.7, '#9e734d'], [1, '#f5f5ff']].forEach(([o, c]) => g.addColorStop(o, c));
  octx.fillStyle = g; octx.fillRect(x0, y0 + 6 * k, bw, 8 * k);
  octx.fillStyle = 'rgba(141, 154, 176, 0.95)';
  octx.fillText(`MAP · ${MAP_STYLES[state.mapStyle]}  (M)`, x0, y0 - 4 * k);
  octx.fillText('0 m', x0, y0 + 30 * k); octx.fillText('elevation', x0 + bw / 2 - 30 * k, y0 + 30 * k); octx.fillText('32 m', x0 + bw - 28 * k, y0 + 30 * k);
  octx.fillStyle = 'rgba(25, 90, 160, 0.9)'; octx.fillRect(x0, y0 + 42 * k, 14 * k, 10 * k);
  octx.fillStyle = 'rgba(141, 154, 176, 0.95)'; octx.fillText('sea', x0 + 20 * k, y0 + 51 * k);
  octx.fillStyle = 'rgba(190, 240, 255, 0.9)'; octx.fillRect(x0 + 70 * k, y0 + 42 * k, 14 * k, 10 * k);
  octx.fillStyle = 'rgba(141, 154, 176, 0.95)'; octx.fillText('floor = your slice', x0 + 90 * k, y0 + 51 * k);
  octx.fillText(state.mapStyle === 0 ? 'shells: coast · 10 m hills · 22 m peaks' : 'a floor every 18 m of ana (Q/E)', x0, y0 + 72 * k);
  octx.fillText('up on screen = ana  ·  R: camera', x0, y0 + 88 * k);
  // inset frame
  const s2 = W / scene.w;
  octx.strokeStyle = 'rgba(214, 224, 240, 0.5)';
  octx.strokeRect(W - (inset.iw + inset.m) * s2, H - (inset.ih + inset.m) * s2, inset.iw * s2, inset.ih * s2);
  octx.fillText('what you actually see (slice)', W - (inset.iw + inset.m) * s2, H - (inset.ih + inset.m) * s2 - 8 * k);
}
function drawSliceMarks(cam, x0 = 0, w0 = overlay.width) {
  state.marks.forEach((mk, i) => { if (i !== state.target) drawSliceTarget(cam, mk, false, x0, w0); });
  if (state.marks[state.target]) drawSliceTarget(cam, state.marks[state.target], true, x0, w0);
}
function drawSliceTarget(cam, mk, isTarget, x0 = 0, w0 = overlay.width) {
  const { dir, dist } = headingTo(mk.n);
  if (dist < 6) return;
  const W = w0, H = overlay.height, k = overlay.width / innerWidth, aspect = W / H;
  const f = vec4.dot(dir, cam.F), r = vec4.dot(dir, cam.R), u = vec4.dot(dir, cam.U);
  const Fh = vec4.norm(vec4.sub(cam.F, vec4.scale(cam.up, vec4.dot(cam.F, cam.up))));   // this view's level forward
  const ana = Math.atan2(vec4.dot(dir, cam.A), Math.hypot(vec4.dot(dir, Fh), vec4.dot(dir, cam.R))) * 180 / Math.PI;
  let x = f > 0 ? (r / f) / (FOV * aspect) : (r >= 0 ? 2 : -2), y = f > 0 ? (u / f) / FOV : 0;
  const off = Math.abs(x) > 0.95 || Math.abs(y) > 0.95;
  if (off && !isTarget) return;
  x = Math.max(-0.95, Math.min(0.95, x)); y = Math.max(-0.9, Math.min(0.9, y));
  const X = x0 + (x * 0.5 + 0.5) * W, Y = (0.5 - y * 0.5) * H;
  const rgb = mk.col.map(c => Math.round(c * 255)).join(',');
  octx.strokeStyle = `rgba(${rgb},${isTarget ? 1 : 0.7})`;
  octx.lineWidth = (isTarget ? 2 : 1.4) * k;
  octx.beginPath(); octx.arc(X, Y, (isTarget ? 9 : 6) * k, 0, 7); octx.stroke();
  // ana tick: how far the landmark leans out of your slice (orange up = toward ana, blue down = toward kata)
  const tick = Math.max(-40, Math.min(40, ana)) * 0.9 * k;
  octx.strokeStyle = ana >= 0 ? 'rgba(255, 170, 90, 0.95)' : 'rgba(110, 175, 255, 0.95)';
  octx.lineWidth = 3 * k;
  octx.beginPath(); octx.moveTo(X, Y - (isTarget ? 11 : 8) * k); octx.lineTo(X, Y - (isTarget ? 11 : 8) * k - Math.abs(tick)); octx.stroke();
  if (!isTarget) return;
  octx.font = `500 ${12 * k}px "IBM Plex Mono", ui-monospace, monospace`;
  octx.fillStyle = 'rgba(236, 240, 246, 0.95)'; octx.textAlign = x > 0.6 ? 'right' : 'left';
  const dx = x > 0.6 ? -14 * k : 14 * k;
  octx.fillText(`${mk.name} ${Math.round(dist)} m`, X + dx, Y - 2 * k);
  octx.fillStyle = 'rgba(141, 154, 176, 0.95)';
  octx.fillText(`${Math.abs(ana) < 2 ? 'in your slice' : Math.round(Math.abs(ana)) + '° toward ' + (ana > 0 ? 'ana' : 'kata')}${off ? ' · off screen' : ''}`, X + dx, Y + 13 * k);
  octx.textAlign = 'left';
}

// ---------- HUD ----------
const fmt = (x, d = 0) => x.toFixed(d);
let hudTimer = 0, fpsAcc = 0, fpsN = 0;
function updateHUD(dt, cam, sun) {
  fpsAcc += dt; fpsN++;
  hudTimer += dt;
  if (hudTimer < 0.15) return;
  const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; hudTimer = 0;
  const h = player.hopf();
  const el = Math.asin(Math.max(-1, Math.min(1, vec4.dot(sun, cam.up)))) * 180 / Math.PI;
  // where the sun is relative to your body: how far it leans into ana, which the slice can't show
  const sa = vec4.dot(sun, player.A), sf = vec4.dot(sun, player.F), sr = vec4.dot(sun, player.R);
  const anaLean = Math.atan2(sa, Math.hypot(sf, sr)) * 180 / Math.PI;
  const ahead = Math.atan2(sr, sf) * 180 / Math.PI;
  $('mode').textContent = { slice: 'Slice view', triptych: 'Triptych: kata · slice · ana', map: 'Map view', eye: '4D eye (cube)' }[state.view];
  const mk = state.marks[state.target];
  if (mk) { const { dist } = headingTo(mk.n); $('target').textContent = `→ ${mk.name} · ${Math.round(dist)} m · B next · F face · N drop marker`; }
  $('where').textContent = `η ${fmt(h.eta)}°  ξ₁ ${fmt(h.xi1)}°  ξ₂ ${fmt(h.xi2)}°`;
  $('alt').textContent = player.swimming ? 'swimming' : `${fmt(player.altitude(), 1)} m above sea`;
  $('sun').textContent = el > -2
    ? `sun ${fmt(el)}° up · ${fmt(Math.abs(anaLean))}° toward ${anaLean >= 0 ? 'ana' : 'kata'} · ${fmt(Math.abs(ahead))}° ${ahead >= 0 ? 'right' : 'left'}`
    : `night · sun ${fmt(-el)}° below`;
  $('clock').textContent = `${state.paused ? 'paused' : '×' + (state.timeScale >= 1 ? state.timeScale : state.timeScale.toFixed(3))} · ${state.rotation} rotation`;
  $('fps').textContent = `${fmt(fps)} fps · res ${fmt(100 * scene.w / canvas.width)}%${dyn.auto ? ' auto' : ''}`;
}

// ---------- main loop ----------
let last = performance.now(), simT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; simT += dt;

  // look
  if (state.view === 'map') {
    // in the map your three walking directions are all on screen: x turns right, y turns toward ana
    if (mouseAlt) player.rotate('RA', mouseDX * SENS);
    else { player.rotate('FR', mouseDX * SENS); player.rotate('FA', -mouseDY * SENS); }
  } else if (mouseAlt) {
    player.rotate('FA', mouseDX * SENS);
    player.rotate('RA', -mouseDY * SENS);
  } else {
    player.rotate('FR', mouseDX * SENS);
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - mouseDY * SENS));
  }
  mouseDX = mouseDY = 0;
  const turnKeys = (keys.has('KeyC') ? 1 : 0) - (keys.has('KeyZ') ? 1 : 0);
  if (turnKeys) player.rotate('FA', turnKeys * 1.2 * dt);
  if (state.view === 'eye') {
    if (keys.has('KeyJ')) state.eyeYaw -= dt; if (keys.has('KeyL')) state.eyeYaw += dt;
    if (keys.has('KeyI')) state.eyePitch = Math.min(1.2, state.eyePitch + dt);
    if (keys.has('KeyK')) state.eyePitch = Math.max(-1.2, state.eyePitch - dt);
  }

  if (state.facing && state.marks[state.target]) {
    const done = player.turnToward(headingTo(state.marks[state.target].n).dir, 2.6 * dt);
    if (done) state.facing = false;
  }
  const input = readInput();
  const sub = 3;
  for (let i = 0; i < sub; i++) player.update(dt / sub, input);
  if (!state.paused) state.time += dt * state.timeScale;

  updateDyn(dt);
  resize();
  const cam = player.camera(), sun = sunDir(state.time);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  if (state.view === 'slice' || state.view === 'triptych') computeSkylines(cam, sun, state.view === 'slice' ? scene.w / scene.h : (scene.w * 0.5) / scene.h);
  if (state.view === 'slice') { drawSlice(cam, sun, 0, 0, scene.w, scene.h, state.skylines); drawAnaGauge(); drawSliceMarks(cam); drawSkyLegend(); }
  else if (state.view === 'triptych') { const t = drawTriptych(cam, sun); drawTriptychOverlay(cam, t); }
  else if (state.view === 'map') { const r = drawMap(cam, sun); drawMapOverlay(r); }
  else { const r = drawEye(cam, sun, simT); drawCubeOverlay(r.cv, r); }
  present();
  updateHUD(dt, cam, sun);
  requestAnimationFrame(frame);
}

// ---------- boot ----------
(async function boot() {
  try {
    const data = prefilter(await buildAtlas(), N);
    atlasTex = tex3D(N, N, 8 * N, gl.R16F, gl.RED, gl.FLOAT, gl.LINEAR, data);
    noiseTex = makeNoise();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, atlasTex);
    gl.bindVertexArray(vao);
    makeRetina(state.retinaM);
    player = new Player(new HeightField(data, N));
    let seed = 20261006;
    const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
    player.spawn(rand);
    state.marks = findLandmarks(rand);
    state.target = 1;
    // start in the morning: sun about 20° up and rising
    const up = player.up();
    for (let t = 0; t < 20000; t += 0.5) {
      const e0 = vec4.dot(sunDir(t), up), e1 = vec4.dot(sunDir(t + 0.5), up);
      if (e0 > 0.3 && e0 < 0.38 && e1 > e0) { state.time = t; break; }
    }
    $('loading').hidden = true;
    $('hud').hidden = false;
    $('hint').hidden = false;
    if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches)
      $('hint').textContent = 'Hoop needs a keyboard and mouse to explore.';
    window.__hoop = { state, player, keys, sunDir, dyn, mapCoords, headingTo };   // handle for debugging from the console
    requestAnimationFrame(t => { last = t; frame(t); });
  } catch (e) {
    fail(e.message);
  }
})();
