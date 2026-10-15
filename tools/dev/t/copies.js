(async () => { try { const { g, p, d, V, len, nz, gt } = PT, G = g.G, L = d.launcher, out = {};
const up = nz(L.site); p.pos = V.add(L.site, V.sc(up, 0.05)); p.vel = [0, 0, 0, 0]; p.settleFrame(); await gt(0.5);
L.setAim([0, 0, Math.PI / 2]); L.setSpeed(60); await gt(0.2);
g.keys.add('Space'); await gt(0.05); g.keys.delete('Space');
G.warp = 5; await gt(45); G.warp = 1;
out.flying = d.flight.active; out.r = +len(V.sub(d.flight.x, d.cosmos.orbitOf('A', g.state.time).c)).toFixed(0);
// square your slice to the row: ana across the hoop axis, so its line (and the planet's centre, below you) lie in your
// slice; then look along it, toward the copies on the far side of the planet from you
const t = g.state.time, h0 = d.cosmos.hoopAxisBody(t), u = p.up(), sgn = V.dot(h0, u) > 0 ? 1 : -1, h = V.sc(h0, sgn);
let ht = V.sub(h, V.sc(u, V.dot(h, u))); ht = nz(ht);
let A = V.sub(p.A, V.sc(u, V.dot(p.A, u))); A = V.sub(A, V.sc(ht, V.dot(A, ht))); A = nz(A);
p.F = ht; p.A = A; p.settleFrame(); p.pitch = Math.asin(Math.max(-1, Math.min(1, V.dot(h, u)))) * 0.5;
const C = d.cosmos; d.flight.F = C.dirToInertial(p.F, t); d.flight.R = C.dirToInertial(p.R, t); d.flight.A = C.dirToInertial(p.A, t);
await gt(1.0); out.hA = +V.dot(h0, p.A).toFixed(3);
out.errors = G.errors || 0; out.lastError = G.lastError ? G.lastError.slice(0, 300) : null; out.gpu = +(g.prof.gpu || 0).toFixed(1);
return JSON.stringify(out);
} catch (e) { return 'ERR ' + e.message; } })()
