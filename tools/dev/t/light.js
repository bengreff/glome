(async () => { try { const { g, p, d, V, len, nz, gt } = PT, G = g.G, LH = G.lighthouse, out = {};
if (!LH || !LH.n) return JSON.stringify({ none: true, e: G.errors || 0, last: G.lastError });
const arc = (a, b) => Math.acos(Math.max(-1, Math.min(1, V.dot(a, b)))) * 250;
out.fromHome = +arc(LH.n, nz(G.home.pos)).toFixed(0); out.h = +p.hf.heightAt(LH.n).toFixed(1); out.lampH = +(len(LH.lamp) - 250).toFixed(1);
// stand 28 m off, square to it (its axis in your slice), and look up at the lamp, at a flash
const u = LH.n, T = [[-u[1], u[0], u[3], -u[2]], [-u[2], -u[3], u[0], u[1]]];
let best = null; for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12, dir = nz(V.add(V.sc(T[0], Math.cos(a)), V.sc(T[1], Math.sin(a)))), q = nz(V.add(V.sc(u, 250), V.sc(dir, 28))), h = p.hf.heightAt(q); if (p.hf.waterAt(q) < h - 0.1 && (!best || h > best.h)) best = { q, h, dir }; }
if (!best) best = { q: nz(V.add(V.sc(u, 250), V.sc(T[0], 28))) };
p.pos = V.sc(best.q, 250 + p.hf.heightAt(best.q) + 0.05); p.vel = [0, 0, 0, 0]; p.settleFrame();
const uu = p.up(); let f = V.sub(V.sc(u, 250), p.pos); f = V.sub(f, V.sc(uu, V.dot(f, uu))); f = nz(f);
let A = V.sub(p.A, V.sc(uu, V.dot(p.A, uu))); A = nz(V.sub(A, V.sc(f, V.dot(A, f))));
p.F = f; p.A = A; p.settleFrame();
p.pitch = Math.atan2(V.dot(V.sub(LH.lamp, p.camera().eye), uu), len(V.sub(V.sub(LH.lamp, p.camera().eye), V.sc(uu, V.dot(V.sub(LH.lamp, p.camera().eye), uu))))) * 0.8;
for (let i = 0; i < 400 && LH.I < 0.8; i++) await gt(0.02);
out.flash = +LH.I.toFixed(2); out.e = G.errors || 0; out.last = G.lastError ? G.lastError.slice(0, 200) : null;
return JSON.stringify(out);
} catch (e) { return 'ERR ' + e.message; } })()
