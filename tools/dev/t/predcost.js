(async () => { try { const { g, p, d, V, nz, gt } = PT, L = d.launcher, C = d.cosmos;
const map = JSON.parse(document.querySelector('script[type=importmap]').textContent).imports, SM = await import(map['./js/spacemap.js']);
const up = nz(L.site); p.pos = V.add(L.site, V.sc(up, 0.05)); p.settleFrame(); await gt(0.5);
const t = g.state.time, x = C.toInertial(p.pos, t), out = {};
for (const sp of [30, 55, 72]) { const v = C.velToInertial(p.pos, V.sc(L.aim.dir, sp), t); const t0 = performance.now(); let r; for (let i = 0; i < 5; i++) r = SM.predict(x, v, t); out[sp] = { ms: +((performance.now() - t0) / 5).toFixed(1), pts: r.pts.length, hit: r.hit && r.hit.what }; }
return JSON.stringify(out);
} catch (e) { return 'ERR ' + e.message; } })()
