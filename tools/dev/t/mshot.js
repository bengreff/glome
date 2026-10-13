(async () => { const { g, p, d, O, w, V, len, nz, gt } = PT;
const m = d.artifacts.find(a => a.id === 'mirror');
const so4 = await import(document.querySelector('script[type=importmap]').textContent.match(/"\.\/js\/so4\.js": "([^"]+)"/)[1]);
const col = j => so4.rot.apply(m.R, [0, 1, 2, 3].map(i => (i === j ? 1 : 0)));
const f = col(0), s_ = col(1), up = nz(m.foot);
// stand 7 m back along −f and 3 m toward −s, face the point between the mould and the house, square the slice
const look = V.add(m.foot, V.sc(s_, 2.0)), q = V.sub(V.sub(look, V.sc(f, 7)), V.sc(s_, 1.5)), n = nz(q);
p.pos = V.sc(n, 250 + p.hf.heightAt(n) + 0.05); p.vel = [0,0,0,0]; p.settleFrame(); await gt(0.3);
const dir = nz(V.sub(look, p.pos));
for (let i = 0; i < 60; i++) { const a = Math.atan2(V.dot(dir, p.R), V.dot(dir, p.F)), b = Math.atan2(V.dot(dir, p.A), V.dot(dir, p.F)); if (Math.abs(a) + Math.abs(b) < 0.002) break; p.rotate('FR', a); p.rotate('FA', b); await gt(0.02); }
const t = col(2); for (let i = 0; i < 60; i++) { const a = Math.atan2(V.dot(t, p.R), V.dot(t, p.A)); if (Math.abs(a) < 0.002) break; p.rotate('RA', -a); await gt(0.02); }
p.pitch = -0.12; await gt(1.5); const key = w.bodies.find(b => b.tag === 'key2'); const kn = nz(key.pos); return JSON.stringify({ waterHere: p.hf.waterAt(nz(p.pos)).toFixed(2), groundHere: p.hf.heightAt(nz(p.pos)).toFixed(2), distSite: (Math.acos(V.dot(nz(p.pos), m.n)) * 250).toFixed(1), siteH: p.hf.heightAt(m.n).toFixed(2), siteWater: p.hf.waterAt(m.n).toFixed(2), keyAboveGround: (len(key.pos) - 250 - p.hf.heightAt(kn)).toFixed(2), keyAsleep: key.sleeping }); })()
