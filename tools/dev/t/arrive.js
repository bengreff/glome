(async () => { const { g, p, d, V, len, nz, gt } = PT, G = g.G, k = g.keys, out = {};
// arrive at an artifact as a player does: from 40 m off (on the way from the start), follow the way's column and cues
const id = window.__arrive || 'knot', order = ['room', 'mirror', 'knot', 'fold'];
for (const x of order) { if (x === id) break; G.flags[x === 'room' ? 'part1' : 'solved_' + x] = true; }
for (const b of d.objects.world.bodies) if (b.kind === 'part' && b.tier <= order.indexOf(id)) d.launcher.seat(b);
const a = d.artifacts.find(x => x.id === id), from = nz(G.home.pos), to = a.n;
const dir = nz(V.sub(from, V.sc(to, V.dot(from, to)))), start = nz(V.add(V.sc(to, Math.cos(40 / 250)), V.sc(dir, Math.sin(40 / 250))));
p.pos = V.sc(start, 250 + p.hf.heightAt(start) + 0.05); p.vel = [0, 0, 0, 0]; p.settleFrame(); await gt(0.5);
const rel = () => { const c = p.camera(), q = d.guide.goal.pos, dd = V.sub(q, c.eye); return { f: V.dot(dd, p.F), r: V.dot(dd, p.R), a: V.dot(dd, p.A), kind: d.guide.goal.kind }; };
const faceGoal = () => { const c = p.camera(), dd = V.sub(d.guide.goal.pos, c.eye), u = p.up(); let h = V.sub(dd, V.sc(u, V.dot(dd, u))); h = V.sub(h, V.sc(p.A, V.dot(h, p.A))); if (len(h) > 0.3) { p.F = nz(h); p.settleFrame(); } };
for (let i = 0; i < 120; i++) {
  const r = rel(); if (Math.hypot(r.f, r.r) < 7 && Math.abs(r.a) < 1.5) break;
  faceGoal(); k.clear(); if (Math.abs(r.a) > 1.0) k.add(r.a > 0 ? 'KeyE' : 'KeyQ'); if (Math.hypot(r.f, r.r) > 6.5) k.add('KeyW');
  await gt(0.4);
}
k.clear(); p.pitch = -0.12; await gt(1.5);
const r = rel(); out.goal = r.kind; out.at = [r.f, r.r, r.a].map(v => +v.toFixed(1));
return JSON.stringify(out); })()
