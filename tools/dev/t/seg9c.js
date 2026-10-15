(async () => { try { const { g, p, d, V, len, nz, gt, wait } = PT, G = g.G, L = d.launcher, out = {};
const key = (code, up) => dispatchEvent(new KeyboardEvent(up ? 'keyup' : 'keydown', { code }));
const tap = async c => { key(c); await wait(60); key(c, true); await wait(60); };
const map = JSON.parse(document.querySelector('script[type=importmap]').textContent).imports, SM = await import(map['./js/spacemap.js']);
// on the pad: a lever moved, the path follows within a frame
const up = nz(L.site); p.pos = V.add(L.site, V.sc(up, 0.05)); p.vel = [0, 0, 0, 0]; p.settleFrame(); await gt(0.6);
const end = () => { const P = SM.smap.path; return P.length ? P[P.length - 1].x.map(v => +v.toFixed(1)).join() : ''; };
const e0 = end(); L.setAim([0.8, 0.2, 0.9]); await wait(40); out.pathFollowedInOneFrame = end() !== e0;
// timewarp: game seconds per real second at 1× and 10×
const rate = async () => { const t0 = g.state.time, r0 = performance.now(); await wait(2000); return +((g.state.time - t0) / ((performance.now() - r0) / 1000)).toFixed(2); };
out.rate1 = await rate();
await tap('Period'); await tap('Period'); await tap('Period'); out.warp = G.warp;
out.rate10 = await rate(); out.fps10 = +(1000 / g.prof.interval).toFixed(0);
// a long flight, straight up at 72 m/s; the way home once a minute has passed
L.setAim([0, 0, Math.PI / 2]); L.setSpeed(72); await gt(0.3);
g.keys.add('Space'); await gt(0.05); g.keys.delete('Space');
for (let i = 0; i < 400 && !(G.canReturn); i++) await gt(0.5);
out.flying = d.flight.active; out.flightTime = +d.flight.time.toFixed(0); out.canReturn = !!G.canReturn; out.pathEnds = SM.smap.hit && SM.smap.hit.what;
key('KeyB'); await wait(1400); key('KeyB', true); await wait(2500);
out.back = { flying: d.flight.active, padDist: +len(V.sub(p.pos, L.site)).toFixed(1), warp: G.warp };
out.errors = G.errors || 0; out.lastError = G.lastError || null;
return JSON.stringify(out);
} catch (e) { return 'ERR ' + e.message; } })()
