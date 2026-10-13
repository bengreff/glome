(async () => {
// The closed room, as a player does it from where they arrive: follow the way (walk toward the column, step through
// ana as its cue says) to the room. Square your slice with it (turn, twist). It is closed on every side; through the
// grille, ring I on its plinth. Step through ana (E) past its walls' reach (the room is gone from your slice), walk on
// over its floor, step back (Q): inside. Take ring I, and step out through ana with it.
const { g, p, d, V, len, nz, gt, look } = PT, G = g.G, out = {}, k = g.keys;
const room = d.artifacts.find(a => a.id === 'room');
const so4 = await import(document.querySelector('script[type=importmap]').textContent.match(/"\.\/js\/so4\.js": "([^"]+)"/)[1]);
const R4 = so4.rot, col = j => R4.apply(room.R, [0, 1, 2, 3].map(i => (i === j ? 1 : 0))), f = col(0), s_ = col(1), a_ = col(2);
const local = q => R4.applyInv(room.R, V.sub(q, room.foot));
const rel = () => { const c = p.camera(), q = d.guide.goal.pos, dd = V.sub(q, c.eye); return { f: V.dot(dd, p.F), r: V.dot(dd, p.R), a: V.dot(dd, p.A), kind: d.guide.goal.kind }; };
const faceGoal = () => { const c = p.camera(), dd = V.sub(d.guide.goal.pos, c.eye), u = p.up(); let h = V.sub(dd, V.sc(u, V.dot(dd, u))); h = V.sub(h, V.sc(p.A, V.dot(h, p.A))); if (len(h) > 0.3) { p.F = nz(h); p.settleFrame(); } };
out.first = rel().kind;
// 1. the way, until the room's centre is within 4 m in your slice
for (let i = 0; i < 160; i++) {
  const r = rel(); if (Math.hypot(r.f, r.r) < 4 && Math.abs(r.a) < 1.5) break;
  faceGoal(); k.clear();
  if (Math.abs(r.a) > 1.0) k.add(r.a > 0 ? 'KeyE' : 'KeyQ');
  if (Math.hypot(r.f, r.r) > 3.5) k.add('KeyW');
  await gt(0.5);
}
k.clear(); await gt(0.3);
out.arrived = { goal: rel().kind, at: local(p.pos).map(v => +v.toFixed(1)) };
// 2. square up: face the room's f, twist until your ana is its
for (let i = 0; i < 80; i++) { const aa = Math.atan2(V.dot(f, p.R), V.dot(f, p.F)), bb = Math.atan2(V.dot(f, p.A), V.dot(f, p.F)); if (Math.abs(aa) + Math.abs(bb) < 0.002) break; p.rotate('FR', aa); p.rotate('FA', bb); }
for (let i = 0; i < 60; i++) { const aa = Math.atan2(V.dot(a_, p.R), V.dot(a_, p.A)); if (Math.abs(aa) < 0.002) break; p.rotate('RA', -aa); }
await gt(0.3);
out.square = +V.dot(p.A, a_).toFixed(3);
// walking in the room's (f, s) with keys (you face +f; your right is ±s), and stepping along its a with E/Q
const walkTo = async (tf, ts, tol = 0.15) => { for (let i = 0; i < 80; i++) { const l = local(p.pos), df = tf - l[0], ds = ts - l[1]; k.clear(); if (Math.abs(df) < tol && Math.abs(ds) < tol) break; if (Math.abs(df) >= tol) k.add(df > 0 ? 'KeyW' : 'KeyS'); if (Math.abs(ds) >= tol) k.add(ds * V.dot(p.R, s_) > 0 ? 'KeyD' : 'KeyA'); await gt(0.1); } k.clear(); await gt(0.3); };
const stepAna = async (want, sign) => { const key = sign * V.dot(p.A, a_) > 0 ? 'KeyE' : 'KeyQ'; for (let i = 0; i < 80; i++) { const la = local(p.pos)[2]; if (sign > 0 ? la > want : la < want) break; k.clear(); k.add(key); await gt(0.1); } k.clear(); await gt(0.4); };
// round to the front (past the walls' reach toward ana, where nothing is in the way), then back into the room's own
// slice before the grille: walls all round it (walking at it, you stop at its front wall)
const side0 = local(p.pos)[2] >= 0 ? 1 : -1;
await stepAna(1.7 * side0, side0); await walkTo(-2.2, 0); await stepAna(0.05 * side0, -side0);
out.front = local(p.pos).map(v => +v.toFixed(2));
await walkTo(0, 0); const l1 = local(p.pos);
out.blocked = { at: l1.map(v => +v.toFixed(2)), stoppedOutside: l1[0] < -1.3 };
await walkTo(-2.2, 0);
// 3. through ana past the walls' reach, over the floor, and back: inside
await stepAna(1.7, 1); out.beside = local(p.pos).map(v => +v.toFixed(2));
await walkTo(-0.6, 0); out.over = local(p.pos).map(v => +v.toFixed(2));
await stepAna(0.15, -1);
out.inside = { at: local(p.pos).map(v => +v.toFixed(2)), solved: !!G.flags.part1 };
// 4. take ring I off the plinth in front of you
const part = room.part; look(part.pos); await gt(0.2); d.actions.fDown = true; await gt(0.4); p.pitch = 0; await gt(0.5);   // (and look up: held, it comes up before you)
out.took = d.objects.held === part;
// 5. out through ana with it, and away
await stepAna(2.2, 1); await walkTo(-2.6, 0);
out.out = { at: local(p.pos).map(v => +v.toFixed(2)), holding: d.objects.held === part, goal: d.guide.goal && d.guide.goal.kind };
return JSON.stringify(out);
})()
