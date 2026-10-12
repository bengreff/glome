(async () => { const { g, p, d, O, w, V, len, nz, gt, place, look } = PT, out = {};
const r1 = w.bodies.find(b => b.kind === 'part' && b.tier === 1), G = g.G;
out.ring = { h: (len(r1.pos) - 250).toFixed(2), floorH: (len(G.cave.floor) - 250).toFixed(2), sleeping: r1.sleeping, kin: !!r1.kinematic, fixed: !!r1.fixed };
// stand in the chamber 1.5 m from the ring, at its floor, and look at it
const u = nz(r1.pos), T0 = nz(V.sub([0.3,-0.5,0.7,0.2], V.sc(u, V.dot([0.3,-0.5,0.7,0.2], u))));
p.pos = V.add(V.sub(r1.pos, V.sc(T0, 1.5)), V.sc(u, 0.1)); p.vel = [0,0,0,0]; p.F = T0; p.settleFrame(); await gt(1.0);
look(r1.pos); await gt(0.3);
const cam = p.camera(), hit = w.raycast(cam.eye, cam.F, 3.2, null);
out.hit = hit ? { kind: hit.body.kind, t: +hit.t.toFixed(2), fixed: !!hit.body.fixed } : null;
out.dist = len(V.sub(r1.pos, cam.eye)).toFixed(2); out.canTake = G.canTake; out.playerH = (len(p.pos) - 250).toFixed(2);
out.ringAfter = (len(r1.pos) - 250).toFixed(2);
return JSON.stringify(out); })()
