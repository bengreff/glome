(async () => {
// Tier IV: carry all four parts to the pad, find a launch the space map says lands on B, wait for that moment,
// aim and jump, and fly until you land.
const { g, p, d, O, w, V, len, nz, gt } = PT;
const L = d.launcher, C = d.cosmos, out = {};
const SM = await import(document.querySelector('script[type=importmap]').textContent.match(/"\.\/js\/spacemap\.js": "([^"]+)"/)[1]);
const up = nz(L.site), T = [[-up[1],up[0],up[3],-up[2]],[-up[2],-up[3],up[0],up[1]],[-up[3],up[2],-up[1],up[0]]];
w.bodies.filter(b => b.kind === 'part').forEach(b => L.seat(b));
p.pos = V.add(L.site, V.sc(up, 0.05)); p.vel = [0,0,0,0]; p.settleFrame(); await gt(1);
out.tier = L.tier;
// aim as a player does with the map: try directions, keep the one whose path passes nearest B, and refine it
let found = null, tries = 0, waited = 0;
const missB = r => r.hit && r.hit.what === 'B' ? 0 : Math.min(...r.pts.map(q => { const B = C.orbitOf('B', q.t).c; return Math.min(...[-1, 0, 1].map(k => len(V.sub(q.x, V.add(B, [0, 0, 0, k * g.LAWS.L]))))); }));
const dirOf = ([az, b, e]) => { const h = nz(V.add(V.sc(T[0], Math.cos(az) * Math.sin(b)), V.add(V.sc(T[1], Math.sin(az) * Math.sin(b)), V.sc(T[2], Math.cos(b))))); return nz(V.add(V.sc(h, Math.cos(e)), V.sc(up, Math.sin(e)))); };
for (; waited < 960 && !found; waited += 60) {
  const t = g.state.time;                                 // searched at the moment of the jump
  const run = q => { tries++; const r = SM.predict(C.toInertial(p.pos, t), C.velToInertial(p.pos, V.sc(dirOf(q), d.TIERS[4]), t), t); return { q, m: missB(r), r }; };
  let best = null;
  for (let i = 0; i < 80; i++) { const x = run([Math.random() * 2 * Math.PI, Math.random() * Math.PI, 0.05 + 1.3 * Math.random()]); if (!best || x.m < best.m) best = x; }
  for (let i = 0, st = 0.2; i < 80 && best.m > 0; i++) { const x = run(best.q.map(v => v + (Math.random() - 0.5) * st)); if (x.m < best.m) best = x; else if (i % 10 === 9) st *= 0.6; }
  if (best.m === 0 && best.r.hit.t - t < 120) found = { dir: dirOf(best.q), eta: (best.r.hit.t - t).toFixed(0) };   // (a short flight: a long one is more at the mercy of the moment of the jump)
  else { g.state.time += 60; await gt(0.05); }
}
out.tries = tries; out.found = !!found;
if (!found) return JSON.stringify(out);
out.waited = waited; out.predicted = found.eta;
p.pos = V.add(L.site, V.sc(up, 0.05)); p.vel = [0,0,0,0];
const u = p.up(), hz = nz(V.sub(found.dir, V.sc(u, V.dot(found.dir, u)))); p.F = hz; p.settleFrame(); p.pitch = Math.asin(V.dot(found.dir, u));
L.aimAt(found.dir); await gt(0.05);                    // (the barrel, set by its sliders: scripted here, the aiming is not the test)
const t0 = g.state.time;
g.keys.add('Space'); await gt(0.05); g.keys.delete('Space');
while (g.state.time - t0 < 320 && p.onB == null) await gt(2);
out.landedB = p.onB != null; out.flightTime = (g.state.time - t0).toFixed(0);
return JSON.stringify(out);
})()
