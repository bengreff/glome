(async () => {
// persistence, part 2 (after a reload): compare what came back
const g = __glome, p = g.player, O = g.dbg.objects, e = JSON.parse(localStorage.getItem('gate.expect'));
const got = { pos: p.pos.map(v => +v.toFixed(2)), held: O.held ? O.held.kind : null, time: +g.state.time.toFixed(0), n: O.world.bodies.filter(b => b.nook == null).length, flags: Object.keys(g.G.flags).length, layers: JSON.stringify(g.state.radar.layers) };
const dpos = Math.hypot(...got.pos.map((v, i) => v - e.pos[i]));
return JSON.stringify({ dpos: dpos.toFixed(2), heldOk: got.held === e.held, timeOk: got.time >= e.time - 1 && got.time < e.time + 30, nOk: got.n === e.n, flagsOk: got.flags === e.flags, layersOk: got.layers === e.layers, got, errors: g.G.errors || 0 });
})()
