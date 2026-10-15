(async () => { try { const { g, p, d, V, len, nz, gt } = PT, G = g.G, out = [];
const home = nz(G.home.pos);
let s = 5; const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296), gauss = () => rnd() + rnd() + rnd() + rnd() - 2;
const rocks = d.props.rocks;
for (let k = 0; out.length < 10 && k < 5000; k++) {
  const n = nz([gauss(), gauss(), gauss(), gauss()]), h = p.hf.heightAt(n);
  if (p.hf.waterAt(n) > h - 0.05 || Math.acos(Math.max(-1, Math.min(1, V.dot(n, home)))) * 250 < 500) continue;
  p.pos = V.sc(n, 250 + h + 0.05); p.vel = [0, 0, 0, 0]; p.settleFrame(); await gt(2.5);
  const cr = d.creatures.list.filter(c => Math.acos(Math.min(1, V.dot(c.n, n))) * 250 < 40);
  const cut = d.creatures.list.filter(c => { const q = V.sc(c.n, 250 + h); return len(V.sub(q, p.pos)) < 40 && Math.abs(V.dot(V.sub(q, p.pos), p.A)) < 1.2; }).length;
  const kinds = {}; for (const r of rocks) { if (len(V.sub(r.c, p.pos)) < 150) kinds[r.kind] = (kinds[r.kind] || 0) + 1; }
  out.push({ h: +h.toFixed(1), walkers40: cr.filter(c => c.kind === 'walker').length, rollers40: cr.filter(c => c.kind === 'roller').length, inSlice40: cut, rocks150: kinds, listN: d.creatures.list.length });
}
return JSON.stringify(out);
} catch (e) { return 'ERR ' + e.message; } })()
