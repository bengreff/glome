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
import { keys, mouse, SENS, readInput, actions } from './input.js';
import { gazePoint, drawFaced, drawGazeDot, updateHUD } from './hud.js';
import { loadSettings, saveSettings, settings, loadWorld, startAutosave, exportFile, importFile, newWorld, hooks } from './save.js';
import { LAWS } from './laws.js';
import { accelBodyA } from './cosmos.js';
import * as saveMod from './save.js';
import * as cosmos from './cosmos.js';
import { capsuleTerrain, envSD, tangents } from './env.js';
import { MASSIF } from './world.js';
import { quality, updateSky } from './render.js';
import { updateSound } from './sounds.js';
import { gpuObj, objects, initObjects, placeStart, stepObjects, playerContacts, uploadObjects, lookedAt, pickUp, drop, throwHeld,
         drawStone, computeGhost, setDown, objectsSave } from './objects.js';
import { flight, updateFlightMode, stepFlight, syncFlightFrame, kick } from './flight.js';

const $ = id => document.getElementById(id);
const state = G.state;
loadSettings();

// ---------- settings (in the help panel) ----------
const QUALITY = { low: 0.55, medium: 0.78, high: 1 };
function applySettings() {
  quality.cap = QUALITY[settings.quality] || 1;
  G.audio?.setVolumes({ sound: settings.sound, music: settings.music });
}
function bindSettings() {
  const sens = $('set-sens'), snd = $('set-sound'), mus = $('set-music'), q = $('set-quality');
  sens.value = Math.log(settings.sens); snd.value = settings.sound; mus.value = settings.music; q.value = settings.quality;
  sens.oninput = () => { settings.sens = Math.exp(+sens.value); };
  snd.oninput = () => { settings.sound = +snd.value; applySettings(); };
  mus.oninput = () => { settings.music = +mus.value; applySettings(); };
  q.onchange = () => { settings.quality = q.value; applySettings(); q.blur(); };
  $('w-export').onclick = () => exportFile();
  $('w-import').onclick = () => $('w-file').click();
  $('w-file').onchange = async () => { const f = $('w-file').files[0]; if (f) { const err = await importFile(f); if (err) $('w-msg').textContent = `That file could not be loaded: ${err}.`; } };
  let armed = 0;
  $('w-new').onclick = () => {
    if (performance.now() - armed < 4000) return newWorld();
    armed = performance.now(); $('w-msg').textContent = 'Click "New world" again to start over (your settings are kept).';
  };
  applySettings();
}

// ---------- fades ----------
// Nothing kills you. Wading past chest depth (or, later, drifting in space) fades the world out and back in
// somewhere safe.
const fade = { t: -1, then: null };
export function fadeOut(then) { if (fade.t < 0) { fade.t = 0; fade.then = then; } }
function updateFade(dt) {
  if (fade.t < 0) return;
  fade.t += dt;
  if (fade.then && fade.t >= 0.6) { fade.then(); fade.then = null; }
  const a = fade.t < 0.6 ? fade.t / 0.6 : Math.max(0, 1 - (fade.t - 0.9) / 0.7);
  $('fade').style.opacity = a.toFixed(3);
  if (fade.t > 1.6) { fade.t = -1; $('fade').style.opacity = 0; }
}
const CHEST = 1.3;
function backToDry() {
  const p = G.player, d = p.dry || G.home;
  p.pos = d.pos.slice(); p.vel = [0, 0, 0, 0];
  if (d.F) { p.F = d.F; p.R = d.R; p.A = d.A; }
  p.settleFrame();
}

// ---------- hands: pick up, carry, set down, throw ----------
const hold = { fT: -1, mT: -1, ghostT: 0 };
const kickPlayer = dv => { if (flight.active) kick(dv); else G.player.vel = vec4.add(G.player.vel, dv); };
function handleActions(cam) {
  const now = G.simT;
  if (actions.fDown) {
    actions.fDown = false;
    if (objects.held) hold.fT = now;                       // tap: drop · hold: show where it will rest
    else { const b = lookedAt(cam); if (b) pickUp(b); }
  }
  if (actions.fUp) {
    actions.fUp = false;
    if (hold.fT >= 0 && objects.held) { if (now - hold.fT > 0.3 && objects.ghost) setDown(); else drop(); }
    hold.fT = -1; objects.ghost = null;
  }
  if (hold.fT >= 0 && objects.held && now - hold.fT > 0.3 && now - hold.ghostT > 0.2) { computeGhost(cam); hold.ghostT = now; }
  G.charge = hold.mT >= 0 && objects.held ? (now - hold.mT) / 1.0 : -1;
  if (actions.g) { actions.g = false; drawStone(cam); }
  if (actions.mDown) { actions.mDown = false; if (objects.held) hold.mT = now; }
  if (actions.mUp) {
    actions.mUp = false;
    if (hold.mT >= 0 && objects.held) throwHeld(cam, Math.min(1, (now - hold.mT) / 1.0), kickPlayer);
    hold.mT = -1;
  }
}
// Soft reset: after touching the star or drifting too long, a quiet fade back to the last ground you stood on.
function softReset() {
  flight.active = false;
  fadeOut(backToDry);
}

// ---------- main loop ----------
let last = performance.now(), lastRaw = last, physAcc = 0;
const STEP = 1 / 120;
const accel = (x, v) => accelBodyA(x, v, state.time);
function frame(now) {
  const player = G.player;
  prof.interval = 0.95 * prof.interval + 0.05 * (now - last);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; G.simT += dt;
  mark();

  // look
  const sens = SENS * settings.sens;
  if (mouse.alt) {
    player.rotate('FA', mouse.dx * sens);
    player.rotate('RA', -mouse.dy * sens);
  } else {
    player.rotate('FR', mouse.dx * sens);
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - mouse.dy * sens));
  }
  if (mouse.dx || mouse.dy) { state.facing = null; syncFlightFrame(player); }   // looking around cancels an automatic turn
  mouse.dx = mouse.dy = 0;
  const turnKeys = (keys.has('KeyC') ? 1 : 0) - (keys.has('KeyZ') ? 1 : 0);
  if (turnKeys) { player.rotate('FA', turnKeys * 1.2 * dt); syncFlightFrame(player); }
  if (state.facing && player.turnToward(headingTo(state.facing).dir, 2.2 * dt)) { state.faced = { n: state.facing, what: state.facingWhat, until: G.simT + 5 }; state.facing = null; }
  const k = c => keys.has(c) ? 1 : 0;
  orbitRadar((k('ArrowLeft') - k('ArrowRight')) * 1.6 * dt, (k('ArrowUp') - k('ArrowDown')) * 1.2 * dt);
  zoomRadar((k('Minus') - k('Equal')) * 1.3 * dt);
  state.radar.grow = Math.max(0, Math.min(1, state.radar.grow + (state.radar.big ? 1 : -1) * dt * 4));

  mark('input');
  const input = fade.t >= 0 ? { fwd: 0, right: 0, ana: 0, jump: false, run: false } : readInput();
  updateBoulders(player.camera().eye);
  // physics runs in fixed steps of 1/120 s (PHYSICS.md), as many as the frame needs
  physAcc += dt * LAWS.TIME_RATE;
  handleActions(player.camera());
  for (let n = 0; physAcc >= STEP && n < 10; n++, physAcc -= STEP) {
    updateFlightMode(player);
    if (flight.active) { if (!stepFlight(player, STEP)) softReset(); }
    else {
      player.update(STEP, input, accel);
      capsuleTerrain(player);
    }
    playerContacts(player);
    stepObjects(player.camera());
    state.time += STEP;
  }
  if (player.depth > CHEST) fadeOut(backToDry);
  updateFade(dt);
  recordTrail();
  mark('physics');

  updateDyn(Math.min(0.2, (now - lastRaw) / 1000)); lastRaw = now;
  resize();
  const cam = player.camera(), sun = updateSky(state.time, cam.eye);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  let rad = null;
  uploadObjects(cam);
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
  updateSound(dt, cam);
  mark('hud');
  requestAnimationFrame(frame);
}

// ---------- boot ----------
(async function boot() {
  try {
    const built = await buildAtlas(), data = prefilter(built.data, N);
    tex.atlas = tex3D(N, N, 8 * N, gl.R16F, gl.RED, gl.FLOAT, gl.LINEAR, data);
    tex.water = tex3D(N >> 1, N >> 1, 8 * (N >> 1), gl.R16F, gl.RED, gl.FLOAT, gl.LINEAR, built.water);
    tex.noise = makeNoise();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, tex.atlas);
    gl.bindVertexArray(vao);
    const player = G.player = new Player(new HeightField(data, N, built.water));
    let seed = 20261006;
    const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
    player.spawn(rand);
    // You arrive on a gentle hillside within sight of the great massif, facing it.
    {
      const T = tangents(MASSIF);
      let best = null;
      for (let k = 0; k < 600; k++) {
        const d = vec4.norm([0, 1, 2, 3].map(i => (rand() - 0.5) * T[0][i] + (rand() - 0.5) * T[1][i] + (rand() - 0.5) * T[2][i]));
        const m = 75 + 45 * rand(), n = vec4.norm(vec4.add(vec4.scale(MASSIF, Math.cos(m / 250)), vec4.scale(d, Math.sin(m / 250))));
        const h = player.hf.heightAt(n);
        if (h < 4 || h > 22 || player.hf.waterAt(n) > 0.01) continue;
        // flat ground over a few metres (so the cairn's balls stay put), and closer is better
        let rough = 0;
        for (const t of tangents(n)) for (const e of [2, 6]) rough += Math.abs(player.hf.heightAt(vec4.norm(vec4.add(n, vec4.scale(t, e / 250)))) - h) / e;
        rough += (m - 75) / 400;
        if (!best || rough < best.rough) best = { n, rough };
      }
      if (best) {
        player.pos = vec4.scale(best.n, 250 + player.hf.heightAt(best.n) + 0.05);
        const u = best.n, toM = vec4.sub(MASSIF, vec4.scale(u, vec4.dot(MASSIF, u)));
        player.F = vec4.norm(toM);
        const T2 = tangents(u).map(t => vec4.sub(t, vec4.scale(player.F, vec4.dot(t, player.F))));
        T2.sort((a, b) => vec4.len(b) - vec4.len(a));
        player.R = vec4.norm(T2[0]); player.A = vec4.norm(vec4.sub(T2[1], vec4.scale(player.R, vec4.dot(T2[1], player.R))));
        player.settleFrame();
        player.pitch = 0.12;
      }
    }
    makeRadarVolume();
    makeBoulders(rand);
    player.contact = boulderContact;
    initObjects(accel, envSD, { height: p => vec4.len(p) - 250 - player.hf.waterAt(vec4.norm(p)), up: p => vec4.norm(p), density: 1000 });
    placeStart(rand);
    hooks.objects = objectsSave;
    G.objects = objects;
    G.home = { pos: player.pos.slice(), F: player.F, R: player.R, A: player.A };
    // start in the morning: sun about 20° up and rising
    const up = player.up();
    for (let t = 0; t < 20000; t += 0.5) {
      const e0 = vec4.dot(sunDir(t), up), e1 = vec4.dot(sunDir(t + 0.5), up);
      if (e0 > 0.3 && e0 < 0.38 && e1 > e0) { state.time = t; break; }
    }
    loadWorld();                       // a saved world, if there is one, replaces the fresh start
    startAutosave();
    bindSettings();
    $('loading').hidden = true;
    $('hud').hidden = !state.help;
    $('hint').hidden = false;
    if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches)
      $('hint').textContent = 'Glome needs a keyboard and mouse to explore.';
    // a handle for debugging from the console (__hoop is the old name)
    window.__glome = window.__hoop = { state, player, keys, sunDir, dyn, radar, boulders, prof, compassAt, logMap, recordTrail, LAWS, G, settings,
      dbg: { gl, drawRadar, drawSlice, scene, updateBoulders, accel, envSD, fade, STEP, save: saveMod, cosmos, backToDry, gpuObj, objects, flight, hold, handleActions, actions, kickPlayer } };
    requestAnimationFrame(t => { last = t; frame(t); });
  } catch (e) {
    fail(e.message);
  }
})();
