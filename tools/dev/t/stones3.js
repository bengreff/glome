(async () => { const { g, p, d, O, w, wait, V, len, look } = PT, out = {}, { best, k } = PTS;
const key = (code, up) => dispatchEvent(new KeyboardEvent(up ? 'keyup' : 'keydown', { code }));
const tap = async code => { key(code); await wait(60); key(code, true); await wait(150); };
g.G.flags.nooks[best] = g.state.time + 0.5; await wait(1500);
let b = w.bodies.find(b => b.nook === best); out.grown = b && !b.fixed; out.glow = b && b.glow;
await tap('KeyG'); out.drawn = O.held && O.held.kind; out.pouch1 = O.pouch;
await tap('KeyG'); out.restowed = !O.held; out.pouch2 = O.pouch;
O.pouch = 9; look(b.pos); await wait(300); await tap('KeyF'); out.held9 = O.held && O.held.kind;
await tap('KeyG'); out.fullStillHeld = !!O.held; out.pouch9 = O.pouch;
return JSON.stringify(out);
})()
