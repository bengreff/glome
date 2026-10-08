(async () => {
const { g, p, d, O, w, V, len, nz, gt, place, look } = PT;
const L = d.launcher, C = d.cosmos, out = {};
const SM = await import(document.querySelector('script[type=importmap]').textContent.match(/"\.\/js\/spacemap\.js": "([^"]+)"/)[1]);
const up = nz(L.site), T = [[-up[1],up[0],up[3],-up[2]],[-up[2],-up[3],up[0],up[1]],[-up[3],up[2],-up[1],up[0]]];
// carry parts I–III to the pad (teleported: the carrying is not the puzzle here)
w.bodies.filter(b => b.kind === 'part' && b.tier <= 3).forEach((b, i) => { b.kinematic = false; b.pos = V.add(V.add(L.site, V.sc(T[i], 0.7)), V.sc(up, 0.2)); b.sleeping = false; });
p.pos = V.add(L.site, V.sc(up, 0.05)); p.vel = [0,0,0,0]; p.settleFrame(); await gt(1);
out.tier = L.tier;
// wait for a moment when a launch flat across the hoop exists, and aim with the map's own prediction
const sweep = (pts) => { let s = 0, last = null; for (const q of pts) { const r = nz(V.sub(q.x, C.orbitOf('A', q.t).c)); if (last) s += Math.acos(Math.max(-1, Math.min(1, V.dot(r, last)))); last = r; } return s; };
let found = null, tries = 0;
for (let wait = 0; wait < 400 && !found; wait += 6) {
  const t = g.state.time + wait;
  for (let i = 0; i < 40 && !found; i++) {
    tries++;
    const az = Math.random() * 2 * Math.PI, b = Math.random() * Math.PI, e = 0.02 + 0.3 * Math.random();
    const h = nz(V.add(V.sc(T[0], Math.cos(az) * Math.sin(b)), V.add(V.sc(T[1], Math.sin(az) * Math.sin(b)), V.sc(T[2], Math.cos(b)))));
    const dir = nz(V.add(V.sc(h, Math.cos(e)), V.sc(up, Math.sin(e))));
    const r = SM.predict(C.toInertial(p.pos, t), C.velToInertial(p.pos, V.sc(dir, d.TIERS[3]), t), t);
    const rs = r.pts.map(q => len(V.sub(q.x, C.orbitOf('A', q.t).c))); if (!r.hit && Math.max(...rs) < 900 && sweep(r.pts) > 2.2 * Math.PI) found = { wait, dir, rmax: Math.max(...rs).toFixed(0) };
  }
}
out.tries = tries; out.found = !!found;
if (!found) return JSON.stringify(out);
out.waited = found.wait; out.rmax = found.rmax;
// the world turns to that moment (the player stands and waits), then aim and jump
g.state.time += found.wait;
p.pos = V.add(L.site, V.sc(up, 0.05)); p.vel = [0,0,0,0];
const u = p.up(), hz = nz(V.sub(found.dir, V.sc(u, V.dot(found.dir, u)))); p.F = hz; p.settleFrame(); p.pitch = Math.asin(V.dot(found.dir, u));
g.keys.add('Space'); await gt(0.05); g.keys.delete('Space');
await gt(150);
out.orbited = !!g.G.flags.orbited; out.stillFlying = d.flight.active;
return JSON.stringify(out);
})()
