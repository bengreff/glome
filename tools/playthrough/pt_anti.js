(async () => {
const { g, p, d, O, w, V, len, nz, gt, place, look } = PT;
const a = d.artifacts.find(x => x.id === 'antipode'), out = {};
const gl = w.bodies.find(b => b.kind === 'glomeS');
place(V.sub(gl.pos, V.sc(p.F, 1.2)), p.F); await gt(0.3); look(gl.pos); await gt(0.2);
d.actions.fDown = true; await gt(0.3); out.holding = O.held === gl;
// the walk to the summit (a teleport), then set it in the bowl
const toBowl = nz(V.sub(a.bowl, V.sc(nz(a.bowl), V.dot(a.bowl, nz(a.bowl)))));
const T = [[-a.bowl[1],a.bowl[0],a.bowl[3],-a.bowl[2]]].map(nz)[0];
place(V.sub(a.bowl, V.sc(T, 0.75)), T); await gt(0.3); look(V.add(a.bowl, V.sc(nz(a.bowl), 0.2)));
d.actions.fDown = true; await gt(0.9); d.actions.fUp = true; await gt(2.5);
out.solved = !!g.G.flags.solved_antipode; out.inBowl = len(V.sub(gl.pos, a.bowl)).toFixed(2);
return JSON.stringify(out);
})()
