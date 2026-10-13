(async () => { const { g, p, d, O, V, len, nz, gt, place } = PT, L = d.launcher, out = [];
const key = (code, up) => dispatchEvent(new KeyboardEvent(up ? 'keyup' : 'keydown', { code }));
const up = nz(L.site), T = [[-up[1],up[0],up[3],-up[2]],[-up[2],-up[3],up[0],up[1]],[-up[3],up[2],-up[1],up[0]]];
const res = {};
for (const [name, dir] of [['t0', T[0]], ['-t0', V.sc(T[0], -1)], ['t1', T[1]], ['t2', T[2]]]) {
  const start = nz(V.add(V.sc(up, 250), V.sc(dir, 7)));
  place(V.sc(start, 250), V.sc(dir, -1)); await gt(0.6);
  const rows = [];
  key('KeyW');
  for (let i = 0; i < 14; i++) { await gt(0.25); const dd = V.sub(p.pos, L.site), h = V.dot(dd, up), lat = len(V.sub(dd, V.sc(up, h)));
    const gH = len(p.pos) - 250 - p.hf.heightAt(nz(p.pos)); rows.push(`${lat.toFixed(2)}/${h.toFixed(2)}/${L.onPad ? 'P' : p.grounded ? 'g' : 'a'}`); }
  key('KeyW', true);
  res[name] = rows.join(' ');
}
res.padTopAboveSummit = 0.25; res.edgeGround = [T[0], T[1], T[2]].map(t => { const q = nz(V.add(V.sc(up, 250), V.sc(t, 1.2))); return (L.h + 0.25 - p.hf.heightAt(q)).toFixed(2); }).join(',');
return JSON.stringify(res);
})()
