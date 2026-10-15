(async () => { try { const { g, p, d, V, len, nz, gt } = PT, out = {};
const arc = (a, b) => Math.acos(Math.max(-1, Math.min(1, V.dot(a, b)))) * 250;
const L = d.creatures.list.filter(c => c.kind === 'walker' && c.legs === 12 && c.K > 1.1).sort((a, b) => arc(a.n, nz(p.pos)) - arc(b.n, nz(p.pos)));
const c = L[0]; if (!c) return 'none'; c.curious = false; c.rest = true; c.goalUntil = 1e9; c.goal = c.n.slice(); c.v = [0, 0, 0, 0];
const u = c.n, f = nz(V.sub(c.heading, V.sc(u, V.dot(c.heading, u))));
p.pos = V.sc(u, 250 + p.hf.heightAt(u)); p.F = f; p.settleFrame();
const dir = nz(V.add(V.sc(p.F, -0.7), V.sc(p.R, 0.7))), q = nz(V.add(V.sc(u, 250), V.sc(dir, 3.2 * c.K)));
p.pos = V.sc(q, 250 + p.hf.heightAt(q) + 0.05); p.vel = [0, 0, 0, 0];
const uu = p.up(); let ff = V.sub(V.sc(u, 250 + p.hf.heightAt(u)), p.pos); ff = V.sub(ff, V.sc(uu, V.dot(ff, uu))); p.F = nz(ff); p.settleFrame(); p.pitch = -0.3;
await gt(3); return JSON.stringify({ K: +c.K.toFixed(2), legs: c.legs });
} catch (e) { return 'ERR ' + e.message; } })()
