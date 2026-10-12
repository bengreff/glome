(async () => {
// The closed room, as a player follows the way from where they arrive: walk toward the column; where the mark's cue
// says to step through ana, step (E or Q) until the goal is in the slice; at the cave's mouth, step down the tunnel
// toward kata into the chamber; take part I (F), and carry it out.
const { g, p, d, V, len, nz, gt, look } = PT, G = g.G, out = {}, k = g.keys;
const rel = () => { const c = p.camera(), q = d.guide.goal.pos, dd = V.sub(q, c.eye); return { f: V.dot(dd, p.F), r: V.dot(dd, p.R), a: V.dot(dd, p.A), kind: d.guide.goal.kind }; };
const faceGoal = () => { const c = p.camera(), dd = V.sub(d.guide.goal.pos, c.eye), u = p.up(); let h = V.sub(dd, V.sc(u, V.dot(dd, u))); h = V.sub(h, V.sc(p.A, V.dot(h, p.A))); if (len(h) > 0.3) { p.F = nz(h); p.settleFrame(); } };
out.first = rel().kind;
// 1. walk toward the mark and step through ana as its cue says, until at the mouth
for (let i = 0; i < 120 && d.guide.goal.kind === 'mouth'; i++) {
  const r = rel(); faceGoal();
  k.delete('KeyE'); k.delete('KeyQ'); k.delete('KeyW');
  if (Math.abs(r.a) > 1.0) k.add(r.a > 0 ? 'KeyE' : 'KeyQ');
  if (Math.hypot(r.f, r.r) > 1.5) k.add('KeyW');
  await gt(0.5);
}
k.clear();
out.atMouth = d.guide.goal.kind; out.toMouth = len(V.sub(p.pos, G.cave.mouth)).toFixed(1);
// 2. down the tunnel: step as the cue says (toward kata), walking toward the mark when it is ahead
for (let i = 0; i < 80 && !G.flags.part1; i++) {
  const r = rel(); faceGoal();
  k.delete('KeyE'); k.delete('KeyQ'); k.delete('KeyW');
  if (Math.abs(r.a) > 0.8) k.add(r.a > 0 ? 'KeyE' : 'KeyQ');
  else if (Math.hypot(r.f, r.r) > 1.2) k.add('KeyW');
  await gt(0.5);
}
k.clear();
out.part1 = !!G.flags.part1; out.goalNow = d.guide.goal && d.guide.goal.kind;
out.depth = (len(p.pos) - 250 - p.hf.heightAt(nz(p.pos))).toFixed(1);
// 3. take the part: walk to it and look at it
for (let i = 0; i < 40 && !(d.objects.held && d.objects.held.kind === 'part'); i++) {
  const r = rel(); faceGoal();
  k.delete('KeyE'); k.delete('KeyQ'); k.delete('KeyW'); k.delete('KeyS');
  // (off it first: the key is a ring a metre across, and what you stand on you can't lift)
  if (Math.abs(r.a) > 0.5) k.add(r.a > 0 ? 'KeyE' : 'KeyQ'); else if (Math.hypot(r.f, r.r) > 1.6) k.add('KeyW'); else if (Math.hypot(r.f, r.r) < 1.1 || p.ride) k.add('KeyS');
  await gt(0.3);
  look(d.guide.goal.pos);
  if (G.canTake) { d.actions.fDown = true; await gt(0.3); }
}
k.clear();
out.holding = !!(d.objects.held && d.objects.held.kind === 'part'); out.goalAfter = d.guide.goal && d.guide.goal.kind;
return JSON.stringify(out);
})()
