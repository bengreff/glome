(async () => {
// Tier IV: carry all four parts to the pad, find a launch the space map says lands on B, wait for that moment,
// aim and jump, and fly until you land.
const { g, p, d, O, w, V, len, nz, gt } = PT;
const L = d.launcher, C = d.cosmos, out = {};
const SM = await import(document.querySelector('script[type=importmap]').textContent.match(/"\.\/js\/spacemap\.js": "([^"]+)"/)[1]);
const up = nz(L.site), T = [[-up[1],up[0],up[3],-up[2]],[-up[2],-up[3],up[0],up[1]],[-up[3],up[2],-up[1],up[0]]];
w.bodies.filter(b => b.kind === 'part').forEach((b, i) => { b.kinematic = false; b.pos = V.add(V.add(L.site, V.sc(i < 3 ? T[i] : V.sc(T[0], -1), 0.7)), V.sc(up, 0.2)); b.sleeping = false; });
p.pos = V.add(L.site, V.sc(up, 0.05)); p.vel = [0,0,0,0]; p.settleFrame(); await gt(1);
out.tier = L.tier;
let found = null, tries = 0;
for (let wait = 0; wait < 960 && !found; wait += 20) {
  const t = g.state.time + wait;
  for (let i = 0; i < 60 && !found; i++) {
    tries++;
    const az = Math.random() * 2 * Math.PI, b = Math.random() * Math.PI, e = 0.05 + 1.3 * Math.random();
    const h = nz(V.add(V.sc(T[0], Math.cos(az) * Math.sin(b)), V.add(V.sc(T[1], Math.sin(az) * Math.sin(b)), V.sc(T[2], Math.cos(b)))));
    const dir = nz(V.add(V.sc(h, Math.cos(e)), V.sc(up, Math.sin(e))));
    const r = SM.predict(C.toInertial(p.pos, t), C.velToInertial(p.pos, V.sc(dir, d.TIERS[4]), t), t);
    if (r.hit && r.hit.what === 'B') found = { wait, dir, eta: (r.hit.t - t).toFixed(0) };
  }
}
out.tries = tries; out.found = !!found;
if (!found) return JSON.stringify(out);
out.waited = found.wait; out.predicted = found.eta;
g.state.time += found.wait;
p.pos = V.add(L.site, V.sc(up, 0.05)); p.vel = [0,0,0,0];
const u = p.up(), hz = nz(V.sub(found.dir, V.sc(u, V.dot(found.dir, u)))); p.F = hz; p.settleFrame(); p.pitch = Math.asin(V.dot(found.dir, u));
const t0 = g.state.time;
g.keys.add('Space'); await gt(0.05); g.keys.delete('Space');
while (g.state.time - t0 < 320 && p.onB == null) await gt(2);
out.landedB = p.onB != null; out.flightTime = (g.state.time - t0).toFixed(0);
return JSON.stringify(out);
})()
