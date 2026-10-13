(async () => { const { g, p, d, V, len, nz, gt } = PT, G = g.G, out = {};
const T = (await import(JSON.parse(document.querySelector('script[type=importmap]').textContent).imports['./js/tides.js'] || new URL('js/tides.js', location.href).href)).tides;
const tan = n => { const o = []; for (const e of [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]) { let v = V.sub(e, V.sc(n, V.dot(e, n))); for (const u of o) v = V.sub(v, V.sc(u, V.dot(v, u))); if (len(v) > 0.3) o.push(nz(v)); if (o.length === 3) break; } return o; };
const home = nz(G.home.pos), Tg = tan(home), off = (u, t, m) => nz(V.add(V.sc(u, Math.cos(m / 250)), V.sc(t, Math.sin(m / 250))));
// a shore near where you arrive: ground a metre over the mean sea, the sea 25 m on
let best = null;
for (let i = 0; i < 400 && !best; i++) {
  const a = i * 2.4, b = Math.acos(1 - 2 * ((i * 0.618) % 1)), dir = nz(V.add(V.add(V.sc(Tg[0], Math.sin(b) * Math.cos(a)), V.sc(Tg[1], Math.sin(b) * Math.sin(a))), V.sc(Tg[2], Math.cos(b))));
  for (let m = 20; m < 200; m += 4) { const n = off(home, dir, m), h = p.hf.heightAt(n); if (h > 0.5 && h < 1.6) { const sea = off(home, dir, m + 25); if (p.hf.heightAt(sea) < -1) { best = { n, dir, sea }; break; } } }
}
if (!best) return JSON.stringify({ err: 'no shore' });
const stand = off(best.n, best.dir, -12); p.pos = V.sc(stand, 250 + p.hf.heightAt(stand) + 0.05); p.vel = [0,0,0,0]; p.settleFrame();
const look = V.sc(best.sea, 250); for (let i = 0; i < 60; i++) { const dir = nz(V.sub(look, p.camera().eye)); const x = Math.atan2(V.dot(dir, p.R), V.dot(dir, p.F)), y = Math.atan2(V.dot(dir, p.A), V.dot(dir, p.F)); if (Math.abs(x) + Math.abs(y) < 0.002) break; p.rotate('FR', x); p.rotate('FA', y); }
p.pitch = -0.25;
// the tide's height at the shore over the next 300 s; go to its low, then its high
const hs = []; for (let s = 0; s < 300; s += 5) { G.state.time += 5; await gt(0.02); hs.push([G.state.time, T.at(best.n)]); }
const lo = hs.reduce((a, b) => b[1] < a[1] ? b : a), hi = hs.reduce((a, b) => b[1] > a[1] ? b : a);
G.state.time = lo[0]; await gt(1.0); out.low = +T.at(best.n).toFixed(2); out.waterLow = +(p.hf.waterAt(best.n) - p.hf.heightAt(best.n)).toFixed(2);
window.__hi = hi[0]; return JSON.stringify({ ...out, hi: hi[0], hiH: +hi[1].toFixed(2) });
})()
