import { VERT, SLICE_FRAG, RETINA_FRAG, EDGE_FRAG, VOLUME_FRAG } from './shaders.js';
import { PLANET_R, SEA, HeightField } from './world.js';
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
const progSlice = program(SLICE_FRAG), progRetina = program(RETINA_FRAG), progEdge = program(EDGE_FRAG), progVol = program(VOLUME_FRAG);
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

// ---------- state ----------
const DAY1 = 300;                       // seconds for one turn in the first rotation plane (at 1×)
const state = {
  view: 'slice', time: 0, timeScale: 1, paused: false, rotation: 'double',
  scale: 0.6, shadows: true, retinaM: 64, help: false, anaTint: false,
  eyeYaw: 0, eyePitch: 0.3, eyeAuto: true,
};
const RATIOS = { double: 1.6180339887, isoclinic: 1 };

// The planet double-rotates; in the planet's own frame the sun circles in two planes at once.
function sunDir(t) {
  const a = Math.SQRT1_2, w1 = 2 * Math.PI / DAY1, w2 = w1 * RATIOS[state.rotation];
  return [a * Math.cos(w1 * t), -a * Math.sin(w1 * t), a * Math.cos(w2 * t), -a * Math.sin(w2 * t)];
}

let player, atlasTex;
let retinaTex = null, volTex = null, fbo = null;

function makeRetina(M) {
  if (retinaTex) { gl.deleteTexture(retinaTex); gl.deleteTexture(volTex); }
  retinaTex = tex3D(M, M, M, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
  volTex = tex3D(M, M, M, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
  fbo = fbo || gl.createFramebuffer();
}

// ---------- input ----------
const keys = new Set();
let mouseDX = 0, mouseDY = 0, mouseAlt = false, dragging = false;
const SENS = 0.0022;

addEventListener('keydown', e => {
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  switch (e.code) {
    case 'KeyV': state.view = state.view === 'slice' ? 'eye' : 'slice'; break;
    case 'BracketRight': state.timeScale = Math.min(state.timeScale * 2, 256); break;
    case 'BracketLeft': state.timeScale = Math.max(state.timeScale / 2, 1 / 8); break;
    case 'KeyP': state.paused = !state.paused; break;
    case 'KeyT': state.rotation = state.rotation === 'double' ? 'isoclinic' : 'double'; break;
    case 'KeyH': state.help = !state.help; $('help').hidden = !state.help; break;
    case 'KeyG': state.shadows = !state.shadows; break;
    case 'Digit1': state.scale = 0.4; break;
    case 'Digit2': state.scale = 0.6; break;
    case 'Digit3': state.scale = 0.85; break;
    case 'KeyM': state.retinaM = { 48: 64, 64: 96, 96: 48 }[state.retinaM]; makeRetina(state.retinaM); break;
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

// ---------- rendering ----------
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(innerWidth * dpr * state.scale));
  const h = Math.max(1, Math.round(innerHeight * dpr * state.scale));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ow = Math.round(innerWidth * dpr), oh = Math.round(innerHeight * dpr);
  if (overlay.width !== ow || overlay.height !== oh) { overlay.width = ow; overlay.height = oh; }
}

function setWorld(p, cam, sun) {
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_3D, atlasTex);
  gl.uniform1i(p.u('uAtlas'), 0);
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

function drawSlice(cam, sun, x, y, w, h) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(progVol);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_3D, volTex);
  gl.uniform1i(progVol.u('uVol'), 2);
  const cv = eyeCamera(t);
  gl.uniform3fv(progVol.u('uCamPos'), cv.pos);
  gl.uniform3fv(progVol.u('uCamR'), cv.R);
  gl.uniform3fv(progVol.u('uCamU'), cv.U);
  gl.uniform3fv(progVol.u('uCamF'), cv.F);
  gl.uniform2f(progVol.u('uRes'), canvas.width, canvas.height);
  gl.uniform1f(progVol.u('uM'), M);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.activeTexture(gl.TEXTURE0);
  // inset: the ordinary slice (it is the middle layer of the retina)
  const iw = Math.round(canvas.width * 0.27), ih = Math.round(iw * 0.62), m = Math.round(canvas.width * 0.012);
  drawSlice(cam, sun, canvas.width - iw - m, m, iw, ih);
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
  const k = overlay.width / canvas.width;
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
  $('mode').textContent = state.view === 'slice' ? 'Slice view' : '4D eye';
  $('where').textContent = `η ${fmt(h.eta)}°  ξ₁ ${fmt(h.xi1)}°  ξ₂ ${fmt(h.xi2)}°`;
  $('alt').textContent = player.swimming ? 'swimming' : `${fmt(player.altitude(), 1)} m above sea`;
  $('sun').textContent = el > -2
    ? `sun ${fmt(el)}° up · ${fmt(Math.abs(anaLean))}° toward ${anaLean >= 0 ? 'ana' : 'kata'} · ${fmt(Math.abs(ahead))}° ${ahead >= 0 ? 'right' : 'left'}`
    : `night · sun ${fmt(-el)}° below`;
  $('clock').textContent = `${state.paused ? 'paused' : '×' + (state.timeScale >= 1 ? state.timeScale : state.timeScale.toFixed(3))} · ${state.rotation} rotation`;
  $('fps').textContent = `${fmt(fps)} fps`;
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
  if (!state.paused) state.time += dt * state.timeScale;

  resize();
  const cam = player.camera(), sun = sunDir(state.time);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  if (state.view === 'slice') { drawSlice(cam, sun, 0, 0, canvas.width, canvas.height); drawAnaGauge(); }
  else { const r = drawEye(cam, sun, simT); drawCubeOverlay(r.cv, r); }
  updateHUD(dt, cam, sun);
  requestAnimationFrame(frame);
}

// ---------- boot ----------
(async function boot() {
  try {
    const data = await buildAtlas();
    atlasTex = tex3D(N, N, 8 * N, gl.R16F, gl.RED, gl.FLOAT, gl.LINEAR, data);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, atlasTex);
    gl.bindVertexArray(vao);
    makeRetina(state.retinaM);
    player = new Player(new HeightField(data, N));
    let seed = 20261006;
    const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
    player.spawn(rand);
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
    window.__hoop = { state, player, keys, sunDir };   // handle for debugging from the console
    requestAnimationFrame(t => { last = t; frame(t); });
  } catch (e) {
    fail(e.message);
  }
})();
