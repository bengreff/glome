// window.TOUR: teleports for standard views. Each view(name) places you and returns a description.
(() => {
const g = __glome, p = g.player, d = g.dbg, len = a => Math.hypot(...a);
const V = { add: (a, b) => a.map((x, i) => x + b[i]), sub: (a, b) => a.map((x, i) => x - b[i]), sc: (a, k) => a.map(x => x * k), dot: (a, b) => a.reduce((s, x, i) => s + x * b[i], 0) };
const nz = a => V.sc(a, 1 / len(a)), tg = u => [[-u[1],u[0],u[3],-u[2]],[-u[2],-u[3],u[0],u[1]],[-u[3],u[2],-u[1],u[0]]];
const off = (u, t, m) => nz(V.add(V.sc(u, Math.cos(m / 250)), V.sc(t, Math.sin(m / 250))));
const home = nz(g.G.home.pos);
// stand dist metres from target point q (4D), facing it, with your slice through it; look at height dh above ground there
const standAt = (q, dist, side = 0, dh = 1.0) => {
  const u = nz(q), T = tg(u), dir = nz(V.add(V.sc(T[0], Math.cos(side)), V.sc(T[1], Math.sin(side))));
  const n = off(u, dir, -dist); p.pos = V.sc(n, 250 + p.hf.heightAt(n) + 0.05); p.vel = [0, 0, 0, 0];
  const up = p.up(), f = V.sub(q, p.pos), fh = nz(V.sub(f, V.sc(up, V.dot(f, up))));
  let a = V.sub(T[2], V.sc(up, V.dot(T[2], up))); a = nz(V.sub(a, V.sc(fh, V.dot(a, fh))));
  p.F = fh; p.A = a; p.R = nz(V.sub(V.sub(T[1], V.sc(up, V.dot(T[1], up))), V.sc(fh, V.dot(V.sub(T[1], V.sc(up, V.dot(T[1], up))), fh))));
  p.settleFrame();
  const eye = p.camera().eye, tgt = V.add(V.sc(nz(q), 250 + p.hf.heightAt(nz(q))), V.sc(nz(q), dh)), dd = V.sub(tgt, eye);
  p.pitch = Math.asin(V.dot(nz(dd), up));
};
const nearestRock = kind => d.props.rocks.filter(r => r.kind === kind).map(r => ({ r, d: len(V.sub(r.c, g.G.home.pos)) })).sort((a, b) => a.d - b.d)[0];
window.TOUR = {
  start: () => { p.pos = g.G.home.pos.slice(); p.F = g.G.home.F; p.R = g.G.home.R; p.A = g.G.home.A; p.settleFrame(); p.pitch = 0.12; return 'start'; },
  grove: () => { const gr = d.groves[0]; standAt(V.sc(gr.n, 250), gr.r + 12, 0.4, 3); return 'grove r ' + gr.r.toFixed(0) + ' n ' + gr.count; },
  inwood: () => { const gs = d.groves.map(g => ({ g, dist: Math.acos(Math.min(1, V.dot(g.n, home))) * 250 })).filter(x => x.dist < 200 && x.g.count > 60).sort((a, b) => b.g.count / b.g.r ** 3 - a.g.count / a.g.r ** 3); const gr = gs[0].g; standAt(V.sc(off(gr.n, tg(gr.n)[0], 4), 250), 6, 0, 2.5); p.pitch = 0.08; return 'in wood r ' + gr.r.toFixed(0) + ' n ' + gr.count; },
  inwood2: () => { p.rotate('FR', 2.0); return 'in wood, turned'; },
  inwood3: () => { p.rotate('FA', 0.5); return 'in wood, turned through ana'; },
  outcrop: () => { const x = nearestRock('outcrop'); standAt(x.r.c, x.r.R + 7, 0.3, 0.8); return 'outcrop ' + x.d.toFixed(0); },
  crystal: () => { const x = nearestRock('crystal'); standAt(x.r.c, x.r.R + 5, 0.3, 0.8); return 'crystal ' + x.d.toFixed(0); },
  stone: () => { const x = nearestRock('stone'); standAt(x.r.c, x.r.R + 4, 0.3, 0.2); return 'stone ' + x.d.toFixed(0); },
  scree: () => { const x = nearestRock('scree'); standAt(x.r.c, x.r.R + 5, 0.3, 0.2); return 'scree ' + x.d.toFixed(0); },
  startL: () => { window.TOUR.start(); p.rotate('FR', -0.9); return 'start, left'; },
  startA: () => { window.TOUR.start(); p.rotate('FA', 0.35); return 'start, turned through ana'; },
  startB: () => { window.TOUR.start(); p.rotate('FR', 2.4); p.rotate('FA', -0.3); return 'start, behind, turned kata'; },
  herd: () => { const L = d.creatures.list.filter(c => c.kind === 'walker').map(c => ({ c, d: Math.acos(Math.min(1, V.dot(c.n, home))) * 250 })).sort((a, b) => a.d - b.d); const c = L[0].c; standAt(V.sc(c.n, 250), 11, 0.2, 0.6); return 'herd ' + L[0].d.toFixed(0) + ' m, near: ' + L.filter(x => V.dot(x.c.n, c.n) > Math.cos(25 / 250)).length + ' walkers, curious ' + L.filter(x => x.c.curious && V.dot(x.c.n, c.n) > Math.cos(25 / 250)).length; },
  ruin: (i = 0) => { const R = d.finds.ruins.map(r => ({ r, d: Math.acos(Math.min(1, V.dot(r.n, home))) * 250 })).sort((a, b) => a.d - b.d); const r = R[i].r; standAt(V.sc(r.n, 250), 11, 0.5, 1.0); return 'ruin ' + r.kind + ' ' + R[i].d.toFixed(0) + ' m'; },
  ruin1: () => window.TOUR.ruin(1), ruin2: () => window.TOUR.ruin(2),
  cairn: () => { const R = d.finds.cairns.map(r => ({ r, d: Math.acos(Math.min(1, V.dot(r.n, home))) * 250 })).sort((a, b) => a.d - b.d); standAt(V.sc(R[0].r.n, 250), 5, 0.5, 0.4); return 'cairn ' + R[0].d.toFixed(0); },
  night: () => { window.TOUR.start(); const u = p.up(); let t = g.state.time; for (let k = 0; k < 4000; k++, t += 1) { if (V.dot(g.sunDir(t), u) < -0.35) break; } g.state.time = t; return 'night, sun ' + V.dot(g.sunDir(t), u).toFixed(2); },
  dusk: () => { window.TOUR.start(); const u = p.up(); let t = g.state.time; for (let k = 0; k < 4000; k++, t += 1) { const e = V.dot(g.sunDir(t), u); if (e < 0.06 && e > 0.0 && V.dot(g.sunDir(t + 1), u) < e) break; } g.state.time = t; return 'dusk'; },
  fly: () => { window.TOUR.start(); g.G.fly = true; p.pos = V.sc(nz(p.pos), Math.hypot(...p.pos) + 70); p.pitch = -0.7; return 'flying 70 m up'; },
  down: () => { window.TOUR.start(); p.pitch = -0.9; return 'down'; },
};
return 'tour ready';
})()
