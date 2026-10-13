(async () => { try { const { g, p, d, V, len, nz, gt } = PT, G = g.G, L = d.launcher, out = { trials: [] };
const key = (code, up) => dispatchEvent(new KeyboardEvent(up ? 'keyup' : 'keydown', { code }));
const hold = async (code, s) => { key(code); await gt(s); key(code, true); };
let seed = 11; const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
const pad = L.site, up0 = nz(pad), T = [[-up0[1], up0[0], up0[3], -up0[2]], [-up0[2], -up0[3], up0[0], up0[1]], [-up0[3], up0[2], -up0[1], up0[0]]];
d.objects.pouch = 3;
for (let trial = 0; trial < 6; trial++) {
  // a dry start 90–150 m from the pad
  let q = null;
  for (let i = 0; i < 200 && !q; i++) { const v = nz(T.reduce((s, t) => V.add(s, V.sc(t, rnd() - 0.5)), [0, 0, 0, 0])), m = 90 + 60 * rnd(); const n = nz(V.add(V.sc(up0, Math.cos(m / 250)), V.sc(v, Math.sin(m / 250)))); const h = p.hf.heightAt(n); if (h > 1 && h < 25 && p.hf.waterAt(n) < h - 0.2) q = n; }
  p.pos = V.sc(q, 250 + p.hf.heightAt(q) + 0.05); p.vel = [0, 0, 0, 0]; p.settleFrame(); await gt(0.5);
  const t0 = g.state.time, start = +len(V.sub(pad, p.pos)).toFixed(0); let detours = 0, best = 1e9, sinceBest = 0;
  while (!L.onPad && g.state.time - t0 < 240) {
    const c = p.camera(), dd = V.sub(pad, c.eye), uu = p.up(); let h = V.sub(dd, V.sc(uu, V.dot(dd, uu))); const a = V.dot(h, p.A); h = V.sub(h, V.sc(p.A, a));
    const dist = len(V.sub(pad, p.pos));
    if (dist < best - 1) { best = dist; sinceBest = 0; } else sinceBest++;
    if (sinceBest > 6) {                                     // no headway for a few seconds: go round (sideways, or through ana), then try again
      detours++; sinceBest = 0;
      const r = rnd();
      if (r < 0.33) await hold(rnd() < 0.5 ? 'KeyE' : 'KeyQ', 1.5);
      else { if (len(h) > 0.3) { p.F = nz(h); p.settleFrame(); } await hold(r < 0.66 ? 'KeyA' : 'KeyD', 2.0); }
      continue;
    }
    if (len(h) > 0.3) { p.F = nz(h); p.settleFrame(); }
    if (Math.abs(a) > 1.2 && len(h) < 30) await hold(a > 0 ? 'KeyE' : 'KeyQ', Math.min(1.5, Math.abs(a) / 4.2));
    else { key('KeyW'); if (sinceBest > 2) key('Space'); await gt(0.5); key('Space', true); }
  }
  key('KeyW', true);
  out.trials.push({ start, reached: L.onPad, secs: +(g.state.time - t0).toFixed(0), detours });
}
out.errors = G.errors || 0;
return JSON.stringify(out);
} catch (e) { return 'ERR ' + e.message + ' ' + (e.stack || '').split('\n')[1]; } })()
