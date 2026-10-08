// Glome: boot and the frame loop. The parts live in their own modules: render (GL, slice view, resolution,
// profiler), radar, boulders, input, hud, save, and laws (every physical constant).
import { HeightField, prefilter } from './world.js';
import { Player, vec4 } from './player.js';
import { G, sunDir } from './game.js';
import { gl, canvas, overlay, octx, fail, tex, tex3D, N, buildAtlas, makeNoise, vao, dyn, updateDyn, resize, scene,
         drawSlice, present, FOV, prof, mark, gpuBegin, gpuEnd } from './render.js';
import { radar, drawRadar, blitRadar, drawRadarOverlay, makeRadarVolume, recordTrail, headingTo, orbitRadar, zoomRadar,
         compassAt, logMap } from './radar.js';
import { boulders, makeBoulders, updateBoulders, boulderContact } from './boulders.js';
import { keys, mouse, SENS, readInput } from './input.js';
import { gazePoint, drawFaced, drawGazeDot, updateHUD } from './hud.js';
import { loadSettings, saveSettings } from './save.js';
import { LAWS } from './laws.js';

const $ = id => document.getElementById(id);
const state = G.state;
loadSettings();
setInterval(saveSettings, 2000);

// ---------- main loop ----------
let last = performance.now(), lastRaw = last;
function frame(now) {
  const player = G.player;
  prof.interval = 0.95 * prof.interval + 0.05 * (now - last);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; G.simT += dt;
  mark();

  // look
  if (mouse.alt) {
    player.rotate('FA', mouse.dx * SENS);
    player.rotate('RA', -mouse.dy * SENS);
  } else {
    player.rotate('FR', mouse.dx * SENS);
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - mouse.dy * SENS));
  }
  if (mouse.dx || mouse.dy) state.facing = null;          // looking around cancels an automatic turn
  mouse.dx = mouse.dy = 0;
  const turnKeys = (keys.has('KeyC') ? 1 : 0) - (keys.has('KeyZ') ? 1 : 0);
  if (turnKeys) player.rotate('FA', turnKeys * 1.2 * dt);
  if (state.facing && player.turnToward(headingTo(state.facing).dir, 2.2 * dt)) { state.faced = { n: state.facing, what: state.facingWhat, until: G.simT + 5 }; state.facing = null; }
  const k = c => keys.has(c) ? 1 : 0;
  orbitRadar((k('ArrowLeft') - k('ArrowRight')) * 1.6 * dt, (k('ArrowUp') - k('ArrowDown')) * 1.2 * dt);
  zoomRadar((k('Minus') - k('Equal')) * 1.3 * dt);
  state.radar.grow = Math.max(0, Math.min(1, state.radar.grow + (state.radar.big ? 1 : -1) * dt * 4));

  mark('input');
  const input = readInput();
  const sub = 3;
  updateBoulders(player.camera().eye);
  for (let i = 0; i < sub; i++) player.update(dt / sub, input);
  recordTrail();
  state.time += dt;
  mark('physics');

  updateDyn(Math.min(0.2, (now - lastRaw) / 1000)); lastRaw = now;
  resize();
  const cam = player.camera(), sun = sunDir(state.time);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  let rad = null;
  const q = gpuBegin();
  drawSlice(cam, sun, 0, 0, scene.w, scene.h);
  mark('slice');
  if (!state.radar.hidden) rad = drawRadar(cam, sun, G.simT, FOV * scene.w / scene.h);
  mark('radar');
  present();
  if (rad) blitRadar(rad);
  gpuEnd(q);
  mark('present');
  radar.gaze = gazePoint(cam);
  mark('gaze');
  drawFaced(cam); drawGazeDot();
  if (rad) drawRadarOverlay(rad, sun); else radar.rect = null;
  mark('overlay');
  updateHUD(dt, cam, sun);
  mark('hud');
  requestAnimationFrame(frame);
}

// ---------- boot ----------
(async function boot() {
  try {
    const data = prefilter(await buildAtlas(), N);
    tex.atlas = tex3D(N, N, 8 * N, gl.R16F, gl.RED, gl.FLOAT, gl.LINEAR, data);
    tex.noise = makeNoise();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, tex.atlas);
    gl.bindVertexArray(vao);
    const player = G.player = new Player(new HeightField(data, N));
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
      $('hint').textContent = 'Glome needs a keyboard and mouse to explore.';
    // a handle for debugging from the console (__hoop is the old name)
    window.__glome = window.__hoop = { state, player, keys, sunDir, dyn, radar, boulders, prof, compassAt, logMap, recordTrail, LAWS, G,
      dbg: { gl, drawRadar, drawSlice, scene, updateBoulders } };
    requestAnimationFrame(t => { last = t; frame(t); });
  } catch (e) {
    fail(e.message);
  }
})();
