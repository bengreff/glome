(async () => { try { const { g, p, d, O, w, V, len, nz, gt } = PT, G = g.G, out = {};
if (O.held && O.held.kind === 'crab') { d.actions.fDown = true; await gt(0.05); d.actions.fUp = true; }   // let it go
await gt(3);
out.crabBodies = w.bodies.filter(b => b.kind === 'crab').length; out.backInList = d.creatures.list.filter(c => c.kind === 'walker' && c.alarm > 0.3).length > 0;
// 4. a ball rolled near a playful crab: it comes after it
const L = d.creatures.list.filter(c => c.kind === 'walker' && c.playful && c.near);
const c = L[0]; out.playful = L.length;
if (c) {
  const ball = w.bodies.find(b => b.kind === 'glomeS' || b.kind === 'glomeL');
  const T = [[-c.n[1], c.n[0], c.n[3], -c.n[2]]], dir = nz(V.sub(T[0], V.sc(c.n, V.dot(T[0], c.n))));
  const at = nz(V.add(V.sc(c.n, 250), V.sc(dir, 4)));
  ball.pos = V.sc(at, 250 + p.hf.heightAt(at) + 0.4); ball.vel = V.sc(dir, 1.5); ball.sleeping = false; ball.kinematic = false;
  const d0 = len(V.sub(V.sc(c.n, 250 + p.hf.heightAt(c.n)), ball.pos)); await gt(4);
  out.ballChase = { before: +d0.toFixed(1), after: +len(V.sub(V.sc(c.n, 250 + p.hf.heightAt(c.n)), ball.pos)).toFixed(1), toy: !!c.toy };
}
out.errors = G.errors || 0; out.lastError = G.lastError ? G.lastError.slice(0, 200) : null;
return JSON.stringify(out);
} catch (e) { return 'ERR ' + e.message; } })()
