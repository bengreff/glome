(async () => {
// The loop as a new player plays it, with the real keys only: from where you arrive, follow the way to the nearest
// impulse stone (turn to face its mark, walk, step through ana by its cue in taps as a hand does), take it when the dot
// opens (F), stow it (G), follow the way to the launcher's pad, and jump (Space). Turning is set straight to the mark
// (the mouse's job); the rest is keys held for as long as a player would.
const { g, p, d, O, V, len, nz, gt } = PT, G = g.G, out = {}, k = g.keys;
const key = (code, up) => dispatchEvent(new KeyboardEvent(up ? 'keyup' : 'keydown', { code }));
const hold = async (code, s) => { key(code); await gt(s); key(code, true); };
const rel = () => { const c = p.camera(), dd = V.sub(d.guide.goal.pos, c.eye); return { f: V.dot(dd, p.F), r: V.dot(dd, p.R), a: V.dot(dd, p.A), u: V.dot(dd, p.up()) }; };
const faceGoal = () => { const c = p.camera(), dd = V.sub(d.guide.goal.pos, c.eye), u = p.up(); let h = V.sub(dd, V.sc(u, V.dot(dd, u))); h = V.sub(h, V.sc(p.A, V.dot(h, p.A))); if (len(h) > 0.2) { p.F = nz(h); p.settleFrame(); } p.pitch = Math.max(-1.2, Math.min(0.6, Math.atan2(V.dot(dd, u), Math.max(0.3, len(h))))); };
const t0 = g.state.time, log = [];
let taps = 0, steps = 0;
// 1. to a stone, and into the pouch
for (let i = 0; i < 400 && O.pouch === 0; i++) {
  const goal = d.guide.goal;
  if (!goal) { if (O.held && O.held.kind === 'stone') { await hold('KeyG', 0.1); log.push('G'); await gt(0.3); continue; } await gt(0.3); continue; }
  if (goal.kind !== 'stone') { log.push('goal ' + goal.kind); break; }
  faceGoal(); await gt(0.05);
  if (G.canTake && goal.cue === 'F') { await hold('KeyF', 0.08); log.push('F'); await gt(0.3); out.took = O.held ? O.held.kind : null; continue; }
  const r = rel(), hz = Math.hypot(r.f, r.r);
  if (Math.abs(r.a) > (goal.near || 1.5)) { const s = Math.abs(r.a) > 1.2 ? Math.min(1.5, (Math.abs(r.a) - 0.6) / 4.2) : 0.06; await hold(r.a > 0 ? 'KeyE' : 'KeyQ', s); taps++; await gt(0.25); }
  else if (hz > 1.6) { await hold('KeyW', Math.min(1.0, (hz - 1.2) / 4.2)); steps++; await gt(0.2); }
  else { await hold('KeyS', 0.06); await gt(0.2); }      // (too close to look at it: a half step back)
}
out.stone = { pouch: O.pouch, secs: +(g.state.time - t0).toFixed(1), anaTaps: taps, walks: steps, log: log.slice(-6).join(' ') };
if (!O.pouch) return JSON.stringify(out);
// 2. to the launcher's pad
const t1 = g.state.time; let stuck = 0, last = p.pos.slice();
for (let i = 0; i < 600 && !d.launcher.onPad; i++) {
  if (!d.guide.goal || d.guide.goal.kind !== 'launch') { await gt(0.3); continue; }
  faceGoal(); const r = rel();
  if (Math.abs(r.a) > 1.2 && Math.hypot(r.f, r.r) < 30) await hold(r.a > 0 ? 'KeyE' : 'KeyQ', Math.min(1.5, Math.abs(r.a) / 4.2));
  else { key('KeyW'); if (stuck > 2) key('Space'); await gt(0.5); key('Space', true); }
  if (len(V.sub(p.pos, last)) < 0.5) stuck++; else stuck = 0; last = p.pos.slice();
  if (stuck > 12) { out.stuckAt = (len(V.sub(d.launcher.site, p.pos))).toFixed(0) + ' m from the pad'; break; }
}
key('KeyW', true);
out.pad = { onPad: d.launcher.onPad, secs: +(g.state.time - t1).toFixed(1), cue: d.guide.goal && d.guide.goal.cue };
if (!d.launcher.onPad) return JSON.stringify(out);
await gt(0.5); const n0 = G.flags.launches || 0;
await hold('Space', 0.08); await gt(0.3);
out.launched = (G.flags.launches || 0) > n0;
out.errors = G.errors || 0; out.lastError = G.lastError || null;
return JSON.stringify(out);
})()
