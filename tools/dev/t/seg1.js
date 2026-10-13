(async () => { const { g, p, d, O, w, wait, V, len, nz, gt } = PT, G = g.G, L = d.launcher, out = {};
// segment 1 check: no errors; the guide points at the nearest stone with an empty pouch, at the launcher with one
// in the pouch; the pad launches along the barrel at the launcher's speed; nothing of the puzzles is left
out.errors = G.errors || 0; out.lastError = G.lastError || null;
out.parts = w.bodies.filter(b => b.kind === 'part' || b.kind === 'key').length;
out.pouch = O.pouch; out.goal = d.guide.goal && d.guide.goal.kind;
const st = w.bodies.filter(b => b.kind === 'stone' && !b.fixed);
out.stones = st.length; out.nearestStone = d.guide.goal ? len(V.sub(d.guide.goal.pos, p.pos)).toFixed(1) : null;
O.pouch = 1; await gt(0.2); out.goalWithPouch = d.guide.goal && d.guide.goal.kind; O.pouch = 0;
const up = nz(L.site); p.pos = V.add(L.site, V.sc(up, 0.05)); p.vel = [0, 0, 0, 0]; p.settleFrame(); await gt(0.6);
out.onPad = L.onPad; out.cue = d.guide.goal && d.guide.goal.cue;
const dir = L.aim.dir.slice(), n0 = G.flags.launches || 0;
g.keys.add('Space'); await gt(0.05); g.keys.delete('Space'); await gt(0.1);
out.launched = (G.flags.launches || 0) > n0;
const v = d.flight.active ? null : p.vel;
out.speed = v ? +len(v).toFixed(1) : 'flying'; out.offBarrel = v ? +(Math.acos(Math.min(1, V.dot(nz(v), dir))) * 57.3).toFixed(1) : null;
out.errors2 = G.errors || 0; out.lastError2 = G.lastError || null;
return JSON.stringify(out);
})()
