// What is drawn over the slice view: the gaze dot, the faced marker, and the numbers (only while help is open).
import { PLANET_R, SEA } from './world.js';
import { vec4 } from './player.js';
import { G } from './game.js';
import { canvas, overlay, octx, scene, prof, FOV } from './render.js';
import { radar, headingTo } from './radar.js';
import { boulders } from './boulders.js';
import { floorOf } from './planetB.js';

const $ = id => document.getElementById(id);

// Where your line of sight (the centre of the slice view) meets the ground or water: marched on the CPU with
// the same heights the GPU draws, so the radar can show what you are looking at.
export function gazePoint(cam) {
  const hf = G.player.hf, under = vec4.len(cam.eye) < PLANET_R + SEA, seaR = under ? 0 : PLANET_R + SEA;   // underwater: see through to the bed
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
export function drawFaced(cam) {
  const f = G.state.faced;
  if (!f || G.simT > f.until) return;
  const h = Math.max(SEA, G.player.hf.heightAt(f.n)), p = vec4.scale(f.n, PLANET_R + h), d = vec4.sub(p, cam.eye);
  const z = vec4.dot(d, cam.F); if (z < 1) return;
  const W = overlay.width, H = overlay.height, k = W / innerWidth;
  const x = vec4.dot(d, cam.R) / z / (FOV * W / H), y = vec4.dot(d, cam.U) / z / FOV;
  if (Math.abs(x) > 0.95 || Math.abs(y) > 0.95) return;
  const X = (x * 0.5 + 0.5) * W, Y = (0.5 - y * 0.5) * H - 10 * k, a = Math.min(1, (f.until - G.simT) / 1.5);
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
export function drawGazeDot() {
  const W = overlay.width, H = overlay.height, k = W / innerWidth;
  octx.save();
  octx.strokeStyle = 'rgba(0, 0, 0, 0.45)'; octx.lineWidth = 3 * k;
  octx.beginPath(); octx.arc(W / 2, H / 2, 3 * k, 0, 7); octx.stroke();
  octx.strokeStyle = 'rgba(255, 255, 255, 0.85)'; octx.lineWidth = 1.4 * k;
  octx.beginPath(); octx.arc(W / 2, H / 2, 3 * k, 0, 7); octx.stroke();
  if (radar.gaze && !G.state.radar.hidden && G.state.help) {
    octx.font = `500 ${10.5 * k}px "IBM Plex Mono", ui-monospace, monospace`; octx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    octx.fillText(`${Math.round(radar.gaze.t)} m`, W / 2 + 8 * k, H / 2 + 4 * k);
  }
  // winding up a throw: a ring around the dot fills with the charge
  const ch = G.charge ?? -1;
  if (ch >= 0) {
    octx.strokeStyle = 'rgba(82, 220, 200, 0.9)'; octx.lineWidth = 2 * k;
    octx.beginPath(); octx.arc(W / 2, H / 2, 9 * k, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * Math.min(1, ch)); octx.stroke();
  }
  octx.restore();
}

const fmt = (x, d = 0) => x.toFixed(d);
let hudTimer = 0, fpsAcc = 0, fpsN = 0;
export function updateHUD(dt, cam, sun) {
  fpsAcc += dt; fpsN++;
  hudTimer += dt;
  if (hudTimer < 0.15) return;
  const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; hudTimer = 0;
  const h = G.player.hopf();
  const el = Math.asin(Math.max(-1, Math.min(1, vec4.dot(sun, cam.up)))) * 180 / Math.PI;
  // where the sun is relative to your body: how far it leans into ana, which the slice can't show
  const sa = vec4.dot(sun, G.player.A), sf = vec4.dot(sun, G.player.F), sr = vec4.dot(sun, G.player.R);
  const anaLean = Math.atan2(sa, Math.hypot(sf, sr)) * 180 / Math.PI;
  const ahead = Math.atan2(sr, sf) * 180 / Math.PI;
  const p = G.player;
  if (p.onB != null) {                                     // on the crystal: which of its 120 floors, and how high
    $('where').textContent = `planet B · floor ${floorOf(p.up()) + 1} of 120`;
    $('alt').textContent = `${fmt(Math.max(0, p.heightAboveGround()), 1)} m above the floor`;
  } else {
    $('where').textContent = `η ${fmt(h.eta)}°  ξ₁ ${fmt(h.xi1)}°  ξ₂ ${fmt(h.xi2)}°`;
    $('alt').textContent = p.depth > 0 ? `wading, ${fmt(p.depth, 1)} m deep` : `${fmt(p.altitude(), 1)} m above sea`;
  }
  $('sun').textContent = el > -2
    ? `sun ${Math.abs(el) < 1.5 ? 'on the horizon' : `${fmt(el)}° up`} · ${fmt(Math.abs(anaLean))}° toward ${anaLean >= 0 ? 'ana' : 'kata'} · ${fmt(Math.abs(ahead))}° ${ahead >= 0 ? 'right' : 'left'}`
    : `night · sun ${fmt(-el)}° below`;
  $('fps').textContent = `${fmt(fps)} fps · res ${fmt(100 * scene.w / canvas.width)}%${prof.gpu > 0 ? ` · gpu ${fmt(prof.gpu, 1)} ms` : ''}`;
}
