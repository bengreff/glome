(async () => { const { g, p, d, V, len, nz } = PT, L = d.launcher, hf = p.hf;
const tangents = n => { const u = n; const c = [[-u[1],u[0],u[3],-u[2]],[-u[2],-u[3],u[0],u[1]],[-u[3],u[2],-u[1],u[0]]]; return c; };
const off = (u, t, m) => nz(V.add(V.sc(u, Math.cos(m / 250)), V.sc(t, Math.sin(m / 250))));
const score = (q, R) => { const T = tangents(q); let lo = 1e9, hi = -1e9; for (let i = 0; i < 60; i++) { const a = i * 2.39996, b = Math.acos(1 - 2 * ((i * 0.618034 + 0.5) % 1)), r = R * Math.sqrt(((i * 0.7548) % 1)); const dir = nz([0,1,2,3].map(k => Math.sin(b) * Math.cos(a) * T[0][k] + Math.sin(b) * Math.sin(a) * T[1][k] + Math.cos(b) * T[2][k])); const pp = r < 0.01 ? q : off(q, dir, r), h = hf.heightAt(pp); if (hf.waterAt(pp) > h - 0.05) return 1e9; lo = Math.min(lo, h); hi = Math.max(hi, h); } return { var: hi - lo, h: hf.heightAt(q) }; };
const out = { summit: L.h.toFixed(1) }, found = [];
const n0 = L.n;
for (let i = 0; i < 6000; i++) {
  const T = tangents(n0), a = i * 2.39996, b = Math.acos(1 - 2 * ((i * 0.618034) % 1)), r = 1 + i * 0.012;
  const dir = nz([0,1,2,3].map(k => Math.sin(b) * Math.cos(a) * T[0][k] + Math.sin(b) * Math.sin(a) * T[1][k] + Math.cos(b) * T[2][k]));
  const q = off(n0, dir, r), s = score(q, 5);
  if (s.var < 1.2) found.push({ r: +r.toFixed(1), h: +s.h.toFixed(1), v: +s.var.toFixed(2) });
}
found.sort((x, y) => y.h - x.h);
out.best = found.slice(0, 8); out.count = found.length;
out.nearest = found.slice().sort((x, y) => x.r - y.r).slice(0, 5);
return JSON.stringify(out);
})()
