(async () => { const g = __glome, d = g.dbg, G = g.G, p = g.player, hf = p.hf, L = d.launcher;
const map = JSON.parse(document.querySelector('script[type=importmap]').textContent).imports;
const T = await import(map['./js/tides.js']), C = await import(map['./js/cosmos.js']);
const nz = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
const places = { start: nz(G.home.pos), raft: G.raftHome, caveMouth: G.cave && nz(G.cave.mouth), pad: L.n };
d.finds.ruins.slice(0, 3).forEach((r, i) => { places['ruin' + i] = r.n; });
const t0 = g.state.time, out = { day: g.LAWS.DAY1, tidesOn: G.tides };
for (const [k, n] of Object.entries(places)) {
  if (!n) continue;
  let hi = -1e9, lo = 1e9, tHi = 0;
  for (let t = t0; t < t0 + 1800; t += 5) { T.updateTides(t); const h = T.tides.at(n); if (h > hi) { hi = h; tHi = t - t0; } lo = Math.min(lo, h); }
  out[k] = { ground: +hf.heightAt(n).toFixed(2), tideLo: +lo.toFixed(2), tideHi: +hi.toFixed(2) };
}
// the period: time between successive highs at the start
const n = places.start; let prev = null, rising = false, highs = [];
for (let t = t0; t < t0 + 3600; t += 2) { T.updateTides(t); const h = T.tides.at(n); if (prev != null) { if (h < prev && rising) highs.push(t - 2 - t0); rising = h > prev; } prev = h; }
out.highsAtStart = highs.map(x => Math.round(x));
T.updateTides(g.state.time);
// gravity on the pad, over a day
let gs = []; for (let t = t0; t < t0 + 900; t += 30) { const a = C.accelBodyA(L.site, [0, 0, 0, 0], t); gs.push(Math.hypot(...a)); }
out.gPad = { mean: +(gs.reduce((s, x) => s + x, 0) / gs.length).toFixed(2), min: +Math.min(...gs).toFixed(2), max: +Math.max(...gs).toFixed(2) };
return JSON.stringify(out);
})()
