// Glome: boot and the frame loop. The parts live in their own modules: render (GL, slice view, resolution,
// profiler), radar, boulders, input, hud, save, and laws (every physical constant).
import { HeightField, prefilter } from './world.js';
import { Player, vec4 } from './player.js';
import { G, sunDir } from './game.js';
import { gl, canvas, overlay, octx, fail, tex, tex3D, N, buildAtlas, makeNoise, vao, dyn, updateDyn, resize, scene,
         drawSlice, present, FOV, prof, mark, gpuBegin, gpuEnd } from './render.js';
import { radar, radarRect, drawRadar, blitRadar, drawRadarOverlay, makeRadarVolume, recordTrail, headingTo, orbitRadar, zoomRadar,
         compassAt, logMap } from './radar.js';
import { boulders, makeBoulders, updateBoulders, boulderContact } from './boulders.js';
import { keys, mouse, SENS, readInput, actions, pad, pollPad } from './input.js';
import { gazePoint, drawFaced, drawGazeDot, drawBMarks, drawGoal, updateHUD } from './hud.js';
import { guide, updateGuide, updateBeam } from './guide.js';
import { flora, initFlora, updateFlora } from './flora.js';
import { loadSettings, saveSettings, settings, loadWorld, startAutosave, exportFile, importFile, newWorld, hooks } from './save.js';
import { LAWS } from './laws.js';
import { accelBodyA } from './cosmos.js';
import * as saveMod from './save.js';
import * as cosmos from './cosmos.js';
import { capsuleTerrain, envSD, tangents } from './env.js';
import { MASSIF } from './world.js';
import { quality, updateSky, setFov, hits, sunbuf, programsReady } from './render.js';
import { updateSound } from './sounds.js';
import { spawn as spawnObj, gpuObj, objects, initObjects, placeStart, stepObjects, playerContacts, uploadObjects, lookedAt, pickUp, drop, throwHeld,
         drawStone, pouchKey, tiltHeld, endTilt, computeGhost, setDown, objectsSave, moveHeld, carryHeld, hold as holdState } from './objects.js';
import { flight, updateFlightMode, stepFlight, syncFlightFrame, kick } from './flight.js';
import { launcher, buildLauncher, placeParts, updateLauncher, tryLaunch, TIERS } from './launcher.js';
import { smap, updateSpaceMap, drawSpaceMap } from './spacemap.js';
import { accelB, groundRadiusB, floorOf } from './planetB.js';
import { buildLandforms, floorRadius, nearCarves, carveSD } from './landforms.js';
import { growTree, trees, groves, rope as ropeSlot, makeForests, treeFrame, tgpu } from './trees.js';
import { stepGate } from './knot.js';
import { creatures, initCreatures, addWalker, stepCreatures, creatureDraw, creaturesSave } from './creatures.js';
import { artifacts, buildArtifacts, updateArtifacts, syncArtifacts } from './artifacts.js';
import { bworld, buildB, bItems, trackOrbit, nearConsole, openConsole, closeConsole, updateConsole, bindConsole } from './console.js';
import { spinSave, spinLoad } from './cosmos.js';
import { stepBoats, windAt } from './boats.js';
import { legs as legSlot } from './trees.js';
import { terrainSD } from './env.js';
import { orbitOf, toBody, dirToBody, dirToInertial } from './cosmos.js';
import { RIVERS, ISLANDS, ARCHI } from './world.js';
import { props, makeRocks, uploadProps, rockContact, rocksAt, placeRock, setExtraProps } from './props.js';
import { finds, makeFinds } from './finds.js';
import { updateNooks } from './nooks.js';
import { tiles } from './tiles.js';

const $ = id => document.getElementById(id);
const state = G.state;
loadSettings();

// ---------- settings (in the help panel) ----------
const QUALITY = { low: 0.55, medium: 0.78, high: 1 };
function applySettings() {
  quality.cap = QUALITY[settings.quality] || 1;
  setFov(settings.fov);
  G.audio?.setVolumes({ sound: settings.sound, music: settings.music });
}
function bindSettings() {
  const sens = $('set-sens'), snd = $('set-sound'), mus = $('set-music'), q = $('set-quality'), fov = $('set-fov'), inv = $('set-invert');
  sens.value = Math.log(settings.sens); snd.value = settings.sound; mus.value = settings.music; q.value = settings.quality;
  fov.value = settings.fov; inv.checked = !!settings.invert;
  fov.oninput = () => { settings.fov = +fov.value; applySettings(); };
  inv.onchange = () => { settings.invert = inv.checked; inv.blur(); };
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
  flight.active = false;
  p.onB = d.onB ?? null; p.groundFn = p.onB != null ? groundRadiusB : null;
  p.pos = d.pos.slice(); p.vel = [0, 0, 0, 0];
  if (d.F) { p.F = d.F; p.R = d.R; p.A = d.A; }
  p.settleFrame();
  moveHeld(p.onB != null);                                 // what you hold comes too
  carryHeld(p.onB != null ? p.camera() : cameraNow());
}

// ---------- hands: pick up, carry, set down, throw ----------
const hold = { fT: -1, mT: -1, ghostT: 0 };
// A change of your velocity given in A's frame (the frame objects live in): in flight it goes to the inertial state,
// on B into B's frame (whose axes are inertial).
const kickPlayer = dv => { const p = G.player; if (flight.active) kick(dv); else if (p.onB != null) p.vel = vec4.add(p.vel, dirToInertial(dv, state.time)); else p.vel = vec4.add(p.vel, dv); };
// The rope where you look at it (within reach, and within 12 cm of your gaze in all four directions): its particle.
function ropeAt(cam) {
  if (!G.rope || G.player.onB != null) return -1;
  let best = -1, bd = 0.12;
  G.rope.x.forEach((q, i) => { const d = vec4.sub(q, cam.eye), t = vec4.dot(d, cam.F); if (t > 0 && t < 3.2) { const m = vec4.len(vec4.sub(d, vec4.scale(cam.F, t))); if (m < bd) { bd = m; best = i; } } });
  return best;
}
function handleActions(cam) {
  const now = G.simT, p = G.player;
  // things are handled in the frame of the world they are in: on B, B's (your own frame there)
  const camW = p.onB != null ? p.camera() : cam, kickW = p.onB != null ? dv => { p.vel = vec4.add(p.vel, dv); } : kickPlayer;
  if (actions.fDown) {
    actions.fDown = false;
    if (!objects.held && nearConsole(G.player)) { if ($('console').hidden) openConsole(); else closeConsole(); }
    else if (G.ropeHeld != null) G.ropeHeld = null;       // let go of the rope
    else if (objects.held) hold.fT = now;                  // tap: drop · hold: show where it will rest
    else {
      const b = lookedAt(camW);
      if (b) pickUp(b, camW);
      else {                                               // or take hold of the rope, where it is (your hand keeps it there, as you turn and go)
        const i = ropeAt(cam);
        if (i >= 0) { const d = vec4.sub(G.rope.x[i], cam.eye); G.ropeHeld = i; G.ropeOff = [cam.F, cam.R, cam.U, cam.A].map(e => vec4.dot(d, e)); G.audio?.emit('clack', G.rope.x[i], 0.25); }
      }
    }
  }
  if (actions.fUp) {
    actions.fUp = false;
    if (hold.fT >= 0 && objects.held) { if (now - hold.fT > 0.3 && objects.ghost) setDown(); else drop(); }
    hold.fT = -1; objects.ghost = null;
  }
  if (hold.fT >= 0 && objects.held && now - hold.fT > 0.3 && now - hold.ghostT > 0.2) { computeGhost(camW); hold.ghostT = now; }
  G.charge = hold.mT >= 0 && objects.held ? (now - hold.mT) / 1.0 : -1;
  if (actions.g) { actions.g = false; pouchKey(camW); }
  if (actions.mDown) { actions.mDown = false; if (objects.held) hold.mT = now; }
  if (actions.mUp) {
    actions.mUp = false;
    if (hold.mT >= 0 && objects.held) throwHeld(camW, Math.min(1, (now - hold.mT) / 1.0), kickW);
    hold.mT = -1;
  }
}
// The camera in A's frame (the renderer's frame), wherever you are: on B your frame is B's, carried on its orbit.
// For drawing, alpha < 1 places it between the last two physics steps (the frame falls between them), with the
// time to match, so motion is smooth whatever the display's rate.
function cameraNow(alpha = 1) {
  const p = G.player, c = p.camera();
  let t = state.time;
  if (alpha < 1 && p.prevPos && p.prevOnB === p.onB && vec4.len(vec4.sub(p.pos, p.prevPos)) < 3) {
    c.eye = vec4.add(c.eye, vec4.scale(vec4.sub(p.pos, p.prevPos), alpha - 1));
    t -= (1 - alpha) * STEP;
  }
  if (p.onB == null) return c;
  const o = orbitOf('B', t).c, toA = v => dirToBody(v, t);
  return { eye: toBody([o[0] + c.eye[0], o[1] + c.eye[1], o[2] + c.eye[2], o[3] + c.eye[3] + p.onB * LAWS.L], t), F: toA(c.F), R: toA(c.R), U: toA(c.U), A: toA(c.A), up: toA(c.up) };
}
// B's return pad: one floor, in the accent colour; jump on it and it throws you along your gaze at 33 m/s
// (B's escape speed is 28).
export const B_PAD = 0, B_PAD_SPEED = 33;
function tryLaunchB(p, jump) {
  if (!jump || p.onB == null || !p.grounded || floorOf(p.up()) !== B_PAD || G.simT - (tryLaunchB.last || -9) < 1.5) return false;
  tryLaunchB.last = G.simT;
  const c = p.camera(), u = p.up(), dir = vec4.dot(c.F, u) > 0.05 ? c.F : u;
  p.vel = vec4.scale(dir, B_PAD_SPEED); p.pos = vec4.add(p.pos, vec4.scale(u, 0.3)); p.grounded = false; p.airborneUntil = G.simT + 0.5;
  G.audio?.emit('launch', p.pos, 1.0);
  return true;
}
// The console's flight: no gravity, you go where you look (W/S, A/D, E/Q, Space/Shift for up and down), and the
// ground still holds you.
function flyStep(p, input, dt) {
  flight.active = false;
  const c = p.camera(), sp = 14;
  const dir = vec4.add(vec4.add(vec4.add(vec4.scale(c.F, input.fwd), vec4.scale(c.R, input.right)), vec4.scale(p.A, input.ana)), vec4.scale(p.up(), (input.jump ? 1 : 0) - (input.run ? 1 : 0)));
  const dl = vec4.len(dir);
  p.vel = dl > 1e-9 ? vec4.scale(dir, sp / dl) : [0, 0, 0, 0];
  p.pos = vec4.add(p.pos, vec4.scale(p.vel, dt));
  const g = p.ground(p.up());
  if (vec4.len(p.pos) < g) p.pos = vec4.scale(p.up(), g);
  p.grounded = false; p.settleFrame();
}
// Soft reset: after touching the star or drifting too long, a quiet fade back to the last ground you stood on.
function softReset() {
  flight.active = false;
  fadeOut(backToDry);
}

// ---------- main loop ----------
let last = performance.now(), lastRaw = last, physAcc = 0, tilting = false;
const STEP = 1 / 120;
const accel = (x, v) => accelBodyA(x, v, state.time);
// One bad frame must never stop the world: errors are recorded (and logged once) and the loop carries on.
function frame(now) {
  try { frameBody(now); }
  catch (e) { if (G.lastError !== e.stack) console.error(e); G.lastError = e.stack; G.errors = (G.errors || 0) + 1; last = now; }
  requestAnimationFrame(frame);
}
function frameBody(now) {
  const player = G.player;
  prof.interval = 0.95 * prof.interval + 0.05 * (now - last);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; G.simT += dt;
  mark();

  // look
  const sens = SENS * settings.sens, dy = settings.invert ? -mouse.dy : mouse.dy;
  if (keys.has('KeyR') && objects.held) { tiltHeld(mouse.dx, dy, mouse.alt, sens * 2.5); tilting = true; }   // (R: the mouse turns what you hold)
  else {
  if (tilting) { endTilt(); tilting = false; }
  if (mouse.alt) {
    player.rotate('FA', mouse.dx * sens);
    player.rotate('RA', -dy * sens);
  } else {
    player.rotate('FR', mouse.dx * sens);
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sens));
  }
  }
  if (mouse.dx || mouse.dy) { state.facing = null; syncFlightFrame(player); }   // looking around cancels an automatic turn
  mouse.dx = mouse.dy = 0;
  // a gamepad's right stick: radians a second (holding LT: toward ana, and twist)
  pollPad();
  if (pad.rx || pad.ry) {
    const s2 = settings.sens, ry = settings.invert ? -pad.ry : pad.ry;
    if (pad.alt) { player.rotate('FA', pad.rx * 2.0 * s2 * dt); player.rotate('RA', -ry * 2.0 * s2 * dt); }
    else { player.rotate('FR', pad.rx * 2.6 * s2 * dt); player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - ry * 2.0 * s2 * dt)); }
    state.facing = null; syncFlightFrame(player);
  }
  if (pad.zoom) zoomRadar(pad.zoom * 1.3 * dt);
  const turnKeys = (keys.has('KeyC') ? 1 : 0) - (keys.has('KeyZ') ? 1 : 0);
  if (turnKeys) { player.rotate('FA', turnKeys * 1.2 * dt); syncFlightFrame(player); }
  if (state.facing && player.turnToward(headingTo(state.facing).dir, 2.2 * dt)) { state.faced = { n: state.facing, what: state.facingWhat, until: G.simT + 5 }; state.facing = null; }
  const k = c => keys.has(c) ? 1 : 0;
  orbitRadar((k('ArrowLeft') - k('ArrowRight')) * 1.6 * dt, (k('ArrowUp') - k('ArrowDown')) * 1.2 * dt);
  zoomRadar((k('Minus') - k('Equal')) * 1.3 * dt);
  state.radar.grow = Math.max(0, Math.min(1, state.radar.grow + (state.radar.big ? 1 : -1) * dt * 4));

  mark('input');
  const input = fade.t >= 0 ? { fwd: 0, right: 0, ana: 0, jump: false, run: false } : readInput();
  updateBoulders(cameraNow().eye);
  // physics runs in fixed steps of 1/120 s (PHYSICS.md), as many as the frame needs
  physAcc += dt * LAWS.TIME_RATE;
  handleActions(cameraNow());
  for (let n = 0; physAcc >= STEP && n < 10; n++, physAcc -= STEP) {
    const onB = player.onB != null;
    player.prevPos = player.pos.slice(); player.prevOnB = player.onB;
    const v0 = player.vel.slice();
    let launched = false;
    if (!onB) { updateLauncher(player); launched = tryLaunch(player, player.camera(), input.jump && !flight.active); }
    else launched = tryLaunchB(player, input.jump);
    // a launch throws you and what you hold together (it is in the world, and so the frame, you are in)
    if (launched && objects.held) objects.held.vel = vec4.add(objects.held.vel, vec4.sub(player.vel, v0));
    updateFlightMode(player);
    if (flight.active) { if (!stepFlight(player, STEP)) softReset(); }
    else if (G.fly) flyStep(player, input, STEP);
    else if (onB) { const k = player.onB; player.update(STEP, input, (x, v) => accelB(x, v, state.time, k)); }
    else {
      player.floorFn = nearCarves(player.pos, 25) ? (n, r) => floorRadius(n, r, player.hf) : null;
      player.update(STEP, input, accel);
      capsuleTerrain(player);
    }
    player.ride = null;
    if (!flight.active) playerContacts(player, undefined, input);   // the bodies of the planet you are on
    if (player.supported && !flight.active && !(G.simT < player.airborneUntil)) player.grounded = true;   // standing on a thing is footing too
    if (!onB) stepBoats(STEP, state.time);
    trackOrbit(flight, state.time);
    if (objects.held && !!objects.held.inB !== (player.onB != null)) moveHeld(player.onB != null);   // landing on B or leaving it: what you hold comes too
    stepObjects(cameraNow(), kickPlayer);
    if (player.onB != null) stepObjects(player.camera(), dv => { player.vel = vec4.add(player.vel, dv); }, objects.worldB, 150, 900);
    if (G.knot && !onB) {                                  // the knot gate's rope, held where your hand is
      const c = cameraNow(), o = G.ropeOff || [0.8, 0, -0.3, 0];
      const hand = G.ropeHeld != null ? { i: G.ropeHeld, p: [c.F, c.R, c.U, c.A].reduce((q, e, k) => vec4.add(q, vec4.scale(e, o[k])), c.eye) } : null;
      stepGate(G.knot, STEP, c.eye, hand);
      if (hand && G.rope.strain() > 0.08) G.ropeHeld = null;   // pulled hard (by the leaf, or caught on something), it slips from your hand
    }
    state.time += STEP;
  }
  if (player.depth > CHEST) fadeOut(backToDry);
  updateFade(dt);
  if (player.onB == null) recordTrail();
  mark('physics');

  updateDyn(Math.min(0.2, (now - lastRaw) / 1000)); lastRaw = now;
  resize();
  // draw between the last two steps: this frame's share of the next step
  const alpha = Math.min(1, physAcc / STEP), tR = state.time - (1 - alpha) * STEP;
  ropeSlot.alpha = alpha;
  const cam = cameraNow(alpha), sun = updateSky(tR, cam.eye, cam.up);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  let rad = null;
  if (player.onB == null) {
    updateArtifacts();
    updateNooks();
    stepCreatures(Math.min(dt, 0.05) * LAWS.TIME_RATE, player.hf);
    const cd = creatureDraw(cam.eye, cam.A, player.hf, dt);
    setExtraProps(cd.items); legSlot.caps = cd.caps;          // the creatures' bodies are props; their legs go with the trees
  } else { setExtraProps([]); legSlot.caps = []; }
  G.creatureItems = bItems(cam, tR, alpha);                  // B's pillars and console, when near
  updateConsole();
  uploadObjects(cam, alpha);
  // the first sight of your own planet's copies round the hoop: a copy inside your slice, in front of you, in the sky
  if (!G.flags.copiesSeen) {
    const h = cosmos.hoopAxisBody(state.time);
    for (const k of [-1, 1]) {
      const c = vec4.scale(h, k * LAWS.L), d = vec4.sub(c, cam.eye), l = vec4.len(d), u = player.up();
      if (Math.abs(vec4.dot(d, cam.A)) < LAWS.R_A && vec4.dot(d, cam.F) / l > Math.cos(0.5) && vec4.dot(d, u) / l > 0.05 && player.onB == null) {
        G.flags.copiesSeen = true; G.audio?.cue('copies'); break;
      }
    }
  }
  updateGuide(); updateBeam(cam);
  uploadProps(cam, sun, scene.w, scene.h, FOV);
  updateFlora(cam.eye);
  treeFrame(cam, sun, scene.w, scene.h, FOV);
  const q = gpuBegin();
  drawSlice(cam, sun, 0, 0, scene.w, scene.h);
  mark('slice');
  // above the ground (or on a charged launcher) the radar becomes the space map
  const onLauncher = launcher.onPad && launcher.tier > 0 && !flight.active;
  const spaceMode = flight.active || onLauncher || player.onB != null || player.heightAboveGround() > 60;
  if (!state.radar.hidden && !state.bare && !spaceMode) rad = drawRadar(cam, sun, G.simT, FOV * scene.w / scene.h);
  else radar.last = null;                                    // (the space map takes no clicks: nothing stale to pick)
  mark('radar');
  present();
  if (rad) blitRadar(rad);
  gpuEnd(q);
  mark('present');
  radar.gaze = gazePoint(cam);
  // what the dot rests on: something you could take (or the console, on B), and how hard you strain at what you hold
  G.canTake = !objects.held && G.ropeHeld == null && fade.t < 0 && (!!lookedAt(player.onB != null ? player.camera() : cam) || ropeAt(cam) >= 0 || nearConsole(player));
  G.strain = objects.held ? holdState.strain || 0 : 0;
  mark('gaze');
  if (!state.bare) { drawFaced(cam); drawBMarks(); drawGoal(cam); drawGazeDot(); }
  if (rad) drawRadarOverlay(rad, sun); else radar.rect = null;
  if (spaceMode && !state.radar.hidden && !state.bare) {
    const u = player.up(), pc = player.camera(), dir = vec4.dot(pc.F, u) > 0.05 ? pc.F : u;
    updateSpaceMap({ flight, launch: onLauncher ? vec4.scale(dir, TIERS[launcher.tier]) : null, onB: player.onB });
    radar.rect = radarRect();
    drawSpaceMap(radar.rect, state.radar.yaw, state.radar.el);
  }
  mark('overlay');
  updateHUD(dt, cam, sun);
  updateSound(dt, cam);
  mark('hud');
}

// ---------- boot ----------
(async function boot() {
  const bootT0 = performance.now(), stamps = {};
  // between its long steps, boot lets the page breathe (a slow computer would otherwise call the page unresponsive)
  const step = async (msg, name) => { if (name) stamps[name] = Math.round(performance.now() - bootT0); const e = $('load-msg'); if (e) e.textContent = msg; await new Promise(r => setTimeout(r, 0)); };
  try {
    const built = await buildAtlas(), data = prefilter(built.data, N);
    stamps.terrain = performance.now() - bootT0;
    await step('Setting down boulders, rocks and things…');
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
    buildLandforms(player.hf, player.up(), player.A);
    {
      // three landmark trees: on a rise beside the start, on an island, and by a river
      const hf = player.hf, home = player.up();
      const highNear = (c, R) => { let best = null; for (let i = 0; i < 300; i++) { const T = tangents(c), d = vec4.norm([0, 1, 2, 3].map(k => (rand() - 0.5) * T[0][k] + (rand() - 0.5) * T[1][k] + (rand() - 0.5) * T[2][k])), m = R * Math.sqrt(rand()), n = vec4.norm(vec4.add(vec4.scale(c, Math.cos(m / 250)), vec4.scale(d, Math.sin(m / 250)))), h = hf.heightAt(n); if (hf.waterAt(n) > h - 0.3 || h < 1) continue; if (!best || h > best.h) best = { n, h }; } return best; };
      const side = vec4.norm(vec4.add(vec4.scale(home, Math.cos(45 / 250)), vec4.scale(player.R, Math.sin(45 / 250))));
      const t1 = highNear(side, 18), t2 = highNear(ISLANDS[1].n, 6), R2 = RIVERS[RIVERS.length - 1], rv = R2.pts[Math.floor(R2.pts.length * 0.5)];
      if (t1) growTree(t1.n, t1.h, { height: 8 }).landmark = true;
      if (t2) growTree(t2.n, t2.h, { height: 6.5, spread: 0.9 }).landmark = true;
      const t3 = highNear(rv, 14);
      if (t3) growTree(t3.n, t3.h, { height: 7.5, spread: 0.65 }).landmark = true;
    }
    await step('Setting down boulders, rocks and things…', 'landforms');
    makeBoulders(rand);
    player.contact = (p, dt, input) => { boulderContact(p, dt, input); rockContact(p, dt, input); };
    initObjects(accel, envSD, { height: p => vec4.len(p) - 250 - player.hf.waterAt(vec4.norm(p)), up: p => vec4.norm(p), density: 1000 });
    placeStart(rand);
    buildLauncher(player.hf);
    {
      // the launcher's four parts, where the artifacts will guard them: near the start, by a river mouth, on an
      // island joined only through ana, and as near the summit's antipode as there is dry ground (each artifact is
      // built on level, dry ground near its part's place)
      const hf = player.hf, home = player.up(), T = tangents(home);
      const dry = (n, tries = 400) => { if (hf.heightAt(n) > 0.8) return n; let b = null; for (let i = 0; i < tries; i++) { const t = tangents(n), r = 3 + i * 0.25, a = i * 2.4, c = i * 1.7; const d = vec4.norm([0, 1, 2, 3].map(k => Math.cos(a) * t[0][k] + Math.sin(a) * Math.cos(c) * t[1][k] + Math.sin(a) * Math.sin(c) * t[2][k])); const q = vec4.norm(vec4.add(vec4.scale(n, Math.cos(r / 250)), vec4.scale(d, Math.sin(r / 250)))); if (hf.heightAt(q) > 0.8 && hf.waterAt(q) <= 0.01) { b = q; break; } } return b || n; };
      const toward = vec4.norm(vec4.sub(MASSIF, vec4.scale(home, vec4.dot(MASSIF, home))));
      const p1 = vec4.norm(vec4.add(vec4.add(vec4.scale(home, Math.cos(14 / 250)), vec4.scale(toward, Math.sin(14 / 250) * 0.95)), vec4.scale(player.A, Math.sin(14 / 250) * 0.3)));
      const R0 = RIVERS[0], p2 = R0.pts[Math.max(0, R0.pts.length - 8)];
      const p3 = ISLANDS[3].n, p4 = dry(vec4.scale(launcher.n, -1));
      placeParts([dry(p1), dry(p2), p3, p4]);
      // a lantern in the cave's chamber (the cave is a place to find: its only way in leaves the chamber toward ana)
      if (G.cave) { const u = vec4.norm(G.cave.floor), t = tangents(u)[0], l = spawnObj('lantern', u); l.pos = vec4.add(vec4.add(G.cave.floor, vec4.scale(u, 0.5)), vec4.scale(t, 1.6)); l.sleeping = false; }
      G.partSpots = [p1, p2, p3, p4];
    }
    hooks.objects = objectsSave;
    {
      // herds where you will go first: near where you arrive, on the way up to the summit, and by each artifact's place
      const home = player.up(), way = f => vec4.norm(vec4.add(vec4.scale(home, 1 - f), vec4.scale(launcher.n, f)));
      initCreatures(player.hf);
      // and a few in your first view, grazing ahead of you in your slice; most of them will come and look
      const at = (deg, m) => { const a = deg * Math.PI / 180; return vec4.norm(vec4.add(vec4.scale(home, Math.cos(m / 250)), vec4.scale(vec4.norm(vec4.add(vec4.scale(player.F, Math.cos(a)), vec4.scale(player.R, Math.sin(a)))), Math.sin(m / 250)))); };
      [[-20, 19, true], [-7, 23, true], [-30, 25, true], [6, 18, false], [-14, 28, true]].forEach(([d, m, cur]) => { const n = at(d, m); if (player.hf.heightAt(n) > 1 && player.hf.waterAt(n) < 0.01) addWalker(n, cur); });
    }
    hooks.creatures = creaturesSave;
    G.creatures = creatures;
    {
      // a raft on a beach facing the archipelago, and a sail on one of the islands
      const hf = player.hf; let beach = null;
      for (let i = 0; i < 4000 && !beach; i++) {
        const T = tangents(ARCHI), d = vec4.norm([0, 1, 2, 3].map(k => (rand() - 0.5) * T[0][k] + (rand() - 0.5) * T[1][k] + (rand() - 0.5) * T[2][k]));
        const m = 150 + 60 * rand(), n = vec4.norm(vec4.add(vec4.scale(ARCHI, Math.cos(m / 250)), vec4.scale(d, Math.sin(m / 250)))), h = hf.heightAt(n);
        if (h > 0.4 && h < 1.6 && hf.waterAt(n) < 0.01) beach = n;
      }
      if (beach) { const r = spawnObj('raft', beach); r.boat = true; G.raftHome = beach; }
      spawnObj('sail', ISLANDS[2].n);
    }
    buildArtifacts();
    {
      // the rocks: clusters of 4D shapes by kind over the whole planet, and a few of each near where you arrive; none
      // on the start, the paths of the artifacts, the launcher, the cave's mouth or the raft's beach
      const hf = player.hf, home = player.up(), keep = [[home, 7]];
      if (launcher.n) keep.push([launcher.n, 45]);                  // (the summit stays clear: a launch leaves it nearly level)
      for (const n of G.partSpots || []) keep.push([vec4.norm(n), 8]);
      for (const a of G.artifacts || []) keep.push([a.n, 9]);
      if (G.cave) keep.push([vec4.norm(G.cave.mouth), 10]);
      if (G.raftHome) keep.push([G.raftHome, 8]);
      const keepOut = (n, r) => keep.some(([q, m]) => Math.acos(Math.max(-1, Math.min(1, vec4.dot(q, n)))) * 250 < m + r)
        || carveSD(vec4.scale(n, 250 + hf.heightAt(n))).d < r + 2;
      await step('Setting down rocks…', 'objects');
      G.rocksMade = makeRocks(hf, home, keepOut, [['outcrop', 16, 32], ['erratic', 10, 22], ['crystal', 24, 45], ['scree', 26, 50], ['stone', 12, 45],
        ['outcrop', 25, 45], ['outcrop', 30, 60], ['erratic', 15, 35], ['erratic', 20, 40], ['crystal', 35, 60], ['scree', 20, 45]]);
      // the woods: none in a rock or a boulder either
      const bgrid = new Map(), bkey = q => q.map(v => Math.floor(v / 10)).join();
      for (const b of boulders.all) { const k = bkey(b.c); if (!bgrid.has(k)) bgrid.set(k, []); bgrid.get(k).push(b); }
      const inStone = (n, r) => {
        const q = vec4.scale(n, 250 + hf.heightAt(n));
        if (rocksAt(q).some(p => vec4.len(vec4.sub(p.c, q)) < p.R + r)) return true;
        const k = q.map(v => Math.floor(v / 10));
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (let d = -1; d <= 1; d++)
          for (const B of bgrid.get([k[0] + a, k[1] + b, k[2] + c, k[3] + d].join()) || []) if (vec4.len(vec4.sub(B.c, q)) < B.r + r) return true;
        return false;
      };
      // what you see first: whole trees and a 4D rock standing in your slice (turn through ana and they come apart)
      {
        const F0 = player.F, R0 = player.R, at = (deg, m) => { const a = deg * Math.PI / 180; return vec4.norm(vec4.add(vec4.scale(home, Math.cos(m / 250)), vec4.scale(vec4.norm(vec4.add(vec4.scale(F0, Math.cos(a)), vec4.scale(R0, Math.sin(a)))), Math.sin(m / 250)))); };
        const plant = (n, o) => { const h = hf.heightAt(n); if (h > 0.8 && hf.waterAt(n) < 0.01) growTree(n, h, o); };
        plant(at(-34, 15), { height: 7.5, depth: 3, spread: 0.7, trunk: 0.48 });
        plant(at(22, 23), { height: 10, form: 'conifer', trunk: 0.36 });
        plant(at(44, 12), { height: 7.5, depth: 2, spread: 0.45, form: 'birch', trunk: 0.2 });
        plant(at(-12, 30), { height: 6.5, depth: 2, spread: 0.8, trunk: 0.4 });
        placeRock('crystal', at(-58, 11), hf); placeRock('crystal', at(-55, 12.5), hf);
        placeRock('outcrop', at(14, 19), hf);
      }
      await step('Growing the woods…', 'rocks');
      G.treesMade = makeForests(hf, home, (n, r) => keepOut(n, r) || inStone(n, r + 0.5), player.R);
      // ruins, cairns and caches, and lines of cairns toward the artifacts and the launcher
      await step('Building the ruins…', 'woods');
      G.findsMade = makeFinds(hf, home, [...(G.artifacts || []).map(a => a.n), launcher.n], keepOut);
      // the flora: grown near you as you go; none on the pad, in the cave's mouth, or on an artifact's place
      const clearOf = [[launcher.n, 6], ...(G.artifacts || []).map(a => [a.n, a.clear || 3]), ...(G.cave ? [[vec4.norm(G.cave.mouth), 5]] : [])].filter(([q]) => q);
      const clear = n => clearOf.some(([q, m]) => vec4.dot(q, n) > Math.cos(m / 250)) || carveSD(vec4.scale(n, 250 + hf.heightAt(n))).d < 1.2;
      initFlora(hf, clear); creatures.keep = clear;               // (and no herd's home there either)
      G.genCount = finds.gen;
    }
    buildB();
    bindConsole();
    hooks.spin = { save: spinSave, load: spinLoad };
    // a flight in progress: its exact inertial state, so a reload carries on the same arc (rather than re-entering
    // flight from the planet's frame, or not at all when the save caught you under 20 m)
    hooks.flight = { save: () => flight.active ? { x: flight.x.slice(), v: flight.v.slice(), F: flight.F, R: flight.R, A: flight.A, time: flight.time, maxR: flight.maxR } : null,
                     load: f => { if (f && f.x && f.v) Object.assign(flight, { active: true, x: f.x.slice(), v: f.v.slice(), F: f.F, R: f.R, A: f.A, time: f.time || 0, maxR: f.maxR || 0 }); } };
    // the console's laws (only the ones it can change), and its two switches
    const CONSOLE_LAWS = ['G_SCALE', 'GRAV_DIM', 'L', 'TIME_RATE', 'JUMP', 'WALK', 'RUN'];
    hooks.laws = { save: () => ({ ...Object.fromEntries(CONSOLE_LAWS.map(k => [k, LAWS[k]])), infinite: !!G.infinite, fly: !!G.fly }),
                   load: s => { for (const k of CONSOLE_LAWS) if (k in s) LAWS[k] = s[k]; G.infinite = !!s.infinite; G.fly = !!s.fly; } };
    if (G.knot) {
      // the knot gate (built with the artifacts): its rope is drawn with the trees' pieces; the leaf and the rope are
      // saved here (the leaf is rebuilt with the world, not saved with the things you carry)
      const k = G.knot, r5 = v => Math.round(v * 1e5) / 1e5;
      ropeSlot.obj = k.rope;
      hooks.knot = {
        save: () => ({ x: k.rope.x.map(v => v.map(r5)), leaf: { pos: k.leaf.pos.map(r5), rot: { l: k.leaf.rot.l.map(r5), r: k.leaf.rot.r.map(r5) } }, asleep: !!k.asleep }),
        load: s => {
          if (!s || !s.x || s.x.length !== k.rope.x.length || !s.leaf) return;
          k.rope.x = s.x.map(v => v.slice()); k.rope.v = s.x.map(() => [0, 0, 0, 0]); k.rope.prevX = null;
          k.leaf.pos = s.leaf.pos.slice(); k.leaf.prevPos = k.leaf.pos.slice(); k.leaf.rot = s.leaf.rot; k.leaf.prevRot = k.leaf.rot;
          k.leaf.vel = [0, 0, 0, 0]; k.leaf.omega = [0, 0, 0, 0, 0, 0]; k.asleep = !!s.asleep; k.leaf.sleeping = k.asleep; k.lastAngle = null;
          k.joint.accP = [0, 0, 0, 0]; k.joint.accA = [0, 0, 0, 0, 0, 0];
        } };
    }
    if (G.fold) {
      // the fold's plates: built with the world, saved here (where each lies on its hinge)
      const fd = G.fold, r5 = v => Math.round(v * 1e5) / 1e5;
      hooks.fold = {
        save: () => fd.plates.map(b => ({ pos: b.pos.map(r5), rot: { l: b.rot.l.map(r5), r: b.rot.r.map(r5) } })),
        load: s => {
          if (!Array.isArray(s) || s.length !== fd.plates.length) return;
          fd.plates.forEach((b, i) => { b.pos = s[i].pos.slice(); b.prevPos = b.pos.slice(); b.rot = s[i].rot; b.prevRot = b.rot; b.vel = [0, 0, 0, 0]; b.omega = [0, 0, 0, 0, 0, 0]; b.sleeping = true; });
          for (const j of fd.joints) { j.accP = [0, 0, 0, 0]; j.accA = [0, 0, 0, 0, 0, 0]; j.accL = 0; }
        } };
    }
    if (launcher.aim) hooks.aim = { save: () => launcher.aim.knobs.map(b => +b.slider.x.toFixed(4)),   // the launcher's sliders, where you left them
      load: xs => { if (Array.isArray(xs) && xs.length === 3) launcher.aim.knobs.forEach((b, k) => { b.slider.x = Math.max(0, Math.min(1, +xs[k] || 0)); }); } };
    G.objects = objects;
    G.home = { pos: player.pos.slice(), F: player.F, R: player.R, A: player.A };
    // start in the morning: sun about 20° up and rising
    const up = player.up();
    for (let t = 0; t < 20000; t += 0.5) {
      const e0 = vec4.dot(sunDir(t), up), e1 = vec4.dot(sunDir(t + 0.5), up);
      if (e0 > 0.3 && e0 < 0.38 && e1 > e0) { state.time = t; break; }
    }
    stamps.world = performance.now() - bootT0;
    await step('Preparing the view…');
    stamps.shaders = Math.round(await programsReady(ms => { const e = $('load-msg'); if (e && ms > 1500) e.textContent = `Preparing the view (compiling the shaders, ${Math.round(ms / 1000)} s)…`; }));
    loadWorld();                       // a saved world, if there is one, replaces the fresh start
    syncArtifacts();
    startAutosave();
    bindSettings();
    G.boot = { ...stamps, total: performance.now() - bootT0 };
    $('loading').hidden = true;
    $('hud').hidden = !state.help;
    $('hint').hidden = false;
    if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches)
      $('hint').textContent = 'Glome needs a keyboard and mouse to explore.';
    // a handle for debugging from the console (__hoop is the old name)
    window.__glome = window.__hoop = { state, player, keys, sunDir, dyn, radar, boulders, prof, compassAt, logMap, recordTrail, LAWS, G, settings,
      dbg: { gl, drawRadar, drawSlice, scene, updateBoulders, accel, envSD, fade, STEP, save: saveMod, cosmos, backToDry, gpuObj, objects, flight, launcher, TIERS, smap, cameraNow, trees, creatures, artifacts, bworld, openConsole, windAt, props, hits, groves, sunbuf, tgpu, tiles, finds, carves: () => import('./landforms.js'), hold, handleActions, actions, kickPlayer, guide, flora } };
    requestAnimationFrame(t => { last = t; frame(t); });
  } catch (e) {
    fail(e.message);
  }
})();
