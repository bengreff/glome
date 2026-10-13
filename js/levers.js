// The launcher's levers: a panel beside the space map while you stand on the pad. Four levers: the first turns the
// barrel round (in the plane of the ground's first two directions), the second tips it toward ana or kata, the third
// raises it from the horizon, the fourth sets the launch speed (0–72 m/s). Free the mouse (Esc) and drag a lever, or
// turn the wheel over one; the barrel and the map's predicted path follow at once. A glyph over each, its value under.
// An instrument, like the radar: it reads the same whatever your slice, as a console in the world could not (a thing
// thin along ana shows only when your slice passes within its thickness of it).
import { overlay, octx, canvas } from './render.js';
import { launcher, setAim, setSpeed, SPEED_MAX } from './launcher.js';
import { GIMBAL } from './gimbal.js';
import { keyCap } from './hud.js';

const DEG = 180 / Math.PI;
const ANA = 'rgba(255, 175, 100, 0.98)', KATA = 'rgba(125, 180, 255, 0.98)', GOAL = 'rgba(82, 220, 200, 0.98)', PALE = 'rgba(225, 230, 238, 0.95)';
const angle = k => ({
  lo: () => GIMBAL.range[k][0], hi: () => GIMBAL.range[k][1],
  get: () => launcher.aim.angles[k], set: v => { const a = launcher.aim.angles.slice(); a[k] = v; setAim(a); },
});
export const LEVERS = [
  { ...angle(0), glyph: 'turn', zero: 0, col: () => PALE, fmt: v => `${Math.round(v * DEG)}°` },
  { ...angle(1), glyph: 'ana', zero: 0, col: v => (v >= 0 ? ANA : KATA), fmt: v => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * DEG))}°` },
  { ...angle(2), glyph: 'up', col: () => PALE, fmt: v => `${Math.round(v * DEG)}°` },
  { lo: () => 0, hi: () => SPEED_MAX, get: () => launcher.speed, set: setSpeed, glyph: 'speed', col: () => GOAL, fmt: v => `${Math.round(v)}` },
];
// shown: drawn this frame (the pad, on A, not flying); box: the panel's place; hover, drag: a lever's index or −1
export const levers = { shown: false, box: null, hover: -1, drag: -1, sel: 0, pad: false };   // (sel: the gamepad's lever)

// The panel's geometry beside the map's square r: the panel, each lever's slot, and its track's ends. (Its foot clear
// of the hint along the bottom, which shows while the mouse is free.)
function layout(r, k) {
  const slotW = 52 * k, pad = 10 * k, w = 4 * slotW + 2 * pad, h = Math.min(r.s, 230 * k);
  const x = r.x - w - 14 * k, y = Math.min(r.y + r.s, overlay.height - 76 * k) - h;
  return { x, y, w, h, slotW, pad, top: y + 40 * k, bot: y + h - 36 * k };
}
const frac = (L, v) => (v - L.lo()) / (L.hi() - L.lo());

export function leverAt([px, py]) {
  const b = levers.box;
  if (!levers.shown || !b || px < b.x + b.pad || px > b.x + b.w - b.pad || py < b.y || py > b.y + b.h) return -1;
  return Math.max(0, Math.min(3, Math.floor((px - b.x - b.pad) / b.slotW)));
}
// Take lever i at screen height y (device pixels): by its handle, it keeps where you took it; elsewhere on its track,
// it comes to the pointer.
export function grabLever(i, y) {
  const b = levers.box, L = LEVERS[i];
  if (!b || !L || !launcher.aim) return;
  const hy = b.bot - frac(L, L.get()) * (b.bot - b.top), k = overlay.width / innerWidth;
  levers.drag = i; levers.off = Math.abs(y - hy) < 9 * k ? hy - y : 0;
  dragLever(i, y);
}
// Drag lever i to the screen height y.
export function dragLever(i, y) {
  const b = levers.box, L = LEVERS[i];
  if (!b || !L || !launcher.aim) return;
  const f = Math.max(0, Math.min(1, (b.bot - y - (levers.off || 0)) / (b.bot - b.top)));
  L.set(L.lo() + f * (L.hi() - L.lo()));
}
// The wheel over lever i: a step of 1/180 of its range (2° of turn, 1° of tip, ½° of raise, 0.4 m/s).
export function nudgeLever(i, steps) {
  const L = LEVERS[i];
  if (!L || !launcher.aim) return;
  L.set(Math.max(L.lo(), Math.min(L.hi(), L.get() + steps * (L.hi() - L.lo()) / 180)));
}

function glyph(kind, x, y, k, col) {
  octx.save(); octx.strokeStyle = col; octx.fillStyle = col; octx.lineWidth = 1.6 * k; octx.lineCap = 'round';
  if (kind === 'turn') {                                       // a turning arrow
    const r = 6.5 * k; octx.beginPath(); octx.arc(x, y, r, -Math.PI * 0.35, Math.PI * 1.25); octx.stroke();
    const a = -Math.PI * 0.35, ex = x + r * Math.cos(a), ey = y + r * Math.sin(a);
    octx.beginPath(); octx.moveTo(ex + 4 * k, ey - 1 * k); octx.lineTo(ex - 1.5 * k, ey - 3.5 * k); octx.lineTo(ex - 0.5 * k, ey + 3 * k); octx.closePath(); octx.fill();
  } else if (kind === 'ana') {                                 // ana over kata, in the radar's colours
    const t = (cy, upw, c) => { octx.fillStyle = c; octx.beginPath(); octx.moveTo(x - 5 * k, cy + upw * 3 * k); octx.lineTo(x + 5 * k, cy + upw * 3 * k); octx.lineTo(x, cy - upw * 4 * k); octx.closePath(); octx.fill(); };
    t(y - 4.5 * k, 1, ANA); t(y + 4.5 * k, -1, KATA);
  } else if (kind === 'up') {                                  // the ground, and a direction raised from it
    octx.beginPath(); octx.moveTo(x - 8 * k, y + 6 * k); octx.lineTo(x + 8 * k, y + 6 * k); octx.moveTo(x - 6 * k, y + 6 * k); octx.lineTo(x + 5 * k, y - 6 * k); octx.stroke();
    octx.beginPath(); octx.arc(x - 6 * k, y + 6 * k, 7 * k, -Math.PI * 0.27, 0); octx.stroke();
  } else {                                                     // speed
    octx.font = `600 ${10.5 * k}px "IBM Plex Mono", ui-monospace, monospace`; octx.textAlign = 'center'; octx.textBaseline = 'middle';
    octx.fillText('m/s', x, y + 0.5 * k);
  }
  octx.restore();
}

// Draw the panel beside the map's square r (device pixels). Call each frame you stand on the pad.
export function drawLevers(r) {
  if (!launcher.aim || !r) { levers.box = null; return; }
  const k = overlay.width / innerWidth, b = levers.box = layout(r, k), locked = document.pointerLockElement === canvas;
  octx.save();
  octx.fillStyle = 'rgba(11, 14, 20, 0.62)'; octx.strokeStyle = 'rgba(160, 175, 195, 0.35)'; octx.lineWidth = 1 * k;
  octx.beginPath(); if (octx.roundRect) octx.roundRect(b.x, b.y, b.w, b.h, 8 * k); else octx.rect(b.x, b.y, b.w, b.h); octx.fill(); octx.stroke();
  LEVERS.forEach((L, i) => {
    const cx = b.x + b.pad + b.slotW * (i + 0.5), v = L.get(), f = frac(L, v), col = L.col(v);
    const hot = levers.drag === i || (!locked && levers.hover === i);
    if (levers.pad && levers.sel === i) { octx.strokeStyle = 'rgba(225, 230, 238, 0.5)'; octx.lineWidth = 1.2 * k; octx.strokeRect(cx - b.slotW / 2 + 3 * k, b.y + 4 * k, b.slotW - 6 * k, b.h - 8 * k); }
    glyph(L.glyph, cx, b.y + 20 * k, k, col);
    // the track, and its lit part: from the middle (turn, tip) or from the bottom (raise, speed) to the handle
    octx.strokeStyle = 'rgba(160, 175, 195, 0.45)'; octx.lineWidth = 3 * k; octx.lineCap = 'round';
    octx.beginPath(); octx.moveTo(cx, b.top); octx.lineTo(cx, b.bot); octx.stroke();
    const yAt = q => b.bot - q * (b.bot - b.top), y = yAt(f), y0 = L.zero != null ? yAt(frac(L, L.zero)) : b.bot;
    if (L.zero != null) { octx.strokeStyle = 'rgba(160, 175, 195, 0.7)'; octx.lineWidth = 1.2 * k; octx.beginPath(); octx.moveTo(cx - 7 * k, y0); octx.lineTo(cx + 7 * k, y0); octx.stroke(); }
    octx.strokeStyle = col; octx.lineWidth = 3 * k; octx.beginPath(); octx.moveTo(cx, y0); octx.lineTo(cx, y); octx.stroke();
    // the handle
    const hw = 13 * k, hh = 5.5 * k;
    octx.fillStyle = hot ? col : 'rgba(30, 36, 46, 0.95)'; octx.strokeStyle = col; octx.lineWidth = 1.6 * k;
    octx.beginPath(); if (octx.roundRect) octx.roundRect(cx - hw, y - hh, 2 * hw, 2 * hh, 3 * k); else octx.rect(cx - hw, y - hh, 2 * hw, 2 * hh); octx.fill(); octx.stroke();
    // its value
    octx.font = `600 ${11 * k}px "IBM Plex Mono", ui-monospace, monospace`; octx.textAlign = 'center'; octx.textBaseline = 'middle';
    octx.fillStyle = col; octx.fillText(L.fmt(v), cx, b.y + b.h - 17 * k);
  });
  // with the mouse taken by the view: Esc frees it, to work the levers
  if (locked && !levers.pad) {
    const w = keyCap(b.x + b.w / 2 - 22 * k, b.y - 14 * k, 'Esc', PALE, k);
    const ax = b.x + b.w / 2 - 22 * k + w + 8 * k, ay = b.y - 21 * k;            // a pointer
    octx.fillStyle = PALE; octx.beginPath(); octx.moveTo(ax, ay); octx.lineTo(ax, ay + 13 * k); octx.lineTo(ax + 3.5 * k, ay + 9.5 * k); octx.lineTo(ax + 6 * k, ay + 14 * k); octx.lineTo(ax + 8 * k, ay + 13 * k); octx.lineTo(ax + 5.5 * k, ay + 8.5 * k); octx.lineTo(ax + 10 * k, ay + 8.5 * k); octx.closePath(); octx.fill();
  }
  octx.restore();
}
