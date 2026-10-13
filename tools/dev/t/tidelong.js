(async () => { const g = __glome, d = g.dbg, G = g.G, p = g.player, hf = p.hf;
const map = JSON.parse(document.querySelector('script[type=importmap]').textContent).imports;
const T = await import(map['./js/tides.js']);
const nz = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
const home = nz(G.home.pos), t0 = g.state.time;
let hi = -1e9, frac = 0, N = 0, over = 0;
for (let t = t0; t < t0 + 40000; t += 20) { T.updateTides(t); const h = T.tides.at(home); hi = Math.max(hi, h); N++; if (h > hf.heightAt(home) - 1.0) over++; }
T.updateTides(g.state.time);
return JSON.stringify({ startGround: +hf.heightAt(home).toFixed(2), maxTide40000s: +hi.toFixed(2), timeWithin1mOfStart: (100 * over / N).toFixed(2) + '%' });
})()
