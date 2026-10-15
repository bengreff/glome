(async () => { try { const { g, p, d, O, w, V, len, nz, gt } = PT, G = g.G, out = {};
const rafts = w.bodies.filter(b => b.kind === 'raft'), sails = w.bodies.filter(b => b.kind === 'sail');
out.rafts = rafts.map(b => { const n = nz(b.pos); return { h: +p.hf.heightAt(n).toFixed(1), fromHome: +(Math.acos(Math.min(1, V.dot(n, nz(G.home.pos)))) * 250).toFixed(0) }; }); out.sails = sails.length;
// take the nearest stone into the hand (by the API: the cue is what is checked)
const st = w.bodies.filter(b => b.kind === 'stone' && !b.fixed).sort((a, b) => len(V.sub(a.pos, p.pos)) - len(V.sub(b.pos, p.pos)))[0];
const cam = p.camera(); st.pos = V.add(cam.eye, V.sc(cam.F, 1.0)); await gt(0.2);
d.actions.fDown = true; await gt(0.1); d.actions.fUp = true; await gt(0.3);
out.held = O.held && O.held.kind;
window.SEG9 = 1; return JSON.stringify(out);
} catch (e) { return 'ERR ' + e.message; } })()
