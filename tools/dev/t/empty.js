(() => { const g = __glome, d = g.dbg, p = g.player, hf = p.hf;
const V = { add: (a, b) => a.map((x, i) => x + b[i]), sub: (a, b) => a.map((x, i) => x - b[i]), sc: (a, k) => a.map(x => x * k), dot: (a, b) => a.reduce((s, x, i) => s + x * b[i], 0) };
const len = a => Math.hypot(...a), nz = a => V.sc(a, 1 / len(a));
const tg = u => [[-u[1],u[0],u[3],-u[2]],[-u[2],-u[3],u[0],u[1]],[-u[3],u[2],-u[1],u[0]]];
let s = 12345; const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
const gauss = () => rnd() + rnd() + rnd() + rnd() - 2;
const trees = d.trees.trees || d.trees, rocks = d.props.rocks, cr = d.creatures.list;
const res = [];
for (let k = 0; k < 4000 && res.length < 300; k++) {
  const n = nz([gauss(), gauss(), gauss(), gauss()]), h = hf.heightAt(n);
  if (h < 1.5 || h > 24 || hf.waterAt(n) > 0.01) continue;
  const T = tg(n), w = nz([gauss(), gauss(), gauss()]), A = nz(V.add(V.add(V.sc(T[0], w[0]), V.sc(T[1], w[1])), V.sc(T[2], w[2])));
  const eye = V.sc(n, 250 + h + 1.6);
  let tr = 0, sh = 0, rk = 0, c60 = 0, c30 = 0, near = 0;
  for (const t of trees) { const dd = V.sub(t.c, eye), di = len(dd); if (di > 100) continue; const a = Math.abs(V.dot(dd, A)); if (a < t.R) { if (t.kind === 'shrub' || t.R < 2) sh++; else tr++; } }
  for (const r of rocks) { const dd = V.sub(r.c, eye), di = len(dd); if (di > 100) continue; if (Math.abs(V.dot(dd, A)) < r.R * 0.7) rk++; }
  for (const c of cr) { const q = V.sc(c.n, 250 + hf.heightAt(c.n) + 0.8), dd = V.sub(q, eye), di = len(dd); if (di < 100) near++; if (di > 60) continue; if (Math.abs(V.dot(dd, A)) < 0.6) { c60++; if (di < 30) c30++; } }
  res.push({ tr, sh, rk, c60, c30, near });
}
const med = k => { const a = res.map(r => r[k]).sort((x, y) => x - y); return [a[Math.floor(a.length * 0.25)], a[Math.floor(a.length * 0.5)], a[Math.floor(a.length * 0.75)]]; };
const frac0 = k => (res.filter(r => r[k] === 0).length / res.length).toFixed(2);
const kinds = {}; for (const t of trees) kinds[t.kind] = (kinds[t.kind] || 0) + 1;
return JSON.stringify({ n: res.length, treesQ: med('tr'), shrubsQ: med('sh'), rocksQ: med('rk'), crInSlice60Q: med('c60'), crWithin100Q: med('near'), noTree: frac0('tr'), noCreature60: frac0('c60'), totals: { trees: trees.length, rocks: rocks.length, creatures: cr.length }, kinds, sampleTree: Object.keys(trees[0]).join(',') });
})()
