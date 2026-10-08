// The space map: once you are well clear of the ground (or standing on a charged launcher), the radar becomes a 3D
// map of the system. At this scale the universe really is three-dimensional (the hoop is small), so the map simply
// drops the hoop coordinate. Your path ahead is predicted with the same exact gravity and the same integrator as
// your flight, so what it shows is what will happen (until you throw a stone).
import { G } from './game.js';
import { vec4 } from './player.js';
import { LAWS } from './laws.js';
import { gravityInertial, orbitOf, toInertial, velToInertial } from './cosmos.js';
import { overlay, octx } from './render.js';

export const smap = { path: [], t: -1, hit: null, center: 'A', range: 1000, bAt: null };

// Integrate forward from inertial state (x, v) at time t: up to 300 s, leapfrog at 0.1 s (0.02 s near a planet).
export function predict(x, v, t) {
  x = x.slice(); v = v.slice();
  const pts = [], t0 = t;
  let hit = null;
  for (let i = 0; t - t0 < 300 && pts.length < 3200; i++) {
    const A = orbitOf('A', t).c, rA = vec4.len(vec4.sub(x, A));
    const B = orbitOf('B', t).c, rB = Math.min(vec4.len(vec4.sub(x, B)), vec4.len(vec4.sub(x, vec4.add(B, [0, 0, 0, LAWS.L]))), vec4.len(vec4.sub(x, vec4.sub(B, [0, 0, 0, LAWS.L]))));
    const dt = rA < 400 || rB < 200 ? 0.02 : 0.1;
    const a0 = gravityInertial(x, t);
    for (let k = 0; k < 4; k++) v[k] += 0.5 * dt * a0[k];
    for (let k = 0; k < 4; k++) x[k] += dt * v[k];
    t += dt;
    const a1 = gravityInertial(x, t);
    for (let k = 0; k < 4; k++) v[k] += 0.5 * dt * a1[k];
    if (i % 4 === 0) pts.push({ x: x.slice(), t });
    if (rA < LAWS.R_A - 5 && t - t0 > 2) { hit = { what: 'A', t }; break; }
    if (rB < LAWS.R_B + 6) { hit = { what: 'B', t }; break; }
    if (vec4.len(x) < LAWS.STAR_R) { hit = { what: 'star', t }; break; }
  }
  return { pts, hit };
}

// Refresh the prediction a few times a second: from your flight, or from the launch the pad would give you.
export function updateSpaceMap(state) {
  if (G.simT - smap.t < 0.25) return;
  smap.t = G.simT;
  const p = G.player, t = G.state.time;
  let x, v;
  if (state.flight.active) { x = state.flight.x; v = state.flight.v; }
  else if (state.onB != null) { const o = orbitOf('B', t); x = vec4.add(vec4.add(o.c, [0, 0, 0, state.onB * LAWS.L]), p.pos); v = vec4.add(o.v, p.vel); }
  else if (state.launch) { x = toInertial(p.pos, t); v = velToInertial(p.pos, state.launch, t); }
  else { x = toInertial(p.pos, t); v = velToInertial(p.pos, p.vel, t); }
  const r = predict(x, v, t);
  smap.path = r.pts; smap.hit = r.hit; smap.now = { x, t };
  const A = orbitOf('A', t).c, far = r.pts.reduce((m, q) => Math.max(m, vec4.len(vec4.sub(q.x, orbitOf('A', q.t).c))), vec4.len(vec4.sub(x, A)));
  smap.center = far < 1300 ? 'A' : 'star';
  smap.range = smap.center === 'A' ? Math.max(500, Math.min(1400, far * 1.15)) : 4200;
}

// Draw it in the radar's place. Points are shown relative to A when A-centred (A's own path then stays still),
// otherwise in the star's frame. yaw and el turn the view, like the radar.
export function drawSpaceMap(rect, yaw, el) {
  const k = overlay.width / innerWidth, cx = rect.x + rect.s / 2, cy = rect.y + rect.s / 2, R = rect.s / 2 * 0.92;
  const sc = R / smap.range, t = G.state.time;
  const cy_ = Math.cos(yaw), sy = Math.sin(yaw), ce = Math.cos(el), se = Math.sin(el);
  const ref = tt => smap.center === 'A' ? orbitOf('A', tt).c : [0, 0, 0, 0];
  const P = (q, tt = t) => {                                  // inertial point -> screen (the hoop coordinate dropped)
    const o = ref(tt), x = q[0] - o[0], y = q[1] - o[1], z = q[2] - o[2];
    const X = cy_ * x + sy * y, Y = -sy * x + cy_ * y;
    const Yd = ce * Y - se * z, Zd = se * Y + ce * z;
    return [cx + X * sc, cy - Zd * sc, Yd];
  };
  octx.save();
  // the glass
  const grad = octx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R / 0.92);
  grad.addColorStop(0, 'rgba(6, 8, 16, 0.86)'); grad.addColorStop(1, 'rgba(10, 14, 26, 0.92)');
  octx.fillStyle = grad; octx.beginPath(); octx.arc(cx, cy, R / 0.92, 0, 7); octx.fill();
  octx.strokeStyle = 'rgba(140, 170, 230, 0.45)'; octx.lineWidth = 1.2 * k; octx.stroke();
  octx.beginPath(); octx.arc(cx, cy, R / 0.92, 0, 7); octx.clip();
  const circle = (c, r, tt = t) => { octx.beginPath(); for (let i = 0; i <= 64; i++) { const a = i / 64 * 2 * Math.PI, q = [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), c[2], 0], s = P(q, tt); i ? octx.lineTo(s[0], s[1]) : octx.moveTo(s[0], s[1]); } octx.stroke(); };
  // orbits (in the star's frame they are circles in the x–y plane)
  if (smap.center === 'star') {
    octx.strokeStyle = 'rgba(120, 160, 220, 0.35)'; octx.lineWidth = 1 * k;
    circle([0, 0, 0], LAWS.ORBIT_A); circle([0, 0, 0], LAWS.ORBIT_B);
  }
  // the star, A and B, to scale (with a minimum size so they can be found)
  const body = (q, r, fill, stroke) => { const s = P(q); octx.fillStyle = fill; octx.strokeStyle = stroke; octx.lineWidth = 1.2 * k; octx.beginPath(); octx.arc(s[0], s[1], Math.max(3 * k, r * sc), 0, 7); octx.fill(); octx.stroke(); return s; };
  const S = body([0, 0, 0, 0], LAWS.STAR_R, 'rgba(255, 214, 130, 0.95)', 'rgba(255, 240, 200, 0.9)');
  body(orbitOf('A', t).c, LAWS.R_A, 'rgba(60, 120, 90, 0.85)', 'rgba(150, 210, 190, 0.8)');
  body(orbitOf('B', t).c, LAWS.R_B, 'rgba(170, 150, 220, 0.85)', 'rgba(220, 210, 255, 0.85)');
  // where B will be when your path comes nearest it: a faint ring, to aim by
  if (smap.path.length) {
    let best = null;
    for (const q of smap.path) { const d = vec4.len(vec4.sub(q.x, orbitOf('B', q.t).c)); if (!best || d < best.d) best = { d, t: q.t, x: q.x }; }
    if (best) {
      const s = P(orbitOf('B', best.t).c, smap.center === 'A' ? best.t : t);
      octx.strokeStyle = 'rgba(220, 210, 255, 0.55)'; octx.setLineDash([3 * k, 3 * k]);
      octx.beginPath(); octx.arc(s[0], s[1], Math.max(3 * k, LAWS.R_B * sc), 0, 7); octx.stroke(); octx.setLineDash([]);
      smap.bAt = best;
    }
  }
  // your path ahead
  if (smap.path.length) {
    octx.lineWidth = 1.8 * k;
    let prev = P(smap.now.x, smap.now.t);
    smap.path.forEach((q, i) => {
      const s = P(q.x, q.t);
      octx.strokeStyle = `rgba(90, 240, 255, ${(0.95 - 0.7 * i / smap.path.length).toFixed(3)})`;
      octx.beginPath(); octx.moveTo(prev[0], prev[1]); octx.lineTo(s[0], s[1]); octx.stroke();
      prev = s;
    });
    if (smap.hit) {
      octx.fillStyle = smap.hit.what === 'B' ? 'rgba(220, 210, 255, 1)' : smap.hit.what === 'star' ? 'rgba(255, 120, 80, 1)' : 'rgba(150, 230, 200, 1)';
      octx.beginPath(); octx.arc(prev[0], prev[1], 3.5 * k, 0, 7); octx.fill();
    }
  }
  // you
  const me = P(smap.now ? smap.now.x : [0, 0, 0, 0]);
  octx.fillStyle = 'rgb(90, 240, 255)'; octx.strokeStyle = 'rgba(5, 10, 16, 0.95)'; octx.lineWidth = 1.5 * k;
  octx.beginPath(); octx.arc(me[0], me[1], 4.5 * k, 0, 7); octx.fill(); octx.stroke();
  // when the star is off the map, an arrow on the rim points to it
  if (Math.hypot(S[0] - cx, S[1] - cy) > R) {
    const a = Math.atan2(S[1] - cy, S[0] - cx);
    octx.fillStyle = 'rgba(255, 214, 130, 0.95)';
    octx.beginPath(); octx.arc(cx + Math.cos(a) * R * 1.02, cy + Math.sin(a) * R * 1.02, 4 * k, 0, 7); octx.fill();
  }
  octx.restore();
  // a scale bar
  octx.save();
  octx.font = `500 ${10 * k}px "IBM Plex Mono", ui-monospace, monospace`; octx.fillStyle = 'rgba(170, 182, 204, 0.9)';
  const km = smap.range >= 2000 ? 1000 : 250, w = km * sc;
  octx.fillRect(rect.x + 14 * k, rect.y + rect.s - 14 * k, w, 1.5 * k);
  octx.fillText(km >= 1000 ? '1 km' : '250 m', rect.x + 14 * k, rect.y + rect.s - 20 * k);
  octx.restore();
}
