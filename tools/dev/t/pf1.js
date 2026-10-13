(async () => {
// The fold, as a player does it: for each plate, stand beyond its far end facing the middle cell (for the arms
// toward ana and kata that is a turn through ana: they are out of the slice you arrive in), take it by its far edge
// (F) and lift it, walking in and looking up as it rises, over upright onto its stop; let go. The last plate first,
// turned up on its arm while the arm lies flat; the arm toward +f last, so the last plate comes over as the roof onto
// the one opposite. Then the chest's lid is gone: take ring IV.
const { g, p, d, O, w, V, len, nz, gt } = PT;
const fd = g.G.fold, a = d.artifacts.find(x => x.id === 'fold'), out = { lifts: [] };
const so4 = await import(document.querySelector('script[type=importmap]').textContent.match(/"\.\/js\/so4\.js": "([^"]+)"/)[1]);
const R4 = so4.rot, E = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
const FL = { L: 0.8, t: 0.04, g: 0.09, stop: Math.PI / 2 };
const upW = nz(fd.foot), EYE = p.camera().eye.map((v, i) => v - p.pos[i]), eyeH = len(EYE);
const tap = async () => { d.actions.fDown = true; await gt(0.05); d.actions.fUp = true; await gt(0.3); };
// a plate's hinge: its point, its outward and upward directions (the roof's ride on its arm)
const hingeOf = i => {
  if (i < 6) { const j = fd.joints[i]; return { at: j.ca, out: R4.apply(j.Fa, E[0]), up: R4.apply(j.Fa, E[3]), stop: FL.stop }; }
  const arm = fd.plates[1], j = fd.joints[6]; return { at: V.add(arm.pos, R4.apply(arm.rot, j.ca)), out: R4.apply(arm.rot, E[0]), up: R4.apply(arm.rot, E[3]), stop: FL.stop };
};
// stand on the platform at a point, facing horizontally along dir (turning only: about up, and through ana)
const stand = (q, dir) => {
  const n = nz(q); p.pos = V.sc(n, len(fd.foot) + 0.05); p.vel = [0, 0, 0, 0]; p.settleFrame();
  for (let k = 0; k < 60; k++) { const aa = Math.atan2(V.dot(dir, p.R), V.dot(dir, p.F)), bb = Math.atan2(V.dot(dir, p.A), V.dot(dir, p.F)); if (Math.abs(aa) + Math.abs(bb) < 0.002) break; p.rotate('FR', aa); p.rotate('FA', bb); }
};
const lookAt = q => { const dd = V.sub(q, p.camera().eye); p.pitch = Math.asin(V.dot(nz(dd), p.up())); };
const lift = async i => {
  const r = { i }, b = fd.plates[i], Le = FL.g / 2 + FL.L - 0.06;
  let H = hingeOf(i);
  const horiz = v => V.sub(v, V.sc(upW, V.dot(v, upW))), outH = nz(horiz(H.out));
  // stand 1.1 m beyond the far edge, facing in; take it by the edge (its top face, 6 cm in from the end)
  const e0 = V.add(V.add(H.at, V.sc(H.out, Le)), V.sc(H.up, FL.t));
  stand(V.add(V.sub(e0, V.sc(upW, V.dot(V.sub(e0, fd.foot), upW))), V.sc(outH, 1.1)), V.sc(outH, -1));
  await gt(0.3); lookAt(V.sub(e0, V.sc(H.up, 0.01))); await gt(0.15);
  await tap(); r.took = O.held === b;
  if (!r.took) return r;
  const local = R4.applyInv(b.rot, V.sub(O.lookPoint || e0, b.pos)), grab = () => V.add(b.pos, R4.apply(b.rot, local));
  const reach = len(V.sub(p.camera().eye, grab()));
  // lift: the hand a little ahead of where the held point is on its arc round the hinge, standing where your reach
  // puts it (walking in as it rises; never onto the middle cell)
  for (let k = 0; k < 200 && O.held; k++) {
    const th = fd.angles()[i]; if (th > H.stop - 0.012) break;
    H = hingeOf(i);
    const q = V.sub(grab(), H.at), qo = V.dot(q, H.out), qu = V.dot(q, H.up), dth = 0.3, c = Math.cos(dth), sn = Math.sin(dth);
    const T = V.add(V.add(H.at, V.sc(H.out, qo * c - qu * sn)), V.add(V.sc(H.up, qo * sn + qu * c), V.sub(q, V.add(V.sc(H.out, qo), V.sc(H.up, qu)))));
    const hz = V.dot(V.sub(T, fd.foot), upW) - eyeH, hd = Math.sqrt(Math.max(0.09, reach * reach - hz * hz));
    const along = Math.max(V.dot(V.sub(T, H.at), outH) + hd, 0.45);
    const at = V.add(H.at, V.sc(outH, along)), on = V.sub(at, V.sc(upW, V.dot(V.sub(at, fd.foot), upW)));
    p.pos = V.sc(nz(on), len(fd.foot) + 0.05); p.vel = [0, 0, 0, 0];
    lookAt(T); await gt(0.05);
  }
  r.dropped = !O.held;
  if (O.held) await tap();
  await gt(1.2); r.angle = +(fd.angles()[i] * 57.3).toFixed(1);
  return r;
};
out.start = fd.angles().map(x => +(x * 57.3).toFixed(1));
for (const i of [6, 0]) out.lifts.push(await lift(i)); return JSON.stringify(out);
await gt(1.5);
out.end = fd.angles().map(x => +(x * 57.3).toFixed(1));
out.solved = !!g.G.flags.solved_fold; out.lid = !!w.bodies.find(b => b.tag === 'vault4');
// take ring IV out of the chest
const part = a.part, horiz = v => V.sub(v, V.sc(upW, V.dot(v, upW)));
stand(V.add(part.pos, V.sc(nz(horiz(V.sub(fd.foot, part.pos))), 1.3)), nz(horiz(V.sub(part.pos, fd.foot))));
await gt(0.3); lookAt(part.pos); await gt(0.2); d.actions.fDown = true; await gt(0.4);
out.tookRing = O.held === part;
return JSON.stringify(out);
})()
