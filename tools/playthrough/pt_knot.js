(async () => {
// The knot gate, as a player does it: stand beside the rope, square your slice with it (turn and twist only), take
// the loop where it hangs on the peg. Lifting it (looking up) and sliding it along the peg to the knob both fail:
// the rope slips from your hand and the leaf stays. Taken again and lifted through ana (E, a moment), it comes off
// the peg: let go, the leaf falls in, and ring III on its plinth inside is free; walk in over the leaf and take it.
const { g, p, d, O, w, V, len, nz, gt } = PT;
const k = g.G.knot, R = k.rope, out = {};
const so4 = await import(document.querySelector('script[type=importmap]').textContent.match(/"\.\/js\/so4\.js": "([^"]+)"/)[1]);
const col = j => so4.rot.apply(k.R, [0, 1, 2, 3].map(i => (i === j ? 1 : 0)));
const f = col(0), s_ = col(1), a_ = col(2), up = col(3), at = c => V.add(k.foot, V.add(V.add(V.sc(f, c[0]), V.sc(s_, c[1])), V.add(V.sc(a_, c[2]), V.sc(up, c[3]))));
const standAt = q => { const n = nz(q); p.pos = V.sc(n, len(k.foot) + 0.05); p.vel = [0, 0, 0, 0]; p.settleFrame(); };
const loopPt = () => R.x[R.loop[0] + 6];                         // the loop's far point, under the peg
const face = q => { for (let i = 0; i < 80; i++) { const dir = nz(V.sub(q, p.camera().eye)); const a = Math.atan2(V.dot(dir, p.R), V.dot(dir, p.F)), b = Math.atan2(V.dot(dir, p.A), V.dot(dir, p.F)); if (Math.abs(a) + Math.abs(b) < 0.002) break; p.rotate('FR', a); p.rotate('FA', b); } };
const look = q => { const dd = V.sub(q, p.camera().eye); p.pitch = Math.asin(V.dot(nz(dd), p.up())); };
const tap = async () => { d.actions.fDown = true; await gt(0.05); d.actions.fUp = true; await gt(0.3); };
const grab = async () => { face(loopPt()); look(loopPt()); await gt(0.1); face(loopPt()); look(loopPt()); await tap(); return g.G.ropeHeld != null; };
// 0. beside the rope, 1.4 m off its plane toward +s and in front of the peg; face the loop and twist until your
// slice holds the rope's plane (your ana across both f and your offset from it)
standAt(at([-3.3, 1.2, 0, 0])); await gt(0.6);
face(loopPt());
for (let i = 0; i < 60; i++) { const a = Math.atan2(V.dot(a_, p.R), V.dot(a_, p.A)); if (Math.abs(a) < 0.002) break; p.rotate('RA', -a); face(loopPt()); }
await gt(0.5);
out.square = Math.abs(V.dot(p.A, a_)) > 0.999;
out.lean0 = +(k.angle() * 57.3).toFixed(1);
// 1. take the loop and lift it (look up, slowly): it can't come up past the peg
out.took = await grab();
for (let i = 0; i < 20; i++) { p.pitch += 0.03; await gt(0.05); }
await gt(0.5); out.liftSlipped = g.G.ropeHeld == null;
if (g.G.ropeHeld != null) await tap();
await gt(1.5); out.afterLift = { solved: !!g.G.flags.solved_knot, lean: +(k.angle() * 57.3).toFixed(1) };
// 2. take it again and walk toward the knob (+s): it catches there
face(loopPt()); out.took2 = await grab();
const right = V.dot(p.R, s_) > 0 ? 'KeyD' : 'KeyA';
g.keys.add(right); await gt(1.6); g.keys.delete(right); await gt(0.5);
out.slideSlipped = g.G.ropeHeld == null; if (g.G.ropeHeld != null) await tap();
await gt(2.0); out.afterSlide = { solved: !!g.G.flags.solved_knot, lean: +(k.angle() * 57.3).toFixed(1), loopS: +V.dot(V.sub(R.x[R.loop[0]], k.foot), s_).toFixed(2) };
// 3. take it again and step through ana (E) for a moment, then let go
standAt(at([-3.3, 1.2, 0, 0])); await gt(0.5); face(loopPt()); out.took3 = await grab();
g.keys.add('KeyE'); await gt(0.35); g.keys.delete('KeyE'); await gt(0.4);
out.anaStep = +V.dot(V.sub(p.pos, at([-3.3, 1.2, 0, 0])), a_).toFixed(2);
if (g.G.ropeHeld != null) await tap();
await gt(3.0);
out.solved = { solved: !!g.G.flags.solved_knot, lean: +(k.angle() * 57.3).toFixed(1), partFree: !d.artifacts.find(a => a.id === 'knot').part.kinematic };
// 4. walk in over the leaf and take ring III
const part = d.artifacts.find(a => a.id === 'knot').part;
standAt(at([-1.0, 0, 0, 0])); await gt(0.4); face(V.add(part.pos, V.sc(up, 1.2))); p.pitch = 0;
let near = 9;
g.keys.add('KeyW');
for (let i = 0; i < 60; i++) { await gt(0.1); near = len(V.sub(part.pos, p.pos)); if (near < 1.3) break; face(V.add(part.pos, V.sc(up, 1.2))); }
g.keys.delete('KeyW'); await gt(0.3);
out.reached = +near.toFixed(2);
look(part.pos); await gt(0.2); d.actions.fDown = true; await gt(0.4);
out.tookPart = O.held === part;
return JSON.stringify(out);
})()
