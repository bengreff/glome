(async () => { const { g, p, d, O, w, V, len, nz, gt } = PT;
// The knot gate: stand beside the rope's plane (off it toward −s, and 0.3 m toward ana), face the rope, and twist
// until the slice holds the rope's plane (its normal across f and the offset). Report the leaf and the rope.
const k = g.G.knot, so4 = await import(document.querySelector('script[type=importmap]').textContent.match(/"\.\/js\/so4\.js": "([^"]+)"/)[1]);
const col = j => so4.rot.apply(k.R, [0, 1, 2, 3].map(i => (i === j ? 1 : 0)));
const f = col(0), s_ = col(1), a_ = col(2), up = col(3), at = c => V.add(k.foot, V.add(V.add(V.sc(f, c[0]), V.sc(s_, c[1])), V.add(V.sc(a_, c[2]), V.sc(up, c[3]))));
const st = (S, A) => { const q = at([-3.4, S, A, 0]), n = nz(q); p.pos = V.sc(n, 250 + Math.max(p.hf.heightAt(n), 0) + 2.0); p.vel = [0,0,0,0]; p.settleFrame(); };
const out = { lean0: (k.angle() * 57.3).toFixed(1), asleep0: !!k.asleep };
st(3.6, 0.3); await gt(1.0);
const look = at([-2.0, 0, 0, 1.25]);
const face = async () => { for (let i = 0; i < 80; i++) { const dir = nz(V.sub(look, p.camera().eye)); const a = Math.atan2(V.dot(dir, p.R), V.dot(dir, p.F)), b = Math.atan2(V.dot(dir, p.A), V.dot(dir, p.F)); if (Math.abs(a) + Math.abs(b) < 0.002) break; p.rotate("FR", a); p.rotate("FA", b); } };
await face();
const off = V.sub(p.camera().eye, at([0, 0, 0, 0])), os = V.dot(off, s_), oa = V.dot(off, a_), At = nz(V.add(V.sc(s_, -oa), V.sc(a_, os)));
for (let i = 0; i < 80; i++) { const a = Math.atan2(V.dot(At, p.R), V.dot(At, p.A)); if (Math.abs(a) < 0.002) break; p.rotate("RA", -a); await face(); }
p.pitch = -0.02; await gt(1.0);
out.Aoff = { f: V.dot(p.A, f).toFixed(3), plane: V.dot(V.sub(at([0,0,0,0]), p.camera().eye), p.A).toFixed(3) };
out.lean = (k.angle() * 57.3).toFixed(1); out.asleep = !!k.asleep;
out.loop = k.rope.x[k.rope.loop[0]].map(v => +v.toFixed(2));
return JSON.stringify(out); })()
