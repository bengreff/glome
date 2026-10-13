(async () => { const { g, p, d, O, w, V, len, nz, gt, look } = PT, G = g.G, out = { actions: {} };
const key = (code, up) => dispatchEvent(new KeyboardEvent(up ? 'keyup' : 'keydown', { code }));
const hold = async (code, s) => { key(code); await gt(s); key(code, true); };
let seed = 7; const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
const count = k => { out.actions[k] = (out.actions[k] || 0) + 1; };
const bad = { nan: 0, flung: 0, under: 0, maxBodyV: 0, maxPlayerV: 0 };
const watch = () => {
  for (const b of w.bodies) { if (b.fixed) continue; if (!b.pos.every(Number.isFinite) || !b.vel.every(Number.isFinite)) bad.nan++; const v = len(b.vel); bad.maxBodyV = Math.max(bad.maxBodyV, v); if (v > 30 && b.kind !== 'stone') bad.flung++; }
  if (!p.pos.every(Number.isFinite)) bad.nan++;
  bad.maxPlayerV = Math.max(bad.maxPlayerV, len(p.vel));
  const h = len(p.pos) - 250 - p.hf.heightAt(nz(p.pos)); if (h < -0.6 && !d.flight.active) bad.under++;
};
const t0 = g.state.time;
while (g.state.time - t0 < 150) {
  watch();
  // the nearest thing you could carry (not a stone: those are thrown at 80 m/s by design)
  let best = null, bd = 12;
  for (const b of w.bodies) { if (b.fixed || b.held || b.kind === 'stone' || b.kind === 'raft' || b.noTake) continue; const dd = len(V.sub(b.pos, p.pos)); if (dd < bd) { bd = dd; best = b; } }
  if (!best) { await hold('KeyW', 0.6); count('wander'); continue; }
  if (!O.held) {
    const c = p.camera(), dd = V.sub(best.pos, c.eye), uu = p.up(); let h = V.sub(dd, V.sc(uu, V.dot(dd, uu))); const a = V.dot(h, p.A); h = V.sub(h, V.sc(p.A, a));
    if (len(h) > 0.3) { p.F = nz(h); p.settleFrame(); }
    if (Math.abs(a) > 0.3) { await hold(a > 0 ? 'KeyE' : 'KeyQ', 0.08); count('ana'); continue; }
    if (len(h) > 2.2) { await hold('KeyW', Math.min(0.5, (len(h) - 1.6) / 4.2)); count('walk'); continue; }
    look(best.pos); await gt(0.1);
    if (G.canTake) { await hold('KeyF', 0.08); count('take'); } else { await hold('KeyS', 0.1); count('back'); }
    continue;
  }
  const r = rnd();
  if (r < 0.3) { p.pitch = 0.2; d.actions.mDown = true; await gt(0.2 + 0.8 * rnd()); d.actions.mUp = true; count('throw'); }
  else if (r < 0.5) { await hold('KeyF', 0.08); count('drop'); }
  else if (r < 0.7) { key('KeyF'); await gt(0.8); key('KeyF', true); count('setDown'); }
  else if (r < 0.85) { await hold('Space', 0.1); await gt(0.6); count('jumpHolding'); }
  else { await hold(rnd() < 0.5 ? 'KeyE' : 'KeyQ', 0.3); key('KeyC'); await gt(0.4); key('KeyC', true); count('twistHolding'); }
  await gt(0.4);
}
watch();
out.bad = { ...bad, maxBodyV: +bad.maxBodyV.toFixed(1), maxPlayerV: +bad.maxPlayerV.toFixed(1) };
out.errors = G.errors || 0; out.lastError = G.lastError || null;
return JSON.stringify(out);
})()
