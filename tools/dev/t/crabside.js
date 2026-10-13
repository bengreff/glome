(async () => { const { g, p, d, V, len, nz, gt } = PT, G = g.G, c = window.CRAB;
const u = c.n, F = nz(V.sub(c.heading, V.sc(u, V.dot(c.heading, u))));
p.pos = V.sc(u, 250 + p.hf.heightAt(u) + 0.05); p.F = F; p.settleFrame();
const dir = nz(V.add(V.sc(p.F, -0.7), V.sc(p.R, 0.7)));       // behind and to the right, at 45°
const q = nz(V.add(V.sc(u, 250), V.sc(dir, 3.4)));
p.pos = V.sc(q, 250 + p.hf.heightAt(q) + 0.05); p.vel = [0, 0, 0, 0];
const uu = p.up(); let f = V.sub(V.sc(u, 250 + p.hf.heightAt(u)), p.pos); f = V.sub(f, V.sc(uu, V.dot(f, uu))); p.F = nz(f); p.settleFrame(); p.pitch = -0.28;
await gt(3); return 1; })()
