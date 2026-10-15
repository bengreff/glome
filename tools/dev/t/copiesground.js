(async () => { try { const { g, p, d, V, len, nz, gt } = PT, G = g.G, out = {};
// stand where the hoop axis is 35° above the horizon, the slice squared to it, looking up along it
const t = g.state.time, h = d.cosmos.hoopAxisBody(t);
let tp = nz(V.sub([0.3, -0.5, 0.7, 0.2], V.sc(h, V.dot([0.3, -0.5, 0.7, 0.2], h))));
let n = nz(V.add(V.sc(h, Math.sin(0.61)), V.sc(tp, Math.cos(0.61))));
for (let i = 0; i < 60 && p.hf.waterAt(n) > p.hf.heightAt(n) - 0.1; i++) { tp = nz(V.add(tp, V.sc(nz(V.sub([Math.sin(i), Math.cos(i * 1.3), 0.3, -0.4], V.sc(h, 0))), 0.3))); tp = nz(V.sub(tp, V.sc(h, V.dot(tp, h)))); n = nz(V.add(V.sc(h, Math.sin(0.61)), V.sc(tp, Math.cos(0.61)))); }
p.pos = V.sc(n, 250 + p.hf.heightAt(n) + 0.05); p.vel = [0, 0, 0, 0]; p.settleFrame();
const u = p.up(); let ht = nz(V.sub(h, V.sc(u, V.dot(h, u)))); let A = V.sub(p.A, V.sc(u, V.dot(p.A, u))); A = nz(V.sub(A, V.sc(ht, V.dot(A, ht))));
p.F = ht; p.A = A; p.settleFrame(); p.pitch = Math.asin(V.dot(h, u)); await gt(1.0);
out.elev = +(Math.asin(V.dot(h, u)) * 57.3).toFixed(0); out.e = G.errors || 0;
return JSON.stringify(out);
} catch (e) { return 'ERR ' + e.message; } })()
