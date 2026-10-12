(async () => { const g = __glome, d = g.dbg, p = g.player, hf = p.hf, wait = ms => new Promise(r => setTimeout(r, ms));
const V = { add: (a, b) => a.map((x, i) => x + b[i]), sub: (a, b) => a.map((x, i) => x - b[i]), sc: (a, k) => a.map(x => x * k), dot: (a, b) => a.reduce((s, x, i) => s + x * b[i], 0) };
const len = a => Math.hypot(...a), nz = a => V.sc(a, 1 / len(a));
let s = 777; const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296); const gauss = () => rnd() + rnd() + rnd() + rnd() - 2;
const gt = async sec => { const t0 = g.state.time; while (g.state.time - t0 < sec) await wait(50); };
const count = () => { const c = p.camera(); let view = 0, sl = 0; for (const k of d.creatures.list) { const q = V.sc(k.n, 250 + hf.heightAt(k.n) + 0.8), dd = V.sub(q, c.eye), di = len(dd); if (di < 60 && Math.abs(V.dot(dd, c.A)) < 0.5) { sl++; const z = V.dot(dd, c.F), x = V.dot(dd, c.R); if (z > 0 && Math.abs(x / z) < 0.9) view++; } } return `${view}/${sl}`; };
const out = [];
for (let k = 0; k < 600 && out.length < 12; k++) {
  const n = nz([gauss(), gauss(), gauss(), gauss()]), h = hf.heightAt(n);
  if (h < 3 || h > 20 || hf.waterAt(n) > 0.01) continue;
  p.pos = V.sc(n, 250 + h + 0.05); p.vel = [0,0,0,0]; p.settleFrame(); p.pitch = 0;
  await gt(1.5); out.push(count());
}
return JSON.stringify({ inViewOverInSlice60: out.join(' '), active: d.creatures.list.length, cells: d.creatures.cells.size, cpu: g.prof ? Object.fromEntries(Object.entries(g.prof.cpu || {}).map(([k, v]) => [k, +v.toFixed(2)])) : null });
})()
