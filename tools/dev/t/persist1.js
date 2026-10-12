(async () => {
// persistence, part 1: change the world (walk, pick up a ball, set a radar toggle), save, export to a file record
const { g, p, d, O, w, V, len, nz, gt, place, look } = PT, out = {};
const ball = w.bodies.find(b => b.kind === 'glomeS');
place(V.sub(ball.pos, V.sc(p.F, 1.2)), p.F); await gt(0.3); look(ball.pos); await gt(0.2);
d.actions.fDown = true; await gt(0.1); d.actions.fUp = true; await gt(0.6);
out.holding = O.held === ball;
const expect = { pos: p.pos.map(v => +v.toFixed(2)), held: O.held ? O.held.kind : null, time: +g.state.time.toFixed(0), n: w.bodies.filter(b => b.nook == null).length, flags: Object.keys(g.G.flags).length, layers: JSON.stringify(g.state.radar.layers) };
localStorage.setItem('gate.expect', JSON.stringify(expect));
d.save.saveWorld?.();
// the export record, kept to import later
const S = await import(document.querySelector('script[type=importmap]').textContent.match(/"\.\/js\/save\.js": "([^"]+)"/)[1]);
S.saveWorld(); S.saveSettings();
localStorage.setItem('gate.file', JSON.stringify({ glome: true, settings: JSON.parse(localStorage.getItem('glome.settings')), world: S._debug.worldRecord() }));
out.saved = !!localStorage.getItem('glome.world'); out.bytes = localStorage.getItem('glome.world').length;
return JSON.stringify({ out, expect });
})()
