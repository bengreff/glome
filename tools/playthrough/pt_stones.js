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
// 2. to the launcher's pad: toward its column; with no headway for a few seconds (a steep face), go round as a
// player would (a few steps sideways, or through ana) and try again
const t1 = g.state.time; let best = 1e9, since = 0, detours = 0, sd = 3;
const rnd = () => ((sd = (Math.imul(sd, 1103515245) + 12345) >>> 0) / 4294967296);
while (!d.launcher.onPad && g.state.time - t1 < 240) {
  if (!d.guide.goal || d.guide.goal.kind !== 'launch') { await gt(0.3); continue; }
  const dist = len(V.sub(d.launcher.site, p.pos));
  if (dist < best - 1) { best = dist; since = 0; } else since++;
  faceGoal(); const r = rel();
  // (a boulder or a rock in the way: climb it, holding Space as you walk on; failing that, go round it, keeping to
  // one side, a little further each time)
  if (since > 6) { detours++; since = 0;
    if (detours % 2) { key('KeyW'); key('Space'); await gt(2.5); key('Space', true); key('KeyW', true); }
    else { const side = detours % 4 === 2 ? 'KeyA' : 'KeyD'; key(side); key('KeyW'); await gt(1.5 + 0.5 * detours); key('KeyW', true); key(side, true); }
    continue; }
  if (Math.abs(r.a) > 1.2 && Math.hypot(r.f, r.r) < 30) await hold(r.a > 0 ? 'KeyE' : 'KeyQ', Math.min(1.5, Math.abs(r.a) / 4.2));
  else { key('KeyW'); if (since > 2) key('Space'); await gt(0.5); key('Space', true); }
}
out.detours = detours;
if (!d.launcher.onPad) {                       // what stopped it: the rocks within 4 m, and the ground's rise ahead
  const map = JSON.parse(document.querySelector('script[type=importmap]').textContent).imports, PR = await import(map['./js/props.js']);
  out.rocks = PR.rocksAt(p.pos).filter(q => len(V.sub(q.c, p.pos)) < q.R + 4).map(q => ({ kind: q.kind, R: +q.R.toFixed(2), d: +len(V.sub(q.c, p.pos)).toFixed(2) }));
  const u = p.up(), ah = [1, 2, 3].map(m => { const n = nz(V.add(V.sc(u, 250), V.sc(p.F, m))); return +(p.hf.heightAt(n) - p.hf.heightAt(u)).toFixed(2); });
  out.riseAhead = ah; out.h = +(len(p.pos) - 250).toFixed(1); out.padDist = +len(V.sub(d.launcher.site, p.pos)).toFixed(1);
  out.ground = +p.hf.heightAt(u).toFixed(1); out.pos = p.pos.map(v => +v.toFixed(2)); out.grounded = p.grounded; out.supported = !!p.supported;
  out.boulders = g.boulders.all.filter(b => len(V.sub(b.c, p.pos)) < b.r + 4).map(b => ({ r: +b.r.toFixed(2), d: +len(V.sub(b.c, p.pos)).toFixed(2) }));
  const LF = await import(map['./js/landforms.js']); out.carve = +LF.carveSD(p.pos).d.toFixed(2); out.nearCarve = LF.carves.map(c => c.name + ':' + Math.min(len(V.sub(c.a, p.pos)), len(V.sub(c.b, p.pos))).toFixed(0)).join(' ');
  const c = p.camera(), dd = V.sub(d.launcher.site, c.eye); out.goalRel = [c.F, c.R, c.U, c.A].map(e => +V.dot(dd, e).toFixed(1));
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
