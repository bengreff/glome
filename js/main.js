import { VERT, SLICE_FRAG, UPSCALE_FRAG, RADAR_BAKE_FRAG, RADAR_FRAG, BLIT_FRAG } from './shaders.js';
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
const progSlice = program(SLICE_FRAG), progUp = program(UPSCALE_FRAG), progRadar = program(RADAR_FRAG), progBake = program(RADAR_BAKE_FRAG), progBlit = program(BLIT_FRAG);
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
const DAY1 = 300;                       // seconds for one turn in the first rotation plane
const RATIO = 1.6180339887;            // the second rotation plane turns φ times faster: days never repeat
const state = {
  time: 0, help: false,
  radar: { big: false, range: 90, compass: false, yaw: 0, el: 0.42, layers: 0, hidden: false, grow: 0 },
  facing: null, faced: null,
};
// Remember radar settings between visits (a convenience; everything works without storage).
const RADAR_SAVED = ['big', 'range', 'compass', 'layers', 'hidden', 'yaw', 'el'];
try {
  const s = JSON.parse(localStorage.getItem('hoop.settings') || '{}');
  for (const key of RADAR_SAVED) if (s.radar && key in s.radar) state.radar[key] = s.radar[key];
  state.radar.grow = state.radar.big ? 1 : 0;
} catch {}
function saveSettings() {
  try {
    const s = { radar: Object.fromEntries(RADAR_SAVED.map(key => [key, state.radar[key]])) };
    localStorage.setItem('hoop.settings', JSON.stringify(s));
  } catch {}
}
setInterval(saveSettings, 2000);

// The planet double-rotates; in the planet's own frame the sun circles in two planes at once.
function sunDir(t) {
  const a = Math.SQRT1_2, w1 = 2 * Math.PI / DAY1, w2 = w1 * RATIO;
  return [a * Math.cos(w1 * t), -a * Math.sin(w1 * t), a * Math.cos(w2 * t), -a * Math.sin(w2 * t)];
}

let player, atlasTex, noiseTex;
// Dynamic resolution: render internally at a fraction of the screen, adjusted to hold ~55-60 fps,
// then upscale with sharpening. 1/2/3 pick a fixed level, 0 returns to automatic.
const dyn = { scale: 0.6, auto: true, acc: 0, n: 0, slow: 0, fast: 0 };
const maxScale = () => Math.min(1, 1.5 / Math.min(devicePixelRatio || 1, 2));
function updateDyn(dt) {
  dyn.acc += dt; dyn.n++;
  if (dyn.acc < 0.35) return;
  const avg = dyn.acc / dyn.n; dyn.acc = 0; dyn.n = 0;
  if (!dyn.auto || simT < 3) return;                      // ignore the start-up hitches (shader warm-up, terrain searches)
  // drop quickly when frames are slow, climb back after a short run of fast frames (no flip-flopping)
  dyn.slow = avg > 1 / 50 ? dyn.slow + 1 : 0;
  dyn.fast = avg < 1 / 58 ? dyn.fast + 1 : 0;
  if (dyn.slow >= 1) { dyn.scale = Math.max(0.3, dyn.scale * (avg > 1 / 35 ? 0.8 : 0.9)); dyn.slow = 0; }
  else if (dyn.fast >= 2) { dyn.scale = Math.min(maxScale(), dyn.scale * 1.08); dyn.fast = 0; }
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
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  switch (e.code) {
    case 'Tab': state.radar.big = !state.radar.big; break;
    case 'KeyL': state.radar.layers = (state.radar.layers + 1) % RADAR_LAYERS.length; break;
    case 'KeyK': state.radar.hidden = !state.radar.hidden; break;
    case 'KeyH': state.help = !state.help; $('help').hidden = !state.help; break;
    case 'KeyM': state.radar.compass = !state.radar.compass; break;
    case 'KeyP': state.radar.pin = state.radar.pin ? null : { n: player.up(), B: radarBasis() }; break;
  }
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
canvas.addEventListener('contextmenu', e => e.preventDefault());
// With the mouse free (Esc), the radar can be spun by dragging, and a click on a summit turns you to face it.
const devPx = e => { const k = overlay.width / innerWidth; return [e.clientX * k, e.clientY * k]; };
const inRadar = ([x, y]) => { const r = radar.rect; return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.s; };
canvas.addEventListener('mousedown', e => {
  if (document.pointerLockElement === canvas || e.button !== 0) return;
  const p = devPx(e);
  if (inRadar(p)) { radar.drag = { p, moved: false }; return; }
  canvas.requestPointerLock?.();
  dragging = true;
});
addEventListener('mouseup', e => {
  dragging = false;
  if (radar.drag && !radar.drag.moved) faceMarkAt(devPx(e));
  radar.drag = null;
});
addEventListener('mousemove', e => {
  if (document.pointerLockElement === canvas || dragging) {
    mouseDX += e.movementX; mouseDY += e.movementY;
    mouseAlt = (e.buttons & 2) !== 0 || e.altKey;
    radar.hover = null;
    return;
  }
  radar.hover = devPx(e);
  if (radar.drag) {
    const k = overlay.width / innerWidth;
    if (Math.hypot(radar.hover[0] - radar.drag.p[0], radar.hover[1] - radar.drag.p[1]) > 4 * k) radar.drag.moved = true;
    if (radar.drag.moved) { orbitRadar(-e.movementX * 0.008, e.movementY * 0.008); }
  }
});
addEventListener('wheel', e => { zoomRadar(e.deltaY * 0.0012); }, { passive: true });
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
const RADAR_FOV = 0.4, RANGE_MIN = 25, RANGE_MAX = Math.PI * PLANET_R;   // all the way out, the ball holds the whole planet
const RADAR_LAYERS = [                     // L cycles what the ball shows
  { name: 'mountains + water', shells: [0, 0, 0.8], water: 1, legend: 'solid: ground above 24 m · blue: water' },
  { name: 'all shells', shells: [0.13, 0.2, 0.75], water: 1, legend: 'shells: coast · 12 m · 24 m' },
  { name: 'mountains only', shells: [0, 0, 0.85], water: 0, legend: 'solid: ground above 24 m' },
];
const VN_SMALL = 80, VN_BIG = 128, BIG_RANGE = 330;   // baked volume resolution: finer for the far ranges
const radar = { fbo: gl.createFramebuffer(), tex: null, w: 0, h: 0, volFbo: gl.createFramebuffer(), vols: {}, enc: 0, bakeKey: '', summits: null,
                trail: [], peaks: [], peaksAt: null, peaksR: 0, marks: [], rect: null, hover: null, drag: null, gaze: null };
function ensureRadar(w, h) {
  if (radar.tex && radar.w === w && radar.h === h) return false;
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
  return true;
}
// Heights inside the ball, baked each frame: half floats where the GPU can render them, else 8 bits.
function makeRadarVolume() {
  const make = (VN, internal, format, type) => {
    const t = tex3D(VN, VN, VN, internal, format, type, gl.LINEAR);
    gl.bindFramebuffer(gl.FRAMEBUFFER, radar.volFbo);
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, t, 0, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) gl.deleteTexture(t);
    return ok ? t : null;
  };
  const small = gl.getExtension('EXT_color_buffer_float') ? make(VN_SMALL, gl.R16F, gl.RED, gl.HALF_FLOAT) : null;
  radar.enc = small ? 0 : 1;
  radar.vols[VN_SMALL] = small || make(VN_SMALL, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
  radar.vols[VN_BIG] = small ? make(VN_BIG, gl.R16F, gl.RED, gl.HALF_FLOAT) : make(VN_BIG, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
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
// Unit direction along the ground from you toward n, and the walking distance.
function headingTo(n) {
  const u = player.up(), c = Math.max(-1, Math.min(1, vec4.dot(u, n)));
  const v = vec4.sub(n, vec4.scale(u, c)), l = vec4.len(v);
  return { dir: l > 1e-9 ? vec4.scale(v, 1 / l) : player.F, dist: Math.acos(c) * PLANET_R };
}

function recordTrail() {
  const u = player.up(), t = radar.trail;
  if (t.length && vec4.dot(t[t.length - 1].n, u) > Math.cos(1.5 / PLANET_R)) return;
  t.push({ n: u, h: player.hf.heightAt(u) });
  if (t.length > 1200) t.shift();
}

// Summits within reach: local maxima of the height on a coarse 3D grid, then climbed to the top.
function findPeaks(RS) {
  const u = player.up(), B = [player.F, player.R, player.A], hf = player.hf;
  const G = 9, g = RS / G, n = 2 * G + 1, H = new Float32Array(n * n * n).fill(-Infinity);
  const at = (i, j, k) => H[(i * n + j) * n + k];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
    const m = [(i - G) * g, (j - G) * g, (k - G) * g];
    if (Math.hypot(...m) <= RS * 1.05) H[(i * n + j) * n + k] = hf.heightAt(expMap(m, B, u));
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
  return out;
}
// Re-search when you have walked a fair way, or the range has grown past (or shrunk well inside) the search.
function updatePeaks() {
  if (state.radar.range > BIG_RANGE) { radar.summits ||= findSummits(); return; }
  const need = state.radar.range * 1.15, u = player.up();
  if (radar.peaksAt && need <= radar.peaksR && need > radar.peaksR * 0.45 && vec4.dot(radar.peaksAt, u) > Math.cos(radar.peaksR / 6 / PLANET_R)) return;
  radar.peaksR = need * 1.3;
  radar.peaks = findPeaks(radar.peaksR); radar.peaksAt = u;
}

// The planet's highest summits, for the far ranges: climb from many random high points, keep the distinct tops.
function findSummits() {
  const hf = player.hf, found = [];
  let seed = 7;
  const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  const gauss = () => rand() + rand() + rand() + rand() - 2;
  for (let k = 0, tries = 0; k < 500 && tries < 30000; tries++) {
    let n = vec4.norm([gauss(), gauss(), gauss(), gauss()]), h = hf.heightAt(n);
    if (h < 14) continue;
    k++;
    const B = [];
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
  return out.slice(0, 14);
}

const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]); return a.map(v => v / l); };
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function radarCamera(RB, t) {
  const yaw = state.radar.yaw, el = state.radar.el, D = RB * 3.0;     // the ball only turns when you spin it
  const pos = [-Math.cos(el) * Math.cos(yaw) * D, -Math.cos(el) * Math.sin(yaw) * D, Math.sin(el) * D];
  const F = pos.map(v => -v / D), R = norm3(cross3([0, 0, 1], F)), U = cross3(F, R);
  return { pos, F, R, U };
}
const orbitRadar = (dy, de) => { state.radar.yaw += dy; state.radar.el = Math.max(-1.3, Math.min(1.35, state.radar.el + de)); };
const zoomRadar = d => { state.radar.range = Math.max(RANGE_MIN, Math.min(RANGE_MAX, state.radar.range * Math.exp(d))); };
// Small in the corner or big beside the slice; Tab animates between them.
function radarRect() {
  const W = overlay.width, H = overlay.height, k = W / innerWidth, m = Math.round(10 * k), g = state.radar.grow;
  const e = g * g * (3 - 2 * g), lerp = (a, b) => a + (b - a) * e;
  const s = Math.round(lerp(Math.min(H * 0.42, W * 0.32), Math.min(H * 0.92, W * 0.6)));
  return { x: W - s - m, y: Math.round(lerp(H - s - m, (H - s) / 2)), s, w: s };
}
function drawRadar(cam, sun, t, fovX) {
  const rect = radar.rect = radarRect(), RB = state.radar.range, pin = state.radar.pin;
  const u = pin ? pin.n : player.up(), B = pin ? pin.B : radarBasis();   // pinned: fixed; else centred on you
  const VN = RB > BIG_RANGE ? VN_BIG : VN_SMALL, vol = radar.vols[VN];
  // resolution follows the frame budget (in steps of 32 px, so the texture isn't reallocated all the time)
  const S = 32 * Math.round(Math.max(160, Math.min(state.radar.grow > 0.5 ? 640 : 448, rect.s * Math.max(0.35, dyn.scale * 0.85))) / 32);
  const fresh = ensureRadar(S, S);
  updatePeaks();
  const cv = radarCamera(RB, t);
  const inB = v => B.map(b => vec4.dot(v, b)), discN = inB(player.A);
  const shared = p => {
    setWorld(p, cam, sun);
    gl.uniform4fv(p.u('uU0'), u);
    gl.uniform4fv(p.u('uB1'), B[0]);
    gl.uniform4fv(p.u('uB2'), B[1]);
    gl.uniform4fv(p.u('uB3'), B[2]);
    gl.uniform1f(p.u('uRB'), RB);
    gl.uniform1f(p.u('uVN'), VN);
    gl.uniform1f(p.u('uEnc'), radar.enc);
  };
  // Redraw only if something in the ball has changed, and then at most every other frame: it is an inset.
  const key = [VN, RB, ...u, ...B.flat()].map(x => x.toFixed(5)).join();
  const look = [key, S, ...cv.pos, fovX, state.radar.layers, ...player.A, ...player.F].map(x => typeof x === 'number' ? x.toFixed(4) : x).join();
  radar.age = (radar.age || 0) + 1;
  if (!fresh && (look === radar.lookKey || radar.age < 2)) return { rect, cv, B, RB, discN, u, pinned: !!pin };
  radar.lookKey = look; radar.age = 0;
  // 1. bake the heights inside the ball (only when the ball has moved, turned or changed size)
  if (key !== radar.bakeKey) {
    radar.bakeKey = key;
    gl.bindFramebuffer(gl.FRAMEBUFFER, radar.volFbo);
    gl.viewport(0, 0, VN, VN);
    gl.useProgram(progBake);
    shared(progBake);
    for (let l = 0; l < VN; l++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, vol, 0, l);
      gl.uniform1f(progBake.u('uLayer'), l);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }
  // 2. march the ball
  const p = progRadar;
  gl.bindFramebuffer(gl.FRAMEBUFFER, radar.fbo);
  gl.viewport(0, 0, S, S);
  gl.useProgram(p);
  shared(p);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_3D, vol); gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(p.u('uVol'), 3);
  gl.uniform2f(p.u('uRes'), S, S);
  gl.uniform1f(p.u('uFov'), RADAR_FOV);
  gl.uniform3fv(p.u('uCam'), cv.pos);
  gl.uniform3fv(p.u('uCamF'), cv.F);
  gl.uniform3fv(p.u('uCamR'), cv.R);
  gl.uniform3fv(p.u('uCamU'), cv.U);
  gl.uniform3fv(p.u('uLight'), norm3([0, 1, 2].map(i => 0.8 * cv.U[i] - 0.5 * cv.R[i] - 0.4 * cv.F[i])));
  gl.uniform3fv(p.u('uDiscN'), discN);
  gl.uniform3fv(p.u('uFwd'), inB(player.F));
  gl.uniform3fv(p.u('uRight'), inB(player.R));
  gl.uniform1f(p.u('uFovX'), fovX);
  const L = RADAR_LAYERS[state.radar.layers];
  gl.uniform3fv(p.u('uShellA'), L.shells);
  gl.uniform1f(p.u('uWater'), L.water);
  gl.uniform1f(p.u('uPinned'), pin ? 1 : 0);
  gl.uniform4fv(p.u('uSliceA'), player.A);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_3D, null); gl.activeTexture(gl.TEXTURE0);
  radar.last = { rect, cv, B, RB, discN, u, pinned: !!pin };
  return { rect, cv, B, RB, discN, u, pinned: !!pin };
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
// What is under the cursor in the radar: a summit marker, else the first mountain or the disc along the
// line of sight through the ball (marched on the CPU with the same heights the GPU uses).
function pickRadar([x, y]) {
  const k = overlay.width / innerWidth, last = radar.last;
  if (!last) return null;
  let best = null, bd = 16 * k;
  for (const m of radar.marks) { const d = Math.hypot(m.x - x, m.y - y); if (d < bd) { bd = d; best = m; } }
  if (best) return { n: best.n, h: best.h, kind: 'summit' };
  for (const r of radar.rocks || []) if (Math.hypot(r.x - x, r.y - y) < Math.max(r.rad, 5 * k)) return { n: r.b.n, h: r.b.r, kind: 'boulder', b: r.b };
  const { rect, cv, B, RB, discN, u, pinned } = last;
  const side = m => pinned ? vec4.dot(expMap(m, B, u), player.A) : dot3(m, discN);   // which side of your slice
  const qx = ((x - rect.x) / rect.s * 2 - 1) * RADAR_FOV, qy = -((y - rect.y) / rect.s * 2 - 1) * RADAR_FOV;
  const rd = norm3([0, 1, 2].map(i => cv.F[i] + qx * cv.R[i] + qy * cv.U[i])), ro = cv.pos;
  const b = dot3(ro, rd), c = dot3(ro, ro) - RB * RB, disc = b * b - c;
  if (disc <= 0) return null;
  const t0 = -b - Math.sqrt(disc), t1 = -b + Math.sqrt(disc), ds = RB / 70;
  let sPrev = null;
  for (let t = t0; t <= t1; t += ds) {
    const m = ro.map((v, i) => v + rd[i] * t), sd = side(m);
    if (sPrev !== null && Math.sign(sd) !== Math.sign(sPrev)) {
      const mm = m.map((v, i) => v - rd[i] * ds * sd / (sd - sPrev)), n = expMap(mm, B, u);
      return { n, h: player.hf.heightAt(n), kind: 'disc' };
    }
    sPrev = sd;
    const n = expMap(m, B, u), h = player.hf.heightAt(n);
    if (h >= 24) return { n, h, kind: 'mountain' };
  }
  return null;
}
function faceMarkAt(p) {
  const hit = pickRadar(p);
  if (hit && headingTo(hit.n).dist > 2) { state.facing = hit.n; state.facingWhat = hit.kind === 'summit' ? `summit ${Math.round(hit.h)} m` : hit.kind === 'boulder' ? 'boulder' : hit.kind === 'mountain' ? 'mountain' : hit.h < SEA ? 'water' : 'this ground'; }
}

const hypsCSS = h => h < 0 ? [70, 140, 220] : h < 4 ? [220, 205, 150] : h < 12 ? [110, 190, 100] : h < 24 ? [200, 175, 90] : h < 30 ? [215, 160, 120] : [245, 245, 255];
function drawRadarOverlay(r, sun) {
  const { rect, cv, B, RB, discN, u, pinned } = r, k = overlay.width / innerWidth;   // u: the ball's centre
  const me = player.up(), whole = RB > RANGE_MAX * 0.97;
  const proj = m => {
    const d = [m[0] - cv.pos[0], m[1] - cv.pos[1], m[2] - cv.pos[2]], z = dot3(d, cv.F);
    return [rect.x + (dot3(d, cv.R) / z / RADAR_FOV * 0.5 + 0.5) * rect.s, rect.y + (0.5 - dot3(d, cv.U) / z / RADAR_FOV * 0.5) * rect.s];
  };
  const foot = m => { const a = dot3(m, discN); return [m[0] - a * discN[0], m[1] - a * discN[1], m[2] - a * discN[2]]; };
  const mono = (w, px) => `${w} ${px * k}px "IBM Plex Mono", ui-monospace, monospace`;
  const inB = v => B.map(b => vec4.dot(v, b));
  octx.save();
  octx.lineCap = 'round'; octx.lineJoin = 'round';

  // distance rings on the disc
  octx.font = mono(500, 9.5); octx.fillStyle = 'rgba(210, 225, 245, 0.8)'; octx.textAlign = 'center';
  const rgt = inB(player.R);
  if (!pinned) for (const f of [1 / 3, 2 / 3]) { const P = proj(rgt.map(v => v * RB * f)); octx.fillText(`${Math.round(RB * f)} m`, P[0], P[1] + 12 * k); }

  // your trail: where you have walked, in all three ground directions, coloured by height
  const pts = radar.trail.map(p => ({ m: logMap(p.n, B, u), h: p.h }));
  octx.lineWidth = 1 * k; octx.strokeStyle = 'rgba(220, 235, 255, 0.28)';
  octx.beginPath();
  if (!pinned) pts.forEach((p, i) => { if (i % 4 || Math.hypot(...p.m) > RB) return; const a = proj(p.m), b = proj(foot(p.m)); octx.moveTo(...a); octx.lineTo(...b); });
  octx.stroke();
  octx.lineWidth = 2.2 * k;
  const runs = new Map();                                   // one path per colour and age band
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (Math.hypot(...a.m) > RB || Math.hypot(...b.m) > RB) continue;
    const key = `rgba(${hypsCSS(b.h).join(',')}, ${(0.35 + 0.6 * Math.ceil(4 * i / pts.length) / 4).toFixed(2)})`;
    if (!runs.has(key)) runs.set(key, []);
    runs.get(key).push(proj(a.m), proj(b.m));
  }
  for (const [style, seg] of runs) {
    octx.strokeStyle = style; octx.beginPath();
    for (let j = 0; j < seg.length; j += 2) { octx.moveTo(...seg[j]); octx.lineTo(...seg[j + 1]); }
    octx.stroke();
  }

  // boulders: dots sized by radius; outlined where your slice cuts them (those are the ones you can see)
  const bs = [];
  if (RB <= 200) for (const b of boulders.all) {
    if (vec4.dot(b.n, u) < Math.cos(RB / PLANET_R)) continue;
    const m = logMap(b.n, B, u), d = Math.hypot(...m);
    if (d < RB * 0.97) bs.push({ m, d, r: b.r, b });
  }
  bs.sort((a, b) => a.d - b.d);
  radar.rocks = [];
  for (const b of bs.slice(0, 80)) {
    const P = proj(b.m), Pr = proj(b.m.map((v, i) => v + cv.R[i] * b.r)), rad = Math.max(1.6 * k, Math.hypot(Pr[0] - P[0], Pr[1] - P[1]));
    const cut = Math.abs(vec4.dot(b.b.c, player.A)) < b.r;
    radar.rocks.push({ x: P[0], y: P[1], rad, b: b.b });
    octx.fillStyle = cut ? 'rgba(235, 228, 215, 0.95)' : 'rgba(160, 155, 148, 0.75)';
    octx.beginPath(); octx.arc(P[0], P[1], rad, 0, 7); octx.fill();
    if (cut) { octx.strokeStyle = '#fff'; octx.lineWidth = 1.4 * k; octx.stroke(); }
  }

  // summits, each on a stalk down to your slice's ground (above = toward ana, below = toward kata)
  radar.marks = [];
  const list = RB > BIG_RANGE ? radar.summits || [] : radar.peaks;
  const shown = list.map(p => ({ ...p, m: logMap(p.n, B, u) })).filter(p => Math.hypot(...p.m) < RB * 0.97).slice(0, RB > BIG_RANGE ? 14 : 7);
  octx.textAlign = 'left';
  for (const p of shown) {
    const off = vec4.dot(p.n, player.A) * (PLANET_R + p.h);       // how far the summit lies from your slice, in 4D
    const P = proj(p.m), Q = pinned ? P : proj(foot(p.m)), inSlice = Math.abs(off) < 3;
    const target = state.facing && vec4.dot(state.facing, p.n) > 0.99999;
    octx.strokeStyle = off >= 0 ? 'rgba(255, 190, 120, 0.8)' : 'rgba(140, 190, 255, 0.8)';
    octx.lineWidth = 1.4 * k;
    octx.beginPath(); octx.moveTo(...Q); octx.lineTo(...P); octx.stroke();
    octx.beginPath(); octx.ellipse(Q[0], Q[1], 3 * k, 1.6 * k, 0, 0, 7); octx.stroke();
    const sz = 5.5 * k;
    octx.fillStyle = `rgb(${hypsCSS(p.h).join(',')})`;
    octx.strokeStyle = inSlice || target ? '#fff' : 'rgba(10, 12, 18, 0.9)';
    octx.lineWidth = (inSlice || target ? 2 : 1) * k;
    octx.beginPath(); octx.moveTo(P[0], P[1] - sz); octx.lineTo(P[0] + sz * 0.9, P[1] + sz * 0.6); octx.lineTo(P[0] - sz * 0.9, P[1] + sz * 0.6); octx.closePath(); octx.fill(); octx.stroke();
    octx.font = mono(500, 10.5); octx.fillStyle = 'rgba(236, 240, 246, 0.92)';
    octx.fillText(`${Math.round(p.h)} m`, P[0] + 8 * k, P[1] + 3 * k);
    radar.marks.push({ x: P[0], y: P[1], n: p.n, h: p.h, off });
  }

  // the rim: ana and kata, the sun, and the compass
  const rimLabel = (dir, txt, color, size = 10.5, scale = 1.1) => {
    const l = Math.hypot(...dir); if (l < 1e-6) return;
    const m = dir.map(v => v / l * RB * scale), P = proj(m);
    const front = dot3(norm3(m), cv.F) < 0.25;
    octx.font = mono(front ? 600 : 500, size);
    octx.fillStyle = color; octx.globalAlpha = front ? 1 : 0.5;
    octx.textAlign = 'center'; octx.fillText(txt, P[0], P[1] + 4 * k); octx.globalAlpha = 1;
  };
  if (!pinned) {
    rimLabel(discN, 'ana', 'rgba(255, 180, 110, 0.95)', 11, 1.13);
    rimLabel(discN.map(v => -v), 'kata', 'rgba(130, 185, 255, 0.95)', 11, 1.13);
  }
  const C = compassAt(u);
  [['i', '#ff8a7a'], ['j', '#9be88f'], ['k', '#8fb8ff']].forEach(([n, col], i) => rimLabel(inB(C[i]), n, col, 10.5, 1.05));
  const su = vec4.dot(sun, u), sh = vec4.sub(sun, vec4.scale(u, su));
  if (vec4.len(sh) > 1e-3) {
    const d = inB(sh), l = Math.hypot(...d), P = proj(d.map(v => v / l * RB * 1.2));
    const el = Math.asin(Math.max(-1, Math.min(1, su))) * 180 / Math.PI;
    octx.fillStyle = el > 0 ? 'rgba(255, 220, 120, 0.95)' : 'rgba(150, 160, 190, 0.6)';
    octx.beginPath(); octx.arc(P[0], P[1], (el > 0 ? 5 : 3.5) * k, 0, 7); octx.fill();
    octx.font = mono(500, 10); octx.textAlign = 'center';
    octx.fillText(`sun ${Math.round(el)}°`, P[0], P[1] - 8 * k);
  }

  // your line of sight: where the centre of the slice view lands, on the disc
  if (radar.gaze) {
    const g = logMap(radar.gaze.n, B, u);
    if (Math.hypot(...g) < RB) {
      const P = proj(g), C = proj(pinned ? logMap(me, B, u) : [0, 0, 0]), pulse = 1 + 0.25 * Math.sin(performance.now() / 220);
      octx.setLineDash([3 * k, 3 * k]); octx.strokeStyle = 'rgba(255, 255, 255, 0.75)'; octx.lineWidth = 1.2 * k;
      octx.beginPath(); octx.moveTo(...C); octx.lineTo(...P); octx.stroke(); octx.setLineDash([]);
      octx.lineWidth = 2 * k; octx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      octx.beginPath(); octx.ellipse(P[0], P[1], 6 * k * pulse, 3.5 * k * pulse, 0, 0, 7); octx.stroke();
      octx.font = mono(500, 10); octx.textAlign = 'left'; octx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      octx.fillText(`${Math.round(radar.gaze.t)} m`, P[0] + 9 * k, P[1] - 4 * k);
    }
  }

  // pinned: you are a dot moving through the ball, with your forward (white) and ana (orange) directions
  if (pinned) {
    const P = proj(logMap(me, B, u)), arrow = (dir, col) => {
      const q = proj(logMap(vec4.add(vec4.scale(me, Math.cos(0.08 * RB / PLANET_R)), vec4.scale(dir, Math.sin(0.08 * RB / PLANET_R))), B, u));
      octx.strokeStyle = col; octx.lineWidth = 2.4 * k; octx.beginPath(); octx.moveTo(...P); octx.lineTo(...q); octx.stroke();
    };
    if (headingTo(u).dist < RB) {
      arrow(player.A, 'rgba(255, 170, 90, 0.95)'); arrow(player.F, 'rgba(255, 255, 255, 0.95)');
      octx.fillStyle = 'rgb(90, 240, 255)'; octx.strokeStyle = 'rgba(5, 10, 16, 0.95)'; octx.lineWidth = 1.5 * k;
      octx.beginPath(); octx.arc(P[0], P[1], 5 * k, 0, 7); octx.fill(); octx.stroke();
    }
    const c0 = proj([0, 0, 0]);
    octx.strokeStyle = 'rgba(236, 240, 246, 0.9)'; octx.lineWidth = 1.5 * k; octx.strokeRect(c0[0] - 3.5 * k, c0[1] - 3.5 * k, 7 * k, 7 * k);
  }

  // hover: what is under the cursor, and how to reach it
  radar.last = { rect, cv, B, RB, discN, u, pinned };
  const hv = radar.hover && pickRadar(radar.hover);
  if (hv) {
    const { dist, dir } = headingTo(hv.n);
    const ana = Math.atan2(vec4.dot(dir, player.A), Math.hypot(vec4.dot(dir, player.F), vec4.dot(dir, player.R))) * 180 / Math.PI;
    const what = hv.kind === 'summit' ? `summit ${Math.round(hv.h)} m high` : hv.kind === 'boulder' ? `boulder, radius ${hv.h.toFixed(1)} m`
      : hv.h < SEA ? `water ${Math.round(SEA - hv.h)} m deep` : `ground ${Math.round(hv.h)} m high`;
    let where = Math.abs(ana) < 2 ? 'in your slice' : `${Math.round(Math.abs(ana))}° toward ${ana > 0 ? 'ana' : 'kata'} from your slice`;
    if (hv.kind === 'boulder') {                            // how much of it your slice cuts: a 3D ball of radius sqrt(r² - a²)
      const a = Math.abs(vec4.dot(hv.b.c, player.A)), r = hv.b.r;    // distance of its centre from your slice
      where = a < r ? `your slice cuts it: a ball of radius ${Math.sqrt(r * r - a * a).toFixed(1)} m` : `${(a - r).toFixed(1)} m outside your slice: invisible`;
    }
    const lines = [`${what} · ${Math.round(dist)} m away`, where, 'click to turn and face it'];
    octx.font = mono(500, 11); octx.textAlign = 'left';
    const [hx, hy] = radar.hover;
    octx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; octx.lineWidth = 1.5 * k;
    octx.beginPath(); octx.arc(hx, hy, 5 * k, 0, 7); octx.stroke();
    const w = Math.max(...lines.map(t => octx.measureText(t).width)) + 16 * k, x0 = Math.min(hx + 12 * k, overlay.width - w - 4 * k), y0 = hy - 52 * k;
    octx.fillStyle = 'rgba(11, 14, 20, 0.88)'; octx.fillRect(x0, y0, w, 50 * k);
    lines.forEach((t, i) => { octx.fillStyle = i === 2 ? 'rgba(141, 154, 176, 0.95)' : 'rgba(236, 240, 246, 0.95)'; octx.fillText(t, x0 + 8 * k, y0 + (15 + 15 * i) * k); });
  }

  // caption
  octx.textAlign = 'left';
  octx.font = mono(500, 10.5);
  const caption = (lines, x, y) => {
    const w = Math.max(...lines.map(t => octx.measureText(t).width)) + 12 * k;
    octx.fillStyle = 'rgba(11, 14, 20, 0.6)'; octx.fillRect(x - 6 * k, y - 12 * k, w, lines.length * 15 * k + 5 * k);
    octx.fillStyle = 'rgba(170, 182, 204, 0.95)'; lines.forEach((t, i) => octx.fillText(t, x, y + i * 15 * k));
  };
  const mode = pinned ? `pinned (${Math.round(headingTo(u).dist)} m from you)` : state.radar.compass ? 'compass-up' : 'heading-up';
  caption([`${whole ? 'WHOLE PLANET' : `RADAR ${Math.round(RB)} m`} · ${mode} · ${RADAR_LAYERS[state.radar.layers].name}`], rect.x + 8 * k, rect.y + 14 * k);
  if (whole) caption([`the whole rim is one point: ${pinned ? "the pin's" : 'your'} antipode, ${Math.round(RANGE_MAX)} m away`], rect.x + 8 * k, rect.y + 34 * k);
  if (state.radar.grow > 0.99) {
    const lines = ['disc: the ground your slice shows', RADAR_LAYERS[state.radar.layers].legend, 'disc tint: mountains toward ana / kata', '▲ summits · ● boulders (ringed: cut by your slice)', 'line: your trail', 'L layers · K hide radar',
      'wheel or −/= zoom (out to the whole planet)', 'arrows, or Esc then drag: spin', 'Esc, then hover / click: inspect / face', 'M heading/compass-up · P pin here', 'Tab smaller'];
    const w = Math.max(...lines.map(t => octx.measureText(t).width));
    caption(lines, Math.max(8 * k, rect.x - w - 18 * k), rect.y + rect.s - 150 * k);
  }
  octx.restore();
}

// ---------- boulders ----------
// Scattered 4D balls, partly buried. The nearest MAXB go to the GPU each frame; the far ones shrink to
// nothing before they drop out of the list, so they never pop.
const MAXB = 32, B_FAR = 140;
const boulders = { all: [], near: [], cut: 0, C: new Float32Array(MAXB * 4), R: new Float32Array(MAXB) };
function makeBoulders(rand) {
  const gauss = () => rand() + rand() + rand() + rand() - 2, home = player.up();
  for (let i = 0; i < 3400; i++) {
    const n = vec4.norm([gauss(), gauss(), gauss(), gauss()]), h = player.hf.heightAt(n);
    if (h < 0.8) continue;
    const r = 1.4 + 3.6 * rand() ** 2;
    if (Math.acos(Math.min(1, vec4.dot(n, home))) * PLANET_R < r + 6) continue;   // keep the start clear
    boulders.all.push({ n, r, c: vec4.scale(n, PLANET_R + h + 0.3 * r) });
  }
}
function updateBoulders(eye) {
  const cand = [];
  for (const b of boulders.all) {
    const d = vec4.len(vec4.sub(b.c, eye));
    if (d < B_FAR + b.r) cand.push({ b, d });
  }
  cand.sort((x, y) => x.d - y.d);
  const near = cand.slice(0, MAXB);
  const cut = Math.min(B_FAR, near.length === MAXB ? near[MAXB - 1].d : B_FAR);
  // a ray of the slice view never leaves your slice, so it can only hit boulders the slice cuts: put them first
  const A = player.A, inSlice = x => Math.abs(vec4.dot(x.b.c, A)) < x.b.r;
  near.sort((x, y) => inSlice(y) - inSlice(x));
  boulders.cut = near.filter(inSlice).length;
  boulders.C.fill(0); boulders.R.fill(0);
  near.forEach(({ b, d }, i) => {
    boulders.C.set(b.c, 4 * i);
    boulders.R[i] = b.r * Math.min(1, Math.max(0, (cut - d) / (0.15 * cut)));   // fade out toward the cut-off
  });
  boulders.near = near.map(x => x.b);
}
// Contact with boulders, in full 4D. The contact normal points from the boulder's centre to you, so it has an
// ana component whenever the centre is off your slice. Coulomb friction (body and feet against rock, μ = 0.9)
// acts on the whole horizontal part of your velocity, ana included: push into a boulder within about 42° of
// head-on and you stick; only a glancing push slides you around it, through ana if that is where its surface
// leans. Holding Space against one scrambles you up its surface; near the top you can stand on it.
const MU = 0.9, CLIMB = 2.2;
function boulderContact(p, dt, input) {
  const up = p.up();
  for (const b of boulders.near) {
    const d = vec4.sub(p.pos, b.c), l = vec4.len(d), R = b.r + 0.3;
    if (l > R + 0.03 || l < 1e-6) continue;
    const n = vec4.scale(d, 1 / l), nu = vec4.dot(n, up);
    if (l < R) p.pos = vec4.add(b.c, vec4.scale(n, R));      // undo any overlap along the 4D normal
    if (nu > 0.5) p.supported = true;                          // you are on top of it
    if (input.jump && nu < 0.85 && (input.fwd || input.right || input.ana)) {
      // scramble: climb along the steepest way up the 4D surface (up, minus its normal part)
      const climb = vec4.sub(up, vec4.scale(n, nu)), cl = vec4.len(climb);
      if (cl > 1e-3) { p.vel = vec4.scale(climb, CLIMB / cl); p.supported = true; continue; }
    }
    const vn = vec4.dot(p.vel, n);
    if (vn >= 0) continue;
    let v = vec4.sub(p.vel, vec4.scale(n, vn));                // the boulder cancels the approach ...
    const vr = vec4.dot(v, up), vt = vec4.sub(v, vec4.scale(up, vr)), vtl = vec4.len(vt);
    const stop = MU * -vn;                                     // ... and friction resists sliding along it
    v = vtl <= stop ? vec4.scale(up, vr) : vec4.add(vec4.scale(up, vr), vec4.scale(vt, 1 - stop / vtl));
    p.vel = v;
  }
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
  gl.uniform1f(p.u('uShadows'), 1);
  gl.uniform4fv(p.u('uBC'), boulders.C);
  gl.uniform1fv(p.u('uBR'), boulders.R);
  gl.uniform1i(p.u('uBN'), boulders.near.length);
  gl.uniform1i(p.u('uBCut'), boulders.cut);
}

const FOV = Math.tan(38 * Math.PI / 180);

function drawSlice(cam, sun, x, y, w, h) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
  gl.viewport(x, y, w, h);
  gl.useProgram(progSlice);
  setWorld(progSlice, cam, sun);
  gl.uniform2f(progSlice.u('uRes'), w, h);
  gl.uniform1f(progSlice.u('uFov'), FOV);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
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

// Where your line of sight (the centre of the slice view) meets the ground or water: marched on the CPU with
// the same heights the GPU draws, so the radar can show what you are looking at.
function gazePoint(cam) {
  const hf = player.hf, under = vec4.len(cam.eye) < PLANET_R + SEA, seaR = under ? 0 : PLANET_R + SEA;   // underwater: see through to the bed
  const gap = t => { const p = vec4.add(cam.eye, vec4.scale(cam.F, t)), r = vec4.len(p); return r - Math.max(seaR, PLANET_R + hf.heightAt(vec4.scale(p, 1 / r))); };
  let tB = 1e9, nB = null;                                        // boulders: analytic, like the GPU
  for (const b of boulders.near) {
    const oc = vec4.sub(cam.eye, b.c), bb = vec4.dot(oc, cam.F), c = vec4.dot(oc, oc) - b.r * b.r, d = bb * bb - c;
    if (d > 0) { const t = -bb - Math.sqrt(d); if (t > 0 && t < tB) { tB = t; nB = b; } }
  }
  const boulderHit = () => ({ n: vec4.norm(vec4.add(cam.eye, vec4.scale(cam.F, tB))), t: tB, water: false });
  let t = 0.3, prev = t;
  for (let i = 0; i < 160 && t < 400; i++) {
    if (t > tB) return boulderHit();
    const g = gap(t);
    if (g < 0) {
      let a = prev, b = t;
      for (let j = 0; j < 12; j++) { const mid = 0.5 * (a + b); if (gap(mid) < 0) b = mid; else a = mid; }
      if (tB < b) return boulderHit();
      const p = vec4.add(cam.eye, vec4.scale(cam.F, b));
      return { n: vec4.norm(p), t: b, water: vec4.len(p) <= seaR + 0.05 };
    }
    prev = t; t += Math.max(0.25, g * 0.6);
  }
  return nB ? boulderHit() : null;
}

// After you turn to face a summit from the radar, mark it in the slice view for a few seconds.
function drawFaced(cam) {
  const f = state.faced;
  if (!f || simT > f.until) return;
  const h = Math.max(SEA, player.hf.heightAt(f.n)), p = vec4.scale(f.n, PLANET_R + h), d = vec4.sub(p, cam.eye);
  const z = vec4.dot(d, cam.F); if (z < 1) return;
  const W = overlay.width, H = overlay.height, k = W / innerWidth;
  const x = vec4.dot(d, cam.R) / z / (FOV * W / H), y = vec4.dot(d, cam.U) / z / FOV;
  if (Math.abs(x) > 0.95 || Math.abs(y) > 0.95) return;
  const X = (x * 0.5 + 0.5) * W, Y = (0.5 - y * 0.5) * H - 10 * k, a = Math.min(1, (f.until - simT) / 1.5);
  octx.save();
  octx.globalAlpha = a;
  octx.strokeStyle = '#fff'; octx.lineWidth = 2 * k; octx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  octx.beginPath(); octx.moveTo(X, Y - 9 * k); octx.lineTo(X + 8 * k, Y + 5 * k); octx.lineTo(X - 8 * k, Y + 5 * k); octx.closePath(); octx.fill(); octx.stroke();
  octx.font = `500 ${12 * k}px "IBM Plex Mono", ui-monospace, monospace`; octx.textAlign = 'center';
  octx.fillStyle = 'rgba(11, 14, 20, 0.6)'; const t = `${f.what || 'here'} · ${Math.round(headingTo(f.n).dist)} m ahead`;
  const w = octx.measureText(t).width + 12 * k; octx.fillRect(X - w / 2, Y - 30 * k, w, 17 * k);
  octx.fillStyle = '#fff'; octx.fillText(t, X, Y - 17 * k);
  octx.restore();
}

// A small dot at the centre of the slice view: the point the radar's ring shows.
function drawGazeDot() {
  const W = overlay.width, H = overlay.height, k = W / innerWidth;
  octx.save();
  octx.strokeStyle = 'rgba(0, 0, 0, 0.45)'; octx.lineWidth = 3 * k;
  octx.beginPath(); octx.arc(W / 2, H / 2, 3 * k, 0, 7); octx.stroke();
  octx.strokeStyle = 'rgba(255, 255, 255, 0.85)'; octx.lineWidth = 1.4 * k;
  octx.beginPath(); octx.arc(W / 2, H / 2, 3 * k, 0, 7); octx.stroke();
  if (radar.gaze && !state.radar.hidden) {
    octx.font = `500 ${10.5 * k}px "IBM Plex Mono", ui-monospace, monospace`; octx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    octx.fillText(`${Math.round(radar.gaze.t)} m`, W / 2 + 8 * k, H / 2 + 4 * k);
  }
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
  $('where').textContent = `η ${fmt(h.eta)}°  ξ₁ ${fmt(h.xi1)}°  ξ₂ ${fmt(h.xi2)}°`;
  $('alt').textContent = player.swimming ? 'swimming' : `${fmt(player.altitude(), 1)} m above sea`;
  $('sun').textContent = el > -2
    ? `sun ${fmt(el)}° up · ${fmt(Math.abs(anaLean))}° toward ${anaLean >= 0 ? 'ana' : 'kata'} · ${fmt(Math.abs(ahead))}° ${ahead >= 0 ? 'right' : 'left'}`
    : `night · sun ${fmt(-el)}° below`;
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
  if (mouseDX || mouseDY) state.facing = null;            // looking around cancels an automatic turn
  mouseDX = mouseDY = 0;
  const turnKeys = (keys.has('KeyC') ? 1 : 0) - (keys.has('KeyZ') ? 1 : 0);
  if (turnKeys) player.rotate('FA', turnKeys * 1.2 * dt);
  if (state.facing && player.turnToward(headingTo(state.facing).dir, 2.2 * dt)) { state.faced = { n: state.facing, what: state.facingWhat, until: simT + 5 }; state.facing = null; }
  const k = c => keys.has(c) ? 1 : 0;
  orbitRadar((k('ArrowLeft') - k('ArrowRight')) * 1.6 * dt, (k('ArrowUp') - k('ArrowDown')) * 1.2 * dt);
  zoomRadar((k('Minus') - k('Equal')) * 1.3 * dt);
  state.radar.grow = Math.max(0, Math.min(1, state.radar.grow + (state.radar.big ? 1 : -1) * dt * 4));

  const input = readInput();
  const sub = 3;
  updateBoulders(player.camera().eye);
  for (let i = 0; i < sub; i++) player.update(dt / sub, input);
  recordTrail();
  state.time += dt;

  updateDyn(dt);
  resize();
  const cam = player.camera(), sun = sunDir(state.time);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  let rad = null;
  drawSlice(cam, sun, 0, 0, scene.w, scene.h);
  if (!state.radar.hidden) rad = drawRadar(cam, sun, simT, FOV * scene.w / scene.h);
  present();
  radar.gaze = gazePoint(cam);
  drawFaced(cam); drawGazeDot();
  if (rad) { blitRadar(rad); drawRadarOverlay(rad, sun); } else radar.rect = null;
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
    player = new Player(new HeightField(data, N));
    let seed = 20261006;
    const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
    player.spawn(rand);
    makeRadarVolume();
    makeBoulders(rand);
    player.contact = boulderContact;
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
    window.__hoop = { state, player, keys, sunDir, dyn, radar, boulders, compassAt, logMap, recordTrail, dbg: { gl, drawRadar, drawSlice, scene, updateBoulders } };   // handle for debugging from the console
    requestAnimationFrame(t => { last = t; frame(t); });
  } catch (e) {
    fail(e.message);
  }
})();
