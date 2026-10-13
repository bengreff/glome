(async () => { try { const { g, p, d, V, len, nz, gt } = PT, G = g.G, L = d.launcher, out = {};
const key = (code, up) => dispatchEvent(new KeyboardEvent(up ? 'keyup' : 'keydown', { code }));
const below = () => +(len(p.pos) - 250 - p.hf.heightAt(nz(p.pos))).toFixed(1);
const t0 = g.state.time; let best = 1e9, since = 0, det = 0, outAt = null;
while (!L.onPad && g.state.time - t0 < 150) {
  const c = p.camera(), dd = V.sub(L.site, c.eye), uu = p.up(); let h = V.sub(dd, V.sc(uu, V.dot(dd, uu))); h = V.sub(h, V.sc(p.A, V.dot(h, p.A)));
  if (len(h) > 0.3) { p.F = nz(h); p.settleFrame(); }
  const dist = len(V.sub(L.site, p.pos)); if (dist < best - 0.5) { best = dist; since = 0; } else since++;
  if (outAt == null && below() > -0.3) outAt = +(g.state.time - t0).toFixed(1);
  if (since > 6) { det++; since = 0; if (det % 2) { key('KeyW'); key('Space'); await gt(2.5); key('Space', true); key('KeyW', true); } else { const s = det % 4 === 2 ? 'KeyA' : 'KeyD'; key(s); key('KeyW'); await gt(1.5 + 0.5 * det); key('KeyW', true); key(s, true); } continue; }
  key('KeyW'); await gt(0.5);
}
key('KeyW', true);
out.outOfHollowAfter = outAt; out.reachedPad = L.onPad; out.secs = +(g.state.time - t0).toFixed(0); out.detours = det; out.endBelow = below(); out.errors = G.errors || 0;
return JSON.stringify(out);
} catch (e) { return 'ERR ' + e.message; } })()
