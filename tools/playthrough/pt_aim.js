(async () => {
// The launcher's aim, as a player sets it: stand at the sliders' stand, take a knob (F) and move your hand along its
// rail (turning to look along it); the barrel turns with it, and stays where you leave it. Then seat ring I, stand
// on the pad and jump: you go the way the barrel points.
const { g, p, d, O, w, V, len, nz, gt } = PT, L = d.launcher, A = L.aim, out = {};
const so4 = await import(document.querySelector('script[type=importmap]').textContent.match(/"\.\/js\/so4\.js": "([^"]+)"/)[1]);
const R4 = so4.rot, up = nz(L.site), sdir = A.knobs[0].slider.dir, fdir = R4.apply(A.R, [1, 0, 0, 0]);
const stand = (q, look) => { const n = nz(q); p.pos = V.sc(n, 250 + p.hf.heightAt(n) + 0.05); p.vel = [0,0,0,0]; p.settleFrame();
  for (let i = 0; i < 80; i++) { const dir = nz(V.sub(look, p.camera().eye)); const a = Math.atan2(V.dot(dir, p.R), V.dot(dir, p.F)), b = Math.atan2(V.dot(dir, p.A), V.dot(dir, p.F)); if (Math.abs(a) + Math.abs(b) < 0.002) break; p.rotate('FR', a); p.rotate('FA', b); }
  p.pitch = Math.asin(V.dot(nz(V.sub(look, p.camera().eye)), p.up())); };
const aim0 = A.angles.map(x => +(x * 57.3).toFixed(1)), dir0 = A.dir.slice();
// stand in front of the stand (on its −f side, between it and the pad), facing the knob for the barrel's height
const knob = A.knobs[2]; stand(V.sub(knob.pos, V.sc(fdir, 1.0)), knob.pos); await gt(0.4);
d.actions.fDown = true; await gt(0.3); out.took = O.held === knob;
// slide it toward one end: walk along the rail (s) for a moment, as your hand carries it
const key = V.dot(p.R, sdir) < 0 ? 'KeyD' : 'KeyA';
g.keys.add(key); await gt(0.12); g.keys.delete(key); await gt(0.3);
d.actions.fDown = true; await gt(0.05); d.actions.fUp = true; await gt(0.5);     // (let go)
out.released = O.held === null;
out.aim = { before: aim0, after: A.angles.map(x => +(x * 57.3).toFixed(1)) };
await gt(2); out.stays = A.angles.map(x => +(x * 57.3).toFixed(1)).join() === out.aim.after.join();
// seat ring I, stand on the pad and jump: the launch goes along the barrel
const r1 = w.bodies.find(b => b.kind === 'part' && b.tier === 1); L.seat(r1); await gt(0.5);
p.pos = V.add(L.site, V.sc(up, 0.05)); p.vel = [0, 0, 0, 0]; p.settleFrame(); await gt(0.6);
out.tier = L.tier;
const dirNow = A.dir.slice(), n0 = g.G.flags.launches || 0;
out.onPad = L.onPad;
g.keys.add('Space'); await gt(0.05); g.keys.delete('Space'); await gt(0.1);
out.launched = (g.G.flags.launches || 0) > n0;
const v = d.flight.active ? null : p.vel;
out.launch = v ? +(Math.acos(Math.min(1, V.dot(nz(v), dirNow))) * 57.3).toFixed(1) : 'in flight';
out.speed = v ? +len(v).toFixed(1) : null;
return JSON.stringify(out);
})()
