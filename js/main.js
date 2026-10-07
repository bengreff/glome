import { VERT, SLICE_FRAG, RETINA_FRAG, EDGE_FRAG, VOLUME_FRAG, UPSCALE_FRAG, RADAR_FRAG, BLIT_FRAG } from './shaders.js';
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
const progSlice = program(SLICE_FRAG), progRetina = program(RETINA_FRAG), progEdge = program(EDGE_FRAG), progVol = program(VOLUME_FRAG), progUp = program(UPSCALE_FRAG), progRadar = program(RADAR_FRAG), progBlit = program(BLIT_FRAG);
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
  radar: { big: false, range: 90, compass: false },
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
      if (e.shiftKey) state.view = state.view === 'eye' ? 'slice' : 'eye';
      else state.view = state.view === 'slice' ? 'triptych' : 'slice';
      break;
    case 'Tab': state.radar.big = !state.radar.big; break;
    case 'KeyR': setAnchor('pin'); break;
    case 'Minus': state.radar.range = RANGES[Math.max(0, RANGES.indexOf(state.radar.range) - 1)]; break;
    case 'Equal': state.radar.range = RANGES[Math.min(RANGES.length - 1, RANGES.indexOf(state.radar.range) + 1)]; break;
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
      else state.radar.compass = !state.radar.compass;
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

// ---------- radar ----------
// The ground of a 4D world is three-dimensional, so its minimap is a ball (see RADAR_FRAG). The disc through
// the middle is the ground your slice view shows; everything above it lies toward ana, below toward kata.
// The last range shows the whole planet as two balls, its near and far halves (see drawPlanetOverlay).
const RANGES = [45, 90, 180, 'planet'];
const RADAR_FOV = 0.4;
const HALF = Math.PI * PLANET_R / 2;   // a quarter lap (393 m): the radius of each half of the planet
const radar = { fbo: gl.createFramebuffer(), tex: null, w: 0, h: 0, trail: [], peaks: [], peaksAt: null, peaksRange: 0, summits: null, anchor: null };
function ensureRadar(w, h) {
  if (radar.tex && radar.w === w && radar.h === h) return;
  if (radar.tex) gl.deleteTexture(radar.tex);
  radar.tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE7);
  gl.bindTexture(gl.TEXTURE_2D, radar.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
  gl.bindFramebuffer(gl.FRAMEBUFFER, radar.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, radar.tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.activeTexture(gl.TEXTURE0);
  radar.w = w; radar.h = h;
}

// Unlike a 2-sphere, the 3-sphere can carry a compass with no poles: multiplying your position (as a unit
// quaternion) by i, j and k gives three perpendicular directions along the ground, everywhere at once.
// Walking straight keeps your compass heading fixed but slowly rolls the other two needles around it.
function compassAt(p) {
  const [a, b, c, d] = p;
  return [[-b, a, d, -c], [-c, -d, a, b], [-d, c, -b, a]];
}
const radarBasis = () => state.radar.compass ? compassAt(player.up()) : [player.F, player.R, player.A];

// Geodesic normal coordinates around you: ball coordinates (m) <-> points on the unit 3-sphere.
function expMap(m, B, u) {
  const r = Math.hypot(m[0], m[1], m[2]);
  if (r < 1e-9) return u;
  const a = r / PLANET_R;
  let D = [0, 0, 0, 0];
  for (let i = 0; i < 3; i++) D = vec4.add(D, vec4.scale(B[i], m[i] / r));
  return vec4.add(vec4.scale(u, Math.cos(a)), vec4.scale(D, Math.sin(a)));
}
function logMap(n, B = radarBasis(), u = player.up()) {
  const c = Math.max(-1, Math.min(1, vec4.dot(u, n)));
  const v = vec4.sub(n, vec4.scale(u, c)), l = vec4.len(v);
  if (l < 1e-9) return [0, 0, 0];
  const k = Math.acos(c) * PLANET_R / l;
  return B.map(b => vec4.dot(v, b) * k);
}

function recordTrail() {
  const u = player.up(), t = radar.trail;
  if (t.length && vec4.dot(t[t.length - 1].n, u) > Math.cos(1.5 / PLANET_R)) return;
  t.push({ n: u, h: player.hf.heightAt(u) });
  if (t.length > 1200) t.shift();
}

// Summits within reach: local maxima of the height on a coarse 3D grid, then climbed to the top.
function findPeaks(RB) {
  const u = player.up(), B = [player.F, player.R, player.A], hf = player.hf;
  const G = 9, g = RB * 1.25 / G, n = 2 * G + 1, H = new Float32Array(n * n * n).fill(-Infinity);
  const at = (i, j, k) => H[(i * n + j) * n + k];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
    const m = [(i - G) * g, (j - G) * g, (k - G) * g];
    if (Math.hypot(...m) <= RB * 1.3) H[(i * n + j) * n + k] = hf.heightAt(expMap(m, B, u));
  }
  const found = [];
  for (let i = 1; i < n - 1; i++) for (let j = 1; j < n - 1; j++) for (let k = 1; k < n - 1; k++) {
    const h = at(i, j, k);
    if (!(h > 10)) continue;
    let top = true;
    for (let di = -1; di <= 1 && top; di++) for (let dj = -1; dj <= 1 && top; dj++) for (let dk = -1; dk <= 1; dk++)
      if (at(i + di, j + dj, k + dk) > h) { top = false; break; }
    if (!top) continue;
    let m = [(i - G) * g, (j - G) * g, (k - G) * g], best = h, step = g / 2;
    for (let it = 0; it < 16 && step > 0.2; it++) {
      let moved = false;
      for (let ax = 0; ax < 3; ax++) for (const sg of [-1, 1]) {
        const m2 = m.slice(); m2[ax] += sg * step;
        const h2 = hf.heightAt(expMap(m2, B, u));
        if (h2 > best) { best = h2; m = m2; moved = true; }
      }
      if (!moved) step *= 0.5;
    }
    found.push({ n: expMap(m, B, u), h: best });
  }
  found.sort((a, b) => b.h - a.h);
  const out = [];
  for (const p of found) if (!out.some(q => vec4.dot(q.n, p.n) > Math.cos(2 * g / PLANET_R))) out.push(p);
  return out.slice(0, 5);
}
function updatePeaks() {
  const RB = state.radar.range, u = player.up();
  if (radar.peaksAt && radar.peaksRange === RB && vec4.dot(radar.peaksAt, u) > Math.cos(RB / 5 / PLANET_R)) return;
  radar.peaks = findPeaks(RB); radar.peaksAt = u; radar.peaksRange = RB;
}

// The planet's highest summits, found once: climb from many random high points, keep the distinct tops.
function findSummits() {
  const hf = player.hf, found = [];
  let seed = 7;
  const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  const gauss = () => rand() + rand() + rand() + rand() - 2;
  for (let k = 0, tries = 0; k < 500 && tries < 30000; tries++) {
    let n = vec4.norm([gauss(), gauss(), gauss(), gauss()]), h = hf.heightAt(n);
    if (h < 14) continue;
    k++;
    const B = [];                                         // ground directions at the start point
    for (const e of [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) {
      let v = vec4.sub(e, vec4.scale(n, vec4.dot(e, n)));
      for (const b of B) v = vec4.sub(v, vec4.scale(b, vec4.dot(v, b)));
      if (vec4.len(v) > 0.3 && B.length < 3) B.push(vec4.norm(v));
    }
    let step = 12 / PLANET_R;
    for (let it = 0; it < 40 && step > 0.3 / PLANET_R; it++) {
      let moved = false;
      for (const b of B) for (const sg of [-1, 1]) {
        const n2 = vec4.norm(vec4.add(n, vec4.scale(b, sg * step))), h2 = hf.heightAt(n2);
        if (h2 > h) { h = h2; n = n2; moved = true; }
      }
      if (!moved) step *= 0.5;
    }
    if (h > 24) found.push({ n, h });
  }
  found.sort((a, b) => b.h - a.h);
  const out = [];
  for (const p of found) if (!out.some(q => vec4.dot(q.n, p.n) > Math.cos(50 / PLANET_R))) out.push(p);
  return out.slice(0, 16);
}
// The planet map is fixed to a pin (your start, or wherever you press R) so you can watch yourself move.
function setAnchor(label) { radar.anchor = { n: player.up(), B: [player.F, player.R, player.A], label }; }

const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]); return a.map(v => v / l); };
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function radarCamera(RB, t, yaw0 = 0) {
  const yaw = yaw0 + (state.eyeAuto ? 0.26 * Math.sin(t * 2 * Math.PI / 16) : 0), el = 0.42, D = RB * 3.0;
  const pos = [-Math.cos(el) * Math.cos(yaw) * D, -Math.cos(el) * Math.sin(yaw) * D, Math.sin(el) * D];
  const F = pos.map(v => -v / D), R = norm3(cross3([0, 0, 1], F)), U = cross3(F, R);
  return { pos, F, R, U };
}
function radarRect() {
  const W = overlay.width, H = overlay.height, k = W / innerWidth, m = Math.round(10 * k);
  const n = state.radar.range === 'planet' ? 2 : 1, big = state.radar.big;
  const s = Math.round(n === 2 ? (big ? Math.min(H * 0.8, W * 0.47) : Math.min(H * 0.36, W * 0.22))
                               : (big ? Math.min(H * 0.92, W * 0.6) : Math.min(H * 0.42, W * 0.32)));
  return { x: W - n * s - m, y: big && n === 1 ? Math.round((H - s) / 2) : H - s - m, s, w: n * s };
}
function renderBall(vx, S, o) {
  const p = progRadar, cv = o.cv;
  gl.viewport(vx, 0, S, S);
  gl.uniform2f(p.u('uRes'), S, S);
  gl.uniform4fv(p.u('uU0'), o.center);
  gl.uniform4fv(p.u('uB1'), o.B[0]);
  gl.uniform4fv(p.u('uB2'), o.B[1]);
  gl.uniform4fv(p.u('uB3'), o.B[2]);
  gl.uniform1f(p.u('uRB'), o.RB);
  gl.uniform3fv(p.u('uCam'), cv.pos);
  gl.uniform3fv(p.u('uCamF'), cv.F);
  gl.uniform3fv(p.u('uCamR'), cv.R);
  gl.uniform3fv(p.u('uCamU'), cv.U);
  gl.uniform3fv(p.u('uLight'), norm3([0, 1, 2].map(i => 0.8 * cv.U[i] - 0.5 * cv.R[i] - 0.4 * cv.F[i])));
  gl.uniform3fv(p.u('uDiscN'), o.disc);
  gl.uniform3fv(p.u('uFwd'), o.fwd);
  gl.uniform3fv(p.u('uRight'), o.right);
  gl.uniform1f(p.u('uYou'), o.you ? 1 : 0);
  gl.uniform1i(p.u('uSteps'), o.steps);
  gl.uniform3fv(p.u('uShellL'), o.shellL);
  gl.uniform3fv(p.u('uShellA'), o.shellA);
  gl.uniform1f(p.u('uWater'), o.water);
  gl.uniform1f(p.u('uLand'), o.land || 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
function drawRadar(cam, sun, t) {
  const rect = radarRect(), planet = state.radar.range === 'planet';
  const S = Math.max(96, Math.min(planet ? 440 : 640, Math.round(rect.s * Math.min(0.7, Math.max(0.4, dyn.scale)))));
  ensureRadar(planet ? 2 * S : S, S);
  gl.bindFramebuffer(gl.FRAMEBUFFER, radar.fbo);
  gl.useProgram(progRadar);
  setWorld(progRadar, cam, sun);
  gl.uniform1f(progRadar.u('uFov'), RADAR_FOV);
  gl.uniform1f(progRadar.u('uFovX'), FOV * scene.w / scene.h);
  if (planet) {
    // Two balls, like a two-hemisphere world map: the half of the planet within a quarter lap of the pin, and
    // the half around the pin's antipode. The far ball uses the negated axes (the 4D rotation x -> -x), so
    // leaving either ball through any point brings you into the other through the opposite point.
    if (!radar.summits) radar.summits = findSummits();
    const a = radar.anchor, cv = radarCamera(HALF, t, 0.55);
    const balls = [{ center: a.n, B: a.B }, { center: vec4.scale(a.n, -1), B: a.B.map(b => vec4.scale(b, -1)) }];
    const look = { RB: HALF, cv, you: false, disc: [0, 0, 0], fwd: [1, 0, 0], right: [0, 1, 0], steps: 150, shellL: [0.5, 12, 27], shellA: [0, 0, 0.9], water: 0.1, land: 0.0024 };
    balls.forEach((b, i) => renderBall(i * S, S, { ...look, ...b }));
    return { rect, cv, planet: true, balls };
  }
  updatePeaks();
  const RB = state.radar.range, B = radarBasis(), cv = radarCamera(RB, t);
  const inB = v => B.map(b => vec4.dot(v, b));
  const discN = inB(player.A);
  renderBall(0, S, { center: player.up(), B, RB, cv, you: true, disc: discN, fwd: inB(player.F), right: inB(player.R), steps: 96, shellL: [0.5, 12, 24], shellA: [0.13, 0.2, 0.72], water: 1 });
  return { rect, cv, B, RB, discN };
}
function blitRadar(r) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(r.rect.x, canvas.height - r.rect.y - r.rect.s, r.rect.w, r.rect.s);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(progBlit);
  gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, radar.tex);
  gl.uniform1i(progBlit.u('uTex'), 6);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.disable(gl.BLEND);
  gl.activeTexture(gl.TEXTURE0);
}

const hypsCSS = h => h < 0 ? [70, 140, 220] : h < 4 ? [220, 205, 150] : h < 12 ? [110, 190, 100] : h < 24 ? [200, 175, 90] : h < 30 ? [215, 160, 120] : [245, 245, 255];
function drawRadarOverlay(r, sun) {
  const { rect, cv, B, RB, discN } = r, k = overlay.width / innerWidth;
  const u = player.up();
  const proj = m => {
    const d = [m[0] - cv.pos[0], m[1] - cv.pos[1], m[2] - cv.pos[2]], z = dot3(d, cv.F);
    return [rect.x + (dot3(d, cv.R) / z / RADAR_FOV * 0.5 + 0.5) * rect.s, rect.y + (0.5 - dot3(d, cv.U) / z / RADAR_FOV * 0.5) * rect.s];
  };
  const foot = m => { const a = dot3(m, discN); return [m[0] - a * discN[0], m[1] - a * discN[1], m[2] - a * discN[2]]; };
  octx.save();
  octx.lineCap = 'round'; octx.lineJoin = 'round';

  // your trail: where you have walked, in all three ground directions, coloured by height
  const pts = radar.trail.map(p => ({ m: logMap(p.n, B, u), h: p.h }));
  octx.lineWidth = 1 * k; octx.strokeStyle = 'rgba(220, 235, 255, 0.28)';
  octx.beginPath();
  pts.forEach((p, i) => { if (i % 4 || Math.hypot(...p.m) > RB) return; const a = proj(p.m), b = proj(foot(p.m)); octx.moveTo(...a); octx.lineTo(...b); });
  octx.stroke();
  octx.lineWidth = 2.2 * k;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (Math.hypot(...a.m) > RB || Math.hypot(...b.m) > RB) continue;
    const c = hypsCSS(b.h);
    octx.strokeStyle = `rgba(${c.join(',')}, ${0.35 + 0.6 * i / pts.length})`;
    octx.beginPath(); octx.moveTo(...proj(a.m)); octx.lineTo(...proj(b.m)); octx.stroke();
  }

  // summits, each on a stalk down to your slice's ground (above = toward ana, below = toward kata)
  octx.font = `500 ${10.5 * k}px "IBM Plex Mono", ui-monospace, monospace`;
  octx.textAlign = 'left';
  for (const p of radar.peaks) {
    const m = logMap(p.n, B, u);
    if (Math.hypot(...m) > RB * 0.98) continue;
    const off = dot3(m, discN), P = proj(m), Q = proj(foot(m)), inSlice = Math.abs(off) < 4;
    octx.strokeStyle = off >= 0 ? 'rgba(255, 190, 120, 0.8)' : 'rgba(140, 190, 255, 0.8)';
    octx.lineWidth = 1.4 * k;
    octx.beginPath(); octx.moveTo(...Q); octx.lineTo(...P); octx.stroke();
    octx.beginPath(); octx.ellipse(Q[0], Q[1], 3 * k, 1.6 * k, 0, 0, 7); octx.stroke();
    const s = 5.5 * k;
    octx.fillStyle = `rgb(${hypsCSS(p.h).join(',')})`;
    octx.strokeStyle = inSlice ? '#fff' : 'rgba(10, 12, 18, 0.9)';
    octx.lineWidth = (inSlice ? 2 : 1) * k;
    octx.beginPath(); octx.moveTo(P[0], P[1] - s); octx.lineTo(P[0] + s * 0.9, P[1] + s * 0.6); octx.lineTo(P[0] - s * 0.9, P[1] + s * 0.6); octx.closePath(); octx.fill(); octx.stroke();
    octx.fillStyle = 'rgba(236, 240, 246, 0.92)';
    octx.fillText(`${Math.round(p.h)} m`, P[0] + 8 * k, P[1] + 3 * k);
  }

  // the rim: ana and kata, the sun, and the compass
  const rimLabel = (dir, txt, color, size = 10.5, scale = 1.1) => {
    const l = Math.hypot(...dir); if (l < 1e-6) return;
    const m = dir.map(v => v / l * RB * scale), P = proj(m);
    const front = dot3(norm3(m), cv.F) < 0.25;
    octx.font = `${front ? 600 : 500} ${size * k}px "IBM Plex Mono", ui-monospace, monospace`;
    octx.fillStyle = color; octx.globalAlpha = front ? 1 : 0.5;
    octx.textAlign = 'center'; octx.fillText(txt, P[0], P[1] + 4 * k); octx.globalAlpha = 1;
  };
  rimLabel(discN, 'ana', 'rgba(255, 180, 110, 0.95)', 11, 1.13);
  rimLabel(discN.map(v => -v), 'kata', 'rgba(130, 185, 255, 0.95)', 11, 1.13);
  const C = compassAt(u), inB = v => B.map(b => vec4.dot(v, b));
  [['i', '#ff8a7a'], ['j', '#9be88f'], ['k', '#8fb8ff']].forEach(([n, col], i) => {
    rimLabel(inB(C[i]), n, col, 10.5, 1.05);
  });
  const su = vec4.dot(sun, u), sh = vec4.sub(sun, vec4.scale(u, su));
  if (vec4.len(sh) > 1e-3) {
    const d = inB(sh), l = Math.hypot(...d), P = proj(d.map(v => v / l * RB * 1.2));
    const el = Math.asin(Math.max(-1, Math.min(1, su))) * 180 / Math.PI;
    octx.fillStyle = el > 0 ? 'rgba(255, 220, 120, 0.95)' : 'rgba(150, 160, 190, 0.6)';
    octx.beginPath(); octx.arc(P[0], P[1], (el > 0 ? 5 : 3.5) * k, 0, 7); octx.fill();
    octx.font = `500 ${10 * k}px "IBM Plex Mono", ui-monospace, monospace`; octx.textAlign = 'center';
    octx.fillText(`sun ${Math.round(el)}°`, P[0], P[1] - 8 * k);
  }

  // caption
  octx.textAlign = 'left';
  octx.font = `500 ${10.5 * k}px "IBM Plex Mono", ui-monospace, monospace`;
  octx.fillStyle = 'rgba(160, 172, 194, 0.95)';
  octx.fillText(`RADAR ${RB} m · ${state.radar.compass ? 'compass-up' : 'heading-up'} · = zoom out`, rect.x + 8 * k, rect.y + 14 * k);
  if (state.radar.big) {
    ['disc: the ground your slice shows', 'shells: coast · 12 m · 24 m', '▲ summits · line: your trail', '', 'Tab smaller · −/= range', 'M heading/compass-up · O rock']
      .forEach((txt, i) => octx.fillText(txt, rect.x + 8 * k, rect.y + rect.s - (88 - 15 * i) * k));
  }
  octx.restore();
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
function drawSlice(cam, sun, x, y, w, h) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
  gl.viewport(x, y, w, h);
  gl.useProgram(progSlice);
  setWorld(progSlice, cam, sun);
  gl.uniform2f(progSlice.u('uRes'), w, h);
  gl.uniform1f(progSlice.u('uFov'), FOV);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
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
  drawSlice(cam, sun, side, 0, mid, H);
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
}
// The whole planet: you, your trail, the summits, and the straight line you are facing, across both halves.
function drawPlanetOverlay(r) {
  const { rect, cv, balls } = r, k = overlay.width / innerWidth, s = rect.s, u = player.up();
  const proj = (m, i) => {
    const d = [m[0] - cv.pos[0], m[1] - cv.pos[1], m[2] - cv.pos[2]], z = dot3(d, cv.F);
    return [rect.x + i * s + (dot3(d, cv.R) / z / RADAR_FOV * 0.5 + 0.5) * s, rect.y + (0.5 - dot3(d, cv.U) / z / RADAR_FOV * 0.5) * s];
  };
  const place = n => { const i = vec4.dot(n, balls[0].center) >= 0 ? 0 : 1; return { i, P: proj(logMap(n, balls[i].B, balls[i].center), i) }; };
  const mono = (w, px) => `${w} ${px * k}px "IBM Plex Mono", ui-monospace, monospace`;
  const path = (pts, style) => {                          // a polyline that breaks where it crosses between balls
    for (let j = 1; j < pts.length; j++) {
      if (pts[j].i !== pts[j - 1].i) continue;
      style(j); octx.beginPath(); octx.moveTo(...pts[j - 1].P); octx.lineTo(...pts[j].P); octx.stroke();
    }
  };
  octx.save();
  octx.lineCap = 'round';

  // the summits
  radar.summits.forEach((p, j) => {
    const { P } = place(p.n), sz = (j < 3 ? 6 : 4.5) * k;
    octx.fillStyle = `rgb(${hypsCSS(p.h).join(',')})`; octx.strokeStyle = 'rgba(10, 12, 18, 0.9)'; octx.lineWidth = 1 * k;
    octx.beginPath(); octx.moveTo(P[0], P[1] - sz); octx.lineTo(P[0] + sz * 0.9, P[1] + sz * 0.6); octx.lineTo(P[0] - sz * 0.9, P[1] + sz * 0.6); octx.closePath(); octx.fill(); octx.stroke();
    if (j < (state.radar.big ? 3 : 1)) { octx.font = mono(500, 10); octx.fillStyle = 'rgba(236, 240, 246, 0.9)'; octx.fillText(`${Math.round(p.h)} m`, P[0] + 7 * k, P[1] + 3 * k); }
  });

  // the pin and its antipode, at the two centres
  octx.strokeStyle = 'rgba(236, 240, 246, 0.9)'; octx.lineWidth = 1.5 * k; octx.font = mono(500, 10); octx.fillStyle = 'rgba(236, 240, 246, 0.85)';
  const c0 = proj([0, 0, 0], 0), c1 = proj([0, 0, 0], 1);
  octx.strokeRect(c0[0] - 3.5 * k, c0[1] - 3.5 * k, 7 * k, 7 * k); octx.fillText(radar.anchor.label, c0[0] + 7 * k, c0[1] - 6 * k);
  octx.beginPath(); octx.arc(c1[0], c1[1], 4 * k, 0, 7); octx.stroke(); octx.fillText('its antipode', c1[0] + 7 * k, c1[1] - 6 * k);

  // straight ahead: the great circle you are facing, all the way round (dots every 100 m)
  const N = 320, ring = [];
  for (let j = 0; j <= N; j++) { const t = j / N * 2 * Math.PI; ring.push(place(vec4.add(vec4.scale(u, Math.cos(t)), vec4.scale(player.F, Math.sin(t))))); }
  octx.setLineDash([6 * k, 4 * k]); octx.lineWidth = 1.6 * k; octx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  octx.beginPath();
  ring.forEach((q, j) => { if (j === 0 || q.i !== ring[j - 1].i) octx.moveTo(...q.P); else octx.lineTo(...q.P); });
  octx.stroke();
  octx.setLineDash([]);
  octx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  for (let d = 100; d < 2 * HALF * 2; d += 100) { const P = place(vec4.add(vec4.scale(u, Math.cos(d / PLANET_R)), vec4.scale(player.F, Math.sin(d / PLANET_R)))).P; octx.beginPath(); octx.arc(P[0], P[1], 1.8 * k, 0, 7); octx.fill(); }
  const anti = place(vec4.scale(u, -1)).P;
  octx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; octx.lineWidth = 1.4 * k;
  octx.beginPath(); octx.arc(anti[0], anti[1], 3.5 * k, 0, 7); octx.stroke();
  octx.font = mono(500, 9.5); octx.fillText('half a lap', anti[0] + 6 * k, anti[1] + 12 * k);

  // your trail
  const trail = radar.trail.map(p => ({ ...place(p.n), h: p.h }));
  octx.lineWidth = 2.6 * k;
  path(trail, j => { octx.strokeStyle = `rgba(${hypsCSS(trail[j].h).join(',')}, ${0.35 + 0.65 * j / trail.length})`; });

  // you, with your forward (white) and ana (orange) directions
  const me = place(u), arrow = (dir, col) => {
    const q = place(vec4.add(vec4.scale(u, Math.cos(40 / PLANET_R)), vec4.scale(dir, Math.sin(40 / PLANET_R))));
    if (q.i !== me.i) return;
    octx.strokeStyle = col; octx.lineWidth = 2.4 * k;
    octx.beginPath(); octx.moveTo(...me.P); octx.lineTo(...q.P); octx.stroke();
  };
  arrow(player.A, 'rgba(255, 170, 90, 0.95)');
  arrow(player.F, 'rgba(255, 255, 255, 0.95)');
  const pulse = 1 + 0.35 * Math.sin(performance.now() / 260);
  octx.strokeStyle = 'rgba(90, 240, 255, 0.55)'; octx.lineWidth = 2 * k;
  octx.beginPath(); octx.arc(me.P[0], me.P[1], 10 * k * pulse, 0, 7); octx.stroke();
  octx.fillStyle = 'rgb(90, 240, 255)'; octx.strokeStyle = 'rgba(5, 10, 16, 0.95)'; octx.lineWidth = 1.5 * k;
  octx.beginPath(); octx.arc(me.P[0], me.P[1], 5 * k, 0, 7); octx.fill(); octx.stroke();

  // captions
  const dist = Math.acos(Math.max(-1, Math.min(1, vec4.dot(u, radar.anchor.n)))) * PLANET_R;
  octx.font = mono(500, 10.5); octx.fillStyle = 'rgba(170, 182, 204, 0.95)';
  octx.fillText(`NEAR HALF · within ${Math.round(HALF)} m of the ${radar.anchor.label}`, rect.x + 8 * k, rect.y + 14 * k);
  octx.fillText('FAR HALF · around its antipode', rect.x + s + 8 * k, rect.y + 14 * k);
  octx.fillText(`you are ${Math.round(dist)} m from the ${radar.anchor.label}`, rect.x + 8 * k, rect.y + 29 * k);
  const lines = state.radar.big
    ? ['leave either ball anywhere: you enter the other at the opposite point', '- - - straight ahead, dots every 100 m · ▲ highest summits · R: pin here · −/= range · Tab']
    : ['leave one ball: enter the other at the opposite point'];
  lines.forEach((txt, j) => octx.fillText(txt, rect.x + 8 * k, rect.y + s - (lines.length - j) * 15 * k + 4 * k));
  octx.restore();
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
  $('mode').textContent = { slice: 'Slice view', triptych: 'Triptych: kata · slice · ana', eye: '4D eye (cube)' }[state.view];
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
  if (mouseAlt) {
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

  const input = readInput();
  const sub = 3;
  for (let i = 0; i < sub; i++) player.update(dt / sub, input);
  recordTrail();
  if (!state.paused) state.time += dt * state.timeScale;

  updateDyn(dt);
  resize();
  const cam = player.camera(), sun = sunDir(state.time);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  let rad = null;
  if (state.view === 'slice') { drawSlice(cam, sun, 0, 0, scene.w, scene.h); rad = drawRadar(cam, sun, simT); }
  else if (state.view === 'triptych') { const t = drawTriptych(cam, sun); drawTriptychOverlay(cam, t); }
  else { const r = drawEye(cam, sun, simT); drawCubeOverlay(r.cv, r); }
  present();
  if (rad) { blitRadar(rad); if (rad.planet) drawPlanetOverlay(rad); else drawRadarOverlay(rad, sun); }
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
    setAnchor('start');
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
    window.__hoop = { state, player, keys, sunDir, dyn, radar, compassAt, logMap, recordTrail };   // handle for debugging from the console
    requestAnimationFrame(t => { last = t; frame(t); });
  } catch (e) {
    fail(e.message);
  }
})();
