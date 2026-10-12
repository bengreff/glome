(async () => { const { g, p, d, O, w, V, len, nz, gt, place, look } = PT, out = {}, log = [];
const r1 = w.bodies.find(b => b.kind === 'part' && b.tier === 1), G = g.G;
const u = nz(r1.pos), T0 = nz(V.sub([0.3,-0.5,0.7,0.2], V.sc(u, V.dot([0.3,-0.5,0.7,0.2], u))));
p.pos = V.add(V.sub(r1.pos, V.sc(T0, 1.5)), V.sc(u, 0.1)); p.vel = [0,0,0,0]; p.F = T0; p.settleFrame(); await gt(1.0);
look(r1.pos); await gt(0.3);
d.actions.fDown = true; await gt(0.05);
for (let i = 0; i < 20; i++) { await gt(0.1); log.push([!!r1.held, len(V.sub(r1.pos, p.camera().eye)).toFixed(2), (len(r1.pos) - len(p.pos)).toFixed(2), (G.strain||0).toFixed(2)].join(' ')); }
out.log = log; out.held = O.held === r1;
return JSON.stringify(out); })()
