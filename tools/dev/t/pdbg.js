(async () => { const { g, p, d, O, w, wait, V, len, nz, place, gt } = PT, out = {}, L = d.launcher, P = L.pillar;
const r1 = w.bodies.find(b => b.kind === 'part' && b.tier === 1);
const T0 = [-P.up[1],P.up[0],P.up[3],-P.up[2]], dir = nz(V.sub(T0, V.sc(P.up, V.dot(T0, P.up))));
const spot = nz(V.add(V.sc(P.n, Math.cos(3 / 250)), V.sc(dir, Math.sin(3 / 250))));
r1.kinematic = false; r1.pos = V.sc(spot, 250 + p.hf.heightAt(spot) + 0.08); r1.rot = P.rot; r1.vel = [0,0,0,0]; r1.sleeping = false; await gt(1.5);
place(V.sub(r1.pos, V.sc(dir, 1.5)), dir); await gt(0.3);
p.pitch = Math.asin(V.dot(nz(V.sub(r1.pos, p.camera().eye)), p.up())); await gt(0.3);
const cam = p.camera(); out.dist = len(V.sub(r1.pos, cam.eye)).toFixed(2);
const hit = w.raycast(cam.eye, cam.F, 3.2, null); out.hit = hit ? { kind: hit.body.kind, t: hit.t.toFixed(2), fixed: !!hit.body.fixed } : null;
out.r1 = { fixed: !!r1.fixed, kin: !!r1.kinematic, held: !!r1.held, bound: r1.bound };
out.canTake = g.G.canTake; out.fade = d.fade && d.fade.t;
return JSON.stringify(out); })()
