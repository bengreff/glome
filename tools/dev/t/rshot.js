(async () => { const { g, p, d, O, w, V, len, nz, gt } = PT;
const room = d.artifacts.find(a => a.id === 'room'), so4 = await import(document.querySelector('script[type=importmap]').textContent.match(/"\.\/js\/so4\.js": "([^"]+)"/)[1]);
const R4 = so4.rot, col = j => R4.apply(room.R, [0, 1, 2, 3].map(i => (i === j ? 1 : 0)));
const f = col(0), s_ = col(1), a_ = col(2), up = col(3), at = c => V.add(room.foot, V.add(V.add(V.sc(f, c[0]), V.sc(s_, c[1])), V.add(V.sc(a_, c[2]), V.sc(up, c[3]))));
const which = window.__rshot || 0, A = [0, 0, 1.8][which], F0 = [-4.2, -0.6, -4.2][which], S0 = [-2.2, -0.3, -2.2][which];
const q = at([F0, S0, A, 0]), n = nz(q); p.pos = V.sc(n, len(room.foot) + 0.05); p.vel = [0,0,0,0]; p.settleFrame();
const look = at([0.4, 0, A, 0.9]);
for (let i = 0; i < 80; i++) { const dir = nz(V.sub(look, p.camera().eye)); const a = Math.atan2(V.dot(dir, p.R), V.dot(dir, p.F)), b = Math.atan2(V.dot(dir, p.A), V.dot(dir, p.F)); if (Math.abs(a) + Math.abs(b) < 0.002) break; p.rotate('FR', a); p.rotate('FA', b); }
for (let i = 0; i < 60; i++) { const a = Math.atan2(V.dot(a_, p.R), V.dot(a_, p.A)); if (Math.abs(a) < 0.002) break; p.rotate('RA', -a); }
p.pitch = Math.asin(V.dot(nz(V.sub(look, p.camera().eye)), p.up()));
await gt(1.5); return JSON.stringify({ which }); })()
