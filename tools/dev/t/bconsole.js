(async () => { const { g, p, d, V, len, nz, gt } = PT, G = g.G, out = {};
const map = JSON.parse(document.querySelector('script[type=importmap]').textContent).imports;
const PB = await import(map['./js/planetB.js']), CS = await import(map['./js/console.js']);
const key = (code, up) => dispatchEvent(new KeyboardEvent(up ? 'keyup' : 'keydown', { code }));
const hold = async (code, s) => { key(code); await gt(s); key(code, true); };
// land on B a quarter of the way round from the console, as a flight does
const cpos = CS.bworld.console.pos, cu = nz(cpos);
let u = nz([0.3, -0.5, 0.7, 0.4]); u = nz(V.add(V.sc(cu, 0.45), V.sc(nz(V.sub(u, V.sc(cu, V.dot(u, cu)))), 0.9)));
d.flight.active = false; p.onB = 0; p.groundFn = PB.groundRadiusB; p.pos = V.sc(u, PB.groundRadiusB(u) + 0.02); p.vel = [0, 0, 0, 0]; p.settleFrame(); p.grounded = true;
await gt(1);
out.start = +len(V.sub(p.pos, cpos)).toFixed(1);
const t0 = g.state.time;
for (let i = 0; i < 300 && !CS.nearConsole(p); i++) {
  const c = p.camera(), dd = V.sub(cpos, c.eye), uu = p.up(); let h = V.sub(dd, V.sc(uu, V.dot(dd, uu))); const a = V.dot(h, p.A); h = V.sub(h, V.sc(p.A, a));
  if (len(h) > 0.3) { p.F = nz(h); p.settleFrame(); }
  if (Math.abs(a) > 1.0 && len(h) < 8) await hold(a > 0 ? 'KeyE' : 'KeyQ', Math.min(1.2, Math.abs(a) / 4.2)); else await hold('KeyW', 0.5);
}
out.near = CS.nearConsole(p); out.secs = +(g.state.time - t0).toFixed(0); out.dist = +len(V.sub(p.pos, cpos)).toFixed(1);
out.canTake = !!G.canTake;
await hold('KeyF', 0.08); await gt(0.3);
out.consoleOpen = !document.getElementById('console').hidden; out.screenOn = !!G.screenOn;
out.errors = G.errors || 0; out.lastError = G.lastError || null;
return JSON.stringify(out);
})()
