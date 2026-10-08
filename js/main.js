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
import { spawn as spawnObj, gpuObj, objects, initObjects, placeStart, stepObjects, playerContacts, uploadObjects, lookedAt, pickUp, drop, throwHeld,
         drawStone, computeGhost, setDown, objectsSave } from './objects.js';
import { flight, updateFlightMode, stepFlight, syncFlightFrame, kick } from './flight.js';
import { launcher, buildLauncher, placeParts, updateLauncher, tryLaunch, TIERS } from './launcher.js';
import { smap, updateSpaceMap, drawSpaceMap } from './spacemap.js';
import { accelB, groundRadiusB, floorOf } from './planetB.js';
import { buildLandforms, floorRadius, nearCarves } from './landforms.js';
import { growTree, trees, rope as ropeSlot } from './trees.js';
import { Rope } from './rope.js';
import { creatures, initCreatures, stepCreatures, creatureDraw, creaturesSave } from './creatures.js';
import { artifacts, buildArtifacts, updateArtifacts, syncArtifacts } from './artifacts.js';
import { bworld, buildB, bItems, bContacts, trackOrbit, nearConsole, openConsole, closeConsole, updateConsole, bindConsole } from './console.js';
import { spinSave, spinLoad } from './cosmos.js';
import { stepBoats, windAt } from './boats.js';
import { legs as legSlot } from './trees.js';
import { terrainSD } from './env.js';
import { uploadTrees } from './render.js';
import { orbitOf, toBody, dirToBody } from './cosmos.js';
import { RIVERS, ISLANDS, ARCHI } from './world.js';

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
  flight.active = false;
  p.onB = d.onB ?? null; p.groundFn = p.onB != null ? groundRadiusB : null;
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
    if (!objects.held && nearConsole(G.player)) { if ($('console').hidden) openConsole(); else closeConsole(); }
    else if (G.ropeHeld != null) G.ropeHeld = null;       // let go of the rope
    else if (objects.held) hold.fT = now;                  // tap: drop · hold: show where it will rest
    else {
      const b = lookedAt(cam);
      if (b) pickUp(b);
      else if (ropeSlot.obj) {                             // or take hold of the rope where you look at it
        let best = -1, bd = 0.35;
        ropeSlot.obj.x.forEach((q, i) => { const d = vec4.sub(q, cam.eye), t = vec4.dot(d, cam.F); if (t > 0 && t < 3.2) { const m = vec4.len(vec4.sub(d, vec4.scale(cam.F, t))); if (m < bd) { bd = m; best = i; } } });
        if (best >= 0) G.ropeHeld = best;
      }
    }
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
// The camera in A's frame (the renderer's frame), wherever you are: on B your frame is B's, carried on its orbit.
function cameraNow() {
  const p = G.player, c = p.camera();
  if (p.onB == null) return c;
  const t = state.time, o = orbitOf('B', t).c, toA = v => dirToBody(v, t);
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
let last = performance.now(), lastRaw = last, physAcc = 0;
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
  updateBoulders(cameraNow().eye);
  // physics runs in fixed steps of 1/120 s (PHYSICS.md), as many as the frame needs
  physAcc += dt * LAWS.TIME_RATE;
  handleActions(cameraNow());
  for (let n = 0; physAcc >= STEP && n < 10; n++, physAcc -= STEP) {
    const onB = player.onB != null;
    if (!onB) { updateLauncher(player); tryLaunch(player, player.camera(), input.jump && !flight.active); }
    else tryLaunchB(player, input.jump);
    updateFlightMode(player);
    if (flight.active) { if (!stepFlight(player, STEP)) softReset(); }
    else if (G.fly) flyStep(player, input, STEP);
    else if (onB) { const k = player.onB; player.update(STEP, input, (x, v) => accelB(x, v, state.time, k)); bContacts(player); }
    else {
      player.floorFn = nearCarves(player.pos, 25) ? (n, r) => floorRadius(n, r, player.hf) : null;
      player.update(STEP, input, accel);
      capsuleTerrain(player);
    }
    player.ride = null;
    if (!onB && !flight.active) playerContacts(player);
    if (player.supported && !flight.active && !(G.simT < player.airborneUntil)) player.grounded = true;   // standing on a thing is footing too
    if (!onB) stepBoats(STEP, state.time);
    trackOrbit(flight, state.time);
    stepObjects(cameraNow());
    if (ropeSlot.obj) {
      const R = ropeSlot.obj;
      R.pins.clear();
      if (G.knotAnchor && !G.flags.solved_knot) R.pins.set(0, G.knotAnchor);   // tied to the gate until it opens
      if (G.ropeHeld != null) { const c = cameraNow(); R.pins.set(G.ropeHeld, vec4.add(vec4.add(c.eye, vec4.scale(c.F, 0.8)), vec4.scale(c.U, -0.3))); }
      if (G.ropeHeld != null || vec4.len(vec4.sub(R.x[0], cameraNow().eye)) < 120) R.step(STEP);
    }
    state.time += STEP;
  }
  if (player.depth > CHEST) fadeOut(backToDry);
  updateFade(dt);
  if (player.onB == null) recordTrail();
  mark('physics');

  updateDyn(Math.min(0.2, (now - lastRaw) / 1000)); lastRaw = now;
  resize();
  const cam = cameraNow(), sun = updateSky(state.time, cam.eye);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  let rad = null;
  if (player.onB == null) {
    updateArtifacts();
    stepCreatures(Math.min(dt, 0.05) * LAWS.TIME_RATE, player.hf);
    const cd = creatureDraw(cam.eye, cam.A, player.hf);
    G.creatureItems = cd.items; legSlot.caps = cd.caps;
  } else { G.creatureItems = []; legSlot.caps = []; }
  G.creatureItems = G.creatureItems.concat(bItems(cam.eye, state.time));   // B's pillars and console, when near
  updateConsole();
  uploadObjects(cam);
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
  const q = gpuBegin();
  drawSlice(cam, sun, 0, 0, scene.w, scene.h);
  mark('slice');
  // above the ground (or on a charged launcher) the radar becomes the space map
  const onLauncher = launcher.onPad && launcher.tier > 0 && !flight.active;
  const spaceMode = flight.active || onLauncher || player.onB != null || player.heightAboveGround() > 60;
  if (!state.radar.hidden && !spaceMode) rad = drawRadar(cam, sun, G.simT, FOV * scene.w / scene.h);
  mark('radar');
  present();
  if (rad) blitRadar(rad);
  gpuEnd(q);
  mark('present');
  radar.gaze = gazePoint(cam);
  mark('gaze');
  drawFaced(cam); drawGazeDot();
  if (rad) drawRadarOverlay(rad, sun); else radar.rect = null;
  if (spaceMode && !state.radar.hidden) {
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
  try {
    const built = await buildAtlas(), data = prefilter(built.data, N);
    stamps.terrain = performance.now() - bootT0;
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
      if (t1) growTree(t1.n, t1.h, { height: 8 });
      if (t2) growTree(t2.n, t2.h, { height: 6.5, spread: 0.9 });
      const t3 = highNear(rv, 14);
      if (t3) growTree(t3.n, t3.h, { height: 7.5, spread: 0.65 });
      uploadTrees();
    }
    makeBoulders(rand);
    player.contact = boulderContact;
    initObjects(accel, envSD, { height: p => vec4.len(p) - 250 - player.hf.waterAt(vec4.norm(p)), up: p => vec4.norm(p), density: 1000 });
    placeStart(rand);
    buildLauncher(player.hf);
    {
      // the launcher's four parts, where the artifacts will guard them: near the start, by a river mouth, on an
      // island joined only through ana, and as near the summit's antipode as there is dry ground
      const hf = player.hf, home = player.up(), T = tangents(home);
      const dry = (n, tries = 400) => { if (hf.heightAt(n) > 0.8) return n; let b = null; for (let i = 0; i < tries; i++) { const t = tangents(n), r = 3 + i * 0.25, a = i * 2.4, c = i * 1.7; const d = vec4.norm([0, 1, 2, 3].map(k => Math.cos(a) * t[0][k] + Math.sin(a) * Math.cos(c) * t[1][k] + Math.sin(a) * Math.sin(c) * t[2][k])); const q = vec4.norm(vec4.add(vec4.scale(n, Math.cos(r / 250)), vec4.scale(d, Math.sin(r / 250)))); if (hf.heightAt(q) > 0.8 && hf.waterAt(q) <= 0.01) { b = q; break; } } return b || n; };
      const toward = vec4.norm(vec4.sub(MASSIF, vec4.scale(home, vec4.dot(MASSIF, home))));
      const p1 = vec4.norm(vec4.add(vec4.add(vec4.scale(home, Math.cos(14 / 250)), vec4.scale(toward, Math.sin(14 / 250) * 0.95)), vec4.scale(player.A, Math.sin(14 / 250) * 0.3)));
      const R0 = RIVERS[0], p2 = R0.pts[Math.max(0, R0.pts.length - 8)];
      const p3 = ISLANDS[3].n, p4 = dry(vec4.scale(launcher.n, -1));
      placeParts([dry(p1), dry(p2), p3, p4]);
      // part I lies on the cave's floor, in the chamber you reach only through the tunnel toward ana
      const part1 = objects.world.bodies.find(b => b.kind === 'part' && b.tier === 1);
      if (part1 && G.cave) { part1.pos = vec4.add(G.cave.floor, vec4.scale(vec4.norm(G.cave.floor), 0.6)); part1.sleeping = false; }
      G.partSpots = [p1, p2, p3, p4];
    }
    hooks.objects = objectsSave;
    initCreatures(player.hf);
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
    buildB();
    bindConsole();
    hooks.spin = { save: spinSave, load: spinLoad };
    // the console's laws (only the ones it can change), and its two switches
    const CONSOLE_LAWS = ['G_SCALE', 'GRAV_DIM', 'L', 'TIME_RATE', 'JUMP', 'WALK', 'RUN'];
    hooks.laws = { save: () => ({ ...Object.fromEntries(CONSOLE_LAWS.map(k => [k, LAWS[k]])), infinite: !!G.infinite, fly: !!G.fly }),
                   load: s => { for (const k of CONSOLE_LAWS) if (k in s) LAWS[k] = s[k]; G.infinite = !!s.infinite; G.fly = !!s.fly; } };
    {
      // the knot gate's rope: tied to the vault, led to the tall post, looped once round it, and back
      const post = G.knotPost, anchor = G.knotAnchor, pts = [];
      const pn = vec4.norm(post.a), up = pn, toPost = vec4.norm(vec4.sub(vec4.sub(post.a, anchor), vec4.scale(up, vec4.dot(vec4.sub(post.a, anchor), up))));
      const T = tangents(pn), side = vec4.norm(vec4.sub(vec4.sub(T[1], vec4.scale(toPost, vec4.dot(T[1], toPost))), vec4.scale(up, vec4.dot(T[1], up))));
      const at = (base, f, s2, h) => vec4.add(vec4.add(vec4.add(base, vec4.scale(toPost, f)), vec4.scale(side, s2)), vec4.scale(up, h));
      const ring = vec4.add(post.a, vec4.scale(up, 0.6));
      const dist = vec4.len(vec4.sub(vec4.sub(post.a, anchor), vec4.scale(up, vec4.dot(vec4.sub(post.a, anchor), up))));
      for (let i = 0; i < 10; i++) pts.push(at(anchor, (dist - 0.5) * i / 10, 0, 0.6 * i / 10 - 0.0));
      for (let i = 0; i <= 14; i++) { const a = Math.PI + 2 * Math.PI * i / 14; pts.push(at(ring, 0.5 * Math.cos(a), 0.5 * Math.sin(a), 0)); }
      for (let i = 1; i <= 6; i++) pts.push(at(ring, -0.5 - 0.3 * i, 0.4, -0.1 * i));
      const postSD = q => { const ab = vec4.sub(post.b, post.a), t = Math.max(0, Math.min(1, vec4.dot(vec4.sub(q, post.a), ab) / vec4.dot(ab, ab))), d = vec4.sub(q, vec4.add(post.a, vec4.scale(ab, t))), l = vec4.len(d); return { d: l - post.r, n: vec4.scale(d, 1 / Math.max(l, 1e-9)) }; };
      const env = q => { const a = terrainSD(q), b = postSD(q); return b.d < a.d ? b : a; };
      ropeSlot.obj = G.rope = new Rope(pts, { radius: 0.035, accel: x => accel(x, [0, 0, 0, 0]), env, damping: 0.995 });
      ropeSlot.obj.iterations = 8;
      hooks.rope = { save: () => ({ x: ropeSlot.obj.x.map(v => v.map(q => Math.round(q * 1e4) / 1e4)) }), load: r => { if (r && r.x && r.x.length === ropeSlot.obj.x.length) { ropeSlot.obj.x = r.x; ropeSlot.obj.v = r.x.map(() => [0, 0, 0, 0]); } } };
    }
    G.objects = objects;
    G.home = { pos: player.pos.slice(), F: player.F, R: player.R, A: player.A };
    // start in the morning: sun about 20° up and rising
    const up = player.up();
    for (let t = 0; t < 20000; t += 0.5) {
      const e0 = vec4.dot(sunDir(t), up), e1 = vec4.dot(sunDir(t + 0.5), up);
      if (e0 > 0.3 && e0 < 0.38 && e1 > e0) { state.time = t; break; }
    }
    stamps.world = performance.now() - bootT0;
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
      dbg: { gl, drawRadar, drawSlice, scene, updateBoulders, accel, envSD, fade, STEP, save: saveMod, cosmos, backToDry, gpuObj, objects, flight, launcher, TIERS, smap, cameraNow, trees, creatures, artifacts, bworld, openConsole, windAt, carves: () => import('./landforms.js'), hold, handleActions, actions, kickPlayer } };
    requestAnimationFrame(t => { last = t; frame(t); });
  } catch (e) {
    fail(e.message);
  }
})();
