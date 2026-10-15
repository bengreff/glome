(async () => { try { const { g, p, d, O, w, V, len, nz, gt } = PT, G = g.G, out = {};
const map = JSON.parse(document.querySelector('script[type=importmap]').textContent).imports, CR = await import(map['./js/creatures.js']);
const L = d.creatures.list.filter(c => c.kind === 'walker');
const hist = {}; for (const c of L) { const k = c.legs + ' legs, ' + (c.K <= CR.CRAB_SMALL ? 'small' : c.K < 1.1 ? 'medium' : c.K < 1.45 ? 'large' : 'big'); hist[k] = (hist[k] || 0) + 1; }
out.kinds = hist; out.total = L.length;
const arc = (a, b) => Math.acos(Math.max(-1, Math.min(1, V.dot(a, b)))) * 250;
// 1. walk into a medium crab, slowly: pushed aside, not running
const m = L.filter(c => c.K > 0.8 && c.K < 1.4).sort((a, b) => arc(a.n, nz(p.pos)) - arc(b.n, nz(p.pos)))[0];
const standBefore = (c, back) => { const u = c.n, f = nz(V.sub(c.heading, V.sc(u, V.dot(c.heading, u)))); p.pos = V.sc(u, 250 + p.hf.heightAt(u)); p.F = f; p.settleFrame(); const q = nz(V.add(V.sc(u, 250), V.sc(p.F, -back))); p.pos = V.sc(q, 250 + p.hf.heightAt(q) + 0.05); p.vel = [0, 0, 0, 0]; p.settleFrame(); };
m.curious = false; m.spooked = 0; standBefore(m, 2.5); await gt(0.3);
const n0 = m.n.slice(); g.keys.add('KeyW'); await gt(1.2); g.keys.delete('KeyW'); await gt(0.5);
out.bump = { moved: +arc(n0, m.n).toFixed(2), spooked: G.simT < (m.spooked || 0), gap: +arc(m.n, nz(p.pos)).toFixed(2) };
// 2. run at another: it runs off
const m2 = L.filter(c => c !== m && c.K > 0.8).sort((a, b) => arc(a.n, nz(p.pos)) - arc(b.n, nz(p.pos)))[0];
m2.spooked = 0; standBefore(m2, 6); await gt(0.3);
g.keys.add('ShiftLeft'); g.keys.add('KeyW'); await gt(0.9); g.keys.delete('KeyW'); g.keys.delete('ShiftLeft'); await gt(0.6);
out.ram = { spooked: G.simT < (m2.spooked || 0), speed: +len(m2.v).toFixed(2) };
// 3. a small one: look at it, F: in hand as a crab; set it down: a crab again, off it goes
let sm = L.filter(c => c.K <= CR.CRAB_SMALL).sort((a, b) => arc(a.n, nz(p.pos)) - arc(b.n, nz(p.pos)))[0];
out.smallFound = !!sm;
if (sm) {
  sm.curious = false; sm.playful = false; sm.rest = true; sm.goal = sm.n.slice(); sm.goalUntil = 1e9; sm.spooked = 0; sm.v = [0, 0, 0, 0];
  standBefore(sm, 1.4); await gt(0.3);
  const eye = p.camera().eye, ctr = V.sc(sm.n, 250 + (sm.g ?? 0) + 0.55 * sm.K), dd = nz(V.sub(ctr, eye)), uu = p.up();   // (aim at it now, where it stands)
  let hz = V.sub(dd, V.sc(uu, V.dot(dd, uu))); hz = V.sub(hz, V.sc(p.A, V.dot(hz, p.A))); p.F = nz(hz); p.settleFrame(); p.pitch = Math.asin(V.dot(dd, uu)); await gt(0.1);
  out.canTake = !!G.canTake; d.actions.fDown = true; await gt(0.1); d.actions.fUp = true; await gt(0.5);
  out.heldKind = O.held && O.held.kind; out.inList = d.creatures.list.includes(sm);
  window.HELDCRAB = 1; await gt(0.2);
}
return JSON.stringify(out);
} catch (e) { return 'ERR ' + e.message + ' ' + (e.stack || '').split('\n')[1]; } })()
