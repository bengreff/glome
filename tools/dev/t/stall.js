(async () => { try { const { g, p, d, V, len, nz, gt } = PT, G = g.G, L = d.launcher, out = {};
const key = (code, up) => dispatchEvent(new KeyboardEvent(up ? 'keyup' : 'keydown', { code }));
d.objects.pouch = 1;
let best = 1e9, since = 0;
key('KeyW');
for (let i = 0; i < 200 && !L.onPad; i++) {
  const c = p.camera(), dd = V.sub(L.site, c.eye), uu = p.up(); let h = V.sub(dd, V.sc(uu, V.dot(dd, uu))); h = V.sub(h, V.sc(p.A, V.dot(h, p.A)));
  if (len(h) > 0.3) { p.F = nz(h); p.settleFrame(); }
  await gt(0.5);
  const dist = len(V.sub(L.site, p.pos)); if (dist < best - 0.3) { best = dist; since = 0; } else if (++since > 6) break;
}
key('KeyW', true);
out.onPad = L.onPad; out.padDist = +len(V.sub(L.site, p.pos)).toFixed(1); out.h = +(len(p.pos) - 250).toFixed(1);
const map = JSON.parse(document.querySelector('script[type=importmap]').textContent).imports, PR = await import(map['./js/props.js']);
out.rocks = PR.rocksAt(p.pos).filter(q => len(V.sub(q.c, p.pos)) < q.R + 4).map(q => ({ kind: q.kind, R: +q.R.toFixed(2), d: +len(V.sub(q.c, p.pos)).toFixed(2) }));
const u = p.up(); out.riseAhead = [0.5, 1, 2, 3].map(m => +(p.hf.heightAt(nz(V.add(V.sc(u, 250), V.sc(p.F, m)))) - p.hf.heightAt(u)).toFixed(2));
out.boulders = d.boulders ? null : null;
const B = g.boulders; if (B && B.all) out.boulder = B.all.filter(b => len(V.sub(b.c, p.pos)) < b.r + 3).map(b => ({ r: +b.r.toFixed(1), d: +len(V.sub(b.c, p.pos)).toFixed(1) }));
const ca = await import(map['./js/landforms.js']); out.carve = +ca.carveSD(V.add(p.pos, V.sc(p.F, 1))).d.toFixed(2);
return JSON.stringify(out);
} catch (e) { return 'ERR ' + e.message; } })()
