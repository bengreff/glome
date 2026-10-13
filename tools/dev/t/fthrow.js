(async () => { const { g, p, d, O, V, len, nz, gt } = PT, G = g.G, L = d.launcher, F = d.flight, out = {};
const key = (code, up) => dispatchEvent(new KeyboardEvent(up ? 'keyup' : 'keydown', { code }));
const hold = async (code, s) => { key(code); await gt(s); key(code, true); };
O.pouch = 3;
const up = nz(L.site); p.pos = V.add(L.site, V.sc(up, 0.05)); p.vel = [0, 0, 0, 0]; p.settleFrame(); await gt(0.5);
await hold('Space', 0.08);
for (let i = 0; i < 40 && !F.active; i++) await gt(0.25);
out.flying = F.active; await gt(1);
// draw a stone (G, empty hands) and throw it straight back along your gaze
await hold('KeyG', 0.08); await gt(0.3);
out.held = O.held && O.held.kind; out.pouch = O.pouch;
const v0 = F.v.slice(), Fd = p.camera().F;
d.actions.mDown = true; await gt(0.2); d.actions.mUp = true; await gt(0.1);
const dv = V.sub(F.v, v0);
out.heldAfter = !!O.held; out.dv = +len(dv).toFixed(2); out.expect = +(80 * 2.5 / (g.LAWS.PLAYER_M + 2.5)).toFixed(2);
// a second: held a moment longer first (does it stay in your hand at flight speed?)
await hold('KeyG', 0.08); await gt(1.5); out.held2 = O.held && O.held.kind;
out.errors = G.errors || 0; out.lastError = G.lastError || null;
return JSON.stringify(out);
})()
