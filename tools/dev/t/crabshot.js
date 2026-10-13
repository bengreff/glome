(async () => { const { g, p, d, V, len, nz, gt } = PT, G = g.G, out = {};
const home = nz(G.home.pos);
const L = d.creatures.list.filter(c => c.kind === 'walker').map(c => ({ c, d: Math.acos(Math.min(1, V.dot(c.n, home))) * 250 })).sort((a, b) => a.d - b.d);
const c = L[0].c; for (const x of L.slice(0, 40)) x.c.curious = true;
window.CRAB = c;
const place = (back) => {
  // square up to it first (your forward along its heading), then stand back along that: it lies in your slice
  const u = c.n, F = nz(V.sub(c.heading, V.sc(u, V.dot(c.heading, u))));
  p.pos = V.sc(u, 250 + p.hf.heightAt(u) + 0.05); p.F = F; p.settleFrame();
  const q = nz(V.add(V.sc(u, 250), V.sc(p.F, back)));
  p.pos = V.sc(q, 250 + p.hf.heightAt(q) + 0.05); p.vel = [0, 0, 0, 0]; p.settleFrame(); p.pitch = -0.3;
  for (const x of d.creatures.list) if (x !== c && x.kind === 'walker') {} 
};
c.v = [0, 0, 0, 0]; place(-3.2); await gt(0.3);
out.dist = L[0].d.toFixed(0);
return JSON.stringify(out);
})()
