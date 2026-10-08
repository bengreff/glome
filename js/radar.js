// The radar: the ground of a 4D world is three-dimensional, so its minimap is a ball (see RADAR_FRAG in
// shaders.js). The disc through the middle is the ground your slice view shows; everything above it lies toward
// ana, below toward kata.
import { PLANET_R, SEA } from './world.js';
import { vec4 } from './player.js';
import { G } from './game.js';
import { gl, canvas, overlay, octx, dyn, setWorld, progRadar, progBake, progBlit } from './render.js';
import { boulders } from './boulders.js';

export const RADAR_FOV = 0.4, RANGE_MIN = 25, RANGE_MAX = Math.PI * PLANET_R;   // all the way out, the ball holds the whole planet
export const RADAR_LAYERS = [                     // L cycles what the ball shows
  { name: 'mountains + water', shells: [0, 0, 0.8], water: 1, legend: 'solid: ground above 24 m · blue: water' },
  { name: 'all shells', shells: [0.13, 0.2, 0.75], water: 1, legend: 'shells: coast · 12 m · 24 m' },
  { name: 'mountains only', shells: [0, 0, 0.85], water: 0, legend: 'solid: ground above 24 m' },
];
const VN_SMALL = 80, VN_BIG = 128, BIG_RANGE = 330;   // baked volume resolution: finer for the far ranges
export const radar = { fbo: gl.createFramebuffer(), tex: null, w: 0, h: 0, volFbo: gl.createFramebuffer(), vols: {}, enc: 0, bakeKey: '', summits: null,
                trail: [], peaks: [], peaksAt: null, peaksR: 0, marks: [], rect: null, hover: null, drag: null, gaze: null };
function ensureRadar(w, h) {
  if (radar.tex && radar.w === w && radar.h === h) return false;
  if (radar.tex) gl.deleteTexture(radar.tex);
  radar.tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE7);
  gl.bindTexture(gl.TEXTURE_2D, radar.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
  gl.bindFramebuffer(gl.FRAMEBUFFER, radar.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, radar.tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.activeTexture(gl.TEXTURE0);
  radar.w = w; radar.h = h;
  return true;
}
// Heights inside the ball, as layers tiled into one 2D atlas: half floats where the GPU can render them, else 8 bits.
const ATLAS_TX = { [VN_SMALL]: 10, [VN_BIG]: 16 };       // layers per row: 80 layers in 10×8, 128 in 16×8
export function makeRadarVolume() {
  const make = (VN, internal, format, type) => {
    const tx = ATLAS_TX[VN], w = tx * VN, h = Math.ceil(VN / tx) * VN, t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
    gl.bindFramebuffer(gl.FRAMEBUFFER, radar.volFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    if (!ok) { gl.deleteTexture(t); return null; }
    return { t, w, h, tx };
  };
  const small = gl.getExtension('EXT_color_buffer_float') ? make(VN_SMALL, gl.R16F, gl.RED, gl.HALF_FLOAT) : null;
  radar.enc = small ? 0 : 1;
  radar.vols[VN_SMALL] = small || make(VN_SMALL, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
  radar.vols[VN_BIG] = small ? make(VN_BIG, gl.R16F, gl.RED, gl.HALF_FLOAT) : make(VN_BIG, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
}

// Unlike a 2-sphere, the 3-sphere can carry a compass with no poles: multiplying your position (as a unit
// quaternion) by i, j and k gives three perpendicular directions along the ground, everywhere at once.
// Walking straight keeps your compass heading fixed but slowly rolls the other two needles around it.
export function compassAt(p) {
  const [a, b, c, d] = p;
  return [[-b, a, d, -c], [-c, -d, a, b], [-d, c, -b, a]];
}
export const radarBasis = () => G.state.radar.compass ? compassAt(G.player.up()) : [G.player.F, G.player.R, G.player.A];

// Geodesic normal coordinates around you: ball coordinates (m) <-> points on the unit 3-sphere.
export function expMap(m, B, u) {
  const r = Math.hypot(m[0], m[1], m[2]);
  if (r < 1e-9) return u;
  const a = r / PLANET_R;
  let D = [0, 0, 0, 0];
  for (let i = 0; i < 3; i++) D = vec4.add(D, vec4.scale(B[i], m[i] / r));
  return vec4.add(vec4.scale(u, Math.cos(a)), vec4.scale(D, Math.sin(a)));
}
export function logMap(n, B = radarBasis(), u = G.player.up()) {
  const c = Math.max(-1, Math.min(1, vec4.dot(u, n)));
  const v = vec4.sub(n, vec4.scale(u, c)), l = vec4.len(v);
  if (l < 1e-9) return [0, 0, 0];
  const k = Math.acos(c) * PLANET_R / l;
  return B.map(b => vec4.dot(v, b) * k);
}
// Unit direction along the ground from you toward n, and the walking distance.
export function headingTo(n) {
  const u = G.player.up(), c = Math.max(-1, Math.min(1, vec4.dot(u, n)));
  const v = vec4.sub(n, vec4.scale(u, c)), l = vec4.len(v);
  return { dir: l > 1e-9 ? vec4.scale(v, 1 / l) : G.player.F, dist: Math.acos(c) * PLANET_R };
}

export function recordTrail() {
  const u = G.player.up(), t = radar.trail;
  if (t.length && vec4.dot(t[t.length - 1].n, u) > Math.cos(1.5 / PLANET_R)) return;
  t.push({ n: u, h: G.player.hf.heightAt(u) });
  if (t.length > 1200) t.shift();
}

// Summits within reach: local maxima of the height on a coarse 3D grid, then climbed to the top.
function findPeaks(RS) {
  const u = G.player.up(), B = [G.player.F, G.player.R, G.player.A], hf = G.player.hf;
  const NG = 9, g = RS / NG, n = 2 * NG + 1, H = new Float32Array(n * n * n).fill(-Infinity);
  const at = (i, j, k) => H[(i * n + j) * n + k];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
    const m = [(i - NG) * g, (j - NG) * g, (k - NG) * g];
    if (Math.hypot(...m) <= RS * 1.05) H[(i * n + j) * n + k] = hf.heightAt(expMap(m, B, u));
  }
  const found = [];
  for (let i = 1; i < n - 1; i++) for (let j = 1; j < n - 1; j++) for (let k = 1; k < n - 1; k++) {
    const h = at(i, j, k);
    if (!(h > 10)) continue;
    let top = true;
    for (let di = -1; di <= 1 && top; di++) for (let dj = -1; dj <= 1 && top; dj++) for (let dk = -1; dk <= 1; dk++)
      if (at(i + di, j + dj, k + dk) > h) { top = false; break; }
    if (!top) continue;
    let m = [(i - NG) * g, (j - NG) * g, (k - NG) * g], best = h, step = g / 2;
    for (let it = 0; it < 16 && step > 0.2; it++) {
      let moved = false;
      for (let ax = 0; ax < 3; ax++) for (const sg of [-1, 1]) {
        const m2 = m.slice(); m2[ax] += sg * step;
        const h2 = hf.heightAt(expMap(m2, B, u));
        if (h2 > best) { best = h2; m = m2; moved = true; }
      }
      if (!moved) step *= 0.5;
    }
    found.push({ n: expMap(m, B, u), h: best });
  }
  found.sort((a, b) => b.h - a.h);
  const out = [];
  for (const p of found) if (!out.some(q => vec4.dot(q.n, p.n) > Math.cos(2 * g / PLANET_R))) out.push(p);
  return out;
}
// Re-search when you have walked a fair way, or the range has grown past (or shrunk well inside) the search.
function updatePeaks() {
  if (G.state.radar.range > BIG_RANGE) { radar.summits ||= findSummits(); return; }
  const need = G.state.radar.range * 1.15, u = G.player.up();
  if (radar.peaksAt && need <= radar.peaksR && need > radar.peaksR * 0.45 && vec4.dot(radar.peaksAt, u) > Math.cos(radar.peaksR / 6 / PLANET_R)) return;
  radar.peaksR = need * 1.3;
  radar.peaks = findPeaks(radar.peaksR); radar.peaksAt = u;
}

// The planet's highest summits, for the far ranges: climb from many random high points, keep the distinct tops.
function findSummits() {
  const hf = G.player.hf, found = [];
  let seed = 7;
  const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  const gauss = () => rand() + rand() + rand() + rand() - 2;
  for (let k = 0, tries = 0; k < 500 && tries < 30000; tries++) {
    let n = vec4.norm([gauss(), gauss(), gauss(), gauss()]), h = hf.heightAt(n);
    if (h < 14) continue;
    k++;
    const B = [];
    for (const e of [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) {
      let v = vec4.sub(e, vec4.scale(n, vec4.dot(e, n)));
      for (const b of B) v = vec4.sub(v, vec4.scale(b, vec4.dot(v, b)));
      if (vec4.len(v) > 0.3 && B.length < 3) B.push(vec4.norm(v));
    }
    let step = 12 / PLANET_R;
    for (let it = 0; it < 40 && step > 0.3 / PLANET_R; it++) {
      let moved = false;
      for (const b of B) for (const sg of [-1, 1]) {
        const n2 = vec4.norm(vec4.add(n, vec4.scale(b, sg * step))), h2 = hf.heightAt(n2);
        if (h2 > h) { h = h2; n = n2; moved = true; }
      }
      if (!moved) step *= 0.5;
    }
    if (h > 24) found.push({ n, h });
  }
  found.sort((a, b) => b.h - a.h);
  const out = [];
  for (const p of found) if (!out.some(q => vec4.dot(q.n, p.n) > Math.cos(50 / PLANET_R))) out.push(p);
  return out.slice(0, 14);
}

const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]); return a.map(v => v / l); };
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function radarCamera(RB, t) {
  const yaw = G.state.radar.yaw, el = G.state.radar.el, D = RB * 3.0;     // the ball only turns when you spin it
  const pos = [-Math.cos(el) * Math.cos(yaw) * D, -Math.cos(el) * Math.sin(yaw) * D, Math.sin(el) * D];
  const F = pos.map(v => -v / D), R = norm3(cross3([0, 0, 1], F)), U = cross3(F, R);
  return { pos, F, R, U };
}
export const orbitRadar = (dy, de) => { G.state.radar.yaw += dy; G.state.radar.el = Math.max(-1.3, Math.min(1.35, G.state.radar.el + de)); };
export const zoomRadar = d => { G.state.radar.range = Math.max(RANGE_MIN, Math.min(RANGE_MAX, G.state.radar.range * Math.exp(d))); };
// Small in the corner or big beside the slice; Tab animates between them.
export function radarRect() {
  const W = overlay.width, H = overlay.height, k = W / innerWidth, m = Math.round(10 * k), g = G.state.radar.grow;
  const e = g * g * (3 - 2 * g), lerp = (a, b) => a + (b - a) * e;
  const s = Math.round(lerp(Math.min(H * 0.42, W * 0.32), Math.min(H * 0.92, W * 0.6)));
  return { x: W - s - m, y: Math.round(lerp(H - s - m, (H - s) / 2)), s, w: s };
}
export function drawRadar(cam, sun, t, fovX) {
  const rect = radar.rect = radarRect(), RB = G.state.radar.range, pin = G.state.radar.pin;
  const u = pin ? pin.n : G.player.up(), B = pin ? pin.B : radarBasis();   // pinned: fixed; else centred on you
  const VN = RB > BIG_RANGE ? VN_BIG : VN_SMALL, vol = radar.vols[VN];
  // resolution follows the frame budget (in steps of 32 px, so the texture isn't reallocated all the time)
  const S = 32 * Math.round(Math.max(160, Math.min(G.state.radar.grow > 0.5 ? 640 : 448, rect.s * Math.max(0.35, dyn.scale * 0.85))) / 32);
  const fresh = ensureRadar(S, S);
  updatePeaks();
  const cv = radarCamera(RB, t);
  const inB = v => B.map(b => vec4.dot(v, b)), discN = inB(G.player.A);
  const shared = p => {
    setWorld(p, cam, sun);
    gl.uniform4fv(p.u('uU0'), u);
    gl.uniform4fv(p.u('uB1'), B[0]);
    gl.uniform4fv(p.u('uB2'), B[1]);
    gl.uniform4fv(p.u('uB3'), B[2]);
    gl.uniform1f(p.u('uRB'), RB);
    gl.uniform1f(p.u('uVN'), VN);
    gl.uniform1f(p.u('uEnc'), radar.enc);
    gl.uniform1f(p.u('uTX'), vol.tx);
  };
  // Redraw only if something in the ball has changed, and then at most every other frame: it is an inset.
  const key = [VN, RB, ...u, ...B.flat()].map(x => x.toFixed(5)).join();
  const look = [key, S, ...cv.pos, fovX, G.state.radar.layers, ...G.player.A, ...G.player.F].map(x => typeof x === 'number' ? x.toFixed(4) : x).join();
  radar.age = (radar.age || 0) + 1;
  if (!fresh && (look === radar.lookKey || radar.age < 2)) return { rect, cv, B, RB, discN, u, pinned: !!pin };
  radar.lookKey = look; radar.age = 0;
  // 1. bake the heights inside the ball (only when the ball has moved, turned or changed size)
  if (key !== radar.bakeKey) {
    radar.bakeKey = key;
    gl.bindFramebuffer(gl.FRAMEBUFFER, radar.volFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, vol.t, 0);
    gl.viewport(0, 0, vol.w, vol.h);
    gl.useProgram(progBake);
    shared(progBake);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  // 2. march the ball
  const p = progRadar;
  gl.bindFramebuffer(gl.FRAMEBUFFER, radar.fbo);
  gl.viewport(0, 0, S, S);
  gl.useProgram(p);
  shared(p);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, vol.t); gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(p.u('uVol'), 3);
  gl.uniform2f(p.u('uVolSize'), vol.w, vol.h);
  gl.uniform2f(p.u('uRes'), S, S);
  gl.uniform1f(p.u('uFov'), RADAR_FOV);
  gl.uniform3fv(p.u('uCam'), cv.pos);
  gl.uniform3fv(p.u('uCamF'), cv.F);
  gl.uniform3fv(p.u('uCamR'), cv.R);
  gl.uniform3fv(p.u('uCamU'), cv.U);
  gl.uniform3fv(p.u('uLight'), norm3([0, 1, 2].map(i => 0.8 * cv.U[i] - 0.5 * cv.R[i] - 0.4 * cv.F[i])));
  gl.uniform3fv(p.u('uDiscN'), discN);
  gl.uniform3fv(p.u('uFwd'), inB(G.player.F));
  gl.uniform3fv(p.u('uRight'), inB(G.player.R));
  gl.uniform1f(p.u('uFovX'), fovX);
  const L = RADAR_LAYERS[G.state.radar.layers];
  gl.uniform3fv(p.u('uShellA'), L.shells);
  gl.uniform1f(p.u('uWater'), L.water);
  gl.uniform1f(p.u('uPinned'), pin ? 1 : 0);
  gl.uniform4fv(p.u('uSliceA'), G.player.A);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0);
  radar.last = { rect, cv, B, RB, discN, u, pinned: !!pin };
  return { rect, cv, B, RB, discN, u, pinned: !!pin };
}
export function blitRadar(r) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(r.rect.x, canvas.height - r.rect.y - r.rect.s, r.rect.w, r.rect.s);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(progBlit);
  gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, radar.tex);
  gl.uniform1i(progBlit.u('uTex'), 6);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.disable(gl.BLEND);
  gl.activeTexture(gl.TEXTURE0);
}
// What is under the cursor in the radar: a summit marker, else the first mountain or the disc along the
// line of sight through the ball (marched on the CPU with the same heights the GPU uses).
export function pickRadar([x, y]) {
  const k = overlay.width / innerWidth, last = radar.last;
  if (!last) return null;
  let best = null, bd = 16 * k;
  for (const m of radar.marks) { const d = Math.hypot(m.x - x, m.y - y); if (d < bd) { bd = d; best = m; } }
  if (best) return { n: best.n, h: best.h, kind: 'summit' };
  for (const r of radar.rocks || []) if (Math.hypot(r.x - x, r.y - y) < Math.max(r.rad, 5 * k)) return { n: r.b.n, h: r.b.r, kind: 'boulder', b: r.b };
  const { rect, cv, B, RB, discN, u, pinned } = last;
  const side = m => pinned ? vec4.dot(expMap(m, B, u), G.player.A) : dot3(m, discN);   // which side of your slice
  const qx = ((x - rect.x) / rect.s * 2 - 1) * RADAR_FOV, qy = -((y - rect.y) / rect.s * 2 - 1) * RADAR_FOV;
  const rd = norm3([0, 1, 2].map(i => cv.F[i] + qx * cv.R[i] + qy * cv.U[i])), ro = cv.pos;
  const b = dot3(ro, rd), c = dot3(ro, ro) - RB * RB, disc = b * b - c;
  if (disc <= 0) return null;
  const t0 = -b - Math.sqrt(disc), t1 = -b + Math.sqrt(disc), ds = RB / 70;
  let sPrev = null;
  for (let t = t0; t <= t1; t += ds) {
    const m = ro.map((v, i) => v + rd[i] * t), sd = side(m);
    if (sPrev !== null && Math.sign(sd) !== Math.sign(sPrev)) {
      const mm = m.map((v, i) => v - rd[i] * ds * sd / (sd - sPrev)), n = expMap(mm, B, u);
      return { n, h: G.player.hf.heightAt(n), kind: 'disc' };
    }
    sPrev = sd;
    const n = expMap(m, B, u), h = G.player.hf.heightAt(n);
    if (h >= 24) return { n, h, kind: 'mountain' };
  }
  return null;
}
export function faceMarkAt(p) {
  const hit = pickRadar(p);
  if (hit && headingTo(hit.n).dist > 2) { G.state.facing = hit.n; G.state.facingWhat = hit.kind === 'summit' ? `summit ${Math.round(hit.h)} m` : hit.kind === 'boulder' ? 'boulder' : hit.kind === 'mountain' ? 'mountain' : hit.h < SEA ? 'water' : 'this ground'; }
}

const hypsCSS = h => h < 0 ? [70, 140, 220] : h < 4 ? [220, 205, 150] : h < 12 ? [110, 190, 100] : h < 24 ? [200, 175, 90] : h < 30 ? [215, 160, 120] : [245, 245, 255];
export function drawRadarOverlay(r, sun) {
  const { rect, cv, B, RB, discN, u, pinned } = r, k = overlay.width / innerWidth;   // u: the ball's centre
  const me = G.player.up(), whole = RB > RANGE_MAX * 0.97;
  const proj = m => {
    const d = [m[0] - cv.pos[0], m[1] - cv.pos[1], m[2] - cv.pos[2]], z = dot3(d, cv.F);
    return [rect.x + (dot3(d, cv.R) / z / RADAR_FOV * 0.5 + 0.5) * rect.s, rect.y + (0.5 - dot3(d, cv.U) / z / RADAR_FOV * 0.5) * rect.s];
  };
  const foot = m => { const a = dot3(m, discN); return [m[0] - a * discN[0], m[1] - a * discN[1], m[2] - a * discN[2]]; };
  const mono = (w, px) => `${w} ${px * k}px "IBM Plex Mono", ui-monospace, monospace`;
  const inB = v => B.map(b => vec4.dot(v, b));
  octx.save();
  octx.lineCap = 'round'; octx.lineJoin = 'round';

  // distance rings on the disc
  octx.font = mono(500, 9.5); octx.fillStyle = 'rgba(210, 225, 245, 0.8)'; octx.textAlign = 'center';
  const rgt = inB(G.player.R);
  if (!pinned) for (const f of [1 / 3, 2 / 3]) { const P = proj(rgt.map(v => v * RB * f)); octx.fillText(`${Math.round(RB * f)} m`, P[0], P[1] + 12 * k); }

  // your trail: where you have walked, in all three ground directions, coloured by height
  const pts = radar.trail.map(p => ({ m: logMap(p.n, B, u), h: p.h }));
  octx.lineWidth = 1 * k; octx.strokeStyle = 'rgba(220, 235, 255, 0.28)';
  octx.beginPath();
  if (!pinned) pts.forEach((p, i) => { if (i % 4 || Math.hypot(...p.m) > RB) return; const a = proj(p.m), b = proj(foot(p.m)); octx.moveTo(...a); octx.lineTo(...b); });
  octx.stroke();
  octx.lineWidth = 2.2 * k;
  const runs = new Map();                                   // one path per colour and age band
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (Math.hypot(...a.m) > RB || Math.hypot(...b.m) > RB) continue;
    const key = `rgba(${hypsCSS(b.h).join(',')}, ${(0.35 + 0.6 * Math.ceil(4 * i / pts.length) / 4).toFixed(2)})`;
    if (!runs.has(key)) runs.set(key, []);
    runs.get(key).push(proj(a.m), proj(b.m));
  }
  for (const [style, seg] of runs) {
    octx.strokeStyle = style; octx.beginPath();
    for (let j = 0; j < seg.length; j += 2) { octx.moveTo(...seg[j]); octx.lineTo(...seg[j + 1]); }
    octx.stroke();
  }

  // objects (glomes, tesseracts, stones, lanterns): small accent squares; filled where your slice cuts them
  if (RB <= 200 && G.objects) {
    for (const b of G.objects.world.bodies) {
      if (b.held) continue;
      const m = logMap(vec4.norm(b.pos), B, u);
      if (Math.hypot(...m) > RB * 0.97) continue;
      const P = proj(m), sz = Math.max(2.2 * k, 3.4 * k * Math.min(1.6, b.bound / 0.3));
      const cut = Math.abs(vec4.dot(vec4.sub(b.pos, G.player.camera().eye), G.player.A)) < b.bound;
      octx.strokeStyle = 'rgba(82, 220, 200, 0.95)'; octx.lineWidth = 1.3 * k; octx.fillStyle = 'rgba(82, 220, 200, 0.85)';
      if (cut) octx.fillRect(P[0] - sz / 2, P[1] - sz / 2, sz, sz); else octx.strokeRect(P[0] - sz / 2, P[1] - sz / 2, sz, sz);
    }
  }
  // creatures: walkers as small warm diamonds, rollers as accent rings
  if (RB <= 200 && G.creatures) {
    for (const c of G.creatures.list) {
      const m = logMap(c.n, B, u);
      if (Math.hypot(...m) > RB * 0.97) continue;
      const P = proj(m), z = 3 * k;
      if (c.kind === 'walker') {
        octx.fillStyle = 'rgba(240, 200, 150, 0.9)';
        octx.beginPath(); octx.moveTo(P[0], P[1] - z); octx.lineTo(P[0] + z, P[1]); octx.lineTo(P[0], P[1] + z); octx.lineTo(P[0] - z, P[1]); octx.closePath(); octx.fill();
      } else {
        octx.strokeStyle = 'rgba(82, 220, 200, 0.95)'; octx.lineWidth = 1.4 * k;
        octx.beginPath(); octx.arc(P[0], P[1], z, 0, 7); octx.stroke();
      }
    }
  }
  // the pouch: one dot per impulse stone, under the ball
  if (G.objects && G.objects.pouch > 0) {
    octx.fillStyle = 'rgba(82, 220, 200, 0.95)';
    for (let i = 0; i < G.objects.pouch; i++) { octx.beginPath(); octx.arc(rect.x + rect.s / 2 + (i - (G.objects.pouch - 1) / 2) * 9 * k, rect.y + rect.s + 4 * k, 2.6 * k, 0, 7); octx.fill(); }
  }

  // boulders: dots sized by radius; outlined where your slice cuts them (those are the ones you can see)
  const bs = [];
  if (RB <= 200) for (const b of boulders.all) {
    if (vec4.dot(b.n, u) < Math.cos(RB / PLANET_R)) continue;
    const m = logMap(b.n, B, u), d = Math.hypot(...m);
    if (d < RB * 0.97) bs.push({ m, d, r: b.r, b });
  }
  bs.sort((a, b) => a.d - b.d);
  radar.rocks = [];
  for (const b of bs.slice(0, 80)) {
    const P = proj(b.m), Pr = proj(b.m.map((v, i) => v + cv.R[i] * b.r)), rad = Math.max(1.6 * k, Math.hypot(Pr[0] - P[0], Pr[1] - P[1]));
    const cut = Math.abs(vec4.dot(b.b.c, G.player.A)) < b.r;
    radar.rocks.push({ x: P[0], y: P[1], rad, b: b.b });
    octx.fillStyle = cut ? 'rgba(235, 228, 215, 0.95)' : 'rgba(160, 155, 148, 0.75)';
    octx.beginPath(); octx.arc(P[0], P[1], rad, 0, 7); octx.fill();
    if (cut) { octx.strokeStyle = '#fff'; octx.lineWidth = 1.4 * k; octx.stroke(); }
  }

  // summits, each on a stalk down to your slice's ground (above = toward ana, below = toward kata)
  radar.marks = [];
  const list = RB > BIG_RANGE ? radar.summits || [] : radar.peaks;
  const shown = list.map(p => ({ ...p, m: logMap(p.n, B, u) })).filter(p => Math.hypot(...p.m) < RB * 0.97).slice(0, RB > BIG_RANGE ? 14 : 7);
  octx.textAlign = 'left';
  for (const p of shown) {
    const off = vec4.dot(p.n, G.player.A) * (PLANET_R + p.h);       // how far the summit lies from your slice, in 4D
    const P = proj(p.m), Q = pinned ? P : proj(foot(p.m)), inSlice = Math.abs(off) < 3;
    const target = G.state.facing && vec4.dot(G.state.facing, p.n) > 0.99999;
    octx.strokeStyle = off >= 0 ? 'rgba(255, 190, 120, 0.8)' : 'rgba(140, 190, 255, 0.8)';
    octx.lineWidth = 1.4 * k;
    octx.beginPath(); octx.moveTo(...Q); octx.lineTo(...P); octx.stroke();
    octx.beginPath(); octx.ellipse(Q[0], Q[1], 3 * k, 1.6 * k, 0, 0, 7); octx.stroke();
    const sz = 5.5 * k;
    octx.fillStyle = `rgb(${hypsCSS(p.h).join(',')})`;
    octx.strokeStyle = inSlice || target ? '#fff' : 'rgba(10, 12, 18, 0.9)';
    octx.lineWidth = (inSlice || target ? 2 : 1) * k;
    octx.beginPath(); octx.moveTo(P[0], P[1] - sz); octx.lineTo(P[0] + sz * 0.9, P[1] + sz * 0.6); octx.lineTo(P[0] - sz * 0.9, P[1] + sz * 0.6); octx.closePath(); octx.fill(); octx.stroke();
    octx.font = mono(500, 10.5); octx.fillStyle = 'rgba(236, 240, 246, 0.92)';
    octx.fillText(`${Math.round(p.h)} m`, P[0] + 8 * k, P[1] + 3 * k);
    radar.marks.push({ x: P[0], y: P[1], n: p.n, h: p.h, off });
  }

  // the rim: ana and kata, the sun, and the compass
  const rimLabel = (dir, txt, color, size = 10.5, scale = 1.1) => {
    const l = Math.hypot(...dir); if (l < 1e-6) return;
    const m = dir.map(v => v / l * RB * scale), P = proj(m);
    const front = dot3(norm3(m), cv.F) < 0.25;
    octx.font = mono(front ? 600 : 500, size);
    octx.fillStyle = color; octx.globalAlpha = front ? 1 : 0.5;
    octx.textAlign = 'center'; octx.fillText(txt, P[0], P[1] + 4 * k); octx.globalAlpha = 1;
  };
  if (!pinned) {
    rimLabel(discN, 'ana', 'rgba(255, 180, 110, 0.95)', 11, 1.13);
    rimLabel(discN.map(v => -v), 'kata', 'rgba(130, 185, 255, 0.95)', 11, 1.13);
  }
  const C = compassAt(u);
  [['i', '#ff8a7a'], ['j', '#9be88f'], ['k', '#8fb8ff']].forEach(([n, col], i) => rimLabel(inB(C[i]), n, col, 10.5, 1.05));
  const su = vec4.dot(sun, u), sh = vec4.sub(sun, vec4.scale(u, su));
  if (vec4.len(sh) > 1e-3) {
    const d = inB(sh), l = Math.hypot(...d), P = proj(d.map(v => v / l * RB * 1.2));
    const el = Math.asin(Math.max(-1, Math.min(1, su))) * 180 / Math.PI;
    octx.fillStyle = el > 0 ? 'rgba(255, 220, 120, 0.95)' : 'rgba(150, 160, 190, 0.6)';
    octx.beginPath(); octx.arc(P[0], P[1], (el > 0 ? 5 : 3.5) * k, 0, 7); octx.fill();
    octx.font = mono(500, 10); octx.textAlign = 'center';
    octx.fillText(`sun ${Math.round(el)}°`, P[0], P[1] - 8 * k);
  }

  // your line of sight: where the centre of the slice view lands, on the disc
  if (radar.gaze) {
    const g = logMap(radar.gaze.n, B, u);
    if (Math.hypot(...g) < RB) {
      const P = proj(g), C = proj(pinned ? logMap(me, B, u) : [0, 0, 0]), pulse = 1 + 0.25 * Math.sin(performance.now() / 220);
      octx.setLineDash([3 * k, 3 * k]); octx.strokeStyle = 'rgba(255, 255, 255, 0.75)'; octx.lineWidth = 1.2 * k;
      octx.beginPath(); octx.moveTo(...C); octx.lineTo(...P); octx.stroke(); octx.setLineDash([]);
      octx.lineWidth = 2 * k; octx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      octx.beginPath(); octx.ellipse(P[0], P[1], 6 * k * pulse, 3.5 * k * pulse, 0, 0, 7); octx.stroke();
      octx.font = mono(500, 10); octx.textAlign = 'left'; octx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      octx.fillText(`${Math.round(radar.gaze.t)} m`, P[0] + 9 * k, P[1] - 4 * k);
    }
  }

  // pinned: you are a dot moving through the ball, with your forward (white) and ana (orange) directions
  if (pinned) {
    const P = proj(logMap(me, B, u)), arrow = (dir, col) => {
      const q = proj(logMap(vec4.add(vec4.scale(me, Math.cos(0.08 * RB / PLANET_R)), vec4.scale(dir, Math.sin(0.08 * RB / PLANET_R))), B, u));
      octx.strokeStyle = col; octx.lineWidth = 2.4 * k; octx.beginPath(); octx.moveTo(...P); octx.lineTo(...q); octx.stroke();
    };
    if (headingTo(u).dist < RB) {
      arrow(G.player.A, 'rgba(255, 170, 90, 0.95)'); arrow(G.player.F, 'rgba(255, 255, 255, 0.95)');
      octx.fillStyle = 'rgb(90, 240, 255)'; octx.strokeStyle = 'rgba(5, 10, 16, 0.95)'; octx.lineWidth = 1.5 * k;
      octx.beginPath(); octx.arc(P[0], P[1], 5 * k, 0, 7); octx.fill(); octx.stroke();
    }
    const c0 = proj([0, 0, 0]);
    octx.strokeStyle = 'rgba(236, 240, 246, 0.9)'; octx.lineWidth = 1.5 * k; octx.strokeRect(c0[0] - 3.5 * k, c0[1] - 3.5 * k, 7 * k, 7 * k);
  }

  // hover: what is under the cursor, and how to reach it
  radar.last = { rect, cv, B, RB, discN, u, pinned };
  const hv = radar.hover && pickRadar(radar.hover);
  if (hv) {
    const { dist, dir } = headingTo(hv.n);
    const ana = Math.atan2(vec4.dot(dir, G.player.A), Math.hypot(vec4.dot(dir, G.player.F), vec4.dot(dir, G.player.R))) * 180 / Math.PI;
    const what = hv.kind === 'summit' ? `summit ${Math.round(hv.h)} m high` : hv.kind === 'boulder' ? `boulder, radius ${hv.h.toFixed(1)} m`
      : hv.h < SEA ? `water ${Math.round(SEA - hv.h)} m deep` : `ground ${Math.round(hv.h)} m high`;
    let where = Math.abs(ana) < 2 ? 'in your slice' : `${Math.round(Math.abs(ana))}° toward ${ana > 0 ? 'ana' : 'kata'} from your slice`;
    if (hv.kind === 'boulder') {                            // how much of it your slice cuts: a 3D ball of radius sqrt(r² - a²)
      const a = Math.abs(vec4.dot(hv.b.c, G.player.A)), r = hv.b.r;    // distance of its centre from your slice
      where = a < r ? `your slice cuts it: a ball of radius ${Math.sqrt(r * r - a * a).toFixed(1)} m` : `${(a - r).toFixed(1)} m outside your slice: invisible`;
    }
    const lines = [`${what} · ${Math.round(dist)} m away`, where, 'click to turn and face it'];
    octx.font = mono(500, 11); octx.textAlign = 'left';
    const [hx, hy] = radar.hover;
    octx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; octx.lineWidth = 1.5 * k;
    octx.beginPath(); octx.arc(hx, hy, 5 * k, 0, 7); octx.stroke();
    const w = Math.max(...lines.map(t => octx.measureText(t).width)) + 16 * k, x0 = Math.min(hx + 12 * k, overlay.width - w - 4 * k), y0 = hy - 52 * k;
    octx.fillStyle = 'rgba(11, 14, 20, 0.88)'; octx.fillRect(x0, y0, w, 50 * k);
    lines.forEach((t, i) => { octx.fillStyle = i === 2 ? 'rgba(141, 154, 176, 0.95)' : 'rgba(236, 240, 246, 0.95)'; octx.fillText(t, x0 + 8 * k, y0 + (15 + 15 * i) * k); });
  }

  // caption
  octx.textAlign = 'left';
  octx.font = mono(500, 10.5);
  const caption = (lines, x, y) => {
    const w = Math.max(...lines.map(t => octx.measureText(t).width)) + 12 * k;
    octx.fillStyle = 'rgba(11, 14, 20, 0.6)'; octx.fillRect(x - 6 * k, y - 12 * k, w, lines.length * 15 * k + 5 * k);
    octx.fillStyle = 'rgba(170, 182, 204, 0.95)'; lines.forEach((t, i) => octx.fillText(t, x, y + i * 15 * k));
  };
  const mode = pinned ? `pinned (${Math.round(headingTo(u).dist)} m from you)` : G.state.radar.compass ? 'compass-up' : 'heading-up';
  caption([`${whole ? 'WHOLE PLANET' : `RADAR ${Math.round(RB)} m`} · ${mode} · ${RADAR_LAYERS[G.state.radar.layers].name}`], rect.x + 8 * k, rect.y + 14 * k);
  if (whole) caption([`the whole rim is one point: ${pinned ? "the pin's" : 'your'} antipode, ${Math.round(RANGE_MAX)} m away`], rect.x + 8 * k, rect.y + 34 * k);
  if (G.state.radar.grow > 0.99) {
    const lines = ['disc: the ground your slice shows', RADAR_LAYERS[G.state.radar.layers].legend, 'disc tint: mountains toward ana / kata', '▲ summits · ● boulders (ringed: cut by your slice)', 'line: your trail', 'L layers · K hide radar',
      'wheel or −/= zoom (out to the whole planet)', 'arrows, or Esc then drag: spin', 'Esc, then hover / click: inspect / face', 'M heading/compass-up · P pin here', 'Tab smaller'];
    const w = Math.max(...lines.map(t => octx.measureText(t).width));
    caption(lines, Math.max(8 * k, rect.x - w - 18 * k), rect.y + rect.s - 150 * k);
  }
  octx.restore();
}
