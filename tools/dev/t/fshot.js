(async () => { const { g, p, d, O, w, V, len, nz, gt } = PT;
const fd = g.G.fold, so4 = await import(document.querySelector('script[type=importmap]').textContent.match(/"\.\/js\/so4\.js": "([^"]+)"/)[1]);
const R4 = so4.rot, col = j => R4.apply(fd.R, [0, 1, 2, 3].map(i => (i === j ? 1 : 0)));
const f = col(0), s_ = col(1), a_ = col(2), up = col(3), at = c => V.add(fd.foot, V.add(V.add(V.sc(f, c[0]), V.sc(s_, c[1])), V.add(V.sc(a_, c[2]), V.sc(up, c[3]))));
const stand = (q, look) => { const n = nz(q); p.pos = V.sc(n, len(fd.foot) + 0.05); p.vel = [0,0,0,0]; p.settleFrame();
  for (let i = 0; i < 80; i++) { const dir = nz(V.sub(look, p.camera().eye)); const a = Math.atan2(V.dot(dir, p.R), V.dot(dir, p.F)), b = Math.atan2(V.dot(dir, p.A), V.dot(dir, p.F)); if (Math.abs(a) + Math.abs(b) < 0.002) break; p.rotate('FR', a); p.rotate('FA', b); }
  for (let i = 0; i < 60; i++) { const a = Math.atan2(V.dot(a_, p.R), V.dot(a_, p.A)); if (Math.abs(a) < 0.002) break; p.rotate('RA', -a); }
  const dd = V.sub(look, p.camera().eye); p.pitch = Math.asin(V.dot(nz(dd), p.up())); };
const which = window.__fshot || 0;
if (which === 1) for (let i = 0; i < 7; i++) { const j = fd.joints[i], b = fd.plates[i];
  if (i < 6) { b.rot = R4.compose(j.Fa, R4.planeRotation(0, 3, Math.PI / 2)); b.pos = V.add(j.ca, R4.apply(b.rot, b.com)); } }
if (which === 1) { const arm = fd.plates[1], j = fd.joints[6], b = fd.plates[6]; b.rot = R4.compose(arm.rot, R4.planeRotation(0, 3, Math.PI / 2)); b.pos = V.add(V.add(arm.pos, R4.apply(arm.rot, j.ca)), R4.apply(b.rot, b.com)); }
stand(at([-3.0, -2.0, 0, 0]), at([0.3, 0, 0, 0.3]));
await gt(1.5);
return JSON.stringify({ which, angles: fd.angles().map(x => +(x * 57.3).toFixed(0)) }); })()
