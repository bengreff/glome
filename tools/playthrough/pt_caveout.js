(async () => {
// The way out of the cave (after pt_room.js, holding part I in its chamber): follow the cues with real keys until the
// guide points at the launcher from the surface.
const { g, p, d, V, len, nz, gt, look } = PT, G = g.G, out = {}, k = g.keys;
const rel = () => { const c = p.camera(), q = d.guide.goal.pos, dd = V.sub(q, c.eye); return { f: V.dot(dd, p.F), r: V.dot(dd, p.R), a: V.dot(dd, p.A), kind: d.guide.goal.kind }; };
const faceGoal = () => { const c = p.camera(), dd = V.sub(d.guide.goal.pos, c.eye), u = p.up(); let h = V.sub(dd, V.sc(u, V.dot(dd, u))); h = V.sub(h, V.sc(p.A, V.dot(h, p.A))); if (len(h) > 0.3) { p.F = nz(h); p.settleFrame(); } };
const depth = () => +(len(p.pos) - 250 - p.hf.heightAt(nz(p.pos))).toFixed(1);
out.start = { depth: depth(), goal: rel().kind };
const kinds = [];
for (let i = 0; i < 80; i++) {
  const r = rel(); if (kinds[kinds.length - 1] !== r.kind) kinds.push(r.kind);
  if (r.kind === 'pad') break;
  faceGoal(); k.clear();
  if (Math.abs(r.a) > 1.0) k.add(r.a > 0 ? 'KeyE' : 'KeyQ'); else if (Math.hypot(r.f, r.r) > 1.5) k.add('KeyW');
  await gt(0.5);
}
k.clear();
out.kinds = kinds.join('>'); out.end = { depth: depth(), goal: rel().kind, out: d.guide.goal.kind !== 'exit' };
return JSON.stringify(out);
})()
