(async () => {
// chaos at each built site: 40 s of random hands and feet (take whatever is under the gaze, walk, jump, step through
// ana, turn what you hold, throw, let go), then: no errors, nothing NaN, nothing flung, every hinge still together
const { g, p, d, V, len, nz, gt } = PT, G = g.G, k = g.keys, w = d.objects.world, out = {};
const so4 = await import(JSON.parse(document.querySelector('script[type=importmap]').textContent).imports['./js/so4.js']), R4 = so4.rot;
const input = await import(JSON.parse(document.querySelector('script[type=importmap]').textContent).imports['./js/input.js']);
let seed = 11; const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
const sites = { room: d.artifacts.find(a => a.id === 'room').foot, mirror: d.artifacts.find(a => a.id === 'mirror').foot, knot: G.knot.foot, fold: G.fold.foot };
const KEYS = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyE', 'KeyQ', 'Space', 'KeyR'];
for (const [name, foot] of Object.entries(sites)) {
  const n = nz(foot); p.pos = V.sc(n, len(foot) + 0.1); p.vel = [0, 0, 0, 0]; p.settleFrame(); await gt(0.5);
  const e0 = G.errors || 0;
  for (let i = 0; i < 160; i++) {
    k.clear(); for (const key of KEYS) if (rnd() < 0.18) k.add(key);
    if (rnd() < 0.3) p.rotate('FR', (rnd() - 0.5) * 1.2); if (rnd() < 0.15) p.rotate('FA', (rnd() - 0.5) * 0.8);
    p.pitch = Math.max(-1.2, Math.min(1.2, p.pitch + (rnd() - 0.5) * 0.6));
    if (rnd() < 0.2) { d.actions.fDown = true; await gt(0.05); if (rnd() < 0.5) d.actions.fUp = true; }
    if (rnd() < 0.08) { d.actions.mDown = true; await gt(0.1); d.actions.mUp = true; }
    if (rnd() < 0.1) { input.mouse.dx += (rnd() - 0.5) * 400; input.mouse.dy += (rnd() - 0.5) * 300; input.mouse.alt = rnd() < 0.5; }
    if (len(V.sub(p.pos, foot)) > 12) { p.pos = V.sc(n, len(foot) + 0.1); p.vel = [0, 0, 0, 0]; }
    await gt(0.25);
  }
  k.clear(); input.mouse.alt = false; if (d.objects.held) { d.actions.fDown = true; await gt(0.05); d.actions.fUp = true; } G.ropeHeld = null; await gt(2);
  const bad = w.bodies.filter(b => b.pos.some(v => !isFinite(v)) || b.vel.some(v => !isFinite(v)));
  const flung = w.bodies.filter(b => !b.fixed && len(b.vel) > 40).map(b => b.kind);
  const joints = w.joints.map(j => { const pa = j.a ? V.add(j.a.pos, R4.apply(j.a.rot, j.ca)) : j.ca, pb = V.add(j.b.pos, R4.apply(j.b.rot, j.cb)); return len(V.sub(pa, pb)); });
  out[name] = { errors: (G.errors || 0) - e0, nan: bad.length, flung, jointGapMax: +Math.max(...joints).toFixed(3), lastError: G.lastError ? G.lastError.slice(0, 160) : null };
}
return JSON.stringify(out);
})()
