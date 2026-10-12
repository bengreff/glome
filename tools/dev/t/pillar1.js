(async () => { const { g, p, d, O, w, wait, V, len, nz, place, gt } = PT, out = {}, L = d.launcher, P = L.pillar, PILLAR_TOP = 1.62;
const key = (code, up) => dispatchEvent(new KeyboardEvent(up ? 'keyup' : 'keydown', { code }));
const tap = async code => { key(code); await wait(60); key(code, true); await wait(150); };
const r1 = w.bodies.find(b => b.kind === 'part' && b.tier === 1); out.bound = r1.bound.toFixed(2);
// lay ring I on the ground 3 m from the pillar, and stand before it
const T = [[-P.up[1],P.up[0],P.up[3],-P.up[2]]], dir = nz(V.sub(T[0], V.sc(P.up, V.dot(T[0], P.up))));
const spot = nz(V.add(V.sc(P.n, Math.cos(3 / 250)), V.sc(dir, Math.sin(3 / 250))));
r1.kinematic = false; r1.pos = V.sc(spot, 250 + p.hf.heightAt(spot) + 0.08); r1.rot = P.rot; r1.vel = [0,0,0,0]; r1.sleeping = false; await gt(1.5);
place(V.sub(r1.pos, V.sc(dir, 1.5)), dir); await gt(0.3);
p.pitch = Math.asin(V.dot(nz(V.sub(r1.pos, p.camera().eye)), p.up())); await gt(0.3);
out.canTake = !!g.G.canTake; await tap('KeyF'); out.held = O.held === r1; await gt(0.6);
out.goal = d.guide.goal && d.guide.goal.kind; out.ballGlow = P.balls.map(b => +b.glow.toFixed(2)).join(',');
// to the pillar: stand 2.4 m from its axis facing it, raise the ring above the spindle's top, then step in until
// it hangs over the axis (as a player would: high first, then over)
const horiz = v => V.sub(v, V.sc(P.up, V.dot(v, P.up)));
const outward = nz(horiz(V.sub(p.pos, P.foot)));
place(V.add(P.foot, V.sc(outward, 2.4)), V.sc(outward, -1)); await gt(0.5);
const state = () => { const dd = V.sub(r1.pos, P.foot), h = V.dot(dd, P.up); return { h, past: V.dot(horiz(dd), p.F), off: len(horiz(dd)) }; };
for (let it = 0; it < 30; it++) { const st = state(); p.pitch = Math.max(-1, Math.min(1.2, p.pitch + 0.5 * ((PILLAR_TOP + 0.15) - st.h) / 1.5)); await gt(0.1); }
for (let it = 0; it < 60; it++) {
  const st = state();
  p.pitch = Math.max(-1, Math.min(1.2, p.pitch + 0.5 * ((PILLAR_TOP + 0.15) - st.h) / 1.5));
  p.pos = V.sub(p.pos, V.sc(p.F, Math.max(-0.05, Math.min(0.05, 0.5 * st.past)))); await gt(0.1);
}
out.stillHeld = O.held === r1;
{ const dd = V.sub(r1.pos, P.foot), h = V.dot(dd, P.up); out.over = { h: h.toFixed(2), off: len(V.sub(dd, V.sc(P.up, h))).toFixed(2), pitchDeg: (p.pitch * 57.3).toFixed(0), standOff: len(V.sub(V.sub(p.pos, P.foot), V.sc(P.up, V.dot(V.sub(p.pos, P.foot), P.up)))).toFixed(2) }; }
window.PTR = { r1 }; return JSON.stringify(out);
})()
