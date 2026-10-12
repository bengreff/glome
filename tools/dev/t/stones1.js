(async () => { const { g, p, d, O, w, wait, V, len, nz, place, look } = PT, out = {};
const key = (code, up) => dispatchEvent(new KeyboardEvent(up ? 'keyup' : 'keydown', { code }));
const tap = async code => { key(code); await wait(60); key(code, true); await wait(150); };
const N = d.finds.nooks; out.nooks = N.length;
// the nearest pedestal to where you stand
let best = 0; N.forEach((k, i) => { if (len(V.sub(k.p, p.pos)) < len(V.sub(N[best].p, p.pos))) best = i; });
const k = N[best], u = nz(k.p), T = [1, 0, 0, 0].map((_, j) => 0); let dir = nz(V.sub([0.3, 0.5, -0.2, 0.7], V.sc(u, V.dot([0.3, 0.5, -0.2, 0.7], u))));
place(V.sub(k.p, V.sc(dir, 1.6)), dir); await wait(1200);
const st = () => w.bodies.find(b => b.nook === best);
let b = st(); out.made = !!b; out.glow = b && b.glow; out.fixed = b && !!b.fixed; out.restGap = b && len(V.sub(b.pos, k.p)).toFixed(3);
look(b.pos); p.A = p.A; await wait(300); out.canTake = !!g.G.canTake;
await tap('KeyF'); out.heldKind = O.held && O.held.kind; out.pouch0 = O.pouch;
window.PTS = { best, k }; return JSON.stringify(out);
})()
