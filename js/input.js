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

export function readInput() {
  const k = c => keys.has(c) ? 1 : 0;
  return {
    fwd: k('KeyW') - k('KeyS'), right: k('KeyD') - k('KeyA'), ana: k('KeyE') - k('KeyQ'),
    jump: keys.has('Space'), run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
  };
}
