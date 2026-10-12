(async () => { const { g, p, d, O, w, wait, V, len } = PT, out = {}, { best, k } = PTS;
const key = (code, up) => dispatchEvent(new KeyboardEvent(up ? 'keyup' : 'keydown', { code }));
const tap = async code => { key(code); await wait(60); key(code, true); await wait(150); };
await tap('KeyG'); out.pouchAfterG = O.pouch; out.heldAfterG = !!O.held;
await wait(800); let b = w.bodies.find(b => b.nook === best);
out.regrowing = !!b; out.regFixed = b && !!b.fixed; out.regGlow = b && +b.glow.toFixed(3); out.timer = (g.G.flags.nooks[best] - g.state.time).toFixed(0);
g.G.flags.nooks[best] = g.state.time + 50;   // most of the way: a dark stone, kindling
await wait(600); out.midGlow = +w.bodies.find(b => b.nook === best).glow.toFixed(3);
// save: no stone on a pedestal is saved
const rec = d.save._debug.worldRecord(); out.recKeys = Object.keys(rec).join(',');
const sv = rec.objects || rec.things || {}; out.savedAtNook = (sv.bodies || []).filter(o => len(V.sub(o.pos, k.p)) < 0.3).length; out.savedN = (sv.bodies || []).length;
return JSON.stringify(out);
})()
