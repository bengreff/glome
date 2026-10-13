(async () => {
const { g, p, d, O, w, V, len, nz, gt, place, look } = PT;
const L = d.launcher, C = d.cosmos, out = {};
const SM = await import(document.querySelector('script[type=importmap]').textContent.match(/"\.\/js\/spacemap\.js": "([^"]+)"/)[1]);
const up = nz(L.site), T = [[-up[1],up[0],up[3],-up[2]],[-up[2],-up[3],up[0],up[1]],[-up[3],up[2],-up[1],up[0]]];
// the launcher's speed is searched too (an orbit wants about 50 m/s; the speed lever sets any)
L.speed = 53;
p.pos = V.add(L.site, V.sc(up, 0.05)); p.vel = [0,0,0,0]; p.settleFrame(); await gt(1);
out.speed = L.speed;
// wait for a moment when a launch flat across the hoop exists, and aim with the map's own prediction
const sweep = (pts) => { let s = 0, last = null; for (const q of pts) { const r = nz(V.sub(q.x, C.orbitOf('A', q.t).c)); if (last) s += Math.acos(Math.max(-1, Math.min(1, V.dot(r, last)))); last = r; } return s; };
// wait for a moment when a launch flat across the hoop exists, and aim with the map's own prediction, made at the
// moment of the jump (the world turns on while it is searched for otherwise, and the spin carries the pad)
let found = null, tries = 0, waited = 0;
for (; waited < 1500 && !found; waited += 6) {
  const t = g.state.time;
  for (let i = 0; i < 40 && !found; i++) {
    tries++;
    const az = Math.random() * 2 * Math.PI, b = Math.random() * Math.PI, e = 0.02 + 0.3 * Math.random();
    const h = nz(V.add(V.sc(T[0], Math.cos(az) * Math.sin(b)), V.add(V.sc(T[1], Math.sin(az) * Math.sin(b)), V.sc(T[2], Math.cos(b)))));
    const dir = nz(V.add(V.sc(h, Math.cos(e)), V.sc(up, Math.sin(e)))), sp = 44 + 16 * Math.random();
    const r = SM.predict(C.toInertial(p.pos, t), C.velToInertial(p.pos, V.sc(dir, sp), t), t);
    // bounded, a turn and more, and with room to spare at its low point (the orbit is marginal by nature: a path
    // that skims the hills is lost to the smallest difference between the map's steps and flight's: paths whose low point
    // cleared the hills by under 60 m were lost about half the time)
    const rs = r.pts.map(q => len(V.sub(q.x, C.orbitOf('A', q.t).c))), lo = Math.min(...rs.slice(rs.length >> 3));
    if (!r.hit && Math.max(...rs) < 700 && lo > 250 + 48 + 62 && sweep(r.pts) > 2.2 * Math.PI) found = { dir, sp, rmax: Math.max(...rs).toFixed(0), rmin: lo.toFixed(0) };
  }
  if (!found) { g.state.time += 6; await gt(0.05); }
}
out.tries = tries; out.found = !!found;
if (!found) return JSON.stringify(out);
out.waited = waited; out.rmax = found.rmax; out.rmin = found.rmin;
p.pos = V.add(L.site, V.sc(up, 0.05)); p.vel = [0,0,0,0];
const u = p.up(), hz = nz(V.sub(found.dir, V.sc(u, V.dot(found.dir, u)))); p.F = hz; p.settleFrame(); p.pitch = Math.asin(V.dot(found.dir, u));
L.aimAt(found.dir); L.speed = found.sp; out.speed = +found.sp.toFixed(1); await gt(0.05);                    // (the barrel, set by its levers: scripted here, the aiming is not the test)
g.keys.add('Space'); await gt(0.05); g.keys.delete('Space');
await gt(2);                                              // (flight begins 20 m up)
for (let i = 0; i < 150 && !g.G.flags.orbited && d.flight.active; i++) await gt(2);   // (a large orbit takes a few minutes to come round)
out.orbited = !!g.G.flags.orbited; out.stillFlying = d.flight.active;
return JSON.stringify(out);
})()
