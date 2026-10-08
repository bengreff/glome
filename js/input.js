// Keyboard and mouse. The look deltas accumulate here and the frame loop consumes them.
import { G } from './game.js';
import { canvas, overlay } from './render.js';
import { radar, RADAR_LAYERS, radarBasis, faceMarkAt, orbitRadar, zoomRadar } from './radar.js';

const $ = id => document.getElementById(id);
export const keys = new Set();
export const mouse = { dx: 0, dy: 0, alt: false, dragging: false };
// Presses for the frame loop to act on (F, G, the throw button), set by the events below.
export const actions = { fDown: false, fUp: false, g: false, mDown: false, mUp: false };
export const SENS = 0.0022;

addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;   // a settings control has focus
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!e.repeat && e.code === 'KeyF') actions.fDown = true;
  if (!e.repeat && e.code === 'KeyG') actions.g = true;
  keys.add(e.code);
  const state = G.state;
  switch (e.code) {
    case 'Tab': state.radar.big = !state.radar.big; break;
    case 'KeyL': state.radar.layers = (state.radar.layers + 1) % RADAR_LAYERS.length; break;
    case 'KeyK': state.radar.hidden = !state.radar.hidden; break;
    case 'KeyU': state.bare = !state.bare; document.body.classList.toggle('bare', state.bare); break;   // nothing over the view: for pictures
    case 'Escape': if (!$('console').hidden) $('console').hidden = true; break;
    case 'KeyH': state.help = !state.help; $('help').hidden = !state.help; $('hud').hidden = !state.help; break;
    case 'KeyM': state.radar.compass = !state.radar.compass; break;
    case 'KeyP': state.radar.pin = state.radar.pin ? null : { n: G.player.up(), B: radarBasis() }; break;
  }
});
addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'KeyF') actions.fUp = true; });
addEventListener('blur', () => keys.clear());
canvas.addEventListener('contextmenu', e => e.preventDefault());
// With the mouse free (Esc), the radar can be spun by dragging, and a click on a summit turns you to face it.
const devPx = e => { const k = overlay.width / innerWidth; return [e.clientX * k, e.clientY * k]; };
const inRadar = ([x, y]) => { const r = radar.rect; return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.s; };
canvas.addEventListener('mousedown', e => {
  if (document.pointerLockElement === canvas) { if (e.button === 0) actions.mDown = true; return; }
  if (e.button !== 0) return;
  const p = devPx(e);
  if (inRadar(p)) { radar.drag = { p, moved: false }; return; }
  canvas.requestPointerLock?.();
  mouse.dragging = true;
});
addEventListener('mouseup', e => {
  if (document.pointerLockElement === canvas && e.button === 0) actions.mUp = true;
  mouse.dragging = false;
  if (radar.drag && !radar.drag.moved) faceMarkAt(devPx(e));
  radar.drag = null;
});
addEventListener('mousemove', e => {
  if (document.pointerLockElement === canvas || mouse.dragging) {
    mouse.dx += e.movementX; mouse.dy += e.movementY;
    mouse.alt = (e.buttons & 2) !== 0 || e.altKey;
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

// A gamepad, if one is connected (standard mapping): the left stick walks (as far as it is pushed), the right stick
// looks (holding LT, it turns toward ana and twists instead), LB/RB step kata/ana, A jumps, a left-stick click runs,
// X picks up and drops (hold: set down), RT winds up a throw, Y draws an impulse stone, B the big radar, Start help,
// the d-pad zooms the radar.
export const pad = { connected: false, lx: 0, ly: 0, rx: 0, ry: 0, alt: false, jump: false, run: false, ana: 0, zoom: 0, prev: [] };
const dead = v => Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85;
export function pollPad() {
  const gp = [...(navigator.getGamepads?.() || [])].find(g => g && g.connected && g.mapping === 'standard');
  if (!gp) {
    // unplugged with X or RT held: let go of them, or a set-down or a throw would be left winding up for ever
    if (pad.prev[2]) actions.fUp = true;
    if (pad.prev[7]) actions.mUp = true;
    Object.assign(pad, { connected: false, lx: 0, ly: 0, rx: 0, ry: 0, alt: false, jump: false, run: false, ana: 0, zoom: 0, prev: [] });
    return;
  }
  const on = i => i === 6 || i === 7 ? (gp.buttons[i]?.value || 0) > 0.4 : !!gp.buttons[i]?.pressed;
  const now = gp.buttons.map((_, i) => on(i)), was = i => !!pad.prev[i], down = i => now[i] && !was(i), up = i => !now[i] && was(i);
  Object.assign(pad, { connected: true, lx: dead(gp.axes[0] || 0), ly: dead(gp.axes[1] || 0), rx: dead(gp.axes[2] || 0), ry: dead(gp.axes[3] || 0),
    alt: now[6], jump: now[0], run: now[10], ana: (now[5] ? 1 : 0) - (now[4] ? 1 : 0), zoom: (now[13] ? 1 : 0) - (now[12] ? 1 : 0) });
  if (down(2)) actions.fDown = true;
  if (up(2)) actions.fUp = true;
  if (down(3)) actions.g = true;
  if (down(7)) actions.mDown = true;
  if (up(7)) actions.mUp = true;
  const state = G.state;
  if (down(1)) state.radar.big = !state.radar.big;
  if (down(9)) { state.help = !state.help; $('help').hidden = !state.help; $('hud').hidden = !state.help; }
  if (gp.axes.some(a => Math.abs(a) > 0.3) || now.some(Boolean)) $('hint').hidden = true;
  pad.prev = now;
}

export function readInput() {
  const k = c => keys.has(c) ? 1 : 0, cl = v => Math.max(-1, Math.min(1, v));
  return {
    fwd: cl(k('KeyW') - k('KeyS') - pad.ly), right: cl(k('KeyD') - k('KeyA') + pad.lx), ana: cl(k('KeyE') - k('KeyQ') + pad.ana),
    jump: keys.has('Space') || pad.jump, run: keys.has('ShiftLeft') || keys.has('ShiftRight') || pad.run,
  };
}
